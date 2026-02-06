import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, ArrowLeft, Settings } from 'lucide-react';

const schema = z.object({
  currency: z.string(),
  taxRate: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  tableCount: z.number().min(0).max(200),
});

const currencies = ['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'THB', 'IDR', 'PHP', 'VND'];

export default function Step4Business({ formData, updateFormData, nextStep, prevStep }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: formData.currency || 'SGD',
      taxRate: formData.taxRate || 9,
      taxInclusive: formData.taxInclusive || false,
      tableCount: formData.tableCount || 0,
    },
  });

  const isFoodBusiness = ['restaurant', 'cafe', 'bar'].includes(formData.businessType);

  const onSubmit = (data) => {
    updateFormData(data);
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
          <Settings className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Business Configuration</h2>
        <p className="text-slate-500">Set up your business preferences</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label className="text-sm font-medium text-slate-700">Currency</Label>
          <Select
            value={watch('currency')}
            onValueChange={(v) => setValue('currency', v)}
          >
            <SelectTrigger className="mt-1.5 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((curr) => (
                <SelectItem key={curr} value={curr}>
                  {curr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-slate-700">Tax Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              {...register('taxRate', { valueAsNumber: true })}
              className="mt-1.5 h-11"
            />
            {errors.taxRate && (
              <p className="text-xs text-red-500 mt-1">{errors.taxRate.message}</p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium text-slate-700">Tax Type</Label>
            <div className="flex items-center gap-3 mt-3">
              <Switch
                checked={watch('taxInclusive')}
                onCheckedChange={(v) => setValue('taxInclusive', v)}
              />
              <span className="text-sm text-slate-600">
                {watch('taxInclusive') ? 'Tax Inclusive' : 'Tax Exclusive'}
              </span>
            </div>
          </div>
        </div>

        {isFoodBusiness && (
          <div>
            <Label className="text-sm font-medium text-slate-700">
              Number of Tables/Seats
            </Label>
            <Input
              type="number"
              {...register('tableCount', { valueAsNumber: true })}
              placeholder="e.g., 12"
              className="mt-1.5 h-11"
            />
            <p className="text-xs text-slate-500 mt-1">
              We'll auto-generate table entries for you (you can edit later)
            </p>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Business Hours</h4>
          <p className="text-xs text-slate-500">You can set detailed hours later in settings</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="mon-fri" defaultChecked className="rounded" />
              <label htmlFor="mon-fri">Mon-Fri (9am-6pm)</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sat" className="rounded" />
              <label htmlFor="sat">Saturday</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sun" className="rounded" />
              <label htmlFor="sun">Sunday</label>
            </div>
          </div>
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