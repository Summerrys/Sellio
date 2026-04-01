import React, { useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Rocket, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Step5Confirmation({ formData, prevStep, onComplete }) {
  const [isLaunching, setIsLaunching] = useState(false);

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
          status: 'trial',
          plan: 'free',
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
            is_active: true,
          });
        }
      }

      // Launch confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
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
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready to Launch! 🎉</h2>
        <p className="text-slate-500">Review your setup and launch your business</p>
      </div>

      <div className="space-y-4 mb-8 max-h-[400px] overflow-y-auto">
        <SummaryItem icon={Check} label="Business" value={formData.businessName} />
        <SummaryItem icon={Check} label="Type" value={formData.businessType?.charAt(0).toUpperCase() + formData.businessType?.slice(1) || 'N/A'} />
        <SummaryItem 
          icon={Check} 
          label="Theme" 
          value={
            <div className="flex items-center gap-2">
              <span>{formData.theme}</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.themeColors?.dark || '#000' }} />
                <div className="w-4 h-4 rounded" style={{ backgroundColor: formData.themeColors?.light || '#ccc' }} />
              </div>
            </div>
          } 
        />
        <SummaryItem icon={Check} label="Admin" value={formData.adminName || formData.adminEmail} />
        <SummaryItem icon={Check} label="Email" value={formData.adminEmail} />
        <SummaryItem icon={Check} label="Currency" value={formData.currency} />
        <SummaryItem icon={Check} label="Tax" value={`${formData.taxRate}% (${formData.taxInclusive ? 'Inclusive' : 'Exclusive'})`} />
        {formData.tableCount > 0 && (
          <SummaryItem icon={Check} label="Tables" value={`${formData.tableCount} tables`} />
        )}
        {formData.products?.length > 0 && (
          <SummaryItem icon={Check} label="Products" value={`${formData.products.length} product${formData.products.length > 1 ? 's' : ''} added`} />
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
          className="flex-1 h-12 bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] hover:opacity-90 text-base font-medium gap-2"
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