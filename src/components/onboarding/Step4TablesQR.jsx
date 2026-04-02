import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, QrCode } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';



export default function Step4TablesQR({ formData, updateFormData, nextStep, prevStep }) {
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
      const variables = generateThemeVariables(DEFAULT_COLORS.primary, DEFAULT_COLORS.secondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const { primary: primaryColor } = getThemeCSSColors(formData);
  const themeGradient = `linear-gradient(to right, ${formData?.themeColors?.dark || formData?.customPrimary || '#3b82f6'}, ${formData?.themeColors?.light || formData?.customSecondary || '#9333ea'})`;

  const handleSubmit = () => {
    nextStep();
  };

  return (
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg max-h-screen overflow-y-auto">
      <div className="text-center mb-6 sm:mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeGradient }}>
          <QrCode className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">Tables & QR Codes</h2>
        <p className="text-sm sm:text-base text-slate-600">Set up your tables and generate QR codes for F&B.</p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <div className="h-32 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 text-sm">
          Table and QR code setup goes here (F&B only)
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
          style={{ background: themeGradient }}
        >
          <span className="hidden sm:inline">Continue</span> <span className="sm:hidden">Next</span> <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>
    </Card>
  );
}