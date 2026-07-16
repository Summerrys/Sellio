import React, { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import { useAppUser } from '@/lib/AppUserContext';
import { Clock, AlertCircle, ChefHat, ArrowLeft, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { NEW_ORDER_TONE_URL, URGENT_ORDER_TONE_URL } from '@/lib/kdsSounds';

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
    <div
      className={`rounded-2xl border-4 p-5 flex flex-col gap-4 ${cfg.bg} text-white`}
      style={isCritical ? { animation: 'kdsBorderPulse 1.4s ease-in-out infinite' } : undefined}
    >
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
          {order.table_name}
        </div>
      )}

      <div className="space-y-2 flex-1">
        {(order.items || []).map((item, idx) => (
          <div key={idx} className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{item.quantity}× {item.name}</p>
            {item.variant && <p className="text-base opacity-80 mt-0.5">{item.variant}</p>}
            {item.notes && (
              <div className="mt-2 bg-yellow-300 text-slate-900 rounded-lg p-2 flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
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

// Mobile-only compact card — fits 4 columns on a phone without scrolling.
// Deliberately minimal (just the order ID + the same glowing border) since
// there's only ~80-90px of width per column to work with; tapping it opens
// the full KDSOrderCard as an overlay for the actual details/actions.
function KDSCompactCard({ order, onExpand }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.preparing;
  const elapsed = Math.floor((Date.now() - new Date(order.created_date)) / 60000);
  const isCritical = elapsed > 20;

  return (
    <button
      onClick={() => onExpand(order)}
      className={`w-full rounded-xl border-4 py-3 px-1.5 flex items-center justify-center text-white ${cfg.bg}`}
      style={isCritical ? { animation: 'kdsBorderPulse 1.4s ease-in-out infinite' } : undefined}
    >
      <span className="text-[11px] font-black leading-tight text-center break-words">
        {order.order_number || `#${order.id?.slice(-4)}`}
      </span>
    </button>
  );
}

// Tablet-tier card — iPad has real room, so unlike the phone's ID-only card
// this shows the order ID, items, and any notes so staff can see what's
// actually in the order without expanding first. Still compact next to the
// full desktop card (no giant buttons, no per-item cards) and still requires
// a tap to open the expand overlay and actually advance the order's status.
function KDSMediumCard({ order, onExpand }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.preparing;
  const elapsed = Math.floor((Date.now() - new Date(order.created_date)) / 60000);
  const isCritical = elapsed > 20;

  return (
    <button
      onClick={() => onExpand(order)}
      className={`w-full rounded-xl border-4 p-3 text-left text-white ${cfg.bg}`}
      style={isCritical ? { animation: 'kdsBorderPulse 1.4s ease-in-out infinite' } : undefined}
    >
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-base font-black leading-tight">{order.order_number || `#${order.id?.slice(-4)}`}</p>
        <span className="text-xs font-semibold opacity-80 flex items-center gap-1 flex-shrink-0">
          <Clock className="w-3 h-3" /><ElapsedTimer createdDate={order.created_date} />
        </span>
      </div>
      {order.table_name && (
        <p className="text-xs font-semibold opacity-80 mb-1.5">{order.table_name}</p>
      )}
      <div className="space-y-0.5 mb-1.5">
        {(order.items || []).map((item, idx) => (
          <div key={idx}>
            <p className="text-sm font-medium leading-snug">
              {item.quantity}× {item.name}{item.variant ? ` (${item.variant})` : ''}
            </p>
            {item.notes && (
              <p className="text-xs italic opacity-80 pl-3">📝 {item.notes}</p>
            )}
          </div>
        ))}
      </div>
      {order.notes && (
        <div className="bg-yellow-300 text-slate-900 rounded-lg px-2 py-1 flex items-center gap-1.5 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <p className="text-xs font-semibold leading-snug">{order.notes}</p>
        </div>
      )}
    </button>
  );
}

export default function KitchenDisplay() {
  const { tenantId, tenant } = useTenant();
  const { appUser } = useAppUser();
  const [orders, setOrders] = useState([]);
  // FIX: the realtime subscription below is set up once (useEffect deps: just
  // [tenantId]) and its callback closure captured `orders` from that one moment
  // — permanently. The repeat-alert interval was checking that frozen snapshot
  // forever after, not the actual current list, so it almost always found no
  // pending order and cancelled itself after a single silent tick. This ref
  // always holds the latest value for that closure to read instead.
  const ordersRef = useRef([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const fallbackPollRef = useRef(null);
  const audioCtxRef = useRef(null);
  const soundEnabledRef = useRef(false);
  const repeatIntervalRef = useRef(null);
  const newOrderAudioRef = useRef(null);
  const urgentAudioRef = useRef(null);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (!newOrderAudioRef.current) newOrderAudioRef.current = new Audio(NEW_ORDER_TONE_URL);
        if (!urgentAudioRef.current) urgentAudioRef.current = new Audio(URGENT_ORDER_TONE_URL);
        [newOrderAudioRef.current, urgentAudioRef.current].forEach(el => {
          el.volume = 0;
          el.play().then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = 1;
          }).catch(() => { el.volume = 1; });
        });
      } catch (e) { /* best effort */ }
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);
  const alertIntervalRef = useRef(60);
  const [alertInterval, setAlertInterval] = useState(60);

  // Restore sound preference — app_users.order_alerts (synced with Profile modal & Orders page)
  // takes priority; localStorage is a fast fallback for the very first render.
  useEffect(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`sellio_sound_alerts_${tenantId}`);
    if (stored === 'true') { setSoundEnabled(true); soundEnabledRef.current = true; }
    if (appUser?.order_alerts !== undefined) {
      const dbValue = appUser.order_alerts !== false;
      setSoundEnabled(dbValue);
      soundEnabledRef.current = dbValue;
      localStorage.setItem(`sellio_sound_alerts_${tenantId}`, String(dbValue));
    }
  }, [tenantId, appUser?.order_alerts]);

  // Ding plays `times` times in a row, with a short gap between each - 2 for a
  // normal new-order/ready notification, 3 when the repeat-alert interval
  // fires because an order has been sitting unacknowledged past the
  // merchant's configured threshold, so the two are audibly distinguishable.
  const playSound = (type, times = 2) => {
    if (!soundEnabledRef.current) return;
    try {
      const isUrgent = type === 'urgent';
      if (!newOrderAudioRef.current) newOrderAudioRef.current = new Audio(NEW_ORDER_TONE_URL);
      if (!urgentAudioRef.current) urgentAudioRef.current = new Audio(URGENT_ORDER_TONE_URL);
      const el = isUrgent ? urgentAudioRef.current : newOrderAudioRef.current;
      let playsLeft = times;
      el.onended = null;
      const playOnce = () => {
        playsLeft -= 1;
        el.onended = playsLeft > 0 ? playOnce : null;
        el.currentTime = 0;
        el.play().catch(() => {});
      };
      playOnce();
    } catch (e) {
      console.warn('playSound error:', e);
    }
  };

  const stopRepeatAlerts = () => {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  const startRepeatAlerts = (checkFn, soundType) => {
    stopRepeatAlerts();
    const secs = alertIntervalRef.current || 60;
    repeatIntervalRef.current = setInterval(() => {
      if (!soundEnabledRef.current) { stopRepeatAlerts(); return; }
      // 3 dings for the repeat/overdue case (an order sitting past the
      // merchant's configured threshold), vs 2 for the initial notification -
      // audibly distinguishes "still waiting" from "just arrived".
      if (checkFn()) playSound('urgent', 3);
      else stopRepeatAlerts();
    }, secs * 1000);
  };

  // iPadOS/iOS Safari can silently suspend an AudioContext when the tab or app
  // is backgrounded (screen lock, app-switch, even briefly), and won't resume
  // it again just because a setInterval callback asks it to — that resume only
  // reliably takes effect right after a fresh user gesture. This re-primes the
  // context whenever the page becomes visible again, so a kitchen tablet that's
  // been sitting idle (screen dimmed, user stepped away) doesn't end up with
  // alerts that silently stopped working. This is a mitigation for a real
  // WebKit quirk, not a guaranteed fix — worth re-testing on the actual iPad
  // after this change.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && newOrderAudioRef.current && urgentAudioRef.current) {
        [newOrderAudioRef.current, urgentAudioRef.current].forEach(el => {
          el.volume = 0;
          el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = 1; }).catch(() => { el.volume = 1; });
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Same idea as the tap-based unlock, but on a timer instead of a gesture -
  // keeps the <audio> element continuously "recently played" for as long as
  // sound is turned on, so a long idle stretch on a tablet nobody's touched
  // can't let it go stale before the next real alert needs to fire.
  useEffect(() => {
    if (!soundEnabled) return;
    const keepAlive = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (!newOrderAudioRef.current) newOrderAudioRef.current = new Audio(NEW_ORDER_TONE_URL);
        if (!urgentAudioRef.current) urgentAudioRef.current = new Audio(URGENT_ORDER_TONE_URL);
        [newOrderAudioRef.current, urgentAudioRef.current].forEach(el => {
          el.volume = 0;
          el.play().then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = 1;
          }).catch(() => { el.volume = 1; });
        });
      } catch (e) { /* best effort */ }
    };
    keepAlive();
    const id = setInterval(keepAlive, 20000);
    return () => clearInterval(id);
  }, [soundEnabled]);

  useEffect(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`sellio_sound_alerts_${tenantId}`);
    if (stored === 'true') {
      setSoundEnabled(true);
      soundEnabledRef.current = true;
    }
    const storedInterval = parseInt(localStorage.getItem(`sellio_alert_interval_${tenantId}`) || '60', 10);
    setAlertInterval(storedInterval);
    alertIntervalRef.current = storedInterval;
  }, [tenantId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    alertIntervalRef.current = alertInterval;
  }, [alertInterval]);

  useEffect(() => {
    return () => { if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current); };
  }, []);

  // Listen for native fullscreen exit (Escape key)
  useEffect(() => {
    const onFSChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFSChange);
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      document.removeEventListener('fullscreenchange', onFSChange);
    };
  }, []);

  const handleEnterFullscreen = () => {
    // FIX: iPadOS/iOS Safari has never supported the Fullscreen API for regular
    // elements (only <video> has a separate proprietary method) — calling
    // requestFullscreen() there throws synchronously rather than returning a
    // rejected promise, so .catch() never ran and this whole function aborted
    // before ever reaching setIsFullscreen(true). The CSS-driven pseudo-
    // fullscreen wrapper below doesn't actually depend on the native API
    // succeeding, so wrapping this in try/catch is enough to make sure we
    // always still reach it.
    try {
      document.documentElement.requestFullscreen?.()?.catch?.(() => {});
    } catch (e) { /* not supported on this browser — CSS fullscreen still applies */ }
    setIsFullscreen(true);
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFullscreen(false);
  };

  const fetchOrders = async () => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .eq('is_deleted', false)
      .order('created_date', { ascending: true });
    if (!error) setOrders(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!tenantId) return;

    fetchOrders();

    let supabaseClient;
    let channel;

    getSupabase().then(sc => {
      supabaseClient = sc;
      channel = sc
        .channel(`kitchen-orders-${tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            console.log('Kitchen Display real-time update:', payload.eventType, payload.new?.order_number);
            fetchOrders();
            if (payload.eventType === 'INSERT' && soundEnabledRef.current) {
              playSound('new');
              startRepeatAlerts(() => ordersRef.current.some(o => o.status === 'pending'), 'new');
            }
            if (payload.eventType === 'UPDATE' &&
                payload.new?.status === 'ready' &&
                payload.old?.status !== 'ready' &&
                soundEnabledRef.current) {
              playSound('ready');
              startRepeatAlerts(() => ordersRef.current.some(o => o.status === 'ready'), 'ready');
            }
            if (payload.eventType === 'UPDATE' &&
                (payload.new?.status === 'confirmed' || payload.new?.status === 'completed')) {
              const stillHasPending = ordersRef.current.some(o => o.status === 'pending' && o.id !== payload.new?.id);
              const stillHasReady = ordersRef.current.some(o => o.status === 'ready' && o.id !== payload.new?.id);
              if (!stillHasPending && !stillHasReady) stopRepeatAlerts();
            }
          }
        )
        .subscribe((status) => {
          console.log('Kitchen Display subscription status:', status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Kitchen Display: real-time failed, falling back to 30s polling');
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
  }, [tenantId]);

  const handleBump = async (orderId, currentStatus) => {
    // Piggybacks on this genuine tap as another chance to re-prime the ding
    // element, same as the pointerdown/touchstart listener — every real user
    // gesture helps keep it from going stale on iOS.
    if (dingAudioRef.current) {
      const el = dingAudioRef.current;
      el.volume = 0;
      el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = 1; }).catch(() => { el.volume = 1; });
    }
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

  const content = (
    <>
      {/* FIX: previously used Tailwind's animate-pulse (opacity-based) on the whole
          card for overdue orders, which faded the item names, timer, and buttons
          right along with the border, making the card harder to read while it was
          flashing. This keyframe only pulses the border/glow — content underneath
          stays fully readable and static throughout. */}
      <style>{`
        @keyframes kdsBorderPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.7); border-color: rgb(248, 113, 113); }
          50% { box-shadow: 0 0 0 10px rgba(248, 113, 113, 0); border-color: rgb(220, 38, 38); }
        }
      `}</style>
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6">
      <div className="mb-6 pb-4 border-b border-slate-700">
        {/* Top row: Exit button + Title */}
        <div className="flex items-center gap-3 mb-3">
          {isFullscreen && (
            <button
              onClick={handleExit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-white/40 text-white bg-transparent hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" /> Exit
            </button>
          )}
          <h1 className="text-xl sm:text-3xl font-black truncate flex-1">{tenant?.name || 'Kitchen'} — Kitchen Display</h1>
          <div className="flex items-center gap-2">
            {soundEnabled && (
              <div className="flex items-center gap-1">
                {[30, 60, 120].map(s => (
                  <button
                    key={s}
                    onClick={() => { setAlertInterval(s); alertIntervalRef.current = s; if (tenantId) localStorage.setItem(`sellio_alert_interval_${tenantId}`, String(s)); }}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${alertInterval === s ? 'bg-white text-slate-900' : 'border border-white/40 text-white/70'}`}
                  >
                    {s === 30 ? '30s' : s === 60 ? '1m' : '2m'}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const newVal = !soundEnabled;
                setSoundEnabled(newVal);
                soundEnabledRef.current = newVal;
                if (tenantId) localStorage.setItem(`sellio_sound_alerts_${tenantId}`, String(newVal));
                // Keep app_users.order_alerts in sync so Profile modal & Orders page reflect this too
                if (appUser?.id) {
                  getSupabase().then(supabase =>
                    supabase.from('app_users').update({ order_alerts: newVal }).eq('id', appUser.id)
                  ).catch(() => {});
                }
                // Playing directly here is fine now - playSound is <audio>-element
                // based and this click is itself a genuine gesture (also already
                // caught by the pointerdown/touchstart unlock listener above it).
                if (newVal) {
                  playSound('new');
                } else {
                  stopRepeatAlerts();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-white/40 text-white bg-transparent hover:bg-white/10 transition-colors flex-shrink-0"
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
          </div>
          {!isFullscreen && (
            <button
              onClick={handleEnterFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-white/40 text-white bg-transparent hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Stat cards — equal width, single row, no overflow */}
        <div className="flex gap-2">
          {[
            { label: 'New',       count: pendingOrders.length,   color: 'text-amber-400',  bg: 'bg-amber-400/10' },
            { label: 'Confirmed', count: confirmedOrders.length, color: 'text-blue-400',   bg: 'bg-blue-400/10' },
            { label: 'Preparing', count: preparingOrders.length, color: 'text-purple-400', bg: 'bg-purple-400/10' },
            { label: 'Ready',     count: readyOrders.length,     color: 'text-green-400',  bg: 'bg-green-400/10' },
          ].map(s => (
            <div key={s.label} className={`flex-1 rounded-xl py-2 text-center ${s.bg}`}>
              <p className={`text-[20px] font-black leading-tight ${s.color}`}>{s.count}</p>
              <p className={`text-[11px] font-semibold ${s.color} opacity-80`}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-500">
          <ChefHat className="w-20 h-20" />
          <p className="text-3xl font-bold">No active orders</p>
          <p className="text-lg">New orders will appear here automatically</p>
        </div>
      ) : (
        <>
        {/* Phone: 4 fixed columns, ID-only compact cards — no room for more.
            iPad gets its own richer tier below (items + notes visible without
            expanding, since there's real space to use). Desktop/large screens
            and the fullscreen kiosk view keep the original full-card layout
            further down, unchanged. */}
        <div className="md:hidden grid grid-cols-4 gap-1.5">
          {[
            { label: 'New', color: 'text-amber-400', list: pendingOrders },
            { label: 'Confirmed', color: 'text-blue-400', list: confirmedOrders },
            { label: 'Preparing', color: 'text-purple-400', list: preparingOrders },
            { label: 'Ready', color: 'text-green-400', list: readyOrders },
          ].map(col => (
            <div key={col.label} className="space-y-1.5">
              <p className={`text-[10px] font-bold uppercase tracking-wide text-center ${col.color}`}>{col.label}</p>
              {[...col.list]
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
                .map(order => (
                  <KDSCompactCard key={order.id} order={order} onExpand={setExpandedOrder} />
                ))}
            </div>
          ))}
        </div>

        {/* iPad tier: same 4-column, no-scroll idea, but with real card content
            (order ID, items, notes) since there's enough width for it here. */}
        <div className="hidden md:grid xl:hidden grid-cols-4 gap-2">
          {[
            { label: 'New', color: 'text-amber-400', list: pendingOrders },
            { label: 'Confirmed', color: 'text-blue-400', list: confirmedOrders },
            { label: 'Preparing', color: 'text-purple-400', list: preparingOrders },
            { label: 'Ready', color: 'text-green-400', list: readyOrders },
          ].map(col => (
            <div key={col.label} className="space-y-2">
              <p className={`text-xs font-bold uppercase tracking-wide text-center ${col.color}`}>{col.label} ({col.list.length})</p>
              {[...col.list]
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
                .map(order => (
                  <KDSMediumCard key={order.id} order={order} onExpand={setExpandedOrder} />
                ))}
            </div>
          ))}
        </div>

        <div className="hidden xl:grid xl:grid-cols-4 gap-6">
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

        {/* Expanded order overlay — tapping the backdrop (not the card) closes it,
            so staff can quickly check one order and get right back to the board. */}
        {expandedOrder && orders.some(o => o.id === expandedOrder.id) && (
          <div
            className="xl:hidden fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70"
            onClick={() => setExpandedOrder(null)}
          >
            <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <KDSOrderCard
                order={orders.find(o => o.id === expandedOrder.id)}
                onBump={(...args) => { handleBump(...args); setExpandedOrder(null); }}
              />
            </div>
          </div>
        )}
        </>
      )}
    </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh',
        zIndex: 9999, background: '#0f172a', overflowY: 'auto'
      }}>
        {content}
      </div>
    );
  }

  return content;
}