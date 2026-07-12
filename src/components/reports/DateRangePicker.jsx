import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

export default function DateRangePicker({ dateRange, onChange }) {
  const [open, setOpen] = useState(false);

  const presets = [
    { label: 'Today', getValue: () => ({ from: new Date(), to: new Date() }) },
    { label: 'Yesterday', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
    { label: 'Last 7 Days', getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
    { label: 'Last 30 Days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
    { label: 'This Week', getValue: () => ({ from: startOfWeek(new Date()), to: new Date() }) },
    { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: 'This Year', getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  ];

  // Figures out which preset (if any) matches the current range, so the active
  // pill stays in sync even if the range was set elsewhere (e.g. on page load).
  const activeLabel = presets.find(p => {
    const v = p.getValue();
    return dateRange?.from && dateRange?.to && isSameDay(v.from, dateRange.from) && isSameDay(v.to, dateRange.to);
  })?.label;

  return (
    <div className="flex items-center gap-2 max-w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {presets.map((preset) => {
          const active = activeLabel === preset.label;
          return (
            <button
              key={preset.label}
              onClick={() => onChange(preset.getValue())}
              className={cn(
                "flex-shrink-0 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                active
                  ? "text-white border-transparent shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              )}
              style={active ? { background: 'var(--color-primary-gradient)' } : undefined}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all",
              !activeLabel
                ? "text-white border-transparent shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            )}
            style={!activeLabel ? { background: 'var(--color-primary-gradient)' } : undefined}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>{format(dateRange.from, 'MMM d')} \u2013 {format(dateRange.to, 'MMM d, yyyy')}</>
              ) : (
                format(dateRange.from, 'MMM d, yyyy')
              )
            ) : (
              'Custom'
            )}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => { onChange(range); if (range?.from && range?.to) setOpen(false); }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
