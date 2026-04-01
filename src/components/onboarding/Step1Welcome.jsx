import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Upload, ArrowRight, Sparkles, Briefcase, Globe } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const schema = z.object({
  businessName: z.string().min(2, 'Business name is required').max(100, 'Business name must be under 100 characters'),
  businessType: z.string().min(1, 'Please select a business type'),
  country: z.string().min(1, 'Please select a country'),
});

const businessTypes = [
  { value: 'restaurant', label: '🍽️ Restaurant/Café' },
  { value: 'retail', label: '🛍️ Retail' },
  { value: 'salon', label: '💇 Service' },
  { value: 'other', label: '📦 Other' },
];

const countries = ['Singapore', 'Malaysia'];

export default function Step1Welcome({ formData, updateFormData, nextStep }) {
  const [logoFile, setLogoFile] = React.useState(null);
  const [logoPreview, setLogoPreview] = React.useState(formData.logoUrl || null);
  const [logoError, setLogoError] = React.useState('');
  const fileInputRef = React.useRef(null);

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

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLogoError('Please upload JPG, PNG, or WEBP files only');
      return;
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      setLogoError('File size must be under 5MB');
      return;
    }

    setLogoError('');
    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data) => {
    let logoUrl = formData.logoUrl;
    
    // Upload logo if one was selected
    if (logoFile) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: logoFile });
        logoUrl = file_url;
      } catch (error) {
        console.error('Logo upload failed:', error);
      }
    }

    updateFormData({ ...data, logoUrl });
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white border-0 shadow-lg">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Let's set up your business</h2>
        <p className="text-slate-600">Tell us about your company to get started</p>
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
            <div className="mt-2 border-2 border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-cover rounded-lg" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Logo uploaded</p>
                <p className="text-xs text-slate-500">Click to change</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Change
              </Button>
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
              placeholder="Acme Restaurant"
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
                    {type.label}
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

        <Button
          type="submit"
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-medium gap-2 mt-8"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}