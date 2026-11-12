import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket, Loader2, CheckCircle2, Circle, Star } from 'lucide-react';
import confetti from 'canvas-confetti';
import { isFnBIndustry } from '@/lib/industry';
import { motion } from 'framer-motion';
import { generateThemeVariables } from '../theme/themeUtils';
import { useAppUser, cookieUtils } from '@/lib/AppUserContext';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';
import { getSupabase } from '@/lib/supabaseClient';
import { useBackToClose } from '@/lib/useBackToClose';
import { countryNamed } from '@/lib/countries';
import { useAppText } from '@/lib/appText';

export default function Step5Confirmation({ formData, prevStep, onComplete }) {
  const { t } = useAppText();
  const { appUser, updateAppUser } = useAppUser();
  const [isLaunching, setIsLaunching] = useState(false);
  // While the store is being created, phone / browser Back waits instead of stepping back.
  useBackToClose(isLaunching, () => false);

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
  const chosenColor = formData?.theme ? formData.customPrimary : '#3b82f6';
  const themeColor = formData?.theme ? formData.customPrimary : 'linear-gradient(to right, #3b82f6, #9333ea)';

  // The country's tax preset (lib/countries.js): GST 9%, SST 6%, or none in Indonesia.
  const country = countryNamed(formData.country);
  const taxRate = formData.taxRate ?? country?.tax.rate ?? 0;
  const taxLabel = taxRate > 0 ? (country?.tax.name || t('Tax')) : t('No tax');

  const isFoodBeverage = isFnBIndustry(formData.businessType);

  const checklistItems = [
    { label: t('Business Profile'), completed: !!formData.businessName, optional: false },
    { label: t('Branch Setup'), completed: !!formData.country, optional: false },
    { label: t('Menu/Services'), completed: formData.products?.length > 0, optional: true },
    ...(isFoodBeverage ? [{ label: t('Tables & QR Codes'), completed: formData.tableCount > 0 || formData.tables?.length > 0, optional: true }] : []),
  ];

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;
  const progressPercentage = (completedCount / totalCount) * 100;
  const isNearComplete = progressPercentage >= 75;

  const nextSteps = [
    t('Access your dashboard to start taking orders and bookings'),
    t('Print QR codes for tables (if applicable)'),
    t('Invite your team members to collaborate'),
    t('Customize settings and branding anytime'),
  ];

  const [launchLabel, setLaunchLabel] = useState('');

  const handleLaunch = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    setLaunchLabel(t('Setting up your store…'));

    try {
      let storedUser = appUser;
      if (!storedUser?.id) storedUser = cookieUtils.get();
      if (!storedUser?.id) throw new Error(t('No user session found. Please log in.'));
      const ownerEmail = storedUser?.email || formData.adminEmail;
      if (!ownerEmail) throw new Error(t('No owner email found. Please log in.'));

      const supabase = await getSupabase();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error(t('Your session has expired. Please sign in again.'));
      }

      const res = await fetch('https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          user_id: storedUser.id,
          formData: {
            ...formData,
            ownerEmail,
            pendingTenantId: localStorage.getItem('pending_tenant_id') || formData.pendingTenantId,
          },
        }),
      });
      const result = await res.json();
      if (!result?.success) {
        const msg = result?.failedStep
          ? t('Failed at {step}: {error}', { step: result.failedStep, error: result.error })
          : (result?.error || t('Onboarding failed'));
        throw new Error(msg);
      }

      const { tenant_id } = result;
      updateAppUser({ onboarding_completed: true, tenant_id });

      // Clear temp localStorage keys
      localStorage.removeItem('onboarding_session_id');
      localStorage.removeItem('onboarding_logo_temp_path');
      localStorage.removeItem('onboarding_logo_temp_url');
      localStorage.removeItem('pending_tenant_id');

      confetti({ particleCount: 250, spread: 120, origin: { y: 0.6 }, gravity: 0.8, scalar: 1.3 });
      confetti({ particleCount: 150, spread: 70, origin: { x: 0.2, y: 0.8 }, gravity: 0.8 });
      confetti({ particleCount: 150, spread: 70, origin: { x: 0.8, y: 0.8 }, gravity: 0.8 });

      setTimeout(async () => {
        try { await onComplete(); } catch { /* still go to the Dashboard */ }
        // Force full page reload so TenantContext re-fetches fresh data. It replaces the
        // setup page, so Back from the Dashboard doesn't land on a finished setup.
        setTimeout(() => { window.location.replace('/Dashboard'); }, 500);
      }, 1500);

    } catch (error) {
      console.error('Onboarding error:', error);
      alert(t('Something went wrong: {error}', { error: error?.message || JSON.stringify(error) }));
      setIsLaunching(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Setup Checklist Card */}
      <Card className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Star className="w-6 h-6 text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900">{t('Setup Checklist')}</h2>
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
              style={item.completed ? (
                formData?.theme
                  ? { borderColor: chosenColor }
                  : { border: '2px solid transparent', background: 'linear-gradient(white, white) padding-box, ' + themeColor + ' border-box' }
              ) : {}}
            >
              <div className="flex-shrink-0">
                {item.completed ? (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: themeColor }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <span className={`flex-1 font-semibold ${
                item.completed ? 'text-slate-900' : 'text-slate-700'
              }`}>
                {item.label}
              </span>
              {item.optional && (
                <span className="text-xs font-medium text-slate-500">{t('Optional')}</span>
              )}
            </motion.div>
          ))}
        </div>
      </Card>

      {/* What Happens Next Card */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 shadow-lg">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('What happens next?')}</h3>
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
          <ArrowLeft className="w-4 h-4" />{' '}{t('Back')}
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
              {launchLabel || t('Setting up your store…')}
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              {t('Go Live!')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}