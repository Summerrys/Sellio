import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function TodayCard({ icon: Icon, label, value, subtext, trend, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-[rgb(var(--color-primary-50))] text-[rgb(var(--color-primary))]',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
  };

  return (
    <Card className="p-6 border-0 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mb-2">{value}</p>
          {subtext && (
            <p className="text-xs text-slate-400">{subtext}</p>
          )}
          {trend && (
            <p className={cn("text-xs font-medium mt-2", trend > 0 ? 'text-green-600' : 'text-red-600')}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs yesterday
            </p>
          )}
        </div>
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </Card>
  );
}