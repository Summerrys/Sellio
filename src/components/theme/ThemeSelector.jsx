import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';
import { COLOR_SETS } from './themeUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ThemeSelector({ variant = 'full' }) {
  const { currentTheme, previewTheme, setTheme, isSaving, clearPreview } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);

  const handlePreview = (themeName) => {
    setSelectedTheme(themeName);
    previewTheme(themeName);
  };

  const handleApply = () => {
    if (selectedTheme) {
      setTheme(selectedTheme);
    }
  };

  const handleCancel = () => {
    setSelectedTheme(currentTheme);
    clearPreview();
  };

  const isChanged = selectedTheme !== currentTheme;

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Palette className="w-4 h-4" />
          <span>Color Theme</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {COLOR_SETS.map((colorSet) => (
            <button
              key={colorSet.name}
              onClick={() => handlePreview(colorSet.name)}
              className={cn(
                "relative h-12 rounded-lg border-2 transition-all overflow-hidden group",
                selectedTheme === colorSet.name
                  ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                  : "border-slate-200 hover:border-slate-300"
              )}
              title={colorSet.name}
            >
              <div className="flex h-full">
                <div className="flex-1" style={{ backgroundColor: colorSet.dark }} />
                <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
              </div>
              {selectedTheme === colorSet.name && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                  <Check className="w-5 h-5 text-white drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
        {isChanged && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isSaving}
              className="flex-1 bg-slate-900 hover:bg-slate-800"
            >
              {isSaving ? 'Applying...' : 'Apply Theme'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Choose Your Color Theme</h3>
          <p className="text-sm text-slate-500">
            Select a color scheme that matches your brand. Changes apply instantly.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {COLOR_SETS.map((colorSet) => (
            <button
              key={colorSet.name}
              onClick={() => handlePreview(colorSet.name)}
              className={cn(
                "relative group rounded-xl border-2 transition-all overflow-hidden",
                selectedTheme === colorSet.name
                  ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              <div className="aspect-[4/3] flex flex-col">
                <div className="flex-[2]" style={{ backgroundColor: colorSet.dark }} />
                <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {selectedTheme === colorSet.name && (
                  <div className="bg-white rounded-full p-2 shadow-lg mb-2">
                    <Check className="w-5 h-5 text-slate-900" />
                  </div>
                )}
                <span className="text-xs font-medium text-white bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
                  {colorSet.name}
                </span>
              </div>
            </button>
          ))}
        </div>

        {isChanged && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-slate-600">
              Preview mode - click Apply to save your selection
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={isSaving}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {isSaving ? 'Applying...' : 'Apply Theme'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}