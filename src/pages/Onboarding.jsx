import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import { isFnBIndustry } from '@/lib/industry';
import Step1Combined from '../components/onboarding/Step1Combined';
import Step2Business from '../components/onboarding/Step2Business';
import Step3MenuSetup from '../components/onboarding/Step3MenuSetup';
import Step4TablesQR from '../components/onboarding/Step4TablesQR';
import Step5Confirmation from '../components/onboarding/Step5Confirmation';
import OnboardingProgress from '../components/onboarding/OnboardingProgress';
import AppLoader from '@/components/ui-custom/AppLoader';
import { getSupabase } from '@/lib/supabaseClient';
import { decideOnboardingAccess } from '@/lib/accountFlow';
import { useBackToClose, removeBackStep } from '@/lib/useBackToClose';
import { COUNTRIES, countryNamed, visitorCountry } from '@/lib/countries';
import { useAppText } from '@/lib/appText';

const STORAGE_KEY = 'apptelier_onboarding_state';

export default function Onboarding() {
  const { t, textKey } = useAppText();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  // Phone / browser Back goes to the previous step, like the step's own Back button.
  useBackToClose(currentStep > 1, () => {
    setCurrentStep(s => Math.max(s - 1, 1));
    if (currentStep > 2) return false; // still steps to go back through
  });
  // Business setup is for an account with a paid plan waiting. A store already →
  // Dashboard; neither → the account page. (complete-onboarding checks again.)
  const [access, setAccess] = useState('checking');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result = 'allowed';
      try {
        const supabase = await getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          result = 'signin';
        } else {
          const { data, error } = await supabase.rpc('my_account_status');
          result = decideOnboardingAccess(data, error);
        }
      } catch {
        result = 'allowed';
      }
      if (cancelled) return;
      if (result === 'allowed') setAccess('allowed');
      else window.location.replace({ signin: '/Auth', dashboard: '/Dashboard', account: '/Account' }[result]);
    })();
    return () => { cancelled = true; };
  }, []);
  // Generate pendingTenantId once and persist — must survive page reloads so temp storage paths stay consistent
  const getOrCreatePendingTenantId = () => {
    const existing = localStorage.getItem('pending_tenant_id');
    if (existing) return existing;
    const newId = crypto.randomUUID();
    localStorage.setItem('pending_tenant_id', newId);
    return newId;
  };

  // The country starts as the visitor's when their phone or computer is in one of Sellio's
  // (lib/countries.js), else Singapore; its currency and tax preset come with it.
  const [startCountry] = useState(() => countryNamed(visitorCountry()) || COUNTRIES[0]);
  const [formData, setFormData] = useState({
    // Step 1 (Business & Theme)
    businessName: '',
    businessType: '',
    country: startCountry.name,
    logoUrl: '',
    theme: '',
    // Step 2 (Branch Setup)
    currency: startCountry.currency,
    taxRate: startCountry.tax.rate,
    taxInclusive: false,
    businessHours: {},
    tableCount: 0,
    // Step 3 (Menu Setup)
    products: [],
    // Pre-generated tenant ID used for temp storage paths during onboarding
    pendingTenantId: getOrCreatePendingTenantId(),
  });

  // Load from localStorage on mount (Supabase is the backup, localStorage is primary for speed)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Always use the persisted pendingTenantId, never overwrite with a stale saved one
        const persistedTenantId = localStorage.getItem('pending_tenant_id') || crypto.randomUUID();
        setFormData({ ...(parsed.formData || {}), pendingTenantId: persistedTenantId });
        setCurrentStep(parsed.currentStep || 1);
      } catch (e) {
        console.error('Failed to parse saved onboarding state');
      }
    }
  }, []);

  // Save to localStorage whenever state changes (exclude large fields like products)
  useEffect(() => {
    const { products, ...smallFormData } = formData;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData: smallFormData, currentStep }));
    } catch (e) {
      // Quota exceeded — clear and retry with minimal data
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData: smallFormData, currentStep }));
      } catch (_) {
        // Silently ignore if still failing
      }
    }
  }, [formData, currentStep]);



  const updateFormData = (data) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const getSteps = () => {
    const isFnB = isFnBIndustry(formData.businessType);
    const baseSteps = [
      { component: Step1Combined, title: t('Business Theme') },
      { component: Step2Business, title: t('Branch Setup') },
      { component: Step3MenuSetup, title: t('Menu Setup') },
    ];
    
    if (isFnB) {
      baseSteps.push({ component: Step4TablesQR, title: t('Tables & QR') });
    }
    
    baseSteps.push({ component: Step5Confirmation, title: t('Review & Launch') });
    return baseSteps;
  };

  // Recalculate steps whenever businessType (or the app's language) changes
  const steps = React.useMemo(() => getSteps(), [formData.businessType, textKey]);

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCompletedSteps([...completedSteps, currentStep]);
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleComplete = async () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('pending_tenant_id');
    // Replaces the finished setup (its Back step taken off first), so Back from the
    // Dashboard doesn't return to it.
    await removeBackStep();
    navigate(createPageUrl('Dashboard'), { replace: true });
  };

  if (access !== 'allowed') return <AppLoader visible={true} />;

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-x-hidden">
      {/* Header with Compact Progress */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem' }}>
          <OnboardingProgress currentStep={currentStep} completedSteps={completedSteps} steps={steps} formData={formData} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 py-4 sm:py-6 overflow-x-hidden">
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem' }} className="w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full min-w-0 overflow-x-hidden"
            >
              <CurrentStepComponent
                formData={formData}
                updateFormData={updateFormData}
                nextStep={nextStep}
                prevStep={prevStep}
                currentStep={currentStep}
                onComplete={handleComplete}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}