import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import db from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from '../ui-custom/StatusBadge';
import { ChevronRight, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function RecentOrders({ tenantId }) {
  const { data: orders = [] } = useQuery({
    queryKey: ['recentOrders', tenantId],
    queryFn: () => db.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 5),
    enabled: !!tenantId,
    refetchInterval: 5000, // Live updates every 5s
  });

  return (
    <Card className="p-6 border-0 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-slate-900">Recent Orders</h3>
        <Clock className="w-5 h-5 text-slate-400" />
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No orders yet today</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-slate-900 text-sm">#{order.order_number}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-slate-500">
                  {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'} · {order.currency || '$'}{order.total_amount?.toFixed(2)}
                  <span className="text-slate-400 ml-2">{format(new Date(order.created_date), 'h:mm a')}</span>
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0 ml-2" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}