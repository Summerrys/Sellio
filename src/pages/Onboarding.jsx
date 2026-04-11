import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
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

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(parsed.formData || formData);
        setCurrentStep(parsed.currentStep || 1);
      } catch (e) {
        console.error('Failed to parse saved onboarding state');
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, currentStep }));
  }, [formData, currentStep]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-x-hidden">
      {/* Header with Compact Progress */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <OnboardingProgress currentStep={currentStep} completedSteps={completedSteps} steps={steps} formData={formData} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-2 sm:px-4 py-4 sm:py-6 overflow-x-hidden">
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