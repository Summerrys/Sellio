import React from 'react';
import { useTheme } from './ThemeProvider';
import { COLOR_SETS } from './themeUtils';
import { Card } from '@/components/ui/card';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

// Only show non-gradient (user-selectable) palettes
const SELECTABLE_PALETTES = COLOR_SETS.filter(c => !c.isGradient);

function SwatchBackground({ colorSet }) {
  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ flex: '7', backgroundColor: colorSet.dark }} />
      <div style={{ flex: '3', backgroundColor: colorSet.light }} />
    </div>
  );
}

function SwatchCard({ colorSet, isSelected, onSelect, disabled }) {
  return (
    <button
      onClick={() => onSelect(colorSet.name)}
      disabled={disabled}
      title={colorSet.name}
      style={{
        border: isSelected ? `2px solid ${colorSet.dark}` : '2px solid #e2e8f0',
        transition: 'border 0.15s, transform 0.15s',
      }}
      className="relative rounded-xl overflow-hidden"
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = `2px solid ${colorSet.dark}80`;
          e.currentTarget.style.transform = 'scale(1.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = '2px solid #e2e8f0';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      <div className="aspect-[4/3]">
        <SwatchBackground colorSet={colorSet} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isSelected && (
          <div className="rounded-full p-2 shadow-lg mb-2" style={{ backgroundColor: colorSet.dark }}>
            <Check className="w-5 h-5 text-white" />
          </div>
        )}
        <span className="text-xs font-medium text-white bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
          {colorSet.name}
        </span>
      </div>
    </button>
  );
}

function CompactSwatch({ colorSet, isSelected, onSelect, disabled }) {
  return (
    <button
      onClick={() => onSelect(colorSet.name)}
      disabled={disabled}
      title={colorSet.name}
      style={{
        border: isSelected ? `2px solid ${colorSet.dark}` : '2px solid #e2e8f0',
        transition: 'border 0.15s, transform 0.15s',
      }}
      className="relative h-12 rounded-lg overflow-hidden"
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = `2px solid ${colorSet.dark}80`;
          e.currentTarget.style.transform = 'scale(1.03)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = '2px solid #e2e8f0';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
    >
      <SwatchBackground colorSet={colorSet} />
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full p-1 shadow" style={{ backgroundColor: colorSet.dark }}>
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
      )}
    </button>
  );
}

export default function ThemeSelector({ variant = 'full' }) {
  const { currentTheme, setTheme, isSaving } = useTheme();

  const handleSelect = (colorSetName) => {
    if (colorSetName !== currentTheme) setTheme(colorSetName);
  };

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Palette className="w-4 h-4" />
          <span>Color Theme</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SELECTABLE_PALETTES.map((colorSet) => (
            <CompactSwatch
              key={colorSet.name}
              colorSet={colorSet}
              isSelected={currentTheme === colorSet.name}
              onSelect={handleSelect}
              disabled={isSaving}
            />
          ))}
        </div>
        {isSaving && <p className="text-xs text-slate-500">Saving theme…</p>}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Choose Your Color Theme</h3>
          <p className="text-sm text-slate-500">Click a swatch to apply it instantly.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {SELECTABLE_PALETTES.map((colorSet) => (
            <SwatchCard
              key={colorSet.name}
              colorSet={colorSet}
              isSelected={currentTheme === colorSet.name}
              onSelect={handleSelect}
              disabled={isSaving}
            />
          ))}
        </div>

        {isSaving && <p className="text-sm text-slate-500 pt-2">Saving…</p>}
      </div>
    </Card>
  );
}