import React from 'react';
import { useTheme } from './ThemeProvider';
import { COLOR_SETS } from './themeUtils';
import { Card } from '@/components/ui/card';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

function SwatchBackground({ colorSet }) {
  if (colorSet.isGradient) {
    return (
      <div
        className="w-full h-full"
        style={{ background: `linear-gradient(135deg, ${colorSet.dark}, ${colorSet.light})` }}
      />
    );
  }
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-[2]" style={{ backgroundColor: colorSet.dark }} />
      <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
    </div>
  );
}

export default function ThemeSelector({ variant = 'full' }) {
  const { currentTheme, setTheme, isSaving } = useTheme();

  const handleSelect = (colorSetName) => {
    if (colorSetName !== currentTheme) {
      setTheme(colorSetName);
    }
  };

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
              onClick={() => handleSelect(colorSet.name)}
              disabled={isSaving}
              className={cn(
                "relative h-12 rounded-lg border-2 transition-all overflow-hidden group",
                currentTheme === colorSet.name
                  ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                  : "border-slate-200 hover:border-slate-300"
              )}
              title={colorSet.name}
            >
              <SwatchBackground colorSet={colorSet} />
              {currentTheme === colorSet.name && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                  <Check className="w-5 h-5 text-white drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
        {isSaving && (
          <p className="text-xs text-slate-500">Saving theme…</p>
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
            Click a swatch to apply it instantly.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {COLOR_SETS.map((colorSet) => (
            <button
              key={colorSet.name}
              onClick={() => handleSelect(colorSet.name)}
              disabled={isSaving}
              className={cn(
                "relative group rounded-xl border-2 transition-all overflow-hidden",
                currentTheme === colorSet.name
                  ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              <div className="aspect-[4/3]">
                <SwatchBackground colorSet={colorSet} />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {currentTheme === colorSet.name && (
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

        {isSaving && (
          <p className="text-sm text-slate-500 pt-2">Saving…</p>
        )}
      </div>
    </Card>
  );
}