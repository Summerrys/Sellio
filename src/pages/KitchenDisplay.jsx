import React, { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import { Clock, AlertCircle, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function ElapsedTimer({ createdDate }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const calc = () => setElapsed(Math.floor((Date.now() - new Date(createdDate)) / 60000));
    calc();
    const id = setInterval(calc, 10000);
    return () => clearInterval(id);
  }, [createdDate]);
  return <span>{elapsed}m</span>;
}

const STATUS_CONFIG = {
  pending:   { label: 'New Order',  bg: 'bg-amber-600 border-amber-400',   btnLabel: '▶  Accept' },
  confirmed: { label: 'Confirmed',  bg: 'bg-blue-700 border-blue-500',     btnLabel: '▶  Start Preparing' },
  preparing: { label: 'Preparing',  bg: 'bg-purple-700 border-purple-500', btnLabel: '✓  Mark Ready' },
  ready:     { label: 'Ready',      bg: 'bg-green-700 border-green-500',   btnLabel: '✓  Mark Served' },
};

const NEXT_STATUS = {
  pending:   'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'completed',
};

function KDSOrderCard({ order, onBump }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.preparing;
  const elapsed = Math.floor((Date.now() - new Date(order.created_date)) / 60000);
  const isUrgent = elapsed > 10;
  const isCritical = elapsed > 20;

  return (
    <div className={`rounded-2xl border-4 p-5 flex flex-col gap-4 ${cfg.bg} text-white ${isCritical ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">{cfg.label}</p>
          <p className="text-4xl font-black leading-none">{order.order_number || `#${order.id?.slice(-4)}`}</p>
        </div>
        <div className={`text-right ${isCritical ? 'text-red-200' : isUrgent ? 'text-yellow-200' : 'text-white/70'}`}>
          <Clock className="w-6 h-6 ml-auto mb-0.5" />
          <p className="text-2xl font-bold"><ElapsedTimer createdDate={order.created_date} /></p>
        </div>
      </div>

      {order.table_name && (
        <div className="bg-white/20 rounded-xl px-4 py-2 text-center text-2xl font-bold">
          TABLE {order.table_name}
        </div>
      )}

      <div className="space-y-2 flex-1">
        {(order.items || []).map((item, idx) => (
          <div key={idx} className="bg-white/15 rounded-xl p-3">
            <p className="text-xl font-bold">{item.quantity}× {item.name}</p>
            {item.variant && <p className="text-base opacity-80 mt-0.5">{item.variant}</p>}
            {item.notes && (
              <div className="mt-2 bg-yellow-300 text-slate-900 rounded-lg p-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-semibold">{item.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="bg-yellow-300 text-slate-900 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="font-bold">{order.notes}</p>
        </div>
      )}

      <Button
        onClick={() => onBump(order.id, order.status)}
        className="w-full h-14 text-xl font-bold bg-white text-slate-900 hover:bg-slate-100"
      >
        {cfg.btnLabel}
      </Button>
    </div>
  );
}

export default function KitchenDisplay() {
  const { tenantId, tenant } = useTenant();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshRef = useRef(null);

  const fetchOrders = async () => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_date', { ascending: true });
    if (!error) setOrders(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!tenantId) return;
    fetchOrders();
    refreshRef.current = setInterval(fetchOrders, 15000);
    return () => clearInterval(refreshRef.current);
  }, [tenantId]);

  const handleBump = async (orderId, currentStatus) => {
    const nextStatus = NEXT_STATUS[currentStatus];
    if (!nextStatus) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus, updated_date: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { toast.error('Failed to update order'); return; }
    if (nextStatus === 'completed') {
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    }
  };

  const pendingOrders   = orders.filter(o => o.status === 'pending');
  const confirmedOrders = orders.filter(o => o.status === 'confirmed');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders     = orders.filter(o => o.status === 'ready');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white text-xl">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700">
        <div>
          <h1 className="text-3xl font-black">{tenant?.name || 'Kitchen'} — Kitchen Display</h1>
          <div className="flex gap-3 mt-3">
            {[
              { label: 'New',       count: pendingOrders.length,   color: 'text-amber-400',  bg: 'bg-amber-400/10' },
              { label: 'Confirmed', count: confirmedOrders.length, color: 'text-blue-400',   bg: 'bg-blue-400/10' },
              { label: 'Preparing', count: preparingOrders.length, color: 'text-purple-400', bg: 'bg-purple-400/10' },
              { label: 'Ready',     count: readyOrders.length,     color: 'text-green-400',  bg: 'bg-green-400/10' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl px-3 py-2 text-center ${s.bg}`}>
                <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
                <p className={`text-xs font-semibold ${s.color} opacity-80`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-500">
          <ChefHat className="w-20 h-20" />
          <p className="text-3xl font-bold">No active orders</p>
          <p className="text-lg">New orders will appear here automatically</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* New Orders */}
          <div>
            <h2 className="text-xl font-bold text-amber-400 uppercase tracking-widest mb-4">
              🟡 New ({pendingOrders.length})
            </h2>
            {pendingOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-700 p-8 text-center text-slate-600">No new orders</div>
            ) : (
              <div className="space-y-4">
                {pendingOrders.map(order => <KDSOrderCard key={order.id} order={order} onBump={handleBump} />)}
              </div>
            )}
          </div>

          {/* Confirmed */}
          <div>
            <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest mb-4">
              🔵 Confirmed ({confirmedOrders.length})
            </h2>
            {confirmedOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-700 p-8 text-center text-slate-600">No confirmed orders</div>
            ) : (
              <div className="space-y-4">
                {confirmedOrders.map(order => <KDSOrderCard key={order.id} order={order} onBump={handleBump} />)}
              </div>
            )}
          </div>

          {/* Preparing */}
          <div>
            <h2 className="text-xl font-bold text-purple-400 uppercase tracking-widest mb-4">
              🟣 Preparing ({preparingOrders.length})
            </h2>
            {preparingOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-700 p-8 text-center text-slate-600">No orders being prepared</div>
            ) : (
              <div className="space-y-4">
                {preparingOrders.map(order => <KDSOrderCard key={order.id} order={order} onBump={handleBump} />)}
              </div>
            )}
          </div>

          {/* Ready */}
          <div>
            <h2 className="text-xl font-bold text-green-400 uppercase tracking-widest mb-4">
              🟢 Ready ({readyOrders.length})
            </h2>
            {readyOrders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-700 p-8 text-center text-slate-600">No ready orders</div>
            ) : (
              <div className="space-y-4">
                {readyOrders.map(order => <KDSOrderCard key={order.id} order={order} onBump={handleBump} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}