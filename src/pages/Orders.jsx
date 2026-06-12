import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadPrinterConfig, buildOrderReceipt, sendViaBluetooth, sendViaEpsonEPos } from '@/lib/printerUtils';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PullToRefresh from '../components/ui-custom/PullToRefresh';
import TableCallAlerts from '../components/orders/TableCallAlerts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ClipboardList, Bell, BellOff, Monitor, Search, Download, Printer, Loader2 } from 'lucide-react';
import { SkeletonList } from '@/components/ui-custom/AppLoader';
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

function OrderCard({ order, currency, merchantName, tenantId, onStatusUpdate, onMarkPaid }) {
  const action = STATUS_NEXT[order.status];
  const accent = STATUS_ACCENT[order.status] || STATUS_ACCENT.completed;
  const elapsed = formatDistanceToNow(new Date(order.created_date || order.created_at), { addSuffix: true });
  const customerName = order.customer_name && order.customer_name.toLowerCase() !== 'nil' ? order.customer_name : null;
  const useThemeButton = THEME_BUTTON_STATUSES.has(order.status);
  const showPrint = order.status === 'ready' || order.status === 'completed';
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    const cfg = loadPrinterConfig(tenantId);
    if (!cfg) {
      // Fall back to browser print dialog
      printReceipt(order, currency, merchantName);
      return;
    }
    setPrinting(true);
    const bytes = buildOrderReceipt(order, currency, merchantName);
    try {
      if (cfg.mode === 'bluetooth' && cfg.deviceName) {
        await sendViaBluetooth(cfg.deviceName, bytes);
      } else if (cfg.mode === 'network') {
        await sendViaEpsonEPos(cfg.ip, bytes, merchantName);
      } else {
        printReceipt(order, currency, merchantName);
      }
      toast.success('Printed ✓');
    } catch (err) {
      toast.error(`Print failed: ${err.message}`);
    } finally {
      setPrinting(false);
    }
  };

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
        <div className={showPrint || (order.payment_status !== 'paid' && (order.status === 'completed' || order.status === 'ready')) ? 'flex flex-col gap-2' : ''}>
          {order.payment_status !== 'paid' && (order.status === 'completed' || order.status === 'ready') && (
            <button
              onClick={() => onMarkPaid(order)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              style={{ border: '1.5px solid #16a34a', color: '#16a34a', background: '#f0fdf4' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#16a34a'; }}
            >
              💳 Mark as Paid
            </button>
          )}
          {showPrint && (
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold flex-1 transition-colors disabled:opacity-70"
              style={{ border: '1.5px solid rgb(var(--color-primary))', color: 'rgb(var(--color-primary))', background: 'transparent' }}
              onMouseEnter={e => { if (!printing) e.currentTarget.style.background = 'rgba(var(--color-primary),0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {printing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                : <><Printer className="w-3.5 h-3.5" /> Receipt</>
              }
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
  const fallbackPollRef = useRef(null);
  const audioCtxRef = useRef(null);
  const soundEnabledRef = useRef(false);

  const isFnB = /f&b|cafe|restaurant|food/i.test(tenant?.industry || '');
  const currency = tenant?.settings?.currency || tenant?.currency || 'SGD';
  const canViewOrders = hasPermission?.('orders.view');

  // Restore sound preference from localStorage once tenantId is available
  useEffect(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`sellio_sound_alerts_${tenantId}`);
    if (stored === 'true') setSoundEnabled(true);
  }, [tenantId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playTone = (freq, duration, delayMs = 0) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.05);
      }, delayMs);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  };

  const playSound = (type) => {
    if (!soundEnabledRef.current) return;
    if (type === 'ready') {
      playTone(880, 0.25, 0);
      playTone(1100, 0.25, 260);
      playTone(1320, 0.35, 520);
    } else {
      playTone(440, 0.3, 0);
      playTone(550, 0.3, 320);
    }
  };

  const handleSoundToggle = (newVal) => {
    setSoundEnabled(newVal);
    soundEnabledRef.current = newVal;
    if (tenantId) localStorage.setItem(`sellio_sound_alerts_${tenantId}`, String(newVal));
    if (newVal) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().then(() => playSound('new'));
      } else {
        playSound('new');
      }
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

    let supabaseClient;
    let channel;

    getSupabase().then(sc => {
      supabaseClient = sc;
      channel = sc
        .channel(`orders-page-${tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            console.log('Orders page real-time update:', payload.eventType, payload.new?.order_number);
            fetchOrders();

            // Sound alerts via real-time events
            if (soundEnabledRef.current && payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
              if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
              }
              playSound('new');
            }
            if (soundEnabledRef.current && payload.eventType === 'UPDATE' &&
                payload.new?.status === 'ready' && payload.old?.status !== 'ready') {
              if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
              }
              playSound('ready');
            }
          }
        )
        .subscribe((status) => {
          console.log('Orders page subscription status:', status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Orders page: real-time failed, falling back to 30s polling');
            clearInterval(fallbackPollRef.current);
            fallbackPollRef.current = setInterval(fetchOrders, 30000);
          } else if (status === 'SUBSCRIBED') {
            clearInterval(fallbackPollRef.current);
          }
        });
    });

    return () => {
      clearInterval(fallbackPollRef.current);
      if (supabaseClient && channel) supabaseClient.removeChannel(channel);
    };
  }, [tenantId, fetchOrders]);

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

  const handleMarkPaid = async (order) => {
    const supabase = await getSupabase();
    await supabase.from('orders').update({
      payment_status: 'paid',
      status: 'completed',
      updated_date: new Date().toISOString(),
    }).eq('id', order.id);

    if (order.table_id) {
      await supabase.from('tables').update({
        status: 'available',
        updated_date: new Date().toISOString(),
      }).eq('id', order.table_id);

      await supabase.from('table_sessions').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      }).eq('table_id', order.table_id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
    }

    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, payment_status: 'paid', status: 'completed' } : o
    ));
    toast.success('Marked as paid ✓');
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
            <SkeletonList count={4} lines={3} imageSize={0} />
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
                  tenantId={tenantId}
                  onStatusUpdate={handleStatusUpdate}
                  onMarkPaid={handleMarkPaid}
                />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>
    </RequirePermission>
  );
}