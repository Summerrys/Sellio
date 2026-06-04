import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { ClipboardList, Volume2, VolumeX, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const STATUS_TABS = [
  { value: 'all',       label: 'All',        color: 'slate' },
  { value: 'pending',   label: 'New',        color: 'amber' },
  { value: 'confirmed', label: 'Confirmed',  color: 'blue' },
  { value: 'preparing', label: 'Preparing',  color: 'purple' },
  { value: 'ready',     label: 'Ready',      color: 'green' },
  { value: 'completed', label: 'Completed',  color: 'slate' },
];

const STATUS_ACCENT = {
  pending:   'border-l-amber-400 bg-amber-50',
  confirmed: 'border-l-blue-400 bg-blue-50',
  preparing: 'border-l-purple-400 bg-purple-50',
  ready:     'border-l-green-400 bg-green-50',
  completed: 'border-l-slate-300 bg-slate-50',
  cancelled: 'border-l-red-300 bg-red-50',
};

const STATUS_NEXT = {
  pending:   { label: 'Accept',           next: 'confirmed' },
  confirmed: { label: 'Start Preparing',  next: 'preparing' },
  preparing: { label: 'Mark Ready',       next: 'ready' },
  ready:     { label: 'Mark Served',      next: 'completed' },
};

function OrderCard({ order, currency, onStatusUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const action = STATUS_NEXT[order.status];
  const elapsed = formatDistanceToNow(new Date(order.created_date), { addSuffix: true });
  const accentClass = STATUS_ACCENT[order.status] || 'border-l-slate-300 bg-slate-50';

  return (
    <div
      className={`border border-slate-200 rounded-xl border-l-4 ${accentClass} shadow-sm overflow-hidden`}
    >
      {/* Card header — tap to expand */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 text-sm">#{order.order_number || order.id?.slice(-6)}</span>
            {order.table_name && (
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                {order.table_name}
              </span>
            )}
            {order.order_type && (
              <span className="text-xs text-slate-500">{order.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-slate-400">{elapsed}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {order.customer_name && (
          <p className="text-xs text-slate-500 mt-1">{order.customer_name}</p>
        )}

        {/* Items preview */}
        <div className="mt-2 space-y-0.5">
          {(order.items || []).map((item, idx) => (
            <p key={idx} className="text-sm text-slate-700">
              {item.quantity}× {item.name}
            </p>
          ))}
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold text-slate-900">{currency} {parseFloat(order.total_amount || 0).toFixed(2)}</span>
          {order.status === 'completed' && (
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Completed</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-3 space-y-1">
          {order.notes && (
            <p className="text-xs text-slate-500 italic mb-2">Note: {order.notes}</p>
          )}
          {(order.items || []).map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm text-slate-700">
              <span>{item.quantity}× {item.name}{item.variant ? ` (${item.variant})` : ''}</span>
              <span className="text-slate-500">{currency} {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-100 mt-1">
            <span>Total</span>
            <span>{currency} {parseFloat(order.total_amount || 0).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Action button */}
      {action && (
        <div className="px-4 pb-4 pt-1" onClick={e => e.stopPropagation()}>
          <Button
            className="w-full h-10 text-sm font-semibold"
            onClick={() => onStatusUpdate(order.id, action.next)}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const previousOrderIdsRef = useRef(new Set());
  const refreshRef = useRef(null);

  const isFnB = /f&b|cafe|restaurant|food/i.test(tenant?.industry || '');
  const currency = tenant?.settings?.currency || tenant?.currency || 'SGD';

  const playDing = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  const fetchOrders = useCallback(async () => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_date', { ascending: false });
    if (!error) setOrders(data || []);
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    fetchOrders();
    refreshRef.current = setInterval(fetchOrders, 10000);
    return () => clearInterval(refreshRef.current);
  }, [tenantId, fetchOrders]);

  // Sound on new pending orders
  useEffect(() => {
    const pendingIds = new Set(orders.filter(o => o.status === 'pending').map(o => o.id));
    if (soundEnabled && previousOrderIdsRef.current.size > 0) {
      for (const id of pendingIds) {
        if (!previousOrderIdsRef.current.has(id)) { playDing(); break; }
      }
    }
    previousOrderIdsRef.current = pendingIds;
  }, [orders, soundEnabled]);

  const handleStatusUpdate = async (orderId, newStatus) => {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, updated_date: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { toast.error('Failed to update order'); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    toast.success('Order updated');
  };

  const handleRefresh = useCallback(() => fetchOrders(), [fetchOrders]);

  const filteredOrders = activeTab === 'all' ? orders : orders.filter(o => o.status === activeTab);

  const countFor = (status) => orders.filter(o => o.status === status).length;

  const pendingCount   = countFor('pending');
  const confirmCount   = countFor('confirmed');
  const preparingCount = countFor('preparing');
  const readyCount     = countFor('ready');

  return (
    <RequirePermission permission="orders.view">
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="space-y-4">
          <PageHeader
            title="Orders"
            description="Manage incoming and active orders"
            actions={
              isFnB ? (
                <Button variant="outline" onClick={() => navigate(createPageUrl('KitchenDisplay'))} className="gap-2 text-sm">
                  <Monitor className="w-4 h-4" />
                  <span className="hidden sm:inline">Kitchen Display</span>
                  <span className="sm:hidden">Kitchen</span>
                </Button>
              ) : null
            }
          />

          {/* Sound toggle */}
          <div className="flex items-center gap-2">
            <Switch id="sound" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            <Label htmlFor="sound" className="flex items-center gap-2 cursor-pointer text-sm">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">Sound Alerts</span>
            </Label>
          </div>

          {/* Table Call Alerts */}
          <TableCallAlerts tenantId={tenantId} />

          {/* Stats — 4 compact cards in a row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-900">{pendingCount}</p>
              <p className="text-[11px] text-amber-700 font-medium">New</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-900">{confirmCount}</p>
              <p className="text-[11px] text-blue-700 font-medium">Confirmed</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-purple-900">{preparingCount}</p>
              <p className="text-[11px] text-purple-700 font-medium">Preparing</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-900">{readyCount}</p>
              <p className="text-[11px] text-green-700 font-medium">Ready</p>
            </div>
          </div>

          {/* Status tabs — horizontal scrollable row */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {STATUS_TABS.map(tab => {
              const count = tab.value === 'all' ? orders.length : countFor(tab.value);
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? 'text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  style={isActive ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' } : {}}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Orders list */}
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No orders {activeTab !== 'all' ? `with status "${STATUS_TABS.find(t=>t.value===activeTab)?.label}"` : 'yet'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currency={currency}
                  onStatusUpdate={handleStatusUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>
    </RequirePermission>
  );
}