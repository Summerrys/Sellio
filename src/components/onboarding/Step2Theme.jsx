import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Check, Palette } from 'lucide-react';
import { COLOR_SETS, generateThemeVariables } from '../theme/themeUtils';
import { cn } from '@/lib/utils';

// Set default theme to blue/purple gradient on first load
const DEFAULT_THEME = { name: 'Indigo Sky', dark: '#4F46E5', light: '#E0E7FF' };

// Popular color palettes
const POPULAR_PALETTES = [
  { name: 'Ocean Blue', dark: '#0369A1', light: '#E0F2FE' },
  { name: 'Forest Green', dark: '#15803D', light: '#DCFCE7' },
  { name: 'Sunset Orange', dark: '#EA580C', light: '#FFEDD5' },
  { name: 'Royal Purple', dark: '#7E22CE', light: '#F3E8FF' },
  { name: 'Berry Red', dark: '#DC2626', light: '#FEE2E2' },
  { name: 'Teal Breeze', dark: '#0891B2', light: '#CFFAFE' },
  { name: 'Indigo Sky', dark: '#4F46E5', light: '#E0E7FF' },
  { name: 'Rose Garden', dark: '#BE185D', light: '#FFE4E6' },
];

export default function Step2Theme({ formData, updateFormData, nextStep, prevStep }) {
  const [selectedTheme, setSelectedTheme] = useState(formData.theme || DEFAULT_THEME.name);

  // Apply default theme on mount
  useEffect(() => {
    if (!formData.theme) {
      const defaultPalette = POPULAR_PALETTES.find(p => p.name === DEFAULT_THEME.name);
      if (defaultPalette) {
        handleThemeSelect(defaultPalette);
      }
    }
  }, []);

  const handleThemeSelect = (palette) => {
    setSelectedTheme(palette.name);
    const variables = generateThemeVariables(palette.dark, palette.light);
    const root = document.documentElement;
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">S</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Choose Your Brand Colors</h2>
        <p className="text-slate-500">Pick a theme that represents your business</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {POPULAR_PALETTES.map((palette) => (
          <button
            key={palette.name}
            onClick={() => handleThemeSelect(palette)}
            className={cn(
              "relative rounded-xl overflow-hidden border-2 transition-all group",
              selectedTheme === palette.name
                ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="aspect-square flex flex-col">
              <div className="flex-1" style={{ backgroundColor: palette.dark }} />
              <div className="flex-1" style={{ backgroundColor: palette.light }} />
            </div>
            {selectedTheme === palette.name && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-full p-2 shadow-lg">
                  <Check className="w-5 h-5 text-slate-900" />
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2">
              <span className="text-xs font-medium text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm block text-center">
                {palette.name}
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