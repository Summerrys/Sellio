import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Utensils } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';

export default function Step3MenuSetup({ formData, updateFormData, nextStep, prevStep }) {
  // Apply theme from Step 1
  useEffect(() => {
    if (formData.customPrimary && formData.customSecondary) {
      const variables = generateThemeVariables(formData.customPrimary, formData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    } else {
      // Apply default theme
      const variables = generateThemeVariables('#9333ea', '#ec4899');
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const handleSubmit = () => {
    nextStep();
  };

  return (
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg max-h-screen overflow-y-auto">
      <div className="text-center mb-6 sm:mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4" style={formData.theme ? { backgroundImage: 'none', backgroundColor: 'rgb(var(--color-primary))' } : {}}>
          <Utensils className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">Menu Setup</h2>
        <p className="text-sm sm:text-base text-slate-600">Configure your products or services.</p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <div className="h-32 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 text-sm">
          Menu/Product/Service setup goes here
        </div>
      </div>

      <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
        <Button
          type="button"
          onClick={prevStep}
          variant="outline"
          className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm"
        >
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          className="flex-1 h-10 sm:h-11 text-white gap-1 sm:gap-2 text-sm"
          style={formData.theme ? { backgroundColor: 'rgb(var(--color-primary))' } : { background: 'linear-gradient(to right, #9333ea, #ec4899)' }}
        >
          <span className="hidden sm:inline">Continue</span> <span className="sm:hidden">Next</span> <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>
    </Card>
  );
}