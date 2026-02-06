import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import StatusBadge from '../components/ui-custom/StatusBadge';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Eye, Clock, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];

export default function Orders() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: () => base44.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 100),
    enabled: !!tenantId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Order.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  return (
    <PermissionGate permission="orders.read">
      <PageHeader title="Orders" description="View and manage incoming orders" />

      <div className="mb-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-white border border-slate-100 shadow-sm p-1 h-auto flex-wrap">
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg text-xs">All ({orders.length})</TabsTrigger>
            {ORDER_STATUSES.filter(s => s !== 'cancelled').map(s => {
              const count = orders.filter(o => o.status === s).length;
              return (
                <TabsTrigger key={s} value={s} className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg text-xs capitalize">
                  {s.replace(/_/g, ' ')} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <EmptyState icon={ClipboardList} title="No orders found" description="Orders will appear here when customers place them." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(order => (
            <Card key={order.id} className="border-0 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedOrder(order)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">#{order.order_number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <span className="text-lg font-bold text-slate-900">${(order.total_amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                {order.table_name && <span>{order.table_name}</span>}
                <span className="capitalize">{order.type?.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{order.created_date ? format(new Date(order.created_date), 'h:mm a') : ''}</span>
              </div>
              <div className="space-y-1">
                {order.items?.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-600">{item.quantity}x {item.product_name}</span>
                    <span className="text-slate-400">${(item.total || 0).toFixed(2)}</span>
                  </div>
                ))}
                {(order.items?.length || 0) > 3 && <p className="text-xs text-slate-400">+{order.items.length - 3} more items</p>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Select
                  value={order.status}
                  onValueChange={(v) => { updateStatusMutation.mutate({ id: order.id, status: v }); }}
                >
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map(s => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <StatusBadge status={selectedOrder.status} />
                <StatusBadge status={selectedOrder.payment_status || 'unpaid'} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-400 block text-xs">Type</span><span className="capitalize">{selectedOrder.type?.replace(/_/g, ' ')}</span></div>
                <div><span className="text-slate-400 block text-xs">Table</span>{selectedOrder.table_name || '-'}</div>
                <div><span className="text-slate-400 block text-xs">Customer</span>{selectedOrder.customer_name || '-'}</div>
                <div><span className="text-slate-400 block text-xs">Date</span>{selectedOrder.created_date ? format(new Date(selectedOrder.created_date), 'MMM d, h:mm a') : '-'}</div>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Items</h4>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-700">{item.quantity}x {item.product_name} {item.variant ? `(${item.variant})` : ''}</span>
                      <span className="font-medium">${(item.total || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${(selectedOrder.subtotal || selectedOrder.total_amount || 0).toFixed(2)}</span></div>
                {selectedOrder.tax_amount > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>${selectedOrder.tax_amount.toFixed(2)}</span></div>}
                {selectedOrder.discount_amount > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span>-${selectedOrder.discount_amount.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>${(selectedOrder.total_amount || 0).toFixed(2)}</span></div>
              </div>
              {selectedOrder.notes && <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-600">{selectedOrder.notes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}