import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ClipboardList, Bell, BellOff, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const STATUS_TABS = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready',     label: 'Ready' },
  { value: 'completed', label: 'Done' },
];

const STATUS_ACCENT = {
  pending:   { border: '#f59e0b', bg: '#fffbeb' },
  confirmed: { border: '#3b82f6', bg: '#eff6ff' },
  preparing: { border: '#8b5cf6', bg: '#f5f3ff' },
  ready:     { border: '#10b981', bg: '#ecfdf5' },
  completed: { border: '#94a3b8', bg: '#f8fafc' },
  cancelled: { border: '#ef4444', bg: '#fef2f2' },
};

const STATUS_NEXT = {
  pending:   { label: 'Accept',          next: 'confirmed' },
  confirmed: { label: 'Start Preparing', next: 'preparing' },
  preparing: { label: 'Mark Ready',      next: 'ready' },
  ready:     { label: 'Mark Served',     next: 'completed' },
};

// Buttons that use theme color vs neutral
const THEME_BUTTON_STATUSES = new Set(['pending', 'confirmed', 'preparing']);

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === 'ready') {
      // Double ding at 880Hz
      [0, 0.3].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime + offset);
        gain.gain.setValueAtTime(0.5, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.4);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.4);
      });
    } else {
      // Single ding at 440Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {}
}

function OrderCard({ order, currency, onStatusUpdate }) {
  const action = STATUS_NEXT[order.status];
  const accent = STATUS_ACCENT[order.status] || STATUS_ACCENT.completed;
  const elapsed = formatDistanceToNow(new Date(order.created_date || order.created_at), { addSuffix: true });
  const customerName = order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : null;

  const useThemeButton = THEME_BUTTON_STATUSES.has(order.status);

  return (
    <div
      className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
      style={{ borderLeft: `4px solid ${accent.border}`, background: accent.bg }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900 text-sm">#{order.order_number || order.id?.slice(-6)}</span>
            {order.table_name && (
              <span className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                🪑 {order.table_name}
              </span>
            )}
            {order.order_type && (
              <span className="text-xs text-slate-500">
                {order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Takeaway' : order.order_type}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{elapsed}</span>
        </div>

        {/* Customer */}
        {customerName && (
          <p className="text-xs text-slate-500 mb-2">{customerName}</p>
        )}

        {/* Items */}
        <div className="space-y-1 mb-3">
          {(order.items || []).map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className="text-slate-800 font-medium">
                {item.quantity}× {item.name || item.product_name}
                {item.variant ? <span className="text-slate-500 font-normal"> ({item.variant})</span> : ''}
              </span>
              {item.price != null && (
                <span className="text-slate-500 text-xs">{currency} {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>

        {/* Notes */}
        {order.notes && (
          <p className="text-xs text-slate-500 italic mb-2">📝 {order.notes}</p>
        )}

        {/* Total */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-900">{currency} {parseFloat(order.total_amount || 0).toFixed(2)}</span>
          {order.status === 'completed' && (
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Completed</span>
          )}
        </div>

        {/* Action button */}
        {action && (
          <button
            onClick={() => onStatusUpdate(order.id, action.next)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white active:scale-95 transition-transform"
            style={useThemeButton
              ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }
              : { background: '#334155' }
            }
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Orders() {
  const { tenantId, tenant } = useTenant();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const previousPendingIds = useRef(new Set());
  const previousReadyIds = useRef(new Set());
  const refreshRef = useRef(null);

  const isFnB = /f&b|cafe|restaurant|food/i.test(tenant?.industry || '');
  const currency = tenant?.settings?.currency || tenant?.currency || 'SGD';

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

  // Sound alerts
  useEffect(() => {
    const pendingIds = new Set(orders.filter(o => o.status === 'pending').map(o => o.id));
    const readyIds   = new Set(orders.filter(o => o.status === 'ready').map(o => o.id));

    if (soundEnabled) {
      if (previousPendingIds.current.size > 0) {
        for (const id of pendingIds) {
          if (!previousPendingIds.current.has(id)) { playSound('new'); break; }
        }
      }
      if (previousReadyIds.current.size > 0) {
        for (const id of readyIds) {
          if (!previousReadyIds.current.has(id)) { playSound('ready'); break; }
        }
      }
    }
    previousPendingIds.current = pendingIds;
    previousReadyIds.current = readyIds;
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
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Orders</h1>
              <p className="text-sm text-slate-500">Manage incoming and active orders</p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {isFnB && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(createPageUrl('KitchenDisplay'))}
                  className="gap-1.5 text-xs h-8 border-slate-200"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Kitchen Display
                </Button>
              )}
              <div className="flex items-center gap-1.5">
                <Switch id="sound" checked={soundEnabled} onCheckedChange={setSoundEnabled} className="scale-90" />
                <Label htmlFor="sound" className="flex items-center gap-1 cursor-pointer text-xs text-slate-600">
                  {soundEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  Sound Alerts
                </Label>
              </div>
            </div>
          </div>

          {/* Table Call Alerts */}
          <TableCallAlerts tenantId={tenantId} />

          {/* Stats — 4 compact cards */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
              <p className="text-xl font-bold text-amber-900">{pendingCount}</p>
              <p className="text-[11px] text-amber-700 font-medium">New</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 text-center">
              <p className="text-xl font-bold text-purple-900">{preparingCount}</p>
              <p className="text-[11px] text-purple-700 font-medium">Preparing</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
              <p className="text-xl font-bold text-green-900">{readyCount}</p>
              <p className="text-[11px] text-green-700 font-medium">Ready</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
              <p className="text-xl font-bold text-blue-900">{confirmCount}</p>
              <p className="text-[11px] text-blue-700 font-medium">Confirmed</p>
            </div>
          </div>

          {/* Status tabs — all fit on mobile 375px */}
          <div className="flex w-full gap-1">
            {STATUS_TABS.map(tab => {
              const count = tab.value === 'all' ? orders.length : countFor(tab.value);
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95 ${
                    isActive
                      ? 'text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                  style={isActive ? { background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' } : {}}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1 py-0 rounded-full min-w-[16px] text-center leading-4 ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
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
              <p className="text-slate-500">No {activeTab !== 'all' ? `${STATUS_TABS.find(t => t.value === activeTab)?.label} ` : ''}orders yet</p>
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