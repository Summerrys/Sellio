import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import OrderKanban from '../components/orders/OrderKanban';
import OrderDetailDialog from '../components/orders/OrderDetailDialog';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { ClipboardList, Volume2, VolumeX, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';

export default function Orders() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const audioRef = useRef(null);
  const previousOrderCountRef = useRef(0);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', tenantId, statusFilter],
    queryFn: async () => {
      const query = { tenant_id: tenantId };
      if (statusFilter === 'active') {
        // Get orders that are not completed or cancelled
        const allOrders = await db.entities.Order.filter(query, '-created_date', 100);
        return allOrders.filter(o => 
          !['completed', 'served', 'cancelled'].includes(o.status)
        );
      } else if (statusFilter === 'all') {
        return db.entities.Order.filter(query, '-created_date', 100);
      } else {
        query.status = statusFilter;
        return db.entities.Order.filter(query, '-created_date', 50);
      }
    },
    enabled: !!tenantId,
    refetchInterval: 5000, // Poll every 5 seconds as backup
  });

  // Real-time subscription via Supabase
  useEffect(() => {
    if (!tenantId) return;
    let channel;
    (async () => {
      const supabase = await getSupabase();
      channel = supabase
        .channel(`orders-tenant-${tenantId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        }, (payload) => {
          queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
          if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
            if (soundEnabled && audioRef.current) {
              audioRef.current.play().catch(() => {});
            }
            toast('🔔 New order received!', { duration: 4000 });
          }
        })
        .subscribe();
    })();
    return () => { if (channel) channel.unsubscribe(); };
  }, [tenantId, soundEnabled, queryClient]);

  // Check for new orders to play sound
  useEffect(() => {
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    if (pendingOrders > previousOrderCountRef.current && soundEnabled && audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
    previousOrderCountRef.current = pendingOrders;
  }, [orders, soundEnabled]);

  const handleRefresh = useCallback(() =>
    queryClient.invalidateQueries({ queryKey: ['orders', tenantId] }), [queryClient, tenantId]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }) => {
      return db.entities.Order.update(orderId, { status });
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['orders', tenantId, statusFilter] });
      const previous = queryClient.getQueryData(['orders', tenantId, statusFilter]);
      queryClient.setQueryData(['orders', tenantId, statusFilter], (old = []) =>
        old.map(o => o.id === orderId ? { ...o, status } : o)
      );
      return { previous };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['orders', tenantId, statusFilter], ctx.previous);
      toast.error(error.message || 'Failed to update order');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      toast.success('Order status updated');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId) => {
      return db.entities.Order.update(orderId, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      toast.success('Order cancelled');
      setSelectedOrder(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to cancel order');
    },
  });

  const handleStatusChange = (orderId, newStatus) => {
    updateStatusMutation.mutate({ orderId, newStatus });
  };

  const handlePrintReceipt = (order) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${order.order_number}</title>
          <style>
            body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 10mm; }
            h1 { font-size: 18pt; text-align: center; margin-bottom: 5mm; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5mm; margin-bottom: 5mm; }
            .item { display: flex; justify-content: space-between; margin: 2mm 0; }
            .total { border-top: 1px dashed #000; padding-top: 5mm; margin-top: 5mm; font-weight: bold; }
            .footer { text-align: center; margin-top: 10mm; font-size: 10pt; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${tenant.name}</h1>
            <p>Order: ${order.order_number}</p>
            <p>${new Date(order.created_date).toLocaleString()}</p>
            ${order.table_name ? `<p>Table: ${order.table_name}</p>` : ''}
          </div>
          ${order.items.map(item => `
            <div class="item">
              <span>${item.quantity}x ${item.product_name}${item.variant ? ` (${item.variant})` : ''}</span>
              <span>${tenant.currency} ${item.total.toFixed(2)}</span>
            </div>
          `).join('')}
          <div class="total">
            <div class="item">
              <span>Subtotal</span>
              <span>${tenant.currency} ${order.subtotal.toFixed(2)}</span>
            </div>
            <div class="item">
              <span>Tax</span>
              <span>${tenant.currency} ${order.tax_amount.toFixed(2)}</span>
            </div>
            <div class="item">
              <span>Total</span>
              <span>${tenant.currency} ${order.total_amount.toFixed(2)}</span>
            </div>
          </div>
          <div class="footer">
            <p>Thank you for your order!</p>
            <p>Powered by Apptelier</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const preparingCount = orders.filter(o => o.status === 'preparing').length;

  return (
    <RequirePermission permission="orders.view">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        <PageHeader
          title="Orders"
          description="Manage incoming and active orders"
          actions={
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl('KitchenDisplay'))}
              className="gap-2 text-sm"
            >
              <Monitor className="w-4 h-4" />
              <span className="hidden sm:inline">Kitchen Display</span>
              <span className="sm:hidden">Kitchen</span>
            </Button>
          }
        />

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Orders</SelectItem>
              <SelectItem value="pending">New</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="all">All Orders</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              id="sound"
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
            <Label htmlFor="sound" className="flex items-center gap-2 cursor-pointer text-sm">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">Sound Alerts</span>
            </Label>
          </div>
        </div>

        {/* Table Call Alerts */}
        <TableCallAlerts tenantId={tenantId} />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-700 mb-1">New Orders</p>
            <p className="text-3xl font-bold text-amber-900">{pendingCount}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-700 mb-1">Preparing</p>
            <p className="text-3xl font-bold text-purple-900">{preparingCount}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 mb-1">Ready</p>
            <p className="text-3xl font-bold text-green-900">
              {orders.filter(o => o.status === 'ready').length}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-700 mb-1">Total Active</p>
            <p className="text-3xl font-bold text-slate-900">{orders.length}</p>
          </div>
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No orders yet</p>
          </div>
        ) : (
          <OrderKanban
            orders={orders}
            onStatusChange={handleStatusChange}
            onOrderClick={setSelectedOrder}
            currency={tenant?.currency || 'SGD'}
          />
        )}

        {/* Order Detail Dialog */}
        <OrderDetailDialog
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
          order={selectedOrder}
          onPrint={handlePrintReceipt}
          onCancel={(order) => cancelOrderMutation.mutate(order.id)}
          currency={tenant?.currency || 'SGD'}
        />

        {/* Hidden audio element for notifications */}
        <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSBQMS6Ln77BcGwU+ltTy0H4qBSh+zPDajzoJE1yy6+SfUBMJS6Lg8rllIQU2j9Ty0oIuBSV4yPDbki4HGWu/7OKXRxILT6jk8bJeHQU7mtXx0H8pBCuCzvDakTsJElyw6+GdTxkKSZ7h8rllHwU2kdPx1IIvBSp4yO/bkz0KFl2w6+KdUhIMT6fn8LRfHQU7nNXy0IAqBS2Bze/aj0IJEV6w6+SfVBUJSaDg8bViIAU3kdTy1IQxBSh4x+/ckT4KFl6x6+KeUhMLUanl8bNgHgVEnNTy0H8pBSt/yPDbkDwJFF+x6uKeTBYKSaHg8bllIAU5k9Tx1IMyBSh5ye/dlEEKFGCy6uOfUhQMUavm8bRiHwVFntXx0H4pBSh/ye7ckUILFWGz6+OgVBYLS6Ph8r" />
      </div>
      </PullToRefresh>
    </RequirePermission>
  );
}