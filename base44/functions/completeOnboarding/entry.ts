import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

// FIX: newer Stripe API versions moved current_period_start/current_period_end
// off the top-level Subscription object onto each SubscriptionItem (to support
// multiple items with independent billing cycles). Reading sub.current_period_start
// directly now returns undefined — which produced new Date(undefined * 1000),
// an Invalid Date, and .toISOString() throwing RangeError: Invalid time value.
// That crash is what caused stripe-webhook to 500 on every subscription update,
// including real successful payments, without ever updating our DB. This helper
// checks the item level first, with the old top-level field as a fallback for
// safety, and returns null (never throws) if neither is present.
function getSubPeriod(sub) {
  const item = sub.items?.data?.[0];
  const startSec = sub.current_period_start ?? item?.current_period_start ?? null;
  const endSec = sub.current_period_end ?? item?.current_period_end ?? null;
  return {
    start: typeof startSec === 'number' ? new Date(startSec * 1000).toISOString() : null,
    end: typeof endSec === 'number' ? new Date(endSec * 1000).toISOString() : null,
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BYPASS_EMAILS = ['alvin.leeyq@gmail.com', 'alvin_y_q_lee@ite.edu.sg'];

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
  const tables = [
    ['inventory_items', 'tenant_id'],
    ['products', 'tenant_id'],
    ['categories', 'tenant_id'],
    ['business_hours', 'tenant_id'],
    ['tables', 'tenant_id'],
    ['theme_configs', 'tenant_id'],
    ['subscriptions', 'tenant_id'],
    ['roles', 'tenant_id'],
    ['tenant_users', 'tenant_id'],
    ['tenants', 'id'],
  ];
  for (const [table, col] of tables) {
    const { error } = await supabase.from(table).delete().eq(col, tenantId);
    if (error) console.warn(`  cleanup ${table} error:`, error.message);
  }
  console.log('✓ Cleanup done for tenant:', tenantId);
}

async function moveFileToPermanent(supabase, tempUrl, permanentPath, bucket = 'product-images') {
  try {
    const urlParts = tempUrl.split(`/${bucket}/`);
    const tempPath = urlParts[1];
    const { error: copyError } = await supabase.storage
      .from(bucket)
      .copy(tempPath, permanentPath);
    if (copyError) {
      console.warn(`  copy error (${tempPath} → ${permanentPath}):`, copyError.message);
      return { url: tempUrl, success: false };
    }
    await supabase.storage.from(bucket).remove([tempPath]);
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(permanentPath);
    console.log(`  ✓ Moved: ${tempPath} → ${permanentPath}`);
    return { url: urlData.publicUrl, success: true };
  } catch (e) {
    console.warn(`  move exception (${permanentPath}):`, e.message);
    return { url: tempUrl, success: false };
  }
}

async function deleteStorageFolder(supabase, bucket, prefix) {
  const allPaths: string[] = [];

  async function listAll(folderPath) {
    const { data: items, error } = await supabase.storage
      .from(bucket)
      .list(folderPath, { limit: 1000 });

    if (error || !items?.length) return;

    for (const item of items) {
      const fullPath = `${folderPath}/${item.name}`;
      if (item.id) {
        allPaths.push(fullPath);
      } else {
        await listAll(fullPath);
      }
    }
  }

  await listAll(prefix);

  if (allPaths.length > 0) {
    const { error } = await supabase.storage.from(bucket).remove(allPaths);
    if (error) console.warn(`  deleteStorageFolder remove error:`, error.message);
    else console.log(`  ✓ Deleted ${allPaths.length} files under ${prefix}/`);
  } else {
    console.log(`  ✓ No files found under ${prefix}/`);
  }
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

    const { data: invite } = await supabase
      .from('merchant_invites')
      .select('phone, currency, plan, stripe_subscription_id, stripe_customer_id')
      .eq('email', ownerEmail)
      .maybeSingle();

    const stripePhone = invite?.phone || null;
    const stripeCurrency = invite?.currency || 'SGD';
    const stripeSubscriptionId = invite?.stripe_subscription_id || null;
    const stripeCustomerId = invite?.stripe_customer_id || null;

    const planRaw = (invite?.plan || 'starter').toLowerCase();
    const tier = BYPASS_EMAILS.includes(ownerEmail) ? 'pro'
               : planRaw.includes('pro') ? 'pro'
               : planRaw.includes('growth') ? 'growth'
               : 'starter';

    const MAX_ROLES = { starter: 3, growth: 5, pro: null }[tier];

    const PLAN_LIMITS = {
      starter: { max_orders: 100,  max_products: 10,   max_users: 3    },
      growth:  { max_orders: 1000, max_products: 50,   max_users: 5    },
      pro:     { max_orders: null, max_products: null,  max_users: null },
    };
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.starter;

    // FIX: enforce the plan's product limit at onboarding time. Previously the
    // subscription row (and its max_products) was only inserted at the very end
    // of this function — AFTER products were already bulk-inserted — so there
    // was nothing for the DB's enforce_product_limit trigger to check against,
    // and a merchant could seed any number of products regardless of tier.
    // Clamping here (and moving the subscription insert earlier below) closes
    // that gap.
    if (limits.max_products != null && formData.products?.length > limits.max_products) {
      console.warn(`⚠ Trimming onboarding products from ${formData.products.length} to plan limit ${limits.max_products} for tier "${tier}"`);
      formData.products = formData.products.slice(0, limits.max_products);
    }

    let allowedSlugs;
    if (tier === 'starter') {
      allowedSlugs = ['owner', 'manager', 'staff'];
    } else {
      allowedSlugs = ['owner', 'manager', 'staff', 'cashier',
                      isFnB ? 'kitchen-staff' : 'inventory-staff'];
    }

    console.log('→ Step 0: cleanup check...');
    try {
      const cleanupIds = new Set();
      const { data: tuRow } = await supabase.from('tenant_users').select('tenant_id').eq('user_email', ownerEmail).maybeSingle();
      if (tuRow?.tenant_id) cleanupIds.add(tuRow.tenant_id);
      const { data: appUser } = await supabase.from('app_users').select('onboarding_completed, tenant_id').eq('email', ownerEmail).maybeSingle();
      if (appUser?.tenant_id) cleanupIds.add(appUser.tenant_id);
      const { data: slugTenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
      if (slugTenant?.id) cleanupIds.add(slugTenant.id);
      const { data: ownerTenants } = await supabase.from('tenants').select('id').eq('owner_email', ownerEmail);
      ownerTenants?.forEach(t => cleanupIds.add(t.id));
      for (const id of cleanupIds) { await cleanupTenant(supabase, id); }
      await supabase.from('app_users').update({ tenant_id: null, onboarding_completed: false }).eq('email', ownerEmail);
      console.log('✓ Step 0 cleanup done');
    } catch (e) { console.warn('Step 0 cleanup warning (non-fatal):', e.message); }

    const newTenantId = formData.pendingTenantId || crypto.randomUUID();

    let logoUrl = formData.logoUrl || null;
    if (logoUrl && logoUrl.includes('/temp/onboarding/')) {
      const filename = logoUrl.split('/').pop();
      const result = await moveFileToPermanent(supabase, logoUrl, `${newTenantId}/logo/${filename}`);
      logoUrl = result.url;
    }

    const productImageMap = {};
    const productImagesArrayMap = {};
    if (formData.products?.length > 0) {
      for (const product of formData.products) {
        if (product.image_url && product.image_url.includes('/temp/onboarding/')) {
          const filename = product.image_url.split('/').pop();
          const result = await moveFileToPermanent(supabase, product.image_url, `${newTenantId}/products/${filename}`);
          productImageMap[product.name] = result.url;
        } else if (product.imageBase64) {
          try {
            const base64Clean = product.imageBase64.replace(/^data:[^;]+;base64,/, '');
            const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
            const filename = `${toSlug(product.name)}-${Date.now()}.png`;
            const path = `${newTenantId}/products/${filename}`;
            const { error } = await supabase.storage.from('product-images').upload(path, bytes, { contentType: 'image/png', upsert: true });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            productImageMap[product.name] = urlData.publicUrl;
          } catch (e) {
            console.warn(`base64 upload warning for "${product.name}":`, e.message);
            productImageMap[product.name] = product.image_url || null;
          }
        } else {
          productImageMap[product.name] = product.image_url || null;
        }
        const movedAdditional: string[] = [];
        if (product.images?.length > 0) {
          for (const imgUrl of product.images) {
            if (!imgUrl) continue;
            if (imgUrl.includes('/temp/onboarding/')) {
              const filename = imgUrl.split('/').pop();
              const result = await moveFileToPermanent(supabase, imgUrl, `${newTenantId}/products/${filename}`);
              movedAdditional.push(result.url);
            } else { movedAdditional.push(imgUrl); }
          }
        }
        productImagesArrayMap[product.name] = movedAdditional;
      }
    }

    console.log('→ Step 3: insert tenant...');
    let tenant;
    try {
      const taxRate = formData.taxRate ?? (formData.country === 'Singapore' ? 9 : formData.country === 'Malaysia' ? 6 : 0);
      const { data, error } = await supabase.from('tenants').insert({
        id: newTenantId, name: businessName, slug: tenantSlug, industry,
        country: formData.country || null, logo_url: logoUrl, owner_email: ownerEmail,
        phone: stripePhone || null,
        address: formData.branchAddress || formData.address || null,
        status: 'trial', plan: 'free', currency: formData.currency || 'SGD',
        settings: { branch_name: formData.branchName || null, tax_rate: taxRate, tax_inclusive: formData.taxInclusive ?? false },
      }).select().single();
      if (error) throw error;
      tenant = data;
      console.log('✓ Step 3 tenant inserted:', tenant.id);
    } catch (e) { return fail(3, 'tenants', e); }

    console.log('→ Step 4: insert theme_config...');
    try {
      const { error } = await supabase.from('theme_configs').insert({
        tenant_id: newTenantId,
        primary_color: formData.customPrimary || '#3b82f6',
        accent_color: formData.customSecondary || '#9333ea',
        color_set_name: formData.theme || 'Default',
        logo_url: logoUrl,
      });
      if (error) throw error;
      console.log('✓ Step 4 theme_config inserted');
    } catch (e) { return fail(4, 'theme_configs', e); }

    console.log('→ Step 5: insert roles...');
    let ownerRole;
    try {
      const ROLE_DEFS = {
        'owner': {
          tenant_id: newTenantId, name: 'Owner', slug: 'owner', is_system: true,
          description: 'Business owner with full access',
          permissions: [
            'orders.view','orders.create','orders.edit','orders.cancel',
            'products.view','products.create','products.edit','products.delete',
            'categories.view','categories.create','categories.edit','categories.delete',
            'inventory.view','inventory.edit','inventory.adjust','inventory.restock',
            'inventory.stock_take','inventory.delivery_order',
            'tables.view','tables.create','tables.edit','tables.delete',
            'staff.view','staff.create','staff.edit','staff.delete',
            'roles.view','roles.create','roles.edit','roles.delete',
            'reports.view','reports.export',
            'settings.view','settings.edit','theme.edit',
            'payments.view','payments.edit',
            'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete',
          ],
        },
        'manager': {
          tenant_id: newTenantId, name: 'Manager', slug: 'manager', is_system: false,
          description: 'Day-to-day operations management',
          permissions: [
            'staff.view','staff.edit',
            'products.view','products.create','products.edit',
            'categories.view','categories.create','categories.edit',
            'inventory.view','inventory.adjust','inventory.restock',
            'inventory.stock_take','inventory.delivery_order',
            'orders.view','orders.create','orders.edit',
            'tables.view','tables.edit',
            'payments.view',
            'reports.view',
            'suppliers.view','suppliers.edit',
          ],
        },
        'cashier': {
          tenant_id: newTenantId, name: 'Cashier', slug: 'cashier', is_system: false,
          description: 'Process orders and payments',
          permissions: [
            'products.view','categories.view',
            'orders.view','orders.create','orders.edit',
            'tables.view',
            'payments.view',
          ],
        },
        'kitchen-staff': {
          tenant_id: newTenantId, name: 'Kitchen Staff', slug: 'kitchen-staff', is_system: false,
          description: 'View and update order preparation status',
          permissions: ['products.view','orders.view','orders.edit','inventory.view'],
        },
        'inventory-staff': {
          tenant_id: newTenantId, name: 'Inventory Staff', slug: 'inventory-staff', is_system: false,
          description: 'Stock and inventory management',
          permissions: [
            'products.view',
            'inventory.view','inventory.adjust','inventory.restock',
            'inventory.stock_take','inventory.delivery_order',
            'categories.view',
            'suppliers.view','suppliers.edit',
          ],
        },
        'staff': {
          tenant_id: newTenantId, name: 'Staff', slug: 'staff', is_system: false,
          description: 'Basic staff access',
          permissions: ['products.view','orders.view','orders.create','tables.view'],
        },
      };

      const rolesToSeed = allowedSlugs.filter(slug => ROLE_DEFS[slug]).map(slug => ROLE_DEFS[slug]);
      const { data, error } = await supabase.from('roles').insert(rolesToSeed).select();
      if (error) throw error;
      ownerRole = data.find(r => r.slug === 'owner');
      if (!ownerRole) throw new Error('Owner role not found after insert');
      console.log('✓ Step 5 roles inserted:', data.map(r => r.name));
    } catch (e) { return fail(5, 'roles', e); }

    console.log('→ Step 6: insert tenant_users...');
    try {
      const { error } = await supabase.from('tenant_users').insert({
        tenant_id: newTenantId, user_email: ownerEmail,
        role_id: ownerRole.id, role_name: 'Owner', is_owner: true, status: 'active',
      });
      if (error) throw error;
      console.log('✓ Step 6 tenant_users inserted');
    } catch (e) { return fail(6, 'tenant_users', e); }

    console.log('→ Step 7: update app_users...');
    let updatedUser;
    try {
      const { data: existingUser } = await supabase.from('app_users').select('id, phone').eq('email', ownerEmail).maybeSingle();
      if (existingUser) {
        const { data, error } = await supabase.from('app_users')
          .update({
            onboarding_completed: true,
            tenant_id: newTenantId,
            ...(stripePhone ? { phone: stripePhone } : {}),
          })
          .eq('email', ownerEmail).select().maybeSingle();
        if (error) throw error;
        updatedUser = data;
      } else {
        const { data, error } = await supabase.from('app_users')
          .insert({ email: ownerEmail, phone: stripePhone, onboarding_completed: true, tenant_id: newTenantId })
          .select().maybeSingle();
        if (error) throw error;
        updatedUser = data;
      }
      console.log('✓ Step 7 app_users done');
    } catch (e) { return fail(7, 'app_users', e); }

    try {
      await supabase.from('merchant_invites')
        .update({ status: 'registered', updated_date: new Date().toISOString() })
        .eq('email', ownerEmail).eq('status', 'pending');
    } catch (e) { console.warn('Step 7b warning:', e.message); }

    // ── Step 8: insert subscription ───────────────────────────────────────────
    // MOVED: this used to run last (after products/tables were already
    // inserted). It's now created right after the tenant/roles/users exist and
    // BEFORE categories/products, so subscriptions.max_products is in place
    // for the enforce_product_limit DB trigger to check against when Step 11
    // inserts the onboarding products below.
    console.log('→ Step 8: insert subscription...');
    try {
      const now = new Date();
      const fallbackTrialEnd = new Date(now);
      fallbackTrialEnd.setDate(fallbackTrialEnd.getDate() + 3);

      // FIX: previously this ALWAYS hardcoded status:'trial' with a fixed 3-day
      // window, even when the merchant had already paid in full at checkout
      // (e.g. via a NO_TRIAL_LINKS payment link with an immediate charge). That
      // meant a fully-paid subscription still got recorded locally as a 3-day
      // trial, so it would show "trial has ended" the moment that fake window
      // lapsed, regardless of what Stripe actually billed. We now ask Stripe for
      // the real subscription state (mirrors the in-app-upgrade branch in
      // stripe-webhook) and only fall back to the 3-day trial when there's
      // genuinely no Stripe subscription to check.
      let subStatus = 'trial';
      let periodStart = now.toISOString();
      let periodEnd = fallbackTrialEnd.toISOString();

      if (stripeSubscriptionId) {
        try {
          const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2026-04-22.dahlia' as any });
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          subStatus = stripeSub.status === 'trialing' ? 'trial' : 'active';
          const resolvedPeriod = getSubPeriod(stripeSub);
          if (resolvedPeriod.start) periodStart = resolvedPeriod.start;
          if (resolvedPeriod.end) periodEnd = resolvedPeriod.end;
          console.log('  ✓ Resolved real Stripe subscription state:', { stripeStatus: stripeSub.status, mappedStatus: subStatus, periodEnd });
        } catch (e) {
          console.warn('  Could not fetch Stripe subscription (falling back to 3-day trial):', e.message);
        }
      } else {
        console.warn('  No stripeSubscriptionId on invite — defaulting to 3-day trial');
      }

      const { error } = await supabase.from('subscriptions').insert({
        tenant_id: newTenantId, tier, status: subStatus,
        billing_cycle: 'monthly',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        currency: stripeCurrency,
        max_roles: MAX_ROLES,
        max_orders: limits.max_orders,
        max_products: limits.max_products,
        max_users: limits.max_users,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
      });
      if (error) throw error;

      // FIX: mark has_used_trial immediately when the initial 3-day trial starts.
      // Previously this only got set inside stripe-webhook's in-app-upgrade branch,
      // meaning it stayed false through the entire trial period. Any later upgrade
      // would then incorrectly qualify for ANOTHER free trial via UpgradeWall's
      // hasUsedTrial check, instead of going straight to a full paid subscription.
      // Also FIX: record tenants.stripe_customer_id here too — previously this was
      // only ever set by stripe-webhook's in-app-upgrade branch, so a merchant's
      // very first (signup-time) Stripe customer was never linked on the tenant
      // row, breaking any later webhook event that looks up the tenant by
      // stripe_customer_id (e.g. customer.subscription.updated).
      await supabase.from('tenants').update({ has_used_trial: true, stripe_customer_id: stripeCustomerId }).eq('id', newTenantId);

      console.log('✓ Step 8 subscription inserted | tier:', tier, '| status:', subStatus, '| max_products:', limits.max_products, '| has_used_trial set true');
    } catch (e) { return fail(8, 'subscriptions', e); }

    const rawHours = formData.operatingHours || formData.businessHours || formData.operating_hours;
    if (rawHours) {
      try {
        const validDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
        const hoursRows = Object.entries(rawHours).map(([day, config]: [string, any]) => {
          const normalizedDay = day.trim().toLowerCase();
          return {
            tenant_id: newTenantId,
            day_of_week: validDays.includes(normalizedDay) ? normalizedDay : null,
            open_time: config.enabled ? (config.start || config.open || config.openTime || '09:00') : null,
            close_time: config.enabled ? (config.end || config.close || config.closeTime || '22:00') : null,
            is_closed: !config.enabled,
          };
        }).filter(r => r.day_of_week !== null);
        if (hoursRows.length > 0) {
          const { error } = await supabase.from('business_hours').insert(hoursRows);
          if (error) throw error;
          console.log('✓ Step 9 business_hours inserted:', hoursRows.length);
        }
      } catch (e) { return fail(9, 'business_hours', e); }
    }

    const categoryMap = {};
    if (formData.products?.length > 0) {
      const uniqueCategories = [...new Set(formData.products.map((p: any) => p.category).filter(Boolean))];
      if (uniqueCategories.length > 0) {
        try {
          const { data, error } = await supabase.from('categories')
            .insert(uniqueCategories.map((cat: any) => ({ tenant_id: newTenantId, name: cat, slug: toSlug(String(cat)), is_active: true })))
            .select();
          if (error) throw error;
          data.forEach((c: any) => { categoryMap[c.name] = c.id; });
          console.log('✓ Step 10 categories inserted:', data.length);
        } catch (e) { return fail(10, 'categories', e); }
      }
    }

    if (formData.products?.length > 0) {
      try {
        const productRows = formData.products.map((p) => ({
          tenant_id: newTenantId,
          category_id: categoryMap[p.category] || null,
          name: p.name, slug: toSlug(p.name),
          price: parseFloat(p.price) || 0,
          image_url: productImageMap[p.name] || p.image_url || null,
          images: productImagesArrayMap[p.name] ?? p.images ?? [],
          description: p.description || null,
          is_active: true,
        }));
        const { data: insertedProducts, error } = await supabase.from('products').insert(productRows).select();
        if (error) throw error;
        console.log('✓ Step 11 products inserted:', insertedProducts.length);
        const inventoryRows = insertedProducts.map(p => ({
          tenant_id: newTenantId, product_id: p.id,
          current_stock: 0, low_stock_threshold: 5, par_level: 0, unit: 'pcs',
        }));
        const { error: invErr } = await supabase.from('inventory_items').insert(inventoryRows);
        if (invErr) console.warn('Step 11b inventory_items warning:', invErr.message);
      } catch (e) { return fail(11, 'products', e); }
    }

    if (isFnB) {
      const tableRows: any[] = [];
      if (formData.tables?.length > 0) {
        for (const t of formData.tables) {
          const tableId = t.id || crypto.randomUUID();
          tableRows.push({
            id: tableId, tenant_id: newTenantId,
            name: t.label || t.name || `Table ${tableRows.length + 1}`,
            capacity: parseInt(t.pax) || parseInt(t.capacity) || 2,
            zone: t.zone || null,
            status: 'available', sort_order: tableRows.length,
            qr_code_url: `https://sellio.apptelier.sg/order/${tenantSlug}/${tableId}`,
          });
        }
      } else if (formData.tableCount > 0) {
        for (let i = 0; i < formData.tableCount; i++) {
          const tableId = crypto.randomUUID();
          tableRows.push({
            id: tableId, tenant_id: newTenantId,
            name: `Table ${i + 1}`,
            capacity: parseInt(formData.tablePax) || 4,
            zone: null,
            status: 'available', sort_order: i,
            qr_code_url: `https://sellio.apptelier.sg/order/${tenantSlug}/${tableId}`,
          });
        }
      } else if (formData.singleQrLabel) {
        // FIX: takeaway/counter-only QR ("No, takeaway/counter only" path) was never
        // persisted anywhere. Auto-create one default "table" row representing it so
        // merchants can revisit, download, or reprint it from the Tables page.
        const tableId = crypto.randomUUID();
        tableRows.push({
          id: tableId, tenant_id: newTenantId,
          name: formData.singleQrLabel || 'Takeaway / Counter',
          capacity: 0,
          zone: null,
          status: 'available', sort_order: 0,
          qr_code_url: `https://sellio.apptelier.sg/order/${tenantSlug}/${tableId}`,
        });
      }
      if (tableRows.length > 0) {
        try {
          const { error } = await supabase.from('tables').insert(tableRows);
          if (error) throw error;
          console.log('✓ Step 12 tables inserted:', tableRows.length);
        } catch (e) { return fail(12, 'tables', e); }
      }
    }

    try {
      await deleteStorageFolder(supabase, 'product-images', `temp/onboarding/${newTenantId}`);
    } catch (e) { console.warn('Step 13 temp cleanup warning:', e.message); }

    console.log('=== completeOnboarding SUCCESS ===', { tenant_id: newTenantId });
    return Response.json({
      success: true, tenant_id: newTenantId, tenant_slug: tenantSlug, user: updatedUser,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('completeOnboarding unexpected error:', error);
    return Response.json({ success: false, failedStep: 'unexpected', error: error.message }, { status: 500, headers: corsHeaders });
  }
});
