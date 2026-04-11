import React, { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket, Loader2 } from 'lucide-react';
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
    <Card className="p-4 sm:p-6 bg-white border-0 shadow-lg w-full" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeColor }}>
          <Rocket className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Ready to Launch</h2>
        <p className="text-sm text-slate-500">Your business configuration is complete</p>
      </div>

      {/* Summary Grid - Two Columns */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Business Info */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Business</div>
          <p className="text-sm font-bold text-slate-900 truncate">{formData.businessName}</p>
          <p className="text-xs text-slate-600 capitalize">{formData.businessType}</p>
        </div>

        {/* Location & Currency */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Setup</div>
          <p className="text-sm font-bold text-slate-900">{formData.country}</p>
          <p className="text-xs text-slate-600">{formData.currency}</p>
        </div>

        {/* Admin Info */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Admin</div>
          <p className="text-sm font-bold text-slate-900 truncate">{formData.adminName || 'Admin'}</p>
          <p className="text-xs text-slate-600 truncate">{formData.adminEmail}</p>
        </div>

        {/* Theme & Tax */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Details</div>
          <p className="text-sm font-bold text-slate-900">{formData.theme || 'Default'} Theme</p>
          <p className="text-xs text-slate-600">Tax: {formData.taxRate}%</p>
        </div>
      </div>

      {/* Products & Tables Summary */}
      <div className="space-y-2 mb-6">
        {formData.products?.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">📦 {formData.products.length} Product{formData.products.length > 1 ? 's' : ''}</span>
            <span className="text-xs text-blue-700">Menu configured</span>
          </div>
        )}
        
        {formData.tables?.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-amber-900">🍽️ {formData.tables.length} Table{formData.tables.length > 1 ? 's' : ''}</span>
            <span className="text-xs text-amber-700">QR ready</span>
          </div>
        )}

        {formData.logoUrl && (
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-purple-900">🎨 Logo</span>
            <span className="text-xs text-purple-700">Uploaded</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={prevStep}
          variant="outline"
          className="h-11 px-4 gap-2"
          disabled={isLaunching}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={isLaunching}
          className="flex-1 h-11 hover:opacity-90 text-base font-semibold gap-2 text-white"
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
              Launch Business
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}