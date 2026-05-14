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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
        },
      }
    );

    // Verify service key is present
    if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500, headers: corsHeaders });
    }

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
      let tenant;
      try {
        const { data, error } = await supabase.from('tenants').insert({
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
        }).select().single();
        if (error) throw Object.assign(error, { _table: 'tenants' });
        tenant = data;
      } catch (e) { throw Object.assign(e, { _table: e._table || 'tenants' }); }
      createdTenantId = tenant.id;
      console.log('✓ tenants created:', tenant.id);

      // 2. Theme config (non-fatal)
      try {
        const { error } = await supabase.from('theme_configs').upsert({
          tenant_id: tenant.id,
          color_set_name: formData.theme || 'Ocean Blue',
          primary_color: formData.customPrimary || '#0369A1',
          accent_color: formData.customSecondary || '#E0F2FE',
        }, { onConflict: 'tenant_id' });
        if (error) console.warn('theme_configs warning:', error.message);
        else console.log('✓ theme_configs upserted');
      } catch (e) { console.warn('theme_configs non-fatal:', e.message); }

      // 3. Create admin role
      let adminRole;
      try {
        const { data, error } = await supabase.from('roles').insert({
          tenant_id: tenant.id,
          name: 'Admin',
          slug: 'admin',
          permissions: ['*'],
          is_system: true,
        }).select().single();
        if (error) throw Object.assign(error, { _table: 'roles' });
        adminRole = data;
      } catch (e) { throw Object.assign(e, { _table: e._table || 'roles' }); }
      console.log('✓ roles created:', adminRole.id);

      // 4. Create tenant_user (owner)
      try {
        const { error } = await supabase.from('tenant_users').insert({
          tenant_id: tenant.id,
          user_email: ownerEmail,
          role_id: adminRole.id,
          role_name: 'Admin',
          is_owner: true,
          status: 'active',
        });
        if (error) throw Object.assign(error, { _table: 'tenant_users' });
      } catch (e) { throw Object.assign(e, { _table: e._table || 'tenant_users' }); }
      console.log('✓ tenant_users created');

      // 5. Business hours
      if (formData.operatingHours) {
        try {
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
          const { error } = await supabase.from('business_hours').insert(hoursRows);
          if (error) throw Object.assign(error, { _table: 'business_hours' });
          console.log('✓ business_hours created');
        } catch (e) { throw Object.assign(e, { _table: e._table || 'business_hours' }); }
      }

      // 6. Tables
      const tableData = formData.tables?.length > 0
        ? formData.tables.map((t, i) => ({ tenant_id: tenant.id, name: t.label, capacity: t.pax || 2, status: 'available', sort_order: i, qr_code_url: formData.qrCodes?.[t.id] || null }))
        : formData.tableCount > 0
          ? Array.from({ length: formData.tableCount }, (_, i) => ({ tenant_id: tenant.id, name: `T${i + 1}`, capacity: 4, status: 'available', sort_order: i, qr_code_url: null }))
          : null;
      if (tableData) {
        try {
          const { error } = await supabase.from('tables').insert(tableData);
          if (error) throw Object.assign(error, { _table: 'tables' });
          console.log('✓ tables created:', tableData.length);
        } catch (e) { throw Object.assign(e, { _table: e._table || 'tables' }); }
      }

      // 7. Products & categories
      if (formData.products?.length > 0) {
        const categoryMap = {};
        for (const product of formData.products) {
          let categoryId = categoryMap[product.category];
          if (!categoryId) {
            try {
              const { data, error } = await supabase.from('categories').insert({
                tenant_id: tenant.id,
                name: product.category,
                slug: product.category.toLowerCase().replace(/\s+/g, '-'),
                is_active: true,
              }).select().single();
              if (error) throw Object.assign(error, { _table: 'categories' });
              categoryId = data.id;
              categoryMap[product.category] = categoryId;
              console.log('✓ category created:', product.category);
            } catch (e) { throw Object.assign(e, { _table: e._table || 'categories' }); }
          }
          try {
            const { error } = await supabase.from('products').insert({
              tenant_id: tenant.id,
              category_id: categoryId,
              name: product.name,
              slug: product.name.toLowerCase().replace(/\s+/g, '-'),
              price: product.price,
              image_url: product.image_url || null,
              is_active: true,
            });
            if (error) throw Object.assign(error, { _table: 'products' });
            console.log('✓ product created:', product.name);
          } catch (e) { throw Object.assign(e, { _table: e._table || 'products' }); }
        }
      }

      // 8. Mark onboarding complete
      let updatedUser;
      try {
        const { data, error } = await supabase.from('app_users')
          .update({ onboarding_completed: true, tenant_id: tenant.id })
          .eq('id', user_id)
          .select()
          .single();
        if (error) throw Object.assign(error, { _table: 'app_users' });
        updatedUser = data;
      } catch (e) { throw Object.assign(e, { _table: e._table || 'app_users' }); }
      console.log('✓ app_users updated');

      return Response.json({ success: true, tenant_id: tenant.id, user: updatedUser }, { headers: corsHeaders });

    } catch (innerError) {
      const failedTable = innerError._table || 'unknown';
      console.error(`✗ FAILED on table [${failedTable}]:`, innerError.message, innerError.code, innerError.details, innerError.hint);
      // Rollback all created records
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
      return Response.json({
        error: `[${failedTable}] ${innerError.message}`,
        table: failedTable,
        code: innerError.code,
        details: innerError.details,
        hint: innerError.hint,
      }, { status: 500, headers: corsHeaders });
    }

  } catch (error) {
    console.error('completeOnboarding error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});