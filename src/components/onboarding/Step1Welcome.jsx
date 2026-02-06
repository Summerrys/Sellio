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

const schema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  businessType: z.string().min(1, 'Please select a business type'),
  country: z.string().min(1, 'Please select a country'),
});

const businessTypes = [
  { value: 'restaurant', label: '🍽️ Restaurant/Café' },
  { value: 'retail', label: '🛍️ Retail Store' },
  { value: 'salon', label: '💇 Salon/Spa' },
  { value: 'bar', label: '🍸 Bar/Lounge' },
  { value: 'other', label: '📦 Other' },
];

const countries = ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam'];

export default function Step1Welcome({ formData, updateFormData, nextStep }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: formData.businessName,
      businessType: formData.businessType,
      country: formData.country,
    },
  });

  const onSubmit = (data) => {
    updateFormData(data);
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to Apptelier Suite</h1>
        <p className="text-slate-500">Let's set up your business in just a few minutes</p>
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
          <div className="mt-1.5 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-slate-300 transition-colors cursor-pointer">
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Click to upload or drag & drop</p>
            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 5MB</p>
          </div>
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