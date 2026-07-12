import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { format, subDays, startOfWeek, startOfMonth, startOfYear, isSameDay } from 'date-fns';

export default function DateRangePicker({ dateRange, onChange }) {
  const [open, setOpen] = useState(false);

  const presets = [
    { value: 'today', label: 'Today', getValue: () => ({ from: new Date(), to: new Date() }) },
    { value: 'yesterday', label: 'Yesterday', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
    { value: '7d', label: 'Last 7 Days', getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
    { value: '30d', label: 'Last 30 Days', getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
    { value: 'week', label: 'This Week', getValue: () => ({ from: startOfWeek(new Date()), to: new Date() }) },
    { value: 'month', label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { value: 'year', label: 'This Year', getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
    { value: 'custom', label: 'Custom Range' },
  ];

  // Figures out which preset (if any) matches the current range \u2014 falls back to
  // 'custom' so the dropdown always shows something sensible.
  const activeValue = presets.find(p => {
    if (p.value === 'custom') return false;
    const v = p.getValue();
    return dateRange?.from && dateRange?.to && isSameDay(v.from, dateRange.from) && isSameDay(v.to, dateRange.to);
  })?.value || 'custom';

  const handleSelect = (value) => {
    if (value === 'custom') {
      setOpen(true);
      return;
    }
    const preset = presets.find(p => p.value === value);
    onChange(preset.getValue());
  };

  const customLabel = dateRange?.from
    ? dateRange.to && !isSameDay(dateRange.from, dateRange.to)
      ? `${format(dateRange.from, 'MMM d')} \u2013 ${format(dateRange.to, 'MMM d')}`
      : format(dateRange.from, 'MMM d, yyyy')
    : 'Custom Range';

  return (
    <div className="flex items-center gap-2">
      <Select value={activeValue} onValueChange={handleSelect}>
        <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1.5 rounded-full border-slate-200 text-sm font-medium">
          <CalendarIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <SelectValue>{activeValue === 'custom' ? customLabel : presets.find(p => p.value === activeValue)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {presets.map(p => (
            <SelectItem key={p.value} value={p.value}>{p.value === 'custom' ? customLabel : p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => { onChange(range); if (range?.from && range?.to) setOpen(false); }}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
