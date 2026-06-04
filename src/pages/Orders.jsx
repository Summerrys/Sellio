import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ClipboardList, Bell, BellOff, Monitor, Search, Download, Printer } from 'lucide-react';
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


function printReceipt(order, currency, merchantName) {
  const itemsHtml = (order.items || []).map(item => {
    const lineTotal = ((item.price || item.unit_price || 0) * (item.quantity || 1)).toFixed(2);
    return `<tr>
      <td style="padding:4px 8px 4px 0">${item.quantity}× ${item.name || item.product_name}${item.variant ? ` (${item.variant})` : ''}</td>
      <td style="padding:4px 0;text-align:right">${currency} ${lineTotal}</td>
    </tr>`;
  }).join('');
  const subtotal = parseFloat(order.subtotal || order.total_amount || 0).toFixed(2);
  const tax = parseFloat(order.tax_amount || 0).toFixed(2);
  const total = parseFloat(order.total_amount || 0).toFixed(2);
  const date = new Date(order.created_date || Date.now()).toLocaleString();

  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
  <style>
    body{font-family:monospace;font-size:13px;margin:0;padding:16px;max-width:320px}
    h2{margin:0 0 4px;font-size:16px;text-align:center}
    .center{text-align:center} .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse} td{vertical-align:top}
    .total{font-weight:bold;font-size:14px} .small{font-size:11px;color:#555}
    @media print{body{padding:0}button{display:none}}
  </style></head><body>
  <h2>${merchantName || 'Receipt'}</h2>
  <p class="center small">${date}</p>
  <div class="divider"></div>
  <p><strong>Order:</strong> ${order.order_number || order.id?.slice(-6)}</p>
  ${order.table_name ? `<p><strong>Table:</strong> ${order.table_name}</p>` : ''}
  ${order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? `<p><strong>Customer:</strong> ${order.customer_name}</p>` : ''}
  <div class="divider"></div>
  <table>${itemsHtml}</table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">${currency} ${subtotal}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">${currency} ${tax}</td></tr>
    <tr class="total"><td>Total</td><td style="text-align:right">${currency} ${total}</td></tr>
  </table>
  <div class="divider"></div>
  <p class="center small">Thank you!</p>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

function OrderCard({ order, currency, merchantName, onStatusUpdate }) {
  const action = STATUS_NEXT[order.status];
  const accent = STATUS_ACCENT[order.status] || STATUS_ACCENT.completed;
  const elapsed = formatDistanceToNow(new Date(order.created_date || order.created_at), { addSuffix: true });
  const customerName = order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : null;
  const useThemeButton = THEME_BUTTON_STATUSES.has(order.status);
  const showPrint = order.status === 'ready' || order.status === 'completed';

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

        {/* Action buttons */}
        <div className={showPrint ? 'flex gap-2' : ''}>
          {showPrint && (
            <button
              onClick={() => printReceipt(order, currency, merchantName)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold flex-1 transition-colors"
              style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--color-primary),0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Printer className="w-3.5 h-3.5" /> Receipt
            </button>
          )}
          {action && (
            <button
              onClick={() => onStatusUpdate(order.id, action.next)}
              className={`py-2.5 rounded-lg text-sm font-semibold text-white active:scale-95 transition-transform ${showPrint ? 'flex-1' : 'w-full'}`}
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
    </div>
  );
}

export default function Orders() {
  const { tenantId, tenant, hasPermission } = useTenant();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    // Will be updated once tenantId is known
    return false;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const lastSeenDateRef = useRef(null);
  const soundPollRef = useRef(null);
  const refreshRef = useRef(null);
  const audioCtxRef = useRef(null);

  const isFnB = /f&b|cafe|restaurant|food/i.test(tenant?.industry || '');
  const currency = tenant?.settings?.currency || tenant?.currency || 'SGD';
  const canViewOrders = hasPermission?.('orders.view');

  // Restore sound preference from localStorage once tenantId is available
  useEffect(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`sellio_sound_alerts_${tenantId}`);
    if (stored === 'true') setSoundEnabled(true);
  }, [tenantId]);

  const playToneNow = (freq, duration) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playSound = (type) => {
    if (!audioCtxRef.current) return;
    if (type === 'ready') {
      playToneNow(880, 0.2);
      setTimeout(() => playToneNow(1100, 0.2), 200);
    } else {
      playToneNow(440, 0.4);
    }
  };

  const handleSoundToggle = (newVal) => {
    setSoundEnabled(newVal);
    if (tenantId) localStorage.setItem(`sellio_sound_alerts_${tenantId}`, String(newVal));
    if (newVal && !audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
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

  // Sound alert polling — runs every 20s when sound is enabled
  useEffect(() => {
    if (!soundEnabled || !tenantId || !canViewOrders) {
      clearInterval(soundPollRef.current);
      return;
    }
    const poll = async () => {
      const supabase = await getSupabase();
      const query = supabase
        .from('orders')
        .select('id, status, created_date')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: false })
        .limit(20);
      const { data } = await query;
      if (!data || data.length === 0) return;

      const latestDate = data[0].created_date;
      if (lastSeenDateRef.current === null) {
        // First poll — just record baseline, no alert
        lastSeenDateRef.current = latestDate;
        return;
      }

      // Check for genuinely new orders (created after last seen)
      const hasNewPending = data.some(o => o.status === 'pending' && o.created_date > lastSeenDateRef.current);
      const hasNewReady   = data.some(o => o.status === 'ready'   && o.created_date > lastSeenDateRef.current);

      if (hasNewReady) {
        playSound('ready');
      } else if (hasNewPending) {
        playSound('new');
      }

      lastSeenDateRef.current = latestDate;
    };

    // Run immediately, then every 20s
    poll();
    soundPollRef.current = setInterval(poll, 20000);
    return () => clearInterval(soundPollRef.current);
  }, [soundEnabled, tenantId, canViewOrders]);

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

  const tabOrders = activeTab === 'all' ? orders : orders.filter(o => o.status === activeTab);
  const filteredOrders = searchQuery.trim()
    ? tabOrders.filter(o => {
        const q = searchQuery.toLowerCase();
        return (
          (o.order_number || '').toLowerCase().includes(q) ||
          (o.table_name || '').toLowerCase().includes(q) ||
          (o.customer_name || '').toLowerCase().includes(q) ||
          (o.items || []).some(i => (i.name || i.product_name || '').toLowerCase().includes(q))
        );
      })
    : tabOrders;
  const countFor = (status) => orders.filter(o => o.status === status).length;

  const handleDownload = () => {
    const rows = orders.map(o => {
      const itemsStr = (o.items || []).map(i => `${i.quantity}x ${i.name || i.product_name}`).join(', ');
      return [
        o.order_number || '',
        o.status || '',
        o.table_name || '',
        `"${itemsStr}"`,
        parseFloat(o.total_amount || 0).toFixed(2),
        o.created_date || '',
      ].join(',');
    });
    const csv = '\uFEFF' + ['order_number,status,table_name,items,total_amount,created_date', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount   = countFor('pending');
  const confirmCount   = countFor('confirmed');
  const preparingCount = countFor('preparing');
  const readyCount     = countFor('ready');

  const STAT_CARDS = [
    { label: 'New',       count: pendingCount,   status: 'pending',   bg: 'bg-amber-50',  border: 'border-amber-200',  activeBorder: '#f59e0b', text: 'text-amber-900',  sub: 'text-amber-700' },
    { label: 'Confirmed', count: confirmCount,   status: 'confirmed', bg: 'bg-blue-50',   border: 'border-blue-200',   activeBorder: '#3b82f6', text: 'text-blue-900',   sub: 'text-blue-700' },
    { label: 'Preparing', count: preparingCount, status: 'preparing', bg: 'bg-purple-50', border: 'border-purple-200', activeBorder: '#8b5cf6', text: 'text-purple-900', sub: 'text-purple-700' },
    { label: 'Ready',     count: readyCount,     status: 'ready',     bg: 'bg-green-50',  border: 'border-green-200',  activeBorder: '#10b981', text: 'text-green-900',  sub: 'text-green-700' },
  ];

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
                <button
                  onClick={() => navigate(createPageUrl('KitchenDisplay'))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors"
                  style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'rgba(var(--color-primary), 0.08)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-gradient)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--color-primary), 0.08)'; e.currentTarget.style.color = 'rgb(var(--color-primary))'; }}
                >
                  <Monitor className="w-4 h-4" /> Kitchen Display
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Switch id="sound" checked={soundEnabled} onCheckedChange={handleSoundToggle} className="scale-90" />
                <Label htmlFor="sound" className="flex items-center gap-1 cursor-pointer text-xs text-slate-600">
                  {soundEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  Sound Alerts
                </Label>
              </div>
            </div>
          </div>

          {/* Search + Download */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search orders, table, items..."
                className="w-full pl-9 pr-3 h-9 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgba(var(--color-primary),0.3)' }}
              />
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>

          {/* Table Call Alerts */}
          <TableCallAlerts tenantId={tenantId} />

          {/* Stats — 4 clickable cards */}
          <div className="grid grid-cols-4 gap-2">
            {STAT_CARDS.map(card => {
              const isActive = activeTab === card.status;
              return (
                <button
                  key={card.status}
                  onClick={() => setActiveTab(isActive ? 'all' : card.status)}
                  className={`${card.bg} rounded-xl p-3 text-center cursor-pointer transition-all active:scale-95 border-2 ${isActive ? '' : card.border}`}
                  style={isActive ? { borderColor: card.activeBorder, boxShadow: `0 0 0 1px ${card.activeBorder}` } : {}}
                >
                  <p className={`text-[20px] font-bold leading-tight ${card.text}`}>{card.count}</p>
                  <p className={`text-[11px] font-medium ${card.sub}`}>{card.label}</p>
                </button>
              );
            })}
          </div>

          {/* Status tabs */}
          <div className="flex w-full gap-1">
            {STATUS_TABS.map(tab => {
              const count = tab.value === 'all' ? orders.length : countFor(tab.value);
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95 ${
                    isActive ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600'
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
              <p className="text-slate-500">
                {searchQuery ? 'No orders match your search' : `No ${activeTab !== 'all' ? `${STATUS_TABS.find(t => t.value === activeTab)?.label} ` : ''}orders yet`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currency={currency}
                  merchantName={tenant?.name}
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