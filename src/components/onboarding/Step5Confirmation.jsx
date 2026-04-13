import React, { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket, Loader2, CheckCircle2, Circle, Star, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
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
  const chosenColor = formData?.customPrimary || '#3b82f6';
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';

  const getTaxRate = () => {
    if (formData.country === 'Singapore') return 9;
    if (formData.country === 'Malaysia') return 6;
    return formData.taxRate ?? 0;
  };

  const getTaxLabel = () => {
    if (formData.country === 'Singapore') return 'GST';
    if (formData.country === 'Malaysia') return 'SST';
    return 'Tax';
  };

  const taxRate = getTaxRate();
  const taxLabel = getTaxLabel();

  const isFoodBeverage = formData.businessType?.toLowerCase().includes('food') || formData.businessType?.toLowerCase().includes('f&b');

  const checklistItems = [
    { label: 'Business Profile', completed: !!formData.businessName, optional: false },
    { label: 'Branch Setup', completed: !!formData.country, optional: false },
    { label: 'Menu/Services', completed: formData.products?.length > 0, optional: true },
    ...(isFoodBeverage ? [{ label: 'Tables & QR Codes', completed: formData.tableCount > 0 || formData.tables?.length > 0, optional: true }] : []),
  ];

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;
  const progressPercentage = (completedCount / totalCount) * 100;
  const isNearComplete = progressPercentage >= 75;

  const nextSteps = [
    'Access your dashboard to start taking orders and bookings',
    'Print QR codes for tables (if applicable)',
    'Invite your team members to collaborate',
    'Customize settings and branding anytime',
  ];

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
            tax_rate: taxRate,
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

      // Launch confetti with more intensity
      confetti({
        particleCount: 250,
        spread: 120,
        origin: { y: 0.6 },
        gravity: 0.8,
        scalar: 1.3,
        duration: 3000
      });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { x: 0.2, y: 0.8 },
        gravity: 0.8,
        duration: 2500
      });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { x: 0.8, y: 0.8 },
        gravity: 0.8,
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
    <div className="w-full space-y-6">
      {/* Setup Checklist Card */}
      <Card className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Star className="w-6 h-6 text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900">Setup Checklist</h2>
        </div>

        <div className="space-y-3">
          {checklistItems.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.15, duration: 0.4 }}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                item.completed ? 'bg-white' : 'bg-white border-slate-200'
              }`}
              style={item.completed ? { borderColor: chosenColor || '#10b981' } : {}}
            >
              <div className="flex-shrink-0">
                {item.completed ? (
                  <CheckCircle2 className="w-5 h-5" style={{ color: chosenColor || '#10b981' }} />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <span className={`flex-1 font-semibold ${
                item.completed ? 'text-emerald-900' : 'text-slate-700'
              }`}>
                {item.label}
              </span>
              {item.optional && (
                <span className="text-xs font-medium text-slate-500">Optional</span>
              )}
            </motion.div>
          ))}
        </div>
      </Card>

      {/* What Happens Next Card */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 shadow-lg">
        <h3 className="text-lg font-bold text-slate-900 mb-4">What happens next?</h3>
        <ul className="space-y-3">
          {nextSteps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <span className="text-slate-700">{step}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={prevStep}
          variant="outline"
          className="h-11 px-6 gap-2"
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
              Going Live...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              Go Live!
            </>
          )}
        </Button>
      </div>
    </div>
  );
}