import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown, FileText } from 'lucide-react';

const TYPE_LABELS = {
  restock: 'Restock',
  sale: 'Sale',
  waste: 'Damaged/Waste',
  adjustment: 'Adjustment',
  return: 'Return',
};

const TYPE_COLORS = {
  restock: 'bg-green-100 text-green-700',
  sale: 'bg-blue-100 text-blue-700',
  waste: 'bg-red-100 text-red-700',
  adjustment: 'bg-amber-100 text-amber-700',
  return: 'bg-purple-100 text-purple-700',
};

export default function InventoryLogTable({ tenantId, productId = null, limit = 50 }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['inventoryLogs', tenantId, productId],
    queryFn: async () => {
      const query = { tenant_id: tenantId };
      if (productId) query.product_id = productId;
      return base44.entities.InventoryLog.filter(query, '-created_date', limit);
    },
    enabled: !!tenantId,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-slate-400">Loading logs...</div>;
  }

  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center border-0 shadow-sm">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">No inventory changes recorded yet</p>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Date & Time
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Product
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Type
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Change
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                New Total
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                By
              </th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-25 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-600">
                  {format(new Date(log.created_date), 'MMM dd, yyyy HH:mm')}
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-slate-900">{log.product_name}</p>
                </td>
                <td className="px-6 py-4">
                  <Badge className={TYPE_COLORS[log.type] || 'bg-slate-100 text-slate-700'}>
                    {TYPE_LABELS[log.type] || log.type}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    {log.quantity_change > 0 ? (
                      <ArrowUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-semibold ${
                      log.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {log.quantity_change > 0 ? '+' : ''}{log.quantity_change}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">
                  {log.quantity_after}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {log.performed_by}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                  {log.notes || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}