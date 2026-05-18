import React from 'react';
import { useTheme } from './ThemeProvider';
import { COLOR_SETS } from './themeUtils';
import { Card } from '@/components/ui/card';
import { Check, Palette } from 'lucide-react';

/* ── full card swatch ───────────────────────────────────────────── */
function SwatchCard({ colorSet, isSelected, onSelect, disabled }) {
  const bc = colorSet.dark;
  return (
    <button
      onClick={() => onSelect(colorSet.name)}
      disabled={disabled}
      title={colorSet.name}
      style={{
        border: isSelected ? `3px solid ${bc}` : '2px solid #e2e8f0',
        transition: 'border 0.15s, transform 0.15s',
      }}
      className="relative rounded-xl overflow-hidden"
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = `2px solid ${bc}80`;
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
      {/* Swatch: 40% dark on top, 60% light on bottom */}
      <div className="aspect-[4/3] flex flex-col">
        {/* Dark section — 40% */}
        <div className="relative flex-none" style={{ height: '40%', background: colorSet.dark }}>
          {/* Label pill inside dark section */}
          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center">
            <span
              className="text-[10px] sm:text-xs font-medium text-white px-2 py-0.5 rounded-full truncate max-w-[90%] text-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            >
              {colorSet.name}
            </span>
          </div>
        </div>
        {/* Light section — 60% */}
        <div className="flex-1" style={{ background: colorSet.light }} />
      </div>

      {/* Checkmark overlay */}
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ top: '20%', bottom: '60%' }}>
          <div className="rounded-full p-2 shadow-lg bg-white">
            <Check className="w-5 h-5" style={{ color: bc }} />
          </div>
        </div>
      )}
    </button>
  );
}

/* ── compact swatch ─────────────────────────────────────────────── */
function CompactSwatch({ colorSet, isSelected, onSelect, disabled }) {
  const bc = colorSet.dark;
  return (
    <button
      onClick={() => onSelect(colorSet.name)}
      disabled={disabled}
      title={colorSet.name}
      style={{
        border: isSelected ? `3px solid ${bc}` : '2px solid #e2e8f0',
        transition: 'border 0.15s, transform 0.15s',
      }}
      className="relative h-12 rounded-lg overflow-hidden flex flex-col"
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.border = `2px solid ${bc}80`;
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
      <div className="flex-none" style={{ height: '40%', background: colorSet.dark }} />
      <div className="flex-1" style={{ background: colorSet.light }} />
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full p-1 shadow bg-white">
            <Check className="w-3 h-3" style={{ color: bc }} />
          </div>
        </div>
      )}
    </button>
  );
}

/* ── main export ────────────────────────────────────────────────── */
export default function ThemeSelector({ variant = 'full' }) {
  const { currentTheme, setTheme, isSaving } = useTheme();

  const handleSelect = (name) => {
    setTheme(name);
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
          {COLOR_SETS.map((colorSet) => (
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