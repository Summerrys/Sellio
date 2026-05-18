import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function fail(step, name, error) {
  const msg = error?.message || String(error);
  const code = error?.code || null;
  const details = error?.details || null;
  const hint = error?.hint || null;
  console.error(`✗ FAILED step ${step} [${name}]:`, msg, '| code:', code, '| details:', details, '| hint:', hint);
  return Response.json({
    success: false,
    failedStep: `step ${step} - ${name}`,
    error: msg,
    code,
    details,
    hint,
  }, { status: 500, headers: corsHeaders });
}

async function cleanupTenant(supabase, tenantId) {
  console.log('Cleaning up tenant:', tenantId);
  await supabase.from('products').delete().eq('tenant_id', tenantId);
  await supabase.from('categories').delete().eq('tenant_id', tenantId);
  await supabase.from('business_hours').delete().eq('tenant_id', tenantId);
  await supabase.from('tables').delete().eq('tenant_id', tenantId);
  await supabase.from('theme_configs').delete().eq('tenant_id', tenantId);
  await supabase.from('subscriptions').delete().eq('tenant_id', tenantId);
  await supabase.from('roles').delete().eq('tenant_id', tenantId);
  await supabase.from('tenant_users').delete().eq('tenant_id', tenantId);
  await supabase.from('tenants').delete().eq('id', tenantId);
  console.log('✓ Cleanup done for tenant:', tenantId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { user_id, formData } = body;

    if (!user_id || !formData) {
      return Response.json({ error: 'user_id and formData are required' }, { status: 400, headers: corsHeaders });
    }

    console.log('=== completeOnboarding START ===', { user_id, businessName: formData.businessName });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` } },
      }
    );

    const ownerEmail = formData.ownerEmail;
    const businessName = formData.businessName;
    const tenantSlug = toSlug(businessName);
    const industry = formData.businessType || formData.industry || '';
    const isFnB = /f&b|cafe|restaurant|food/i.test(industry);

    // ── Step 0: Cleanup previous incomplete onboarding ───────────────────────
    console.log('→ Step 0: cleanup check...');
    try {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('onboarding_completed, tenant_id')
        .eq('id', user_id)
        .maybeSingle();

      if (appUser && appUser.onboarding_completed === false) {
        const { data: tuRow } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_email', ownerEmail)
          .maybeSingle();

        const staleId = tuRow?.tenant_id || appUser.tenant_id || null;
        if (staleId) {
          await cleanupTenant(supabase, staleId);
          await supabase.from('app_users').update({ tenant_id: null }).eq('id', user_id);
        }
      }

      const { data: slugTenant } = await supabase
        .from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
      if (slugTenant) {
        await cleanupTenant(supabase, slugTenant.id);
      }
      console.log('✓ Step 0 cleanup done');
    } catch (e) {
      console.warn('Step 0 cleanup warning (non-fatal):', e.message);
    }

    // ── Generate tenant UUID upfront ──────────────────────────────────────────
    const newTenantId = crypto.randomUUID();
    console.log('→ newTenantId:', newTenantId);

    // ── Step 1: Upload logo if provided ──────────────────────────────────────
    let logoUrl = null;
    console.log('→ Step 1: logo upload...');
    if (formData.logoBase64 || formData.logoFile) {
      try {
        const base64Data = formData.logoBase64 || formData.logoFile;
        const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
        const path = `${newTenantId}/logo.png`;
        const { error } = await supabase.storage
          .from('tenant-logos')
          .upload(path, bytes, { contentType: 'image/png', upsert: true });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('tenant-logos').getPublicUrl(path);
        logoUrl = urlData.publicUrl;
        console.log('✓ Step 1 logo uploaded:', logoUrl);
      } catch (e) {
        console.warn('Step 1 logo upload warning (non-fatal):', e.message);
        logoUrl = formData.logoUrl || null;
      }
    } else {
      logoUrl = formData.logoUrl || null;
      console.log('✓ Step 1 logo skipped (no file), using:', logoUrl);
    }

    // ── Step 2: Upload product images if provided as base64 ──────────────────
    const productImageMap = {};
    console.log('→ Step 2: product image uploads...');
    if (formData.products?.length > 0) {
      for (const product of formData.products) {
        if (product.imageBase64) {
          try {
            const base64Clean = product.imageBase64.replace(/^data:[^;]+;base64,/, '');
            const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
            const filename = `${toSlug(product.name)}.png`;
            const path = `${newTenantId}/${filename}`;
            const { error } = await supabase.storage
              .from('product-images')
              .upload(path, bytes, { contentType: 'image/png', upsert: true });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            productImageMap[product.name] = urlData.publicUrl;
          } catch (e) {
            console.warn(`Step 2 product image warning for "${product.name}" (non-fatal):`, e.message);
            productImageMap[product.name] = product.image_url || null;
          }
        } else {
          productImageMap[product.name] = product.image_url || null;
        }
      }
    }
    console.log('✓ Step 2 product images done');

    // ── Step 3: Insert tenant ─────────────────────────────────────────────────
    console.log('→ Step 3: insert tenant...');
    let tenant;
    try {
      const { data, error } = await supabase.from('tenants').insert({
        id: newTenantId,
        name: businessName,
        slug: tenantSlug,
        industry,
        country: formData.country || null,
        logo_url: logoUrl,
        owner_email: ownerEmail,
        status: 'trial',
        plan: 'free',
        currency: formData.currency || 'SGD',
        settings: {
          branch_name: formData.branchName || null,
          tax_rate: formData.taxRate ?? (formData.country === 'Singapore' ? 9 : formData.country === 'Malaysia' ? 6 : 0),
          tax_inclusive: formData.taxInclusive ?? false,
        },
      }).select().single();
      if (error) throw error;
      tenant = data;
      console.log('✓ Step 3 tenant inserted:', tenant.id);
    } catch (e) { return fail(3, 'tenants', e); }

    // ── Step 4: Insert theme_config ───────────────────────────────────────────
    console.log('→ Step 4: insert theme_config...');
    try {
      const { error } = await supabase.from('theme_configs').insert({
        tenant_id: newTenantId,
        primary_color: formData.customPrimary || '#0369A1',
        accent_color: formData.customSecondary || '#E0F2FE',
        color_set_name: formData.theme || 'Ocean Blue',
        logo_url: logoUrl,
      });
      if (error) throw error;
      console.log('✓ Step 4 theme_config inserted');
    } catch (e) { return fail(4, 'theme_configs', e); }

    // ── Step 5: Insert roles ──────────────────────────────────────────────────
    console.log('→ Step 5: insert roles...');
    let ownerRole;
    try {
      const { data, error } = await supabase.from('roles').insert([
        { tenant_id: newTenantId, name: 'owner', slug: 'owner', permissions: ['*'], is_system: true },
        { tenant_id: newTenantId, name: 'staff', slug: 'staff', permissions: [], is_system: true },
      ]).select();
      if (error) throw error;
      ownerRole = data.find(r => r.name === 'owner');
      console.log('✓ Step 5 roles inserted:', data.map(r => r.name));
    } catch (e) { return fail(5, 'roles', e); }

    // ── Step 6: Insert tenant_users ───────────────────────────────────────────
    console.log('→ Step 6: insert tenant_users...');
    try {
      const { error } = await supabase.from('tenant_users').insert({
        tenant_id: newTenantId,
        user_email: ownerEmail,
        role_id: ownerRole.id,
        role_name: 'owner',
        is_owner: true,
        status: 'active',
      });
      if (error) throw error;
      console.log('✓ Step 6 tenant_users inserted');
    } catch (e) { return fail(6, 'tenant_users', e); }

    // ── Step 7: Update app_users ──────────────────────────────────────────────
    console.log('→ Step 7: update app_users by email:', ownerEmail);
    let updatedUser;
    try {
      const { data, error } = await supabase.from('app_users')
        .update({ onboarding_completed: true, tenant_id: newTenantId })
        .eq('email', ownerEmail)
        .select()
        .maybeSingle();
      if (error) throw error;
      updatedUser = data;
      console.log('✓ Step 7 app_users updated:', updatedUser ? 'row found' : 'no row matched (continuing)');
    } catch (e) { return fail(7, 'app_users', e); }

    // ── Step 8: Insert business_hours ─────────────────────────────────────────
    if (formData.operatingHours) {
      console.log('→ Step 8: insert business_hours...');
      try {
        const dayMap = {
          Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday',
          Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday',
        };
        const hoursRows = Object.entries(formData.operatingHours).map(([day, config]) => ({
          tenant_id: newTenantId,
          day_of_week: dayMap[day] || day.toLowerCase(),
          open_time: config.enabled ? config.start : null,
          close_time: config.enabled ? config.end : null,
          is_closed: !config.enabled,
        }));
        const { error } = await supabase.from('business_hours').insert(hoursRows);
        if (error) throw error;
        console.log('✓ Step 8 business_hours inserted:', hoursRows.length);
      } catch (e) { return fail(8, 'business_hours', e); }
    } else {
      console.log('✓ Step 8 business_hours skipped (no data)');
    }

    // ── Step 9: Insert categories ─────────────────────────────────────────────
    const categoryMap = {};
    if (formData.products?.length > 0) {
      const uniqueCategories = [...new Set(formData.products.map(p => p.category).filter(Boolean))];
      if (uniqueCategories.length > 0) {
        console.log('→ Step 9: insert categories:', uniqueCategories);
        try {
          const categoryRows = uniqueCategories.map(cat => ({
            tenant_id: newTenantId,
            name: cat,
            slug: toSlug(cat),
            is_active: true,
          }));
          const { data, error } = await supabase.from('categories').insert(categoryRows).select();
          if (error) throw error;
          data.forEach(c => { categoryMap[c.name] = c.id; });
          console.log('✓ Step 9 categories inserted:', data.length);
        } catch (e) { return fail(9, 'categories', e); }
      } else {
        console.log('✓ Step 9 categories skipped (no categories in products)');
      }
    } else {
      console.log('✓ Step 9 categories skipped (no products)');
    }

    // ── Step 10: Insert products ──────────────────────────────────────────────
    if (formData.products?.length > 0) {
      console.log('→ Step 10: insert products:', formData.products.length);
      try {
        const productRows = formData.products.map(p => ({
          tenant_id: newTenantId,
          category_id: categoryMap[p.category] || null,
          name: p.name,
          slug: toSlug(p.name),
          description: p.description || null,
          price: p.price,
          image_url: productImageMap[p.name] || p.image_url || null,
          images: p.images && p.images.length > 0 ? p.images : null,
          is_active: true,
        }));
        const { error } = await supabase.from('products').insert(productRows);
        if (error) throw error;
        console.log('✓ Step 10 products inserted:', productRows.length);
      } catch (e) { return fail(10, 'products', e); }
    } else {
      console.log('✓ Step 10 products skipped (none provided)');
    }

    // ── Step 11: Insert tables (F&B only) ─────────────────────────────────────
    if (isFnB) {
      const tableRows = [];
      if (formData.tables?.length > 0) {
        for (const t of formData.tables) {
          const tableId = crypto.randomUUID();
          tableRows.push({
            id: tableId,
            tenant_id: newTenantId,
            name: t.label || t.name,
            capacity: t.pax || t.capacity || 2,
            status: 'available',
            qr_code_url: `https://sellio.apptelier.sg/order/${tenantSlug}/${tableId}`,
          });
        }
      } else if (formData.tableCount > 0) {
        for (let i = 0; i < formData.tableCount; i++) {
          const tableId = crypto.randomUUID();
          tableRows.push({
            id: tableId,
            tenant_id: newTenantId,
            name: `T${i + 1}`,
            capacity: 4,
            status: 'available',
            qr_code_url: `https://sellio.apptelier.sg/order/${tenantSlug}/${tableId}`,
          });
        }
      }
      if (tableRows.length > 0) {
        console.log('→ Step 11: insert tables:', tableRows.length);
        try {
          const { error } = await supabase.from('tables').insert(tableRows);
          if (error) throw error;
          console.log('✓ Step 11 tables inserted:', tableRows.length);
        } catch (e) { return fail(11, 'tables', e); }
      } else {
        console.log('✓ Step 11 tables skipped (none provided)');
      }
    } else {
      console.log('✓ Step 11 tables skipped (not F&B)');
    }

    // ── Step 12: Insert subscription ──────────────────────────────────────────
    console.log('→ Step 12: insert subscription...');
    try {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 3);
      const { error } = await supabase.from('subscriptions').insert({
        tenant_id: newTenantId,
        tier: 'free',
        status: 'trial',
        billing_cycle: 'monthly',
        current_period_start: now.toISOString(),
        current_period_end: trialEnd.toISOString(),
        currency: formData.currency || 'SGD',
      });
      if (error) throw error;
      console.log('✓ Step 12 subscription inserted');
    } catch (e) { return fail(12, 'subscriptions', e); }

    console.log('=== completeOnboarding SUCCESS ===', { tenant_id: newTenantId });
    return Response.json({ success: true, tenant_id: newTenantId, user: updatedUser }, { headers: corsHeaders });

  } catch (error) {
    console.error('completeOnboarding unexpected error:', error);
    return Response.json({ success: false, failedStep: 'unexpected', error: error.message }, { status: 500, headers: corsHeaders });
  }
});