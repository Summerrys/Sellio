import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { user_id, tenant_id, formData } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Legacy path: if only user_id + tenant_id passed (no formData), just mark complete
    if (tenant_id && !formData) {
      const { data, error } = await supabase
        .from('app_users')
        .update({ onboarding_completed: true, tenant_id })
        .eq('id', user_id)
        .select()
        .single();
      if (error) throw error;
      return Response.json({ success: true, user: data }, { headers: corsHeaders });
    }

    if (!user_id || !formData) {
      return Response.json({ error: 'user_id and formData are required' }, { status: 400, headers: corsHeaders });
    }

    const getTaxRate = (country, taxRate) => {
      if (country === 'Singapore') return 9;
      if (country === 'Malaysia') return 6;
      return taxRate ?? 0;
    };

    const taxRate = getTaxRate(formData.country, formData.taxRate);
    const slug = formData.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const ownerEmail = formData.ownerEmail;

    // ── Check for existing tenant with same slug ──────────────────────────────
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .eq('owner_email', ownerEmail)
      .maybeSingle();

    if (existingTenant) {
      // Clean up all partial records tied to this tenant so we can recreate cleanly
      const existingId = existingTenant.id;
      await supabase.from('products').delete().eq('tenant_id', existingId);
      await supabase.from('categories').delete().eq('tenant_id', existingId);
      await supabase.from('tables').delete().eq('tenant_id', existingId);
      await supabase.from('business_hours').delete().eq('tenant_id', existingId);
      await supabase.from('tenant_users').delete().eq('tenant_id', existingId);
      await supabase.from('roles').delete().eq('tenant_id', existingId);
      await supabase.from('theme_configs').delete().eq('tenant_id', existingId);
      await supabase.from('tenants').delete().eq('id', existingId);
    }

    // ── Track created IDs for rollback on failure ─────────────────────────────
    let createdTenantId = null;

    try {
      // 1. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: formData.businessName,
          slug,
          logo_url: formData.logoUrl || null,
          industry: formData.businessType,
          owner_email: ownerEmail,
          country: formData.country,
          currency: formData.currency,
          address: formData.address || null,
          status: 'trial',
          plan: 'free',
          settings: {
            branch_name: formData.branchName || null,
            tax_rate: taxRate,
            tax_inclusive: formData.taxInclusive ?? false,
          },
        })
        .select()
        .single();

      if (tenantError) throw tenantError;
      createdTenantId = tenant.id;

      // 2. Save theme config
      const { error: themeError } = await supabase
        .from('theme_configs')
        .upsert({
          tenant_id: tenant.id,
          color_set_name: formData.theme || 'Ocean Blue',
          primary_color: formData.customPrimary || '#0369A1',
          accent_color: formData.customSecondary || '#E0F2FE',
        }, { onConflict: 'tenant_id' });
      if (themeError) console.warn('Theme config warning:', themeError.message);

      // 3. Create admin role
      const { data: adminRole, error: roleError } = await supabase
        .from('roles')
        .insert({
          tenant_id: tenant.id,
          name: 'Admin',
          slug: 'admin',
          permissions: ['*'],
          is_system: true,
        })
        .select()
        .single();
      if (roleError) throw roleError;

      // 4. Create tenant_user (owner)
      const { error: tuError } = await supabase.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_email: ownerEmail,
        role_id: adminRole.id,
        role_name: 'Admin',
        is_owner: true,
        status: 'active',
      });
      if (tuError) throw tuError;

      // 5. Business hours
      if (formData.operatingHours) {
        const dayMap = {
          Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday',
          Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday',
        };
        const hoursRows = Object.entries(formData.operatingHours).map(([day, config]) => ({
          tenant_id: tenant.id,
          day_of_week: dayMap[day],
          open_time: config.enabled ? config.start : null,
          close_time: config.enabled ? config.end : null,
          is_closed: !config.enabled,
        }));
        const { error: hoursError } = await supabase.from('business_hours').insert(hoursRows);
        if (hoursError) throw hoursError;
      }

      // 6. Tables
      if (formData.tables?.length > 0) {
        const tableRows = formData.tables.map((t, i) => ({
          tenant_id: tenant.id,
          name: t.label,
          capacity: t.pax || 2,
          status: 'available',
          sort_order: i,
          qr_code_url: formData.qrCodes?.[t.id] || null,
        }));
        const { error: tablesError } = await supabase.from('tables').insert(tableRows);
        if (tablesError) throw tablesError;
      } else if (formData.tableCount > 0) {
        const tableRows = Array.from({ length: formData.tableCount }, (_, i) => ({
          tenant_id: tenant.id,
          name: `T${i + 1}`,
          capacity: 4,
          status: 'available',
          sort_order: i,
          qr_code_url: null,
        }));
        const { error: tablesError } = await supabase.from('tables').insert(tableRows);
        if (tablesError) throw tablesError;
      }

      // 7. Products & categories
      if (formData.products?.length > 0) {
        const categoryMap = {};
        for (const product of formData.products) {
          let categoryId = categoryMap[product.category];
          if (!categoryId) {
            const { data: category, error: catError } = await supabase
              .from('categories')
              .insert({
                tenant_id: tenant.id,
                name: product.category,
                slug: product.category.toLowerCase().replace(/\s+/g, '-'),
                is_active: true,
              })
              .select()
              .single();
            if (catError) throw catError;
            categoryId = category.id;
            categoryMap[product.category] = categoryId;
          }

          const { error: productError } = await supabase.from('products').insert({
            tenant_id: tenant.id,
            category_id: categoryId,
            name: product.name,
            slug: product.name.toLowerCase().replace(/\s+/g, '-'),
            price: product.price,
            image_url: product.image_url || null,
            is_active: true,
          });
          if (productError) throw productError;
        }
      }

      // 8. Mark onboarding complete on app_user
      const { data: updatedUser, error: userError } = await supabase
        .from('app_users')
        .update({ onboarding_completed: true, tenant_id: tenant.id })
        .eq('id', user_id)
        .select()
        .single();
      if (userError) throw userError;

      return Response.json({ success: true, tenant_id: tenant.id, user: updatedUser }, { headers: corsHeaders });

    } catch (innerError) {
      // Rollback: delete the tenant and all cascade-deleted child records
      if (createdTenantId) {
        console.error('Rolling back tenant:', createdTenantId);
        await supabase.from('products').delete().eq('tenant_id', createdTenantId);
        await supabase.from('categories').delete().eq('tenant_id', createdTenantId);
        await supabase.from('tables').delete().eq('tenant_id', createdTenantId);
        await supabase.from('business_hours').delete().eq('tenant_id', createdTenantId);
        await supabase.from('tenant_users').delete().eq('tenant_id', createdTenantId);
        await supabase.from('roles').delete().eq('tenant_id', createdTenantId);
        await supabase.from('theme_configs').delete().eq('tenant_id', createdTenantId);
        await supabase.from('tenants').delete().eq('id', createdTenantId);
      }
      throw innerError;
    }

  } catch (error) {
    console.error('completeOnboarding error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});