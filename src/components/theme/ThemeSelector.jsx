import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { COLOR_SETS, generateThemeVariables } from './themeUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import db from '@/lib/db';
import { useTenant } from '../tenant/TenantContext';

export default function ThemeSelector({ variant = 'full' }) {
  const { currentTheme, previewTheme, setTheme, isSaving, clearPreview } = useTheme();
  const { tenantId } = useTenant();
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [customColors, setCustomColors] = useState(null);

  // Fetch custom theme colors from DB
  useEffect(() => {
    const fetchCustomColors = async () => {
      if (!tenantId) return;
      const configs = await db.entities.ThemeConfig.filter({ tenant_id: tenantId });
      if (configs[0]?.primary_color && configs[0]?.accent_color) {
        setCustomColors({
          id: configs[0].id,
          primary: configs[0].primary_color,
          accent: configs[0].accent_color,
          name: configs[0].color_set_name || 'Custom'
        });
      }
    };
    fetchCustomColors();
  }, [tenantId]);

  const handleCustomPreview = () => {
    if (customColors) {
      const variables = generateThemeVariables(customColors.primary, customColors.accent);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
      setSelectedTheme(customColors.name);
    }
  };

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
    // Reapply current theme
    if (customColors) {
      handleCustomPreview();
    }
  };

  const isChanged = selectedTheme !== currentTheme;

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Palette className="w-4 h-4" />
          <span>Color Theme</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {customColors && (
            <button
              key="custom"
              onClick={handleCustomPreview}
              className={cn(
                "flex flex-col items-center gap-2 transition-all",
                selectedTheme === customColors.name && "opacity-100"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-xl border-2 overflow-hidden cursor-pointer",
                selectedTheme === customColors.name
                  ? "border-slate-900 ring-2 ring-slate-900"
                  : "border-slate-300"
              )}>
                <div className="flex h-full">
                  <div className="flex-1" style={{ backgroundColor: customColors.primary }} />
                  <div className="flex-1" style={{ backgroundColor: customColors.accent }} />
                </div>
              </div>
              {selectedTheme === customColors.name && (
                <div className="absolute mt-6 bg-white rounded-full p-1.5 shadow-lg">
                  <Check className="w-4 h-4 text-slate-900" />
                </div>
              )}
              <span className="text-xs font-medium text-slate-700 text-center">Custom</span>
            </button>
          )}
          {COLOR_SETS.slice(0, 4).map((colorSet) => (
            <button
              key={colorSet.name}
              onClick={() => handlePreview(colorSet.name)}
              className={cn(
                "flex flex-col items-center gap-2 transition-all",
                selectedTheme === colorSet.name && "opacity-100"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-xl border-2 overflow-hidden cursor-pointer",
                selectedTheme === colorSet.name
                  ? "border-slate-900 ring-2 ring-slate-900"
                  : "border-slate-300"
              )}>
                <div className="flex h-full">
                  <div className="flex-1" style={{ backgroundColor: colorSet.dark }} />
                  <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
                </div>
              </div>
              {selectedTheme === colorSet.name && (
                <div className="absolute mt-6 bg-white rounded-full p-1.5 shadow-lg">
                  <Check className="w-4 h-4 text-slate-900" />
                </div>
              )}
              <span className="text-xs font-medium text-slate-700 text-center">{colorSet.name.split(' ')[0]}</span>
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
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Choose Your Brand Colors</h3>
          <p className="text-sm text-slate-500">
            Select a color scheme that matches your brand.
          </p>
        </div>

        <div className="space-y-6">
          {/* First row: Custom + 3 presets */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Custom option */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <button
                  onClick={handleCustomPreview}
                  className={cn(
                    "relative w-24 h-24 rounded-2xl border-4 overflow-hidden transition-all",
                    selectedTheme === customColors?.name
                      ? "border-slate-900 ring-4 ring-slate-900"
                      : "border-slate-300 hover:border-slate-400"
                  )}
                >
                  {customColors ? (
                    <div className="flex h-full">
                      <div className="flex-1" style={{ backgroundColor: customColors.primary }} />
                      <div className="flex-1" style={{ backgroundColor: customColors.accent }} />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                      <span className="text-xs text-slate-500">Custom</span>
                    </div>
                  )}
                </button>
                {selectedTheme === customColors?.name && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg">
                    <Check className="w-6 h-6 text-slate-900" />
                  </div>
                )}
              </div>
              <span className="text-xs font-medium text-slate-700">Custom</span>
            </div>

            {/* First row presets */}
            {COLOR_SETS.slice(0, 3).map((colorSet) => (
              <div key={colorSet.name} className="flex flex-col items-center gap-3">
                <div className="relative">
                  <button
                    onClick={() => handlePreview(colorSet.name)}
                    className={cn(
                      "relative w-24 h-24 rounded-2xl border-4 overflow-hidden transition-all",
                      selectedTheme === colorSet.name
                        ? "border-slate-900 ring-4 ring-slate-900"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex h-full">
                      <div className="flex-1" style={{ backgroundColor: colorSet.dark }} />
                      <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
                    </div>
                  </button>
                  {selectedTheme === colorSet.name && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg">
                      <Check className="w-6 h-6 text-slate-900" />
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-700">{colorSet.name}</span>
              </div>
            ))}
          </div>

          {/* Remaining presets in subsequent rows */}
          {COLOR_SETS.length > 3 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {COLOR_SETS.slice(3).map((colorSet) => (
                <div key={colorSet.name} className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => handlePreview(colorSet.name)}
                      className={cn(
                        "relative w-24 h-24 rounded-2xl border-4 overflow-hidden transition-all",
                        selectedTheme === colorSet.name
                          ? "border-slate-900 ring-4 ring-slate-900"
                          : "border-slate-300 hover:border-slate-400"
                      )}
                    >
                      <div className="flex h-full">
                        <div className="flex-1" style={{ backgroundColor: colorSet.dark }} />
                        <div className="flex-1" style={{ backgroundColor: colorSet.light }} />
                      </div>
                    </button>
                    {selectedTheme === colorSet.name && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg">
                        <Check className="w-6 h-6 text-slate-900" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-700">{colorSet.name}</span>
                </div>
              ))}
            </div>
          )}
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