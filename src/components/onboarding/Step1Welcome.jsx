import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Upload, ArrowRight } from 'lucide-react';
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

const countries = ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam'];

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
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <img src="https://cart.apptelier.sg/wp-content/uploads/2026/04/Logo_Sellio.png" alt="Sellio" className="h-12 object-contain mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to Sellio</h1>
        <p className="text-slate-500">Let's customise your business in just a few minutes</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label className="text-sm font-medium text-slate-700">Business Name *</Label>
          <Input
            {...register('businessName')}
            placeholder="e.g., Bella's Coffee House"
            className="mt-1.5 h-11"
          />
          {errors.businessName && (
            <p className="text-xs text-red-500 mt-1">{errors.businessName.message}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700">Business Type *</Label>
          <Select
            value={watch('businessType')}
            onValueChange={(v) => setValue('businessType', v)}
          >
            <SelectTrigger className="mt-1.5 h-11">
              <SelectValue placeholder="Select your business type" />
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

        <div>
          <Label className="text-sm font-medium text-slate-700">Country/Region *</Label>
          <Select
            value={watch('country')}
            onValueChange={(v) => setValue('country', v)}
          >
            <SelectTrigger className="mt-1.5 h-11">
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

        <div>
          <Label className="text-sm font-medium text-slate-700">Business Logo (Optional)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleLogoUpload}
            className="hidden"
          />
          {logoPreview ? (
            <div className="mt-1.5 border-2 border-slate-200 rounded-xl p-4 flex items-center gap-4">
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
              className="mt-1.5 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-slate-300 transition-colors cursor-pointer"
            >
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Click to upload or drag & drop</p>
              <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP up to 5MB</p>
            </div>
          )}
          {logoError && (
            <p className="text-xs text-red-500 mt-1">{logoError}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-12 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] text-base font-medium gap-2"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}