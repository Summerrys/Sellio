import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function KitchenDisplay() {
  const queryClient = useQueryClient();
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    fetchTenantData();
  }, []);

  const fetchTenantData = async () => {
    try {
      const tenants = await base44.entities.Tenant.filter({ status: 'active' }, '-created_date', 1);
      if (tenants.length > 0) {
        setTenant(tenants[0]);
      }
    } catch (error) {
      console.error('Failed to load tenant:', error);
    }
  };

  const { data: orders = [] } = useQuery({
    queryKey: ['kitchen-orders', tenant?.id],
    queryFn: async () => {
      const allOrders = await base44.entities.Order.filter(
        { tenant_id: tenant.id },
        '-created_date',
        50
      );
      return allOrders.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status));
    },
    enabled: !!tenant?.id,
    refetchInterval: 3000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!tenant?.id) return;

    const unsubscribe = base44.entities.Order.subscribe((event) => {
      if (event.data?.tenant_id === tenant.id) {
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders', tenant.id] });
      }
    });

    return unsubscribe;
  }, [tenant?.id, queryClient]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }) => {
      return base44.entities.Order.update(orderId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
  });

  const handleBump = (orderId, currentStatus) => {
    const nextStatus = currentStatus === 'pending' ? 'confirmed' : 
                      currentStatus === 'confirmed' ? 'preparing' : 'ready';
    updateStatusMutation.mutate({ orderId, status: nextStatus });
  };

  if (!tenant) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-white text-2xl">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      {/* Header */}
      <div className="mb-8 pb-4 border-b border-slate-700">
        <h1 className="text-4xl font-bold">{tenant.name} - Kitchen Display</h1>
        <p className="text-slate-400 text-xl mt-2">
          {orders.length} active order{orders.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle2 className="w-24 h-24 text-green-500 mx-auto mb-4" />
          <p className="text-3xl text-slate-400">All caught up! No orders pending.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <KDSOrderCard
              key={order.id}
              order={order}
              onBump={handleBump}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KDSOrderCard({ order, onBump }) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const created = new Date(order.created_date);
      const minutes = Math.floor((now - created) / 60000);
      setElapsedTime(minutes);
    }, 1000);

    return () => clearInterval(interval);
  }, [order.created_date]);

  const isUrgent = elapsedTime > 20;
  const isCritical = elapsedTime > 30;

  const statusColors = {
    pending: 'bg-amber-600 border-amber-500',
    confirmed: 'bg-blue-600 border-blue-500',
    preparing: 'bg-purple-600 border-purple-500',
  };

  const statusLabels = {
    pending: 'NEW ORDER',
    confirmed: 'CONFIRMED',
    preparing: 'PREPARING',
  };

  return (
    <div className={`rounded-2xl border-4 p-6 ${statusColors[order.status]} ${
      isCritical ? 'animate-pulse' : ''
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold opacity-90 mb-1">
            {statusLabels[order.status]}
          </div>
          <div className="text-5xl font-bold">{order.order_number}</div>
        </div>
        <div className={`text-right ${isCritical ? 'text-red-300' : isUrgent ? 'text-amber-300' : ''}`}>
          <Clock className="w-8 h-8 mb-1 ml-auto" />
          <div className="text-4xl font-bold">{elapsedTime}m</div>
        </div>
      </div>

      {/* Table */}
      {order.table_name && (
        <div className="bg-white/20 rounded-lg px-4 py-2 mb-4">
          <div className="text-3xl font-bold text-center">TABLE {order.table_name}</div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3 mb-4">
        {order.items?.map((item, idx) => (
          <div key={idx} className="bg-white/10 rounded-lg p-4">
            <div className="text-2xl font-bold mb-1">
              {item.quantity}x {item.product_name}
            </div>
            {item.variant && (
              <div className="text-xl opacity-90">{item.variant}</div>
            )}
            {item.notes && (
              <div className="bg-yellow-400 text-slate-900 rounded-lg p-3 mt-2 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-lg font-semibold">{item.notes}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Order Notes */}
      {order.notes && (
        <div className="bg-yellow-400 text-slate-900 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div className="text-xl font-bold">{order.notes}</div>
          </div>
        </div>
      )}

      {/* Bump Button */}
      <Button
        onClick={() => onBump(order.id, order.status)}
        className="w-full h-16 text-2xl font-bold bg-white text-slate-900 hover:bg-slate-100"
      >
        {order.status === 'pending' && 'ACCEPT ORDER'}
        {order.status === 'confirmed' && 'START PREPARING'}
        {order.status === 'preparing' && 'MARK READY'}
      </Button>
    </div>
  );
}