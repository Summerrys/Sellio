import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import Step1Combined from '../components/onboarding/Step1Combined';
import Step2Business from '../components/onboarding/Step2Business';
import Step3MenuSetup from '../components/onboarding/Step3MenuSetup';
import Step4TablesQR from '../components/onboarding/Step4TablesQR';
import Step5Confirmation from '../components/onboarding/Step5Confirmation';
import OnboardingProgress from '../components/onboarding/OnboardingProgress';

const STORAGE_KEY = 'apptelier_onboarding_state';

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    // Step 1 (Business & Theme)
    businessName: '',
    businessType: '',
    country: 'Singapore',
    logoUrl: '',
    theme: '',
    // Step 2 (Branch Setup)
    currency: 'SGD',
    taxRate: 9,
    taxInclusive: false,
    businessHours: {},
    tableCount: 0,
    // Step 3 (Menu Setup)
    products: [],
  });

  // Load from Supabase/localStorage on mount
  useEffect(() => {
    const loadOnboardingState = async () => {
      try {
        const user = await base44.auth.me();
        if (user?.onboarding_state) {
          // Load from Supabase
          const state = JSON.parse(user.onboarding_state);
          setFormData(state.formData || formData);
          setCurrentStep(state.currentStep || 1);
          setCompletedSteps(state.completedSteps || []);
        } else {
          // Fallback to localStorage
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            setFormData(parsed.formData || formData);
            setCurrentStep(parsed.currentStep || 1);
            setCompletedSteps(parsed.completedSteps || []);
          }
        }
      } catch (e) {
        console.error('Failed to load onboarding state:', e);
        // Fallback to localStorage on error
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setFormData(parsed.formData || formData);
          setCurrentStep(parsed.currentStep || 1);
          setCompletedSteps(parsed.completedSteps || []);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadOnboardingState();
  }, []);

  // Save to localStorage and Supabase whenever state changes
  useEffect(() => {
    if (isLoading) return;
    
    const state = { formData, currentStep, completedSteps };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
    // Save to Supabase
    base44.auth.updateMe({
      onboarding_state: JSON.stringify(state)
    }).catch(err => console.error('Failed to save to Supabase:', err));
  }, [formData, currentStep, completedSteps, isLoading]);

  const updateFormData = (data) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const getSteps = () => {
    const isFnB = formData.businessType === 'food' || formData.businessType === 'fnb' || formData.businessType === 'F&B';
    const baseSteps = [
      { component: Step1Combined, title: 'Business Theme' },
      { component: Step2Business, title: 'Branch Setup' },
      { component: Step3MenuSetup, title: 'Menu Setup' },
    ];
    
    if (isFnB) {
      baseSteps.push({ component: Step4TablesQR, title: 'Tables & QR' });
    }
    
    baseSteps.push({ component: Step5Confirmation, title: 'Review & Launch' });
    return baseSteps;
  };

  // Recalculate steps whenever businessType changes
  const steps = React.useMemo(() => getSteps(), [formData.businessType]);

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCompletedSteps([...completedSteps, currentStep]);
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleComplete = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate(createPageUrl('Dashboard'));
  };

  const CurrentStepComponent = steps[currentStep - 1].component;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-x-hidden">
      {/* Header with Compact Progress */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <OnboardingProgress currentStep={currentStep} completedSteps={completedSteps} steps={steps} formData={formData} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-0 sm:px-1 py-2 sm:py-3 overflow-x-hidden">
        <div className="w-full max-w-6xl min-w-0 overflow-x-hidden">
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