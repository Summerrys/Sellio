import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Upload, ArrowRight, Sparkles, Briefcase, Globe, UtensilsCrossed, ShoppingBag, Wrench, X, Edit3, Check, Palette, Pipette } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getSupabase } from '@/lib/supabaseClient';
import { generateThemeVariables } from '../theme/themeUtils';
import { cn } from '@/lib/utils';

const schema = z.object({
  businessName: z.string().min(2, 'Business name is required').max(100, 'Business name must be under 100 characters'),
  businessType: z.string().min(1, 'Please select a business type'),
  country: z.string().min(1, 'Please select a country'),
});

const businessTypes = [
  { value: 'food', label: 'F&B/Cafe/Restaurant', Icon: UtensilsCrossed, color: 'text-orange-500' },
  { value: 'retail', label: 'Retail', Icon: ShoppingBag, color: 'text-blue-500' },
  { value: 'service', label: 'Service', Icon: Wrench, color: 'text-green-500' },
];

const countries = ['Singapore', 'Malaysia'];

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

export default function Step1Combined({ formData, updateFormData, nextStep }) {
  const [logoFile, setLogoFile] = React.useState(null);
  const [logoPreview, setLogoPreview] = React.useState(formData.logoUrl || null);
  const [logoError, setLogoError] = React.useState('');
  const fileInputRef = React.useRef(null);
  const [selectedTheme, setSelectedTheme] = useState(formData.theme || '');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customPrimary, setCustomPrimary] = useState(formData.customPrimary || '#0369A1');
  const [customSecondary, setCustomSecondary] = useState(formData.customSecondary || '#E0F2FE');

  // Apply theme on mount
  React.useEffect(() => {
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

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: formData.businessName,
      businessType: formData.businessType,
      country: formData.country,
    },
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLogoError('Please upload JPG, PNG, or WEBP files only');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setLogoError('File size must be under 5MB');
      return;
    }

    setLogoError('');
    setLogoFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleThemeSelect = (palette) => {
    if (selectedTheme === palette.name) {
      // Unclick to revert to default
      setSelectedTheme('');
      const root = document.documentElement;
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-primary-100');
    } else {
      // Select new theme
      setSelectedTheme(palette.name);
      const variables = generateThemeVariables(palette.dark, palette.light);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  };



  const onSubmit = async (data) => {
    let logoUrl = formData.logoUrl;
    
    if (logoFile) {
      try {
        const supabaseClient = await getSupabase();
        const timestamp = Date.now();
        const fileName = `${timestamp}-${logoFile.name}`;
        const { data: uploadData, error } = await supabaseClient.storage
          .from('logos')
          .upload(fileName, logoFile);
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabaseClient.storage
          .from('logos')
          .getPublicUrl(fileName);
        logoUrl = publicUrl;
        
        localStorage.setItem('business_logo_url', logoUrl);
      } catch (error) {
        console.error('Logo upload failed:', error);
      }
    }

    let themeData = {
      theme: selectedTheme,
      logoUrl,
    };

    if (selectedTheme) {
      // Apply selected theme
      if (selectedTheme === 'Custom') {
        themeData.customPrimary = customPrimary;
        themeData.customSecondary = customSecondary;
      } else {
        const palette = POPULAR_PALETTES.find(p => p.name === selectedTheme);
        if (palette) {
          themeData.customPrimary = palette.dark;
          themeData.customSecondary = palette.light;
        }
      }
    } else {
      // Use default purple-pink gradient
      themeData.customPrimary = '#9333ea';
      themeData.customSecondary = '#ec4899';
      const variables = generateThemeVariables(themeData.customPrimary, themeData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
    
    updateFormData({ ...data, ...themeData });
    nextStep();
  };

  const selectedPalette = selectedTheme === 'Custom' 
    ? { dark: customPrimary, light: customSecondary }
    : (selectedTheme ? POPULAR_PALETTES.find(p => p.name === selectedTheme) : null);
  
  const getCardBackground = () => {
    if (!selectedPalette) return '#FFFFFF';
    // Use hex to rgba conversion with reduced opacity for a toned-down effect
    const hex = selectedPalette.light.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.2)`;
  };

  return (
    <Card className="p-8 sm:p-10 border-0 shadow-lg transition-colors" style={{ backgroundColor: getCardBackground() }}>
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Let's set up your business</h2>
        <p className="text-slate-600">Tell us about your company and choose your brand colors</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Logo Upload */}
        <div>
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-500" /> Business Logo (optional)
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleLogoUpload}
            className="hidden"
          />
          {logoPreview ? (
           <div className="mt-4 flex justify-center">
             <div
               onClick={() => fileInputRef.current?.click()}
               className="relative w-24 h-24 rounded-2xl overflow-hidden cursor-pointer group"
             >
               <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <Edit3 className="w-6 h-6 text-white" />
               </div>
               <Button
                 type="button"
                 variant="ghost"
                 size="icon"
                 className="absolute top-0 right-0 h-6 w-6 text-slate-400 hover:text-red-500 bg-white/80 hover:bg-white rounded-bl-lg p-0"
                 onClick={(e) => {
                   e.stopPropagation();
                   setLogoPreview(null);
                   setValue('logo', null);
                 }}
               >
                 <X className="w-3 h-3" />
               </Button>
             </div>
           </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-slate-400 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">Upload your logo</p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG, WEBP up to 5MB</p>
            </div>
          )}
          {logoError && (
            <p className="text-xs text-red-500 mt-2">{logoError}</p>
          )}
        </div>

        {/* Two-column layout for name and type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-500" /> Business Name</Label>
            <Input
              {...register('businessName')}
              placeholder="eg. Xin Fu Ji Local Delights"
              className="mt-2 h-11"
            />
            {errors.businessName && (
              <p className="text-xs text-red-500 mt-1">{errors.businessName.message}</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Briefcase className="w-4 h-4 text-green-500" /> Industry Type</Label>
            <Select
              value={watch('businessType')}
              onValueChange={(v) => setValue('businessType', v)}
            >
              <SelectTrigger className="mt-2 h-11">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {businessTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                       <div className="flex items-center gap-2">
                         <type.Icon className={`w-4 h-4 ${type.color}`} />
                         {type.label}
                       </div>
                      </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.businessType && (
              <p className="text-xs text-red-500 mt-1">{errors.businessType.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Globe className="w-4 h-4 text-orange-500" /> Country</Label>
          <Select
            value={watch('country')}
            onValueChange={(v) => setValue('country', v)}
          >
            <SelectTrigger className="mt-2 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Theme Selection - Grid Layout */}
        <div className="border-t pt-6">
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4 text-purple-500" /> Choose Your Brand Colors
          </Label>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {/* Color Picker Button */}
            <button
              type="button"
              onClick={() => setShowColorPicker(true)}
              className="relative rounded-lg overflow-hidden border-2 border-dashed border-slate-300 hover:border-slate-400 transition-all aspect-square flex items-center justify-center group"
              title="Custom Colors"
            >
              <div className="flex flex-col items-center gap-2">
                <Pipette className="w-6 h-6 text-slate-400 group-hover:text-slate-600" />
                <span className="text-xs text-slate-400 group-hover:text-slate-600 font-medium">Custom</span>
              </div>
            </button>

            {POPULAR_PALETTES.map((palette) => (
              <button
                key={palette.name}
                type="button"
                onClick={() => handleThemeSelect(palette)}
                className={cn(
                  "relative rounded-lg overflow-hidden border-2 transition-all aspect-square",
                  selectedTheme === palette.name
                    ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2"
                    : "border-slate-200 hover:border-slate-300"
                )}
                title={palette.name}
              >
                <div className="w-full h-full flex flex-col">
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
                  <span className="text-[10px] sm:text-xs font-medium text-white px-2 py-0.5 rounded-full block text-center truncate" style={{ backgroundColor: palette.dark }}>
                    {palette.name}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Color Picker Modal */}
          {showColorPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Choose Custom Colors</h3>
                
                <div className="space-y-4 mb-6">
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">Primary Color</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={customPrimary}
                        onChange={(e) => setCustomPrimary(e.target.value)}
                        className="w-16 h-10 rounded cursor-pointer"
                      />
                      <span className="text-sm text-slate-600 font-mono">{customPrimary}</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">Secondary Color</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={customSecondary}
                        onChange={(e) => setCustomSecondary(e.target.value)}
                        className="w-16 h-10 rounded cursor-pointer"
                      />
                      <span className="text-sm text-slate-600 font-mono">{customSecondary}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowColorPicker(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedTheme('Custom');
                      const variables = generateThemeVariables(customPrimary, customSecondary);
                      const root = document.documentElement;
                      Object.entries(variables).forEach(([key, value]) => {
                        root.style.setProperty(key, value);
                      });
                      setShowColorPicker(false);
                    }}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          )}



        </div>

        {(() => {
          const defaultPalette = POPULAR_PALETTES[0];
          const buttonStyle = selectedPalette?.dark
            ? { backgroundColor: selectedPalette.dark }
            : { background: 'linear-gradient(to right, #9333ea, #ec4899)' };
          return (
            <Button
              type="submit"
              className="w-full h-12 text-white text-base font-medium gap-2 mt-8 transition-all"
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.target.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.target.style.opacity = '1';
              }}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          );
        })()}
      </form>
    </Card>
  );
}