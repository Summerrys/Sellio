import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppRefreshHandler, useAppReloadGuard } from '@/lib/AppRefreshContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ShoppingBag, X } from 'lucide-react';
import { getCounterOptionGroups, toggleCounterOption, validCounterOptions } from '@/lib/counterOptions';
import { useBackToClose } from '@/lib/useBackToClose';
import CounterOrderResult from '@/components/counter/CounterOrderResult';
import { getSupabase } from '@/lib/supabaseClient';
import { submitCheckout } from '@/lib/mobileCheckout';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import { fetchStorefrontCatalog } from '@/lib/storefrontCatalog';
import { createPageUrl } from '@/utils';

// Counter: staff order entry for the counter tablet (adapts to phones).
// Pick a table (or Takeaway) -> one tap per dish -> Send. Prices, order numbers
// and each table's running bill are handled server-side by place_order().

const CURRENCY_SYMBOLS = { SGD: '$', MYR: 'RM ', USD: '$', AUD: 'A$', GBP: '£', EUR: '€' };


function splitName(s) {
  const str = String(s || '').replace(/^❌\s*/, 'No ');
  const m = str.match(/^(.*?)\s*([㐀-鿿豈-﫿].*)$/);
  if (m && m[1].trim()) return { cjk: m[2].trim(), latin: m[1].trim() };
  if (m) return { cjk: m[2].trim(), latin: '' };
  return { cjk: '', latin: str };
}

function optionPrice(groups, sel) {
  const g = groups.find(x => x.name === sel.group);
  const o = g && g.options.find(x => x.label === sel.label);
  return o ? o.price : 0;
}

const selKey = sel => JSON.stringify(sel.map(x => `${x.group}|${x.label}`).sort());

export default function Counter() {
  return (
    <RequirePermission permission="orders.create">
      <CounterScreen />
    </RequirePermission>
  );
}

function CounterScreen() {
  const navigate = useNavigate();
  const { tenantId, tenant, user, hasPermission } = useTenant();
  const draftKey = `sellio_counter_drafts:${tenantId}:${user?.id || 'staff'}`;
  const sym = CURRENCY_SYMBOLS[tenant?.currency] || (tenant?.currency ? `${tenant.currency} ` : '$');
  const money = useCallback(n => `${sym}${(Number(n) || 0).toFixed(2)}`, [sym]);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState({});
  const [sold, setSold] = useState({});
  const [view, setView] = useState('tables');
  const [target, setTarget] = useState(null);
  const [tickets, setTickets] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(draftKey) || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { return {}; }
  });
  const [cat, setCat] = useState('popular');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState(null);
  const [quantityProduct, setQuantityProduct] = useState(null);
  const [sentOrder, setSentOrder] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [nameMode, setNameMode] = useState(() => {
    try { return localStorage.getItem('counter_name_mode') || 'cjk'; } catch { return 'cjk'; }
  });
  const uidRef = useRef(Date.now());
  const gestureRef = useRef(null);
  const suppressClickUntil = useRef(0);
  const draftKeyRef = useRef(draftKey);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (draftKeyRef.current !== draftKey) {
      draftKeyRef.current = draftKey;
      try { setTickets(JSON.parse(sessionStorage.getItem(draftKey) || '{}')); } catch { setTickets({}); }
      setTarget(null); setView('tables'); setSheet(null); setQuantityProduct(null); setSentOrder(null);
      return;
    }
    try { sessionStorage.setItem(draftKey, JSON.stringify(tickets)); } catch { /* Drafts remain in memory. */ }
  }, [draftKey, tickets]);

  const byId = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const groupsById = useMemo(() => Object.fromEntries(products.map(p => [p.id, getCounterOptionGroups(p)])), [products]);

  const loadSessions = useCallback(async (throwOnError = false) => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('table_sessions')
      .select('id, table_id, order_ids, total_amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (error) { if (throwOnError === true) throw error; return; }
    const map = {};
    (data || []).forEach(s => { map[s.table_id] = s; });
    setSessions(map);
  }, [tenantId]);

  const loadCatalog = useCallback(async (shouldApply = () => true) => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const [catalog, tablesRes, itemsRes] = await Promise.all([
      fetchStorefrontCatalog(supabase, tenantId),
      supabase.from('tables').select('id, name, zone, status, sort_order')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('order_items').select('product_id, quantity')
        .eq('tenant_id', tenantId)
        .gte('created_date', since)
        .limit(5000),
    ]);
    if (tablesRes.error) throw tablesRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (!shouldApply()) return;
    setProducts(catalog.products || []);
    setCategories(catalog.categories || []);
    setTables(tablesRes.data || []);
    const counts = {};
    (itemsRes.data || []).forEach(i => { counts[i.product_id] = (counts[i.product_id] || 0) + (i.quantity || 0); });
    setSold(counts);
  }, [tenantId]);

  useAppRefreshHandler(() => Promise.all([loadCatalog(), loadSessions(true)]));
  useAppReloadGuard(() => ({
    dirty: Object.values(tickets).some(ticket => ticket.length > 0) || !!sheet,
    busy: sendingRef.current || settling || printing,
  }));

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    setLoading(true);
    loadCatalog(() => !cancelled)
      .catch(() => { if (!cancelled) toast.error('Could not load the menu. Check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    loadSessions();
    const timer = setInterval(loadSessions, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [tenantId, loadCatalog, loadSessions]);

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || sendingRef.current || settling || printing) return;
      if (sheet) setSheet(null);
      else if (quantityProduct) setQuantityProduct(null);
      else if (sentOrder) setSentOrder(null);
      else if (settleOpen && !settling) setSettleOpen(false);
      else if (ticketOpen) setTicketOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, quantityProduct, sentOrder, settleOpen, settling, printing, ticketOpen]);

  const popular = useMemo(
    () => products.filter(p => sold[p.id]).sort((a, b) => sold[b.id] - sold[a.id]).slice(0, 8),
    [products, sold],
  );
  const hasPopular = popular.length >= 3;
  const cats = useMemo(() => categories.filter(c => products.some(p => p.category_id === c.id)), [categories, products]);
  const uncategorized = useMemo(
    () => products.filter(p => !p.category_id || !categories.some(c => c.id === p.category_id)),
    [products, categories],
  );

  const nameParts = useCallback(raw => {
    const s = splitName(raw);
    if (!s.cjk) return { main: s.latin, sub: '' };
    if (!s.latin) return { main: s.cjk, sub: '' };
    return nameMode === 'cjk' ? { main: s.cjk, sub: s.latin } : { main: s.latin, sub: s.cjk };
  }, [nameMode]);

  const toggleNameMode = () => {
    const next = nameMode === 'cjk' ? 'latin' : 'cjk';
    setNameMode(next);
    try { localStorage.setItem('counter_name_mode', next); } catch { /* per-device convenience only */ }
  };

  const key = target?.key;
  const lines = (key && tickets[key]) || [];
  const setLines = updater => setTickets(prev => {
    const cur = prev[key] || [];
    return { ...prev, [key]: typeof updater === 'function' ? updater(cur) : updater };
  });
  const unitPrice = useCallback(line => {
    const p = byId[line.pid];
    if (!p) return 0;
    const groups = groupsById[line.pid] || [];
    return (Number(p.price) || 0) + line.sel.reduce((s, x) => s + optionPrice(groups, x), 0);
  }, [byId, groupsById]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const draftCount = k => (tickets[k] || []).reduce((s, l) => s + l.qty, 0);
  const inTicket = useMemo(() => {
    const m = {};
    lines.forEach(l => { m[l.pid] = (m[l.pid] || 0) + l.qty; });
    return m;
  }, [lines]);
  const session = target?.tableId ? sessions[target.tableId] : null;
  const orderCount = Array.isArray(session?.order_ids) ? session.order_ids.length : 0;

  const zones = useMemo(() => {
    const m = new Map();
    tables.forEach(t => {
      const z = t.zone || 'Tables';
      if (!m.has(z)) m.set(z, []);
      m.get(z).push(t);
    });
    return [...m.entries()];
  }, [tables]);
  const tableLabel = t => {
    let n = t.name || '';
    if (t.zone && n.toLowerCase().startsWith(t.zone.toLowerCase())) n = n.slice(t.zone.length).replace(/^[\s\-–:]+/, '');
    return n || t.name || 'Table';
  };

  const openTarget = t => {
    setTarget(t);
    setView('order');
    setCat(hasPopular ? 'popular' : (cats[0]?.id || 'other'));
    setQuery('');
    setTicketOpen(false);
    setSheet(null);
    setQuantityProduct(null);
    setSettleOpen(false);
  };
  const backToTables = () => { setView('tables'); setSheet(null); setQuantityProduct(null); setSettleOpen(false); setTicketOpen(false); };
  const closeUnlessBusy = close => () => {
    if (sendingRef.current || settling || printing) return false;
    close();
  };
  useBackToClose(view === 'order', closeUnlessBusy(backToTables));
  useBackToClose(ticketOpen, closeUnlessBusy(() => setTicketOpen(false)));
  useBackToClose(!!quantityProduct, closeUnlessBusy(() => setQuantityProduct(null)));
  useBackToClose(settleOpen, closeUnlessBusy(() => setSettleOpen(false)));
  useBackToClose(!!sheet, closeUnlessBusy(() => setSheet(null)));
  useBackToClose(!!sentOrder, closeUnlessBusy(() => setSentOrder(null)));

  const addProduct = p => {
    const groups = groupsById[p.id] || [];
    if (groups.length) { setSheet({ mode: 'new', pid: p.id, sel: [] }); return; }
    setLines(prev => {
      const same = prev.find(l => l.pid === p.id && !l.sel.length && !l.note);
      if (same) return prev.map(l => (l === same ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...prev, { uid: uidRef.current++, pid: p.id, qty: 1, sel: [], note: '', noteOpen: false }];
    });
  };
  const changeQty = (uid, d) => setLines(prev => prev
    .map(l => (l.uid === uid ? { ...l, qty: Math.min(99, l.qty + d) } : l))
    .filter(l => l.qty > 0));
  const toggleNote = uid => setLines(prev => prev.map(l => (l.uid === uid ? { ...l, noteOpen: !l.noteOpen } : l)));
  const updateNote = (uid, note) => setLines(prev => prev.map(l => (l.uid === uid ? { ...l, note } : l)));

  const toggleOption = (group, label) => setSheet(s => {
    if (!s) return s;
    const sel = toggleCounterOption(s.sel, group, label);
    return { ...s, sel };
  });
  const confirmSheet = () => {
    if (!sheet || !validCounterOptions(groupsById[sheet.pid] || [], sheet.sel)) return;
    if (sheet.mode === 'new') {
      const k = selKey(sheet.sel);
      setLines(prev => {
        const same = prev.find(l => l.pid === sheet.pid && !l.note && selKey(l.sel) === k);
        if (same) return prev.map(l => (l === same ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
        return [...prev, { uid: uidRef.current++, pid: sheet.pid, qty: 1, sel: sheet.sel, note: '', noteOpen: false }];
      });
    } else {
      setLines(prev => prev.map(l => (l.uid === sheet.uid ? { ...l, sel: sheet.sel } : l)));
    }
    setSheet(null);
  };

  const reduceProduct = p => {
    const matches = lines.filter(l => l.pid === p.id);
    if (matches.length === 1) changeQty(matches[0].uid, -1);
    else if (matches.length > 1) setQuantityProduct(p.id);
  };
  const startSwipe = event => {
    gestureRef.current = null;
    if (event.touches.length !== 1 || sendingRef.current || settling || sheet || quantityProduct || sentOrder || settleOpen) return;
    const element = event.target;
    if (element.closest('input, textarea, .ctr-cats, .ctr-card-stepper, .ctr-stepper, .ctr-l-tools')) return;
    const area = element.closest('.ctr-tables, .ctr-menu-scroll, .ctr-lines');
    const touch = event.touches[0];
    if (!area || touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    gestureRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };
  const finishSwipe = event => {
    const start = gestureRef.current; gestureRef.current = null;
    if (!start || !event.changedTouches.length || event.touches.length || sendingRef.current || settling) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 72 || Math.abs(dy) > Math.abs(dx) * .5 || Date.now() - start.time > 700) return;
    let handled = false;
    if (ticketOpen && dx > 0) { setTicketOpen(false); handled = true; }
    else if (!ticketOpen && view === 'order' && dx > 0) { backToTables(); handled = true; }
    else if (!ticketOpen && view === 'order' && dx < 0 && count > 0) { setTicketOpen(true); handled = true; }
    else if (view === 'tables' && dx < 0 && target) { setView('order'); handled = true; }
    if (handled) suppressClickUntil.current = Date.now() + 400;
  };

  const send = async () => {
    if (!lines.length || sendingRef.current || sending || !target) return;
    if (lines.some(line => !byId[line.pid] || !validCounterOptions(groupsById[line.pid] || [], line.sel))) {
      toast.error('Check each item’s options before sending. A menu option may have changed.');
      setTicketOpen(true);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      const supabase = await getSupabase();
      const data = await submitCheckout(supabase, {
        p_tenant_id: tenantId,
        p_items: lines.map(l => ({
          product_id: l.pid,
          quantity: l.qty,
          options: l.sel.map(x => ({ group: x.group, label: x.label })),
          notes: l.note?.trim() || null,
        })),
        p_type: target.type,
        p_table_id: target.tableId || null,
        p_notes: null,
        p_customer_id: null,
      }, `counter:${tenantId}:${target.key}`);
      toast.success(`${data.order_number} sent to kitchen · ${money(data.total_amount)}`);
      setTickets(prev => ({ ...prev, [target.key]: [] }));
      backToTables();
      setTarget(null);
      setSentOrder(data);
      loadSessions();
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('Order limit reached')) toast.error('This store has reached its monthly order limit. Ask the owner to upgrade the plan.');
      else if (['P0002', '22023'].includes(e?.code) && msg) toast.error(msg);
      else toast.error(e?.checkoutUnconfirmed ? e.message : 'Could not send the order. Check your connection and try again.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // Same steps as "Mark as Paid" on the Orders page, applied to the whole bill.
  const settle = async method => {
    if (!session || settling || !target) return;
    setSettling(true);
    try {
      const supabase = await getSupabase();
      const now = new Date().toISOString();
      const ids = Array.isArray(session.order_ids) ? session.order_ids : [];
      if (ids.length) {
        const { error } = await supabase.from('orders')
          .update({ payment_status: 'paid', status: 'completed', payment_method: method, updated_date: now })
          .in('id', ids)
          .eq('tenant_id', tenantId)
          .neq('payment_status', 'paid');
        if (error) throw error;
      }
      await supabase.from('tables').update({ status: 'available', updated_date: now })
        .eq('id', target.tableId).eq('tenant_id', tenantId);
      const { error: sErr } = await supabase.from('table_sessions')
        .update({ status: 'completed', ended_at: now, updated_date: now })
        .eq('id', session.id);
      if (sErr) throw sErr;
      toast.success(`${target.label} settled · ${money(session.total_amount)}`);
      setSettleOpen(false);
      await loadSessions();
      if (!lines.length) { backToTables(); setTarget(null); }
    } catch (e) {
      toast.error('Could not settle the bill. Please try again.');
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return (
      <div className="ctr-root">
        <style>{CSS}</style>
        <div className="ctr-loading"><Loader2 className="w-6 h-6 animate-spin" /> Loading the counter…</div>
      </div>
    );
  }

  const tabs = [
    ...(hasPopular ? [{ id: 'popular', main: nameMode === 'cjk' ? '最常点' : 'Most ordered', sub: nameMode === 'cjk' ? 'Most ordered' : '最常点' }] : []),
    ...cats.map(c => ({ id: c.id, ...nameParts(c.name) })),
    ...(uncategorized.length ? [{ id: 'other', main: 'Other', sub: '' }] : []),
  ];
  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? products.filter(p => String(p.name || '').toLowerCase().includes(q))
    : cat === 'popular' ? popular : cat === 'other' ? uncategorized : products.filter(p => p.category_id === cat);
  const qrLabel = tenant?.currency === 'MYR' ? 'QR · DuitNow / TNG' : 'QR · PayNow';

  return (
    <div className="ctr-root" aria-busy={sending}
      onTouchStart={startSwipe}
      onTouchMove={event => { if (event.touches.length !== 1) gestureRef.current = null; }}
      onTouchEnd={finishSwipe}
      onTouchCancel={() => { gestureRef.current = null; }}
      onClickCapture={event => { if (sendingRef.current || Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
      onChangeCapture={event => { if (sendingRef.current) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDownCapture={event => { if (sendingRef.current) { event.preventDefault(); event.stopPropagation(); } }}>
      <style>{CSS}</style>
      {sending && <div role="status" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30"><div className="rounded-xl bg-background text-foreground px-5 py-4 shadow-xl">Sending order…</div></div>}

      <header className="ctr-top">
        {view === 'tables'
          ? <button className="ctr-back" onClick={() => navigate(createPageUrl('Dashboard'))}>← Exit</button>
          : <button className="ctr-back" onClick={backToTables}>← Tables</button>}
        <div className="ctr-title">
          {view === 'tables' || !target
            ? <>{tenant?.logo_url ? <img className="ctr-logo" src={tenant.logo_url} alt="" /> : null}<span className="ctr-brand">{tenant?.name || 'Counter'}</span><span className="ctr-store">Counter</span></>
            : <span className="ctr-target">{target.label}{target.zone ? <span className="ctr-zone-tag"> · {target.zone}</span> : null}</span>}
        </div>
        <button className="ctr-lang" onClick={toggleNameMode} aria-label="Switch which dish-name language is shown large">
          <span className={nameMode === 'cjk' ? 'on' : ''}>中</span>/<span className={nameMode === 'latin' ? 'on' : ''}>EN</span>
        </button>
      </header>

      {view === 'tables' || !target ? (
        <div className="ctr-tables">
          <div className="ctr-tables-inner">
            <div className="ctr-head">
              <h1>Pick a table</h1>
              <p>Tap a table to take its order. Amber tables have a running bill.</p>
            </div>
            <button
              className="ctr-takeaway"
              onClick={() => openTarget({ key: 'takeaway', type: 'takeaway', tableId: null, label: 'Takeaway', zone: '' })}
            >
              <span className="ctr-tw-icon"><ShoppingBag className="w-6 h-6" /></span>
              <span className="ctr-tw-text">
                <b>Takeaway</b>
                <span>{draftCount('takeaway') ? `${draftCount('takeaway')} items not sent yet` : 'No table needed'}</span>
              </span>
              <span className="ctr-go">Start →</span>
            </button>
            {zones.map(([z, list]) => (
              <section key={z} className="ctr-zone">
                <h2>{z} <span>{list.filter(t => sessions[t.id]).length} of {list.length} with a running bill</span></h2>
                <div className="ctr-table-grid">
                  {list.map(t => {
                    const s = sessions[t.id];
                    const d = draftCount(`table:${t.id}`);
                    const lbl = tableLabel(t);
                    const num = (lbl.match(/(\d+)\s*$/) || [])[1];
                    const word = num ? lbl.replace(/\s*\d+\s*$/, '') : '';
                    return (
                      <button
                        key={t.id}
                        className={`ctr-tile ${s ? 'busy' : d ? 'draft' : ''}`}
                        onClick={() => openTarget({ key: `table:${t.id}`, type: 'dine_in', tableId: t.id, label: lbl, zone: t.zone || '' })}
                      >
                        <span className="ctr-tnum">{num ? <><small>{word || 'Table'}</small>{num}</> : lbl}</span>
                        <span className="ctr-tstate">{s ? money(s.total_amount) : d ? 'Not sent yet' : 'Free'}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!tables.length && (
              <p className="ctr-empty">No tables yet. Takeaway works without them; add tables under Tables &amp; QR.</p>
            )}
          </div>
        </div>
      ) : (
        <div className={`ctr-order ${ticketOpen ? 'ticket-open' : ''}`}>
          <section className="ctr-menu" aria-label="Menu">
            <div className="ctr-cats" role="tablist" aria-label="Menu categories">
              {tabs.map(tab => (
                <button key={tab.id} role="tab" aria-selected={!q && cat === tab.id} className="ctr-cat" onClick={() => { setCat(tab.id); setQuery(''); }}>
                  <span className="m">{tab.main}</span>{tab.sub ? <span className="s">{tab.sub}</span> : null}
                </button>
              ))}
            </div>
            <div className="ctr-menu-scroll">
              <div className="ctr-search">
                <input
                  id="counter-search"
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search dishes…"
                  aria-label="Search dishes"
                />
                {query && <button className="ctr-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
              </div>
              {q
                ? <p className="ctr-note">{visibleItems.length} dish{visibleItems.length === 1 ? '' : 'es'} match “{query.trim()}”. Tap to add.</p>
                : cat === 'popular' && <p className="ctr-note">Most ordered here in the last 90 days. One tap adds a dish.</p>}
              <div className="ctr-grid">
                {visibleItems.map(p => {
                  const n = nameParts(p.name);
                  const q = inTicket[p.id];
                  const groups = groupsById[p.id] || [];

                  return (
                    <article key={p.id} className={`ctr-item ${q ? 'in' : ''}`} aria-label={p.name}>
                      <button className="ctr-item-add" onClick={() => addProduct(p)} aria-label={`Add ${p.name}, ${money(p.price)}`}>
                      {q ? <span className="ctr-qty">×{q}</span> : null}
                      <span className="ctr-i-media">
                        {p.image_url
                          ? <img className="ctr-i-img" src={p.image_url} alt="" loading="lazy" />
                          : <span className="ctr-i-ph" aria-hidden="true">{Array.from(n.main || '?')[0]}</span>}
                      </span>
                      <span className="ctr-i-names">
                        <span className="ctr-i-main" title={p.name}>{n.main}</span>
                        {n.sub ? <span className="ctr-i-sub">{n.sub}</span> : null}
                      </span>
                      <span className="ctr-i-foot">
                        <span className="ctr-i-price">{money(p.price)}</span>
                        <span className="ctr-i-hint">
                          {groups.length ? 'Choose options' : (cat === 'popular' && sold[p.id] ? `${sold[p.id]} sold` : '')}
                        </span>
                      </span>
                      </button>
                      <div className="ctr-card-stepper" aria-label={`Quantity for ${p.name}`}>
                        <button disabled={!q} onClick={() => reduceProduct(p)} aria-label={`Remove one ${p.name}`}>−</button>
                        <span aria-live="polite">{q || 0}</span>
                        <button onClick={() => addProduct(p)} aria-label={`Add one ${p.name}`}>+</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!visibleItems.length && <p className="ctr-empty">No active dishes here.</p>}
            </div>
            <div className="ctr-review">
              {count
                ? <button className="ctr-review-bar" onClick={() => setTicketOpen(true)}><span>{count} item{count > 1 ? 's' : ''} · {money(total)}</span><span>Review &amp; send →</span></button>
                : <p className="ctr-review-hint">Tap dishes to add them to this order</p>}
            </div>
          </section>

          <aside className="ctr-ticket" aria-label="Current order">
            <div className="ctr-ticket-head">
              <div className="ctr-row">
                <div>
                  <div className="ctr-eyebrow">{target.type === 'takeaway' ? 'Takeaway' : (target.zone || 'Dine-in')}</div>
                  <h2>{target.label}</h2>
                </div>
                <button className="ctr-close-ticket" onClick={() => setTicketOpen(false)}>← Menu</button>
              </div>
              {session && (
                <div className="ctr-running">
                  <span>Already sent <b>{money(session.total_amount)}</b> · {orderCount} order{orderCount === 1 ? '' : 's'}</span>
                  <button className="ctr-settle" onClick={() => setSettleOpen(true)}>Settle bill</button>
                </div>
              )}
            </div>
            <ul className="ctr-lines">
              {lines.length ? lines.map(line => {
                const p = byId[line.pid];
                if (!p) return null;
                const n = nameParts(p.name);
                const groups = groupsById[line.pid] || [];
                return (
                  <li key={line.uid} className="ctr-line">
                    <div className="ctr-line-main">
                      <span className="ctr-l-main">{n.main}</span>
                      {n.sub ? <span className="ctr-l-sub">{n.sub}</span> : null}
                      {line.sel.length > 0 && <span className="ctr-l-opts">+ {line.sel.map(x => nameParts(x.label).main).join(', ')}</span>}
                      {line.note && !line.noteOpen && <span className="ctr-l-note">“{line.note}”</span>}
                      <div className="ctr-l-tools">
                        {groups.length > 0 && (
                          <button className="ctr-chip" onClick={() => setSheet({ mode: 'edit', uid: line.uid, pid: line.pid, sel: line.sel })}>Options</button>
                        )}
                        <button className="ctr-chip" onClick={() => toggleNote(line.uid)}>{line.noteOpen ? 'Done' : 'Note'}</button>
                      </div>
                      {line.noteOpen && (
                        <input
                          className="ctr-note-input"
                          autoFocus
                          value={line.note}
                          placeholder="e.g. less oil, no ginger"
                          aria-label={`Note for ${p.name}`}
                          onChange={e => updateNote(line.uid, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') toggleNote(line.uid); }}
                        />
                      )}
                    </div>
                    <div className="ctr-line-side">
                      <div className="ctr-stepper">
                        <button onClick={() => changeQty(line.uid, -1)} aria-label="One less">−</button>
                        <span>{line.qty}</span>
                        <button onClick={() => changeQty(line.uid, 1)} aria-label="One more">+</button>
                      </div>
                      <span className="ctr-l-total">{money(unitPrice(line) * line.qty)}</span>
                    </div>
                  </li>
                );
              }) : (
                <li className="ctr-empty">Add dishes from the menu. Use + and − to adjust quantities.</li>
              )}
            </ul>
            <div className="ctr-foot">
              <div className="ctr-total"><span>This order</span><b>{money(total)}</b></div>
              <button className="ctr-send" disabled={!lines.length || sending} onClick={send}>
                {sending ? 'Sending…' : 'Send to kitchen'}
              </button>
              {lines.length > 0 && <button className="ctr-clear" onClick={() => setLines([])}>Clear order</button>}
            </div>
          </aside>
        </div>
      )}

      {sheet && byId[sheet.pid] && (() => {
        const p = byId[sheet.pid];
        const groups = groupsById[sheet.pid] || [];
        const n = nameParts(p.name);
        const ready = validCounterOptions(groups, sheet.sel);
        const unit = (Number(p.price) || 0) + sheet.sel.reduce((s, x) => s + optionPrice(groups, x), 0);
        const line = sheet.mode === 'edit' ? lines.find(l => l.uid === sheet.uid) : null;
        return (
          <div className="ctr-sheet-back" onClick={() => setSheet(null)}>
            <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label={`Options for ${p.name}`} onClick={e => e.stopPropagation()}>
              <div className="ctr-sheet-heading">
                <div>
                <h3>{n.main} {n.sub ? <span className="ctr-sheet-alt">{n.sub}</span> : null}</h3>
                <p className="ctr-sheet-sub">
                  {sheet.mode === 'new' ? 'Choose the options, then add.' : line && line.qty > 1 ? `Applies to all ${line.qty} on this line.` : 'Tap to add or remove.'}
                </p>
                </div>
                <button className="ctr-sheet-close" aria-label="Close options" onClick={() => setSheet(null)}><X size={22} /></button>
              </div>
              {groups.map(g => (
                <div key={g.name} className="ctr-opt-group">
                  <h4>{g.name} · {g.multiple ? 'pick any' : 'pick one'}</h4>
                  <div className="ctr-opts">
                    {g.options.map(o => {
                      const on = sheet.sel.some(x => x.group === g.name && x.label === o.label);
                      const on2 = nameParts(o.label);
                      return (
                        <button key={o.label} className="ctr-opt" aria-pressed={on} onClick={() => toggleOption(g, o.label)}>
                          <span><span className="m">{on2.main}</span>{on2.sub ? <span className="s">{on2.sub}</span> : null}</span>
                          <span className="ctr-o-price">{o.price ? `+${money(o.price)}` : 'Free'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button className="ctr-sheet-done" disabled={!ready} onClick={confirmSheet}>
                {sheet.mode === 'new' ? `Add · ${money(unit)}` : `Done · ${money(unit)} each`}
              </button>
            </div>
          </div>
        );
      })()}

      {quantityProduct && byId[quantityProduct] && (
        <div className="ctr-sheet-back" onClick={() => setQuantityProduct(null)}>
          <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label={`Quantities for ${byId[quantityProduct].name}`} onClick={e => e.stopPropagation()}>
            <div className="ctr-sheet-heading"><h3>{byId[quantityProduct].name}</h3><button className="ctr-sheet-close" aria-label="Close quantities" onClick={() => setQuantityProduct(null)}><X size={22} /></button></div>
            {lines.filter(l => l.pid === quantityProduct).map(line => (
              <div className="ctr-row" key={line.uid}>
                <span>{line.sel.map(x => x.label).join(', ') || 'Standard'}{line.note ? ` · ${line.note}` : ''}</span>
                <div className="ctr-stepper">
                  <button onClick={() => changeQty(line.uid, -1)} aria-label={`Remove one ${line.sel.map(x => x.label).join(', ') || 'standard'}`}>−</button>
                  <span>{line.qty}</span>
                  <button disabled={line.qty >= 99} onClick={() => changeQty(line.uid, 1)} aria-label="Add one of these options">+</button>
                </div>
              </div>
            ))}
            <button className="ctr-sheet-done" onClick={() => setQuantityProduct(null)}>Done</button>
          </div>
        </div>
      )}
      {sentOrder && <CounterOrderResult order={sentOrder} tenant={tenant} tenantId={tenantId} canPrintChit={hasPermission('orders.print_chit')} printing={printing} setPrinting={setPrinting} onClose={() => setSentOrder(null)} />}

      {settleOpen && session && target && (
        <div className="ctr-sheet-back" onClick={() => !settling && setSettleOpen(false)}>
          <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label={`Settle ${target.label}`} onClick={e => e.stopPropagation()}>
            <div>
              <h3>Settle {target.label}</h3>
              <p className="ctr-sheet-sub">Marks {orderCount} order{orderCount === 1 ? '' : 's'} as paid and frees the table.</p>
            </div>
            <div className="ctr-settle-total">{money(session.total_amount)}</div>
            <div className="ctr-pay-grid">
              {[['cash', 'Cash'], ['qr', qrLabel], ['card', 'Card']].map(([m, l]) => (
                <button key={m} className="ctr-pay" disabled={settling} onClick={() => settle(m)}>{settling ? '…' : l}</button>
              ))}
            </div>
            <button className="ctr-cancel" disabled={settling} onClick={() => setSettleOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.ctr-root { position: fixed; inset: 0; z-index: 35; display: flex; flex-direction: column; background: #f6f4f8; color: #1d1a24;
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; -webkit-tap-highlight-color: transparent; }
.ctr-root button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.ctr-root button:disabled { cursor: not-allowed; }
.ctr-root button:focus-visible, .ctr-root input:focus-visible { outline: 3px solid rgb(var(--color-primary, 194 51 138)); outline-offset: 2px; }
.ctr-loading { margin: auto; display: flex; gap: 10px; align-items: center; color: #6f6879; font-weight: 600; }
.ctr-top { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e5e0ea; min-height: 58px; flex-shrink: 0; }
.ctr-back { padding: 9px 14px; border-radius: 10px; background: #efebf3 !important; font-weight: 700; white-space: nowrap; }
.ctr-title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; overflow: hidden; }
.ctr-brand { font-weight: 800; font-size: 17px; }
.ctr-store { color: #6f6879; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctr-target { font-weight: 800; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctr-zone-tag { color: #6f6879; font-weight: 600; }
.ctr-lang { padding: 8px 12px; border-radius: 10px; border: 1px solid #e5e0ea !important; color: #6f6879 !important; font-weight: 700; display: flex; gap: 4px; }
.ctr-lang .on { color: rgb(var(--color-primary, 194 51 138)); }
.ctr-tables { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 16px 32px; }
.ctr-tables-inner { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.ctr-head h1 { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin: 0; }
.ctr-head p { margin: 4px 0 0; color: #6f6879; }
.ctr-takeaway { display: flex; align-items: center; gap: 16px; text-align: left; background: #fff !important; border: 2px solid rgb(var(--color-primary, 194 51 138)) !important; border-radius: 16px; padding: 16px 20px; }
.ctr-tw-icon { width: 46px; height: 46px; border-radius: 12px; background: color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff); color: rgb(var(--color-primary, 194 51 138)); display: grid; place-items: center; flex-shrink: 0; }
.ctr-tw-text { display: flex; flex-direction: column; }
.ctr-tw-text b { font-size: 17px; }
.ctr-tw-text span { color: #6f6879; font-size: 13px; }
.ctr-go { margin-left: auto; font-weight: 800; color: rgb(var(--color-primary, 194 51 138)); }
.ctr-zone h2 { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; font-size: 15px; font-weight: 800; }
.ctr-zone h2 span { color: #6f6879; font-weight: 600; font-size: 13px; }
.ctr-table-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.ctr-tile { min-height: 96px; border-radius: 14px; background: #fff !important; border: 1px solid #e5e0ea !important; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 12px 14px; text-align: left; transition: transform .08s ease; }
.ctr-tile:active { transform: scale(.97); }
.ctr-tnum { font-size: 26px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
.ctr-tnum small { display: block; font-size: 12px; font-weight: 700; color: #6f6879; letter-spacing: 0; margin-bottom: 3px; }
.ctr-tstate { font-size: 12px; font-weight: 700; color: #6f6879; font-variant-numeric: tabular-nums; }
.ctr-tile.busy { background: #fff1dc !important; border-color: #f2cf9c !important; }
.ctr-tile.busy .ctr-tstate { color: #9a4a06; font-size: 14px; }
.ctr-tile.draft { background: color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff) !important; border-color: transparent !important; }
.ctr-tile.draft .ctr-tstate { color: rgb(var(--color-primary, 194 51 138)); }
.ctr-empty { color: #6f6879; font-size: 14px; padding: 24px 16px; list-style: none; }
.ctr-order { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.ctr-menu { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.ctr-cats { display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px; flex-shrink: 0; border-bottom: 1px solid #e5e0ea; scrollbar-width: none; }
.ctr-cats::-webkit-scrollbar { display: none; }
.ctr-cat { flex-shrink: 0; display: flex; align-items: baseline; gap: 6px; padding: 10px 16px; border-radius: 999px; background: #fff !important; border: 1px solid #e5e0ea !important; white-space: nowrap; min-height: 44px; }
.ctr-cat .m { font-weight: 700; font-size: 16px; }
.ctr-cat .s { font-size: 12px; color: #6f6879; font-weight: 600; }
.ctr-cat[aria-selected="true"] { background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; border-color: rgb(var(--color-primary, 194 51 138)) !important; color: #fff !important; }
.ctr-cat[aria-selected="true"] .s { color: inherit; opacity: .75; }
.ctr-menu-scroll { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.ctr-note { font-size: 12px; color: #6f6879; margin: 0 0 10px; font-weight: 600; }
.ctr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.ctr-item { position: relative; text-align: left; background: #fff !important; border: 2px solid #e5e0ea !important; border-radius: 16px; padding: 8px 8px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; transition: transform .08s ease, border-color .15s ease; }
.ctr-item-add { position: relative; text-align: left; display: flex; flex-direction: column; gap: 6px; width: 100%; flex: 1; min-width: 0; padding: 0; }
.ctr-item-add:active { transform: scale(.98); }
.ctr-card-stepper { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; text-align: center; border-top: 1px solid #e5e0ea; padding-top: 6px; font-weight: 800; }
.ctr-card-stepper button { min-width: 44px; min-height: 44px; border-radius: 10px; font-size: 24px; background: color-mix(in srgb, rgb(var(--color-primary)) 10%, white); color: rgb(var(--color-primary)); }
.ctr-card-stepper button:disabled { opacity: .35; }
.ctr-menu-scroll, .ctr-lines, .ctr-tables { touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.ctr-sheet-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ctr-sheet-close { width: 44px; min-height: 44px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; background: #f1f5f9 !important; }
.ctr-tables, .ctr-menu, .ctr-ticket { animation: ctr-enter .18s ease-out; }
@keyframes ctr-enter { from { opacity: .6; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
.ctr-item.in { border-color: rgb(var(--color-primary, 194 51 138)) !important; background: color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff) !important; }
.ctr-i-main { font-weight: 700; font-size: 16px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.ctr-i-sub { font-size: 12px; color: #6f6879; font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctr-i-foot { margin-top: auto; padding: 2px 4px 0; display: flex; align-items: baseline; justify-content: space-between; gap: 6px; min-width: 0; }
.ctr-i-price { font-weight: 800; font-variant-numeric: tabular-nums; }
.ctr-i-hint { font-size: 11px; color: #6f6879; font-weight: 600; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ctr-qty { position: absolute; top: 12px; right: 12px; z-index: 1; box-shadow: 0 1px 4px rgba(0,0,0,.25); min-width: 26px; height: 26px; padding: 0 7px; border-radius: 999px; background: rgb(var(--color-primary, 194 51 138)); color: #fff; font-weight: 800; font-size: 13px; display: grid; place-items: center; }
.ctr-review { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid #e5e0ea; background: #fff; }
.ctr-review-bar { width: 100%; min-height: 56px; border-radius: 14px; background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; color: #fff !important; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 18px; font-weight: 800; font-size: 15px; }
.ctr-review-bar span { white-space: nowrap; font-variant-numeric: tabular-nums; }
.ctr-review-hint { color: #6f6879; font-size: 13px; text-align: center; padding: 8px 0; margin: 0; }
.ctr-ticket { display: none; flex-direction: column; min-height: 0; background: #fff; border-left: 1px solid #e5e0ea; }
.ctr-ticket-head { padding: 14px 16px 12px; border-bottom: 1px solid #e5e0ea; display: flex; flex-direction: column; gap: 8px; }
.ctr-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ctr-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6f6879; font-weight: 700; }
.ctr-ticket-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
.ctr-close-ticket { display: none; padding: 9px 12px; border-radius: 10px; background: #efebf3 !important; font-weight: 700; }
.ctr-running { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff1dc; color: #9a4a06; border-radius: 10px; padding: 8px 10px; font-size: 13px; font-weight: 700; }
.ctr-settle { padding: 6px 10px; border-radius: 8px; background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; color: #fff !important; font-weight: 700; font-size: 13px; }
.ctr-lines { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; }
.ctr-line { display: flex; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #e5e0ea; }
.ctr-line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ctr-l-main { font-weight: 700; font-size: 16px; }
.ctr-l-sub { font-size: 12px; color: #6f6879; font-weight: 600; }
.ctr-l-opts { font-size: 13px; color: rgb(var(--color-primary, 194 51 138)); font-weight: 600; }
.ctr-l-note { font-size: 13px; font-style: italic; }
.ctr-l-tools { display: flex; gap: 6px; margin-top: 4px; }
.ctr-chip { padding: 6px 10px; border-radius: 8px; background: #efebf3 !important; font-size: 12px; font-weight: 700; min-height: 32px; }
.ctr-note-input { margin-top: 6px; width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #e5e0ea; background: #f6f4f8; font-size: 14px; }
.ctr-line-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.ctr-stepper { display: flex; align-items: center; background: #efebf3; border-radius: 10px; }
.ctr-stepper button { width: 40px; height: 40px; font-size: 20px; font-weight: 700; border-radius: 10px; }
.ctr-stepper span { min-width: 22px; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }
.ctr-l-total { font-weight: 800; font-variant-numeric: tabular-nums; }
.ctr-foot { padding: 12px 16px 16px; border-top: 1px solid #e5e0ea; display: flex; flex-direction: column; gap: 10px; }
.ctr-total { display: flex; justify-content: space-between; align-items: baseline; }
.ctr-total span { color: #6f6879; font-weight: 700; }
.ctr-total b { font-size: 26px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.ctr-send { min-height: 60px; border-radius: 14px; background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; color: #fff !important; font-weight: 800; font-size: 18px; }
.ctr-send:disabled { background: #efebf3 !important; color: #6f6879 !important; }
.ctr-clear { align-self: center; padding: 6px 12px; color: #6f6879 !important; font-weight: 700; font-size: 13px; }
.ctr-sheet-back { position: fixed; inset: 0; z-index: 45; background: rgba(19,17,24,.55); display: grid; place-items: end center; }
.ctr-sheet { width: min(640px, 100%); max-height: 86%; overflow-y: auto; background: #fff; border-radius: 20px 20px 0 0; padding: 18px 16px calc(18px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 14px; }
.ctr-sheet h3 { margin: 0; font-size: 20px; font-weight: 800; }
.ctr-sheet-alt { font-size: 14px; font-weight: 600; color: #6f6879; }
.ctr-sheet-sub { color: #6f6879; font-size: 13px; margin: 2px 0 0; }
.ctr-opt-group h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6f6879; font-weight: 700; }
.ctr-opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ctr-opt { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 52px; padding: 10px 12px; border-radius: 12px; border: 1px solid #e5e0ea !important; background: #f6f4f8 !important; text-align: left; }
.ctr-opt .m { display: block; font-weight: 700; }
.ctr-opt .s { display: block; font-size: 11px; color: #6f6879; font-weight: 600; }
.ctr-o-price { font-size: 13px; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ctr-opt[aria-pressed="true"] { border-color: rgb(var(--color-primary, 194 51 138)) !important; background: color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff) !important; }
.ctr-opt[aria-pressed="true"] .ctr-o-price { color: rgb(var(--color-primary, 194 51 138)); }
.ctr-sheet-done { min-height: 56px; border-radius: 14px; background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; color: #fff !important; font-weight: 800; font-size: 16px; }
.ctr-sheet-done:disabled { opacity: .4; }
.ctr-settle-total { font-size: 34px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.ctr-pay-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ctr-pay { min-height: 60px; border-radius: 14px; background: var(--color-primary-gradient, rgb(var(--color-primary, 194 51 138))) !important; color: #fff !important; font-weight: 800; font-size: 16px; }
.ctr-cancel { align-self: center; padding: 8px 14px; color: #6f6879 !important; font-weight: 700; }

.ctr-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: cover; flex-shrink: 0; align-self: center; }
.ctr-search { position: relative; margin-bottom: 12px; }
.ctr-search input { width: 100%; min-height: 46px; padding: 10px 40px 10px 14px; border-radius: 12px; border: 1px solid #e5e0ea; background: #fff; font-size: 15px; }
.ctr-search input:focus { outline: none; border-color: rgb(var(--color-primary, 194 51 138)); box-shadow: 0 0 0 3px color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff); }
.ctr-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; border-radius: 8px; font-size: 20px; color: #6f6879 !important; }
.ctr-i-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0 4px; text-align: center; align-items: center; }
.ctr-i-media { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; background: #efebf3; }
.ctr-i-ph { width: 100%; height: 100%; display: grid; place-items: center; font-size: 34px; font-weight: 800; color: rgb(var(--color-primary, 194 51 138)); background: color-mix(in srgb, rgb(var(--color-primary, 194 51 138)) 12%, #fff); }
.ctr-i-img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
@media (min-width: 880px) {
  .ctr-order { grid-template-columns: minmax(0, 1fr) 370px; }
  .ctr-ticket { display: flex; }
  .ctr-review { display: none; }
  .ctr-sheet-back { place-items: center; }
  .ctr-sheet { border-radius: 20px; }
}
@media (max-width: 879.98px) {
  .ctr-order.ticket-open .ctr-ticket { display: flex; position: fixed; inset: 0; z-index: 40; border-left: 0; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .ctr-close-ticket { display: inline-block; }
  .ctr-store { display: none; }
  .ctr-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
}
@media (prefers-reduced-motion: reduce) { .ctr-root * { transition: none !important; animation: none !important; } }
`;
