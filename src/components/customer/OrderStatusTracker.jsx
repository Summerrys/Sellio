import React from 'react';
import { CheckCircle2, Clock, ChefHat, PackageCheck, Utensils } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_STEPS = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: PackageCheck },
  { key: 'served', label: 'Served', icon: Utensils },
];

export default function OrderStatusTracker({ order }) {
  const currentIndex = STATUS_STEPS.findIndex(step => step.key === order.status);

  return (
    <div className="space-y-6">
      {STATUS_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex gap-4 items-start">
            {/* Icon */}
            <div className="relative">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? 'bg-green-500'
                    : isCurrent
                    ? 'bg-[rgb(var(--color-primary))] animate-pulse'
                    : 'bg-slate-200'
                }`}
              >
                <Icon
                  className={`w-6 h-6 ${
                    isCompleted || isCurrent ? 'text-white' : 'text-slate-400'
                  }`}
                />
              </div>
              {index < STATUS_STEPS.length - 1 && (
                <div
                  className={`absolute left-1/2 top-12 w-0.5 h-12 -translate-x-1/2 ${
                    isCompleted ? 'bg-green-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-8">
              <h3
                className={`font-semibold text-lg ${
                  isCompleted || isCurrent ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {step.label}
              </h3>
              {isCompleted && order.updated_date && (
                <p className="text-sm text-slate-500">
                  {format(new Date(order.updated_date), 'HH:mm')}
                </p>
              )}
              {isCurrent && (
                <p className="text-sm text-[rgb(var(--color-primary))] font-medium">
                  In progress...
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}