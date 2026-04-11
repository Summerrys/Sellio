import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, ArrowLeft, MapPin, Clock } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';
import TimePicker from './TimePicker';



const schema = z.object({
  branchName: z.string().min(1, 'Branch name is required').max(100),
  address: z.string().min(1, 'Address is required').max(500),
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];



export default function Step2Business({ formData, updateFormData, nextStep, prevStep }) {
  // Apply theme from Step 1
  useEffect(() => {
    if (formData.customPrimary && formData.customSecondary) {
      const variables = generateThemeVariables(formData.customPrimary, formData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    } else {
      // Apply default theme
      const variables = generateThemeVariables(DEFAULT_COLORS.primary, DEFAULT_COLORS.secondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const { primary: primaryColor, secondary: secondaryColor } = getThemeCSSColors(formData);
  const chosenColor = formData?.theme ? (formData?.themeColors?.dark || formData?.customPrimary) : null;
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      branchName: formData.branchName || '',
      address: formData.address || '',
    },
  });

  const [operatingHours, setOperatingHours] = React.useState(formData.operatingHours || {
    Monday: { start: '09:00', end: '22:00', enabled: true },
    Tuesday: { start: '09:00', end: '22:00', enabled: true },
    Wednesday: { start: '09:00', end: '22:00', enabled: true },
    Thursday: { start: '09:00', end: '22:00', enabled: true },
    Friday: { start: '09:00', end: '22:00', enabled: true },
    Saturday: { start: '09:00', end: '22:00', enabled: false },
    Sunday: { start: '09:00', end: '22:00', enabled: false },
  });

  const [quickApplyStart, setQuickApplyStart] = React.useState('09:00');
  const [quickApplyEnd, setQuickApplyEnd] = React.useState('22:00');

  const applyToAllDays = (start, end) => {
    const updated = {};
    days.forEach(day => {
      updated[day] = { ...operatingHours[day], start, end };
    });
    setOperatingHours(updated);
  };

  const onSubmit = (data) => {
    updateFormData({ ...data, operatingHours });
    nextStep();
  };

  return (
    <Card className="p-2 sm:p-4 bg-white border-0 shadow-lg max-h-screen overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeColor }}>
          <MapPin className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">Set up your first branch</h2>
        <p className="text-sm sm:text-base text-slate-600">Configure your main location and operating hours</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        {/* Branch Name */}
        <div>
          <Label className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-green-500" />
            Branch Name <span className="text-red-500">*</span>
          </Label>
          <Input
            {...register('branchName')}
            placeholder="eg. ION Orchard Outlet"
            className="h-10 sm:h-11 text-sm"
          />
          {errors.branchName && (
            <p className="text-xs text-red-500 mt-1">{errors.branchName.message}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <Label className="text-xs sm:text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Address
          </Label>
          <Textarea
            {...register('address')}
            placeholder="123 Main Street, Singapore 123456"
            rows={2}
            className="resize-none text-sm"
          />
          {errors.address && (
            <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>
          )}
        </div>

        {/* Operating Hours */}
        <div className="rounded-lg sm:rounded-xl p-3 sm:p-5" style={{ background: `linear-gradient(white, white) padding-box, ${themeColor} border-box`, border: '1px solid transparent' }}>
          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-slate-700" />
            Operating Hours
          </h3>

          {/* Quick Apply */}
          <div className="mb-4 p-3 bg-white border border-slate-200 rounded-lg">
            <p className="text-xs font-medium text-slate-700 mb-2">Apply to all days</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1 w-full">
                <TimePicker
                  value={quickApplyStart}
                  onChange={setQuickApplyStart}
                  formData={formData}
                />
                <span className="text-slate-400 text-xs flex-shrink-0">-</span>
                <TimePicker
                  value={quickApplyEnd}
                  onChange={setQuickApplyEnd}
                  formData={formData}
                />
              </div>
              <button
                type="button"
                onClick={() => applyToAllDays(quickApplyStart, quickApplyEnd)}
                className="w-full px-3 py-1.5 text-white rounded-lg text-xs font-medium"
                style={{ background: themeColor, cursor: 'pointer' }}
              >
                Apply to All
              </button>
            </div>
          </div>

          {/* Days List */}
          <div className="space-y-2.5 overflow-y-auto max-h-56 sm:max-h-none">
            {days.map((day) => (
              <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={operatingHours[day].enabled}
                    onChange={(e) => setOperatingHours({
                      ...operatingHours,
                      [day]: { ...operatingHours[day], enabled: e.target.checked }
                    })}
                    className="w-4 h-4 rounded cursor-pointer flex-shrink-0"
                    style={{ accentColor: primaryColor }}
                  />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 flex-shrink-0 w-24">{day}</span>
                </div>
                {operatingHours[day].enabled && (
                  <div className="flex items-center gap-1 w-full sm:w-auto sm:flex-1">
                    <TimePicker
                      value={operatingHours[day].start}
                      onChange={(value) => setOperatingHours({
                        ...operatingHours,
                        [day]: { ...operatingHours[day], start: value }
                      })}
                      formData={formData}
                    />
                    <span className="text-slate-400 text-xs flex-shrink-0">-</span>
                    <TimePicker
                      value={operatingHours[day].end}
                      onChange={(value) => setOperatingHours({
                        ...operatingHours,
                        [day]: { ...operatingHours[day], end: value }
                      })}
                      formData={formData}
                    />
                  </div>
                )}
                {!operatingHours[day].enabled && (
                  <span className="text-xs text-slate-400 italic sm:flex-1">Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-2 sm:gap-3 pt-3 sm:pt-4">
          <Button
            type="button"
            onClick={prevStep}
            variant="outline"
            className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <Button
            type="submit"
            className="h-10 sm:h-11 px-4 sm:px-6 text-white gap-1 sm:gap-2 text-sm"
            style={{ background: themeColor }}
          >
            Next <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}