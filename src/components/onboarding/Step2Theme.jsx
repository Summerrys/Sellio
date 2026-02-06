import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Check, Palette } from 'lucide-react';
import { COLOR_SETS, generateThemeVariables } from '../theme/themeUtils';
import { cn } from '@/lib/utils';

export default function Step2Theme({ formData, updateFormData, nextStep, prevStep }) {
  const [selectedTheme, setSelectedTheme] = useState(formData.theme || 'Indigo');

  const handleThemeSelect = (themeName) => {
    setSelectedTheme(themeName);
    const colorSet = COLOR_SETS.find(s => s.name === themeName);
    if (colorSet) {
      const variables = generateThemeVariables(colorSet.dark, colorSet.light);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  };

  const handleContinue = () => {
    if (!selectedTheme) {
      alert('Please select a theme to continue');
      return;
    }
    updateFormData({ theme: selectedTheme });
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
          <Palette className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Choose Your Brand Colors</h2>
        <p className="text-slate-500">Pick a theme that represents your business</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {COLOR_SETS.slice(0, 8).map((colorSet) => (
          <button
            key={colorSet.name}
            onClick={() => handleThemeSelect(colorSet.name)}
            className={cn(
              "relative rounded-xl overflow-hidden border-2 transition-all group",
              selectedTheme === colorSet.name
                ? "border-[rgb(var(--color-primary))] ring-2 ring-[rgb(var(--color-primary))] ring-offset-2"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="aspect-[4/3] flex flex-col">
              <div className="flex-[2]" style={{ backgroundColor: colorSet.dark }} />
              <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
            </div>
            {selectedTheme === colorSet.name && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="bg-white rounded-full p-2 shadow-lg">
                  <Check className="w-5 h-5 text-[rgb(var(--color-primary))]" />
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2">
              <span className="text-xs font-medium text-white bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm block text-center">
                {colorSet.name}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-700 text-center">
          ✨ Your theme is being previewed live! Look at the colors around this wizard.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={prevStep}
          variant="outline"
          className="flex-1 h-11 gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button
          onClick={handleContinue}
          className="flex-1 h-11 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}