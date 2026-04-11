import React, { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Rocket, Loader2, Globe, Utensils, Package } from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';



export default function Step5Confirmation({ formData, prevStep, onComplete }) {
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    const colors = formData.customPrimary && formData.customSecondary
      ? { primary: formData.customPrimary, secondary: formData.customSecondary }
      : DEFAULT_COLORS;
    const variables = generateThemeVariables(colors.primary, colors.secondary);
    Object.entries(variables).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [formData.customPrimary, formData.customSecondary]);

  const { primary: primaryColor } = getThemeCSSColors(formData);
  const chosenColor = formData?.theme ? (formData?.themeColors?.dark || formData?.customPrimary) : null;
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';

  const handleLaunch = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    
    try {
      const supabase = await getSupabase();
      const slug = formData.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      // Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: formData.businessName,
          slug,
          industry: formData.businessType,
          owner_email: formData.adminEmail,
          country: formData.country,
          currency: formData.currency,
          address: formData.address || null,
          status: 'trial',
          plan: 'free',
          settings: {
            branch_name: formData.branchName || null,
            tax_rate: formData.taxRate ?? null,
            tax_inclusive: formData.taxInclusive ?? false,
          },
        })
        .select()
        .single();
      
      if (tenantError) throw tenantError;

      // Create theme config
      if (formData.customPrimary && formData.customSecondary) {
        await supabase.from('theme_configs').insert({
          tenant_id: tenant.id,
          color_set_name: formData.theme || 'Custom',
          primary_color: formData.customPrimary,
          accent_color: formData.customSecondary,
        });
      }

      // Create asset if logo was uploaded
      if (formData.logoUrl) {
        await supabase.from('assets').insert({
          tenant_id: tenant.id,
          name: 'business_logo',
          type: 'logo',
          url: formData.logoUrl,
          is_active: true,
        });
      }

      // Create admin role
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

      // Create tenant user (admin)
      await supabase.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_email: formData.adminEmail,
        role_id: adminRole.id,
        role_name: 'Admin',
        is_owner: true,
        status: 'active',
      });

      // Save business hours
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
        await supabase.from('business_hours').insert(hoursRows);
      }

      // Create tables if F&B business
      if (formData.tableCount > 0) {
        const tables = Array.from({ length: formData.tableCount }, (_, i) => ({
          tenant_id: tenant.id,
          name: `T${i + 1}`,
          capacity: 4,
          status: 'available',
          sort_order: i,
        }));
        await supabase.from('tables').insert(tables);
      }

      // Create products
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

          await supabase.from('products').insert({
            tenant_id: tenant.id,
            category_id: categoryId,
            name: product.name,
            slug: product.name.toLowerCase().replace(/\s+/g, '-'),
            price: product.price,
            image_url: product.images?.[0] || null,
            tags: product.images?.length > 1 ? product.images.slice(1) : [],
            is_active: true,
          });
        }
      }

      // Launch confetti
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 },
        duration: 3000
      });
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { x: 0.2, y: 0.8 },
        duration: 2500
      });
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { x: 0.8, y: 0.8 },
        duration: 2500
      });

      // Wait a moment for effect
      setTimeout(() => {
        onComplete();
      }, 1500);

    } catch (error) {
      console.error('Onboarding error:', error);
      alert('Something went wrong. Please try again.');
      setIsLaunching(false);
    }
  };

  return (
    <Card className="p-3 sm:p-5 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeColor }}>
          <Rocket className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready to Launch! 🎉</h2>
        <p className="text-slate-500">Review your setup and launch your business</p>
      </div>

      <div className="space-y-3 mb-8 max-h-[500px] overflow-y-auto">
        {/* Step 1: Business & Theme */}
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Business Setup</div>
        <SummaryItem icon={Check} label="Business Name" value={formData.businessName} />
        <SummaryItem icon={Check} label="Business Type" value={formData.businessType?.charAt(0).toUpperCase() + formData.businessType?.slice(1) || 'N/A'} />
        <SummaryItem icon={Check} label="Country" value={formData.country} />
        {formData.logoUrl && <SummaryItem icon={Check} label="Logo" value="Uploaded" />}
        
        {/* Step 2: Theme & Branch */}
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Theme & Settings</div>
        <SummaryItem 
          icon={Check} 
          label="Theme" 
          value={
            <div className="flex items-center gap-2">
              <span>{formData.theme || 'Not selected'}</span>
              {formData.themeColors && (
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.themeColors?.dark || '#000' }} />
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.themeColors?.light || '#ccc' }} />
                </div>
              )}
            </div>
          } 
        />
        <SummaryItem icon={Check} label="Admin Name" value={formData.adminName || formData.adminEmail} />
        <SummaryItem icon={Check} label="Admin Email" value={formData.adminEmail} />
        <SummaryItem icon={Check} label="Currency" value={formData.currency} />
        <SummaryItem icon={Check} label="Tax Rate" value={`${formData.taxRate}% (${formData.taxInclusive ? 'Inclusive' : 'Exclusive'})`} />
        {formData.branchName && <SummaryItem icon={Check} label="Branch Name" value={formData.branchName} />}
        {formData.address && <SummaryItem icon={Check} label="Address" value={formData.address} />}
        
        {/* Step 3: Menu/Products */}
        {formData.products?.length > 0 && (
          <>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Menu & Products</div>
            <SummaryItem icon={Package} label="Products" value={`${formData.products.length} product${formData.products.length > 1 ? 's' : ''} configured`} />
            {formData.products.slice(0, 3).map((product, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">{product.category}</p>
                  <div className="text-sm font-medium text-slate-900 truncate">{product.name} • ${product.price}</div>
                </div>
              </div>
            ))}
            {formData.products.length > 3 && (
              <div className="px-3 py-2 text-xs text-slate-500">+{formData.products.length - 3} more products</div>
            )}
          </>
        )}
        
        {/* Step 4: Tables & QR */}
        {formData.tables?.length > 0 && (
          <>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4">Tables & QR Codes</div>
            <SummaryItem icon={Utensils} label="Tables" value={`${formData.tables.length} tables created`} />
            {formData.tables.slice(0, 3).map((table, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Utensils className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500">Table</p>
                  <div className="text-sm font-medium text-slate-900">{table.label} {table.pax ? `• ${table.pax} pax` : ''}</div>
                </div>
              </div>
            ))}
            {formData.tables.length > 3 && (
              <div className="px-3 py-2 text-xs text-slate-500">+{formData.tables.length - 3} more tables</div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={prevStep}
          variant="outline"
          className="flex-1 h-12"
          disabled={isLaunching}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={isLaunching}
          className="flex-1 h-12 hover:opacity-90 text-base font-medium gap-2 text-white"
          style={{ background: themeColor }}
        >
          {isLaunching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              Launch Your Business
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function SummaryItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="text-sm font-medium text-slate-900 truncate">
          {typeof value === 'string' ? value : value}
        </div>
      </div>
    </div>
  );
}