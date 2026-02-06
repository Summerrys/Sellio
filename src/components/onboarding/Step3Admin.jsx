import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, ArrowLeft, UserCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  adminName: z.string().min(2, 'Full name is required'),
  adminEmail: z.string().email('Valid email is required'),
  adminPhone: z.string().min(8, 'Phone number is required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function Step3Admin({ formData, updateFormData, nextStep, prevStep }) {
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      adminName: formData.adminName,
      adminEmail: formData.adminEmail,
      adminPhone: formData.adminPhone,
      adminPassword: formData.adminPassword,
    },
  });

  const password = watch('adminPassword');

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { strength: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    if (score <= 2) return { strength: score, label: 'Weak', color: 'bg-red-500' };
    if (score <= 3) return { strength: score, label: 'Fair', color: 'bg-yellow-500' };
    if (score <= 4) return { strength: score, label: 'Good', color: 'bg-blue-500' };
    return { strength: score, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  const onSubmit = (data) => {
    updateFormData(data);
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
          <UserCircle className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Your Admin Account</h2>
        <p className="text-slate-500">You'll have full control over your business</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label className="text-sm font-medium text-slate-700">Full Name *</Label>
          <Input
            {...register('adminName')}
            placeholder="John Doe"
            className="mt-1.5 h-11"
          />
          {errors.adminName && (
            <p className="text-xs text-red-500 mt-1">{errors.adminName.message}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700">Email Address *</Label>
          <Input
            {...register('adminEmail')}
            type="email"
            placeholder="john@example.com"
            className="mt-1.5 h-11"
          />
          {errors.adminEmail && (
            <p className="text-xs text-red-500 mt-1">{errors.adminEmail.message}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700">Phone Number *</Label>
          <Input
            {...register('adminPhone')}
            placeholder="+65 8123 4567"
            className="mt-1.5 h-11"
          />
          {errors.adminPhone && (
            <p className="text-xs text-red-500 mt-1">{errors.adminPhone.message}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-slate-700">Password *</Label>
          <div className="relative">
            <Input
              {...register('adminPassword')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="mt-1.5 h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 mt-0.75"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.adminPassword && (
            <p className="text-xs text-red-500 mt-1">{errors.adminPassword.message}</p>
          )}
          {password && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Password strength</span>
                <span className={cn("text-xs font-medium", passwordStrength.strength <= 2 ? 'text-red-500' : passwordStrength.strength <= 3 ? 'text-yellow-600' : 'text-green-600')}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all", passwordStrength.color)}
                  style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={prevStep}
            variant="outline"
            className="flex-1 h-11 gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Button
            type="submit"
            className="flex-1 h-11 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}