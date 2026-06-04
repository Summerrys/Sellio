import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { ChevronRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const STATUS_LABEL = {
  pending:   { text: 'New',        cls: 'bg-amber-100 text-amber-700' },
  confirmed: { text: 'Confirmed',  cls: 'bg-blue-100 text-blue-700' },
  preparing: { text: 'Preparing',  cls: 'bg-purple-100 text-purple-700' },
  ready:     { text: 'Ready',      cls: 'bg-green-100 text-green-700' },
  completed: { text: 'Completed',  cls: 'bg-slate-100 text-slate-600' },
  cancelled: { text: 'Cancelled',  cls: 'bg-red-100 text-red-600' },
};

export default function RecentOrders({ tenantId }) {
  const navigate = useNavigate();

  const { data: orders = [] } = useQuery({
    queryKey: ['recentOrders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 5000,
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
          {orders.map((order) => {
            const statusInfo = STATUS_LABEL[order.status] || { text: order.status, cls: 'bg-slate-100 text-slate-600' };
            return (
              <div
                key={order.id}
                onClick={() => navigate(createPageUrl('Orders'))}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-slate-900 text-sm">#{order.order_number || order.id?.slice(-6)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.cls}`}>
                      {statusInfo.text}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {(order.items || []).length} {(order.items || []).length === 1 ? 'item' : 'items'} · {order.total_amount != null ? `$${parseFloat(order.total_amount).toFixed(2)}` : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <p className="text-xs text-slate-400">{order.created_date ? format(new Date(order.created_date), 'h:mm a') : ''}</p>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}