import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, ArrowLeft, MapPin, Clock } from 'lucide-react';

const schema = z.object({
  branchName: z.string().min(1, 'Branch name is required').max(100),
  address: z.string().min(1, 'Address is required').max(500),
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];



export default function Step4Business({ formData, updateFormData, nextStep, prevStep }) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      branchName: formData.branchName || '',
      address: formData.address || '',
    },
  });

  const [operatingHours, setOperatingHours] = React.useState(formData.operatingHours || {
    Monday: { start: '09:00', end: '22:00' },
    Tuesday: { start: '09:00', end: '22:00' },
    Wednesday: { start: '09:00', end: '22:00' },
    Thursday: { start: '09:00', end: '22:00' },
    Friday: { start: '09:00', end: '22:00' },
    Saturday: { start: '09:00', end: '22:00' },
    Sunday: { start: '09:00', end: '22:00' },
  });

  const onSubmit = (data) => {
    updateFormData({ ...data, operatingHours });
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white border-0 shadow-lg">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Set up your first branch</h2>
        <p className="text-slate-600">Configure your main location and operating hours</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Branch Name */}
        <div>
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-green-500" />
            Branch Name <span className="text-red-500">*</span>
          </Label>
          <Input
            {...register('branchName')}
            placeholder="Main Branch / Downtown / Orchard"
            className="h-11"
          />
          {errors.branchName && (
            <p className="text-xs text-red-500 mt-1">{errors.branchName.message}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <Label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Address
          </Label>
          <Textarea
            {...register('address')}
            placeholder="123 Main Street, Singapore 123456"
            rows={3}
            className="resize-none"
          />
          {errors.address && (
            <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>
          )}
        </div>

        {/* Operating Hours */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-600" />
            Operating Hours
          </h3>
          <div className="space-y-3">
            {days.map((day) => (
              <div key={day} className="flex items-center gap-3">
                <div className="w-24">
                  <p className="text-sm font-medium text-slate-700">{day}</p>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={operatingHours[day].start}
                    onChange={(e) => setOperatingHours({
                      ...operatingHours,
                      [day]: { ...operatingHours[day], start: e.target.value }
                    })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="time"
                    value={operatingHours[day].end}
                    onChange={(e) => setOperatingHours({
                      ...operatingHours,
                      [day]: { ...operatingHours[day], end: e.target.value }
                    })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            onClick={prevStep}
            variant="outline"
            className="h-11 px-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Button
            type="submit"
            className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}