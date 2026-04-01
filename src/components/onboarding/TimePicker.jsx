import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function TimePicker({ value = '00:00', onChange, formData }) {
  const [hours, minutes] = value.split(':').map(Number);
  const [isOpen, setIsOpen] = useState(false);

  const handleHourChange = (newHour) => {
    const clipped = Math.max(0, Math.min(23, newHour));
    onChange(`${String(clipped).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  };

  const handleMinuteChange = (newMinute) => {
    const clipped = Math.max(0, Math.min(59, newMinute));
    onChange(`${String(hours).padStart(2, '0')}:${String(clipped).padStart(2, '0')}`);
  };

  const primaryColor = formData?.theme ? 'rgb(var(--color-primary))' : '#9333ea';
  const bgColor = formData?.theme ? 'rgba(var(--color-primary-rgb), 0.1)' : 'rgba(147, 51, 234, 0.1)';

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1.5 border rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
        style={{ borderColor: primaryColor }}
      >
        <span className="text-xs sm:text-sm" style={{ color: primaryColor }}>
          {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}

      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-2 p-3 border rounded-lg shadow-lg z-50 bg-white"
          style={{ borderColor: primaryColor, backgroundColor: 'white' }}
        >
          <div className="flex gap-3 items-center justify-center">
            {/* Hours */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleHourChange(hours + 1)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              </button>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base"
                style={{ backgroundColor: bgColor, color: primaryColor }}
              >
                {String(hours).padStart(2, '0')}
              </div>
              <button
                type="button"
                onClick={() => handleHourChange(hours - 1)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              </button>
            </div>

            {/* Separator */}
            <div style={{ color: primaryColor }} className="text-lg font-bold">
              :
            </div>

            {/* Minutes */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleMinuteChange(minutes + 1)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              </button>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base"
                style={{ backgroundColor: bgColor, color: primaryColor }}
              >
                {String(minutes).padStart(2, '0')}
              </div>
              <button
                type="button"
                onClick={() => handleMinuteChange(minutes - 1)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}