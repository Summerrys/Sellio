import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import Step1Welcome from '../components/onboarding/Step1Welcome';
import Step2Theme from '../components/onboarding/Step2Theme';
import Step3Admin from '../components/onboarding/Step3Admin';
import Step4Business from '../components/onboarding/Step4Business';
import Step5QuickStart from '../components/onboarding/Step5QuickStart';
import Step6Confirmation from '../components/onboarding/Step6Confirmation';
import ProgressBar from '../components/onboarding/ProgressBar';

const STORAGE_KEY = 'apptelier_onboarding_state';

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1
    businessName: '',
    businessType: '',
    country: 'Singapore',
    logoUrl: '',
    // Step 2
    theme: 'Indigo',
    // Step 3
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    // Step 4
    currency: 'SGD',
    taxRate: 9,
    taxInclusive: false,
    businessHours: {},
    tableCount: 0,
    // Step 5
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
    if (currentStep < 6) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleComplete = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate(createPageUrl('Dashboard'));
  };

  const steps = [
    { component: Step1Welcome, title: 'Welcome' },
    { component: Step2Theme, title: 'Choose Theme' },
    { component: Step3Admin, title: 'Admin Account' },
    { component: Step4Business, title: 'Business Setup' },
    { component: Step5QuickStart, title: 'Quick Start' },
    { component: Step6Confirmation, title: 'Launch' },
  ];

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png" alt="Sellio" className="h-8 object-contain" />
            <div>
              <span className="font-bold text-sm text-slate-900 tracking-tight">Sellio</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBar currentStep={currentStep} totalSteps={steps.length} />

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