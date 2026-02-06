import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles = {
  // Order statuses
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-violet-50 text-violet-700 border-violet-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  served: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  // Table statuses
  available: 'bg-green-50 text-green-700 border-green-200',
  occupied: 'bg-red-50 text-red-700 border-red-200',
  reserved: 'bg-blue-50 text-blue-700 border-blue-200',
  maintenance: 'bg-slate-50 text-slate-700 border-slate-200',
  // Tenant statuses
  active: 'bg-green-50 text-green-700 border-green-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  trial: 'bg-amber-50 text-amber-700 border-amber-200',
  // Payment
  paid: 'bg-green-50 text-green-700 border-green-200',
  unpaid: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-slate-50 text-slate-700 border-slate-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  // User
  invited: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function StatusBadge({ status, className }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize font-medium text-xs px-2.5 py-0.5',
        statusStyles[status] || 'bg-slate-50 text-slate-700 border-slate-200',
        className
      )}
    >
      {status?.replace(/_/g, ' ')}
    </Badge>
  );
}