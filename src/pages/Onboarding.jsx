import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import Step1Combined from '../components/onboarding/Step1Combined';
import Step4Business from '../components/onboarding/Step4Business';
import Step5QuickStart from '../components/onboarding/Step5QuickStart';
import Step6Confirmation from '../components/onboarding/Step6Confirmation';
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
    // Step 4 (Quick Start)
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

  const nextStep = () => {
    if (currentStep < 4) {
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

  const steps = [
    { component: Step1Combined, title: 'Business & Theme' },
    { component: Step4Business, title: 'Branch Setup' },
    { component: Step5QuickStart, title: 'Quick Start' },
    { component: Step6Confirmation, title: 'Launch' },
  ];

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header with Compact Progress */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <OnboardingProgress currentStep={currentStep} completedSteps={completedSteps} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
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