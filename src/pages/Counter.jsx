import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ShoppingBag } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import { fetchStorefrontCatalog } from '@/lib/storefrontCatalog';
import { createPageUrl } from '@/utils';

// Counter: staff order entry for the counter tablet (adapts to phones).
// Pick a table (or Takeaway) -> one tap per dish -> Send. Prices, order numbers
// and each table's running bill are handled server-side by place_order().

const CURRENCY_SYMBOLS = { SGD: '$', MYR: 'RM ', USD: '$', AUD: 'A$', GBP: '£', EUR: '€' };
const KNOWN_VARIANT_KEYS = ['size', 'color', 'colour', 'addon', 'flavour', 'flavor', 'type', 'option', 'variant'];

function splitName(s) {
  const str = String(s || '').replace(/^❌\s*/, 'No ');
  const m = str.match(/^(.*?)\s*([㐀-鿿豈-﫿].*)$/);
  if (m && m[1].trim()) return { cjk: m[2].trim(), latin: m[1].trim() };
  if (m) return { cjk: m[2].trim(), latin: '' };
  return { cjk: '', latin: str };
}

// Mirrors place_order()'s option parsing so the price staff see is the price charged.
function getOptionGroups(product) {
  const raw = Array.isArray(product?.variants) ? product.variants : [];
  if (!raw.length) return [];
  if (raw[0] && Array.isArray(raw[0].options)) {
    return raw
      .filter(g => Array.isArray(g.options) && g.options.length)
      .map(g => ({
        name: g.name || 'Options',
        required: String(g.type || '').toLowerCase() === 'size',
        options: g.options.map(o => ({ label: String(o.label ?? ''), price: Number(o.price_modifier) || 0 })),
      }));
  }
  const keys = Object.keys(raw[0] || {});
  const vKey = keys.find(k => KNOWN_VARIANT_KEYS.includes(k.toLowerCase())) || keys.find(k => k !== 'price' && k !== 'price_modifier');
  if (vKey) {
    const prices = raw.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    const base = parseFloat(product.price) > 0 ? parseFloat(product.price) : (prices.length ? Math.min(...prices) : 0);
    return [{
      name: vKey.charAt(0).toUpperCase() + vKey.slice(1).toLowerCase(),
      required: true,
      options: raw.map(v => ({
        label: String(v[vKey] ?? ''),
        price: Math.max(0, Math.round(((parseFloat(v.price) || 0) - base) * 100) / 100),
      })),
    }];
  }
  return [{ name: 'Options', required: false, options: raw.map(v => ({ label: String(v.name || v.label || ''), price: Number(v.price_modifier) || 0 })) }];
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
  const { tenantId, tenant } = useTenant();
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
  const [tickets, setTickets] = useState({});
  const [cat, setCat] = useState('popular');
  const [sheet, setSheet] = useState(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [nameMode, setNameMode] = useState(() => {
    try { return localStorage.getItem('counter_name_mode') || 'cjk'; } catch { return 'cjk'; }
  });
  const uidRef = useRef(1);

  const byId = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const groupsById = useMemo(() => Object.fromEntries(products.map(p => [p.id, getOptionGroups(p)])), [products]);

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('table_sessions')
      .select('id, table_id, order_ids, total_amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    const map = {};
    (data || []).forEach(s => { map[s.table_id] = s; });
    setSessions(map);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
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
        if (cancelled) return;
        setProducts(catalog.products || []);
        setCategories(catalog.categories || []);
        setTables(tablesRes.data || []);
        const counts = {};
        (itemsRes.data || []).forEach(i => { counts[i.product_id] = (counts[i.product_id] || 0) + (i.quantity || 0); });
        setSold(counts);
      } catch (e) {
        toast.error('Could not load the menu. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    loadSessions();
    const timer = setInterval(loadSessions, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [tenantId, loadSessions]);

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (sheet) setSheet(null);
      else if (settleOpen && !settling) setSettleOpen(false);
      else if (ticketOpen) setTicketOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, settleOpen, settling, ticketOpen]);

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
    setTicketOpen(false);
    setSheet(null);
    setSettleOpen(false);
  };
  const backToTables = () => { setView('tables'); setSheet(null); setSettleOpen(false); setTicketOpen(false); };

  const addProduct = p => {
    const groups = groupsById[p.id] || [];
    if (groups.some(g => g.required)) { setSheet({ mode: 'new', pid: p.id, sel: [] }); return; }
    setLines(prev => {
      const same = prev.find(l => l.pid === p.id && !l.sel.length && !l.note);
      if (same) return prev.map(l => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { uid: uidRef.current++, pid: p.id, qty: 1, sel: [], note: '', noteOpen: false }];
    });
  };
  const changeQty = (uid, d) => setLines(prev => prev
    .map(l => (l.uid === uid ? { ...l, qty: l.qty + d } : l))
    .filter(l => l.qty > 0));
  const toggleNote = uid => setLines(prev => prev.map(l => (l.uid === uid ? { ...l, noteOpen: !l.noteOpen } : l)));
  const updateNote = (uid, note) => setLines(prev => prev.map(l => (l.uid === uid ? { ...l, note } : l)));

  const toggleOption = (group, label) => setSheet(s => {
    if (!s) return s;
    const on = s.sel.some(x => x.group === group.name && x.label === label);
    const sel = group.required
      ? [...s.sel.filter(x => x.group !== group.name), { group: group.name, label }]
      : on
        ? s.sel.filter(x => !(x.group === group.name && x.label === label))
        : [...s.sel, { group: group.name, label }];
    return { ...s, sel };
  });
  const confirmSheet = () => {
    if (!sheet) return;
    if (sheet.mode === 'new') {
      const k = selKey(sheet.sel);
      setLines(prev => {
        const same = prev.find(l => l.pid === sheet.pid && !l.note && selKey(l.sel) === k);
        if (same) return prev.map(l => (l === same ? { ...l, qty: l.qty + 1 } : l));
        return [...prev, { uid: uidRef.current++, pid: sheet.pid, qty: 1, sel: sheet.sel, note: '', noteOpen: false }];
      });
    } else {
      setLines(prev => prev.map(l => (l.uid === sheet.uid ? { ...l, sel: sheet.sel } : l)));
    }
    setSheet(null);
  };

  const send = async () => {
    if (!lines.length || sending || !target) return;
    setSending(true);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('place_order', {
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
      });
      if (error) throw error;
      toast.success(`${data.order_number} sent to kitchen · ${money(data.total_amount)}`);
      setTickets(prev => ({ ...prev, [target.key]: [] }));
      backToTables();
      setTarget(null);
      loadSessions();
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('Order limit reached')) toast.error('This store has reached its monthly order limit. Ask the owner to upgrade the plan.');
      else if (['P0002', '22023'].includes(e?.code) && msg) toast.error(msg);
      else toast.error('Could not send the order. Check your connection and try again.');
    } finally {
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
  const visibleItems = cat === 'popular' ? popular : cat === 'other' ? uncategorized : products.filter(p => p.category_id === cat);
  const qrLabel = tenant?.currency === 'MYR' ? 'QR · DuitNow / TNG' : 'QR · PayNow';

  return (
    <div className="ctr-root">
      <style>{CSS}</style>

      <header className="ctr-top">
        {view === 'tables'
          ? <button className="ctr-back" onClick={() => navigate(createPageUrl('Dashboard'))}>← Exit</button>
          : <button className="ctr-back" onClick={backToTables}>← Tables</button>}
        <div className="ctr-title">
          {view === 'tables' || !target
            ? <><span className="ctr-brand">Counter</span><span className="ctr-store">{tenant?.name}</span></>
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
                <button key={tab.id} role="tab" aria-selected={cat === tab.id} className="ctr-cat" onClick={() => setCat(tab.id)}>
                  <span className="m">{tab.main}</span>{tab.sub ? <span className="s">{tab.sub}</span> : null}
                </button>
              ))}
            </div>
            <div className="ctr-menu-scroll">
              {cat === 'popular' && <p className="ctr-note">Most ordered here in the last 90 days. One tap adds a dish.</p>}
              <div className="ctr-grid">
                {visibleItems.map(p => {
                  const n = nameParts(p.name);
                  const q = inTicket[p.id];
                  const groups = groupsById[p.id] || [];
                  const req = groups.find(g => g.required);
                  return (
                    <button key={p.id} className={`ctr-item ${q ? 'in' : ''}`} onClick={() => addProduct(p)} aria-label={`Add ${p.name}, ${money(p.price)}`}>
                      {q ? <span className="ctr-qty">×{q}</span> : null}
                      <span className="ctr-i-main">{n.main}</span>
                      {n.sub ? <span className="ctr-i-sub">{n.sub}</span> : null}
                      <span className="ctr-i-foot">
                        <span className="ctr-i-price">{money(p.price)}</span>
                        <span className="ctr-i-hint">
                          {req ? `Choose ${req.name.toLowerCase()}` : groups.length ? '+ extras' : (cat === 'popular' && sold[p.id] ? `${sold[p.id]} sold` : '')}
                        </span>
                      </span>
                    </button>
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
                          <button className="ctr-chip" onClick={() => setSheet({ mode: 'edit', uid: line.uid, pid: line.pid, sel: line.sel })}>Extras</button>
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
                <li className="ctr-empty">Tap a dish to add it. Dishes go in plain; tap <b>Extras</b> on the line to add toppings.</li>
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
        const ready = groups.filter(g => g.required).every(g => sheet.sel.some(x => x.group === g.name));
        const unit = (Number(p.price) || 0) + sheet.sel.reduce((s, x) => s + optionPrice(groups, x), 0);
        const line = sheet.mode === 'edit' ? lines.find(l => l.uid === sheet.uid) : null;
        return (
          <div className="ctr-sheet-back" onClick={() => setSheet(null)}>
            <div className="ctr-sheet" role="dialog" aria-modal="true" aria-label={`Options for ${p.name}`} onClick={e => e.stopPropagation()}>
              <div>
                <h3>{n.main} {n.sub ? <span className="ctr-sheet-alt">{n.sub}</span> : null}</h3>
                <p className="ctr-sheet-sub">
                  {sheet.mode === 'new' ? 'Choose the options, then add.' : line && line.qty > 1 ? `Applies to all ${line.qty} on this line.` : 'Tap to add or remove.'}
                </p>
              </div>
              {groups.map(g => (
                <div key={g.name} className="ctr-opt-group">
                  <h4>{g.name}{g.required ? ' · pick one' : ''}</h4>
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
.ctr-root button:focus-visible, .ctr-root input:focus-visible { outline: 3px solid #c2338a; outline-offset: 2px; }
.ctr-loading { margin: auto; display: flex; gap: 10px; align-items: center; color: #6f6879; font-weight: 600; }
.ctr-top { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e5e0ea; min-height: 58px; flex-shrink: 0; }
.ctr-back { padding: 9px 14px; border-radius: 10px; background: #efebf3 !important; font-weight: 700; white-space: nowrap; }
.ctr-title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; overflow: hidden; }
.ctr-brand { font-weight: 800; font-size: 17px; }
.ctr-store { color: #6f6879; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctr-target { font-weight: 800; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctr-zone-tag { color: #6f6879; font-weight: 600; }
.ctr-lang { padding: 8px 12px; border-radius: 10px; border: 1px solid #e5e0ea !important; color: #6f6879 !important; font-weight: 700; display: flex; gap: 4px; }
.ctr-lang .on { color: #1d1a24; }
.ctr-tables { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 16px 32px; }
.ctr-tables-inner { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
.ctr-head h1 { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin: 0; }
.ctr-head p { margin: 4px 0 0; color: #6f6879; }
.ctr-takeaway { display: flex; align-items: center; gap: 16px; text-align: left; background: #fff !important; border: 2px solid #1d1a24 !important; border-radius: 16px; padding: 16px 20px; }
.ctr-tw-icon { width: 46px; height: 46px; border-radius: 12px; background: #f1eafe; color: #6d28d9; display: grid; place-items: center; flex-shrink: 0; }
.ctr-tw-text { display: flex; flex-direction: column; }
.ctr-tw-text b { font-size: 17px; }
.ctr-tw-text span { color: #6f6879; font-size: 13px; }
.ctr-go { margin-left: auto; font-weight: 800; }
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
.ctr-tile.draft { background: #f1eafe !important; border-color: transparent !important; }
.ctr-tile.draft .ctr-tstate { color: #6d28d9; }
.ctr-empty { color: #6f6879; font-size: 14px; padding: 24px 16px; list-style: none; }
.ctr-order { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.ctr-menu { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.ctr-cats { display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px; flex-shrink: 0; border-bottom: 1px solid #e5e0ea; scrollbar-width: none; }
.ctr-cats::-webkit-scrollbar { display: none; }
.ctr-cat { flex-shrink: 0; display: flex; align-items: baseline; gap: 6px; padding: 10px 16px; border-radius: 999px; background: #fff !important; border: 1px solid #e5e0ea !important; white-space: nowrap; min-height: 44px; }
.ctr-cat .m { font-weight: 700; font-size: 16px; }
.ctr-cat .s { font-size: 12px; color: #6f6879; font-weight: 600; }
.ctr-cat[aria-selected="true"] { background: #1d1a24 !important; border-color: #1d1a24 !important; color: #f6f4f8 !important; }
.ctr-cat[aria-selected="true"] .s { color: inherit; opacity: .75; }
.ctr-menu-scroll { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.ctr-note { font-size: 12px; color: #6f6879; margin: 0 0 10px; font-weight: 600; }
.ctr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.ctr-item { position: relative; text-align: left; background: #fff !important; border: 1px solid #e5e0ea !important; border-radius: 14px; padding: 12px 13px 11px; min-height: 104px; display: flex; flex-direction: column; gap: 3px; transition: transform .08s ease; }
.ctr-item:active { transform: scale(.97); }
.ctr-item.in { border-color: #c2338a !important; box-shadow: inset 0 0 0 1px #c2338a; }
.ctr-i-main { font-weight: 700; font-size: 18px; line-height: 1.2; }
.ctr-i-sub { font-size: 12px; color: #6f6879; font-weight: 600; line-height: 1.25; }
.ctr-i-foot { margin-top: auto; padding-top: 6px; display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.ctr-i-price { font-weight: 800; font-variant-numeric: tabular-nums; }
.ctr-i-hint { font-size: 11px; color: #6f6879; font-weight: 600; text-align: right; }
.ctr-qty { position: absolute; top: -7px; right: -5px; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 999px; background: #c2338a; color: #fff; font-weight: 800; font-size: 13px; display: grid; place-items: center; }
.ctr-review { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid #e5e0ea; background: #fff; }
.ctr-review-bar { width: 100%; min-height: 56px; border-radius: 14px; background: linear-gradient(100deg,#ea580c 0%,#db2777 55%,#7e22ce 100%) !important; color: #fff !important; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 18px; font-weight: 800; font-size: 15px; }
.ctr-review-bar span { white-space: nowrap; font-variant-numeric: tabular-nums; }
.ctr-review-hint { color: #6f6879; font-size: 13px; text-align: center; padding: 8px 0; margin: 0; }
.ctr-ticket { display: none; flex-direction: column; min-height: 0; background: #fff; border-left: 1px solid #e5e0ea; }
.ctr-ticket-head { padding: 14px 16px 12px; border-bottom: 1px solid #e5e0ea; display: flex; flex-direction: column; gap: 8px; }
.ctr-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ctr-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6f6879; font-weight: 700; }
.ctr-ticket-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
.ctr-close-ticket { display: none; padding: 9px 12px; border-radius: 10px; background: #efebf3 !important; font-weight: 700; }
.ctr-running { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff1dc; color: #9a4a06; border-radius: 10px; padding: 8px 10px; font-size: 13px; font-weight: 700; }
.ctr-settle { padding: 6px 10px; border-radius: 8px; background: #fff !important; color: #1d1a24 !important; font-weight: 700; font-size: 13px; }
.ctr-lines { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; }
.ctr-line { display: flex; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #e5e0ea; }
.ctr-line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ctr-l-main { font-weight: 700; font-size: 16px; }
.ctr-l-sub { font-size: 12px; color: #6f6879; font-weight: 600; }
.ctr-l-opts { font-size: 13px; color: #c2338a; font-weight: 600; }
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
.ctr-send { min-height: 60px; border-radius: 14px; background: linear-gradient(100deg,#ea580c 0%,#db2777 55%,#7e22ce 100%) !important; color: #fff !important; font-weight: 800; font-size: 18px; }
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
.ctr-opt[aria-pressed="true"] { border-color: #c2338a !important; background: #fbe7f3 !important; }
.ctr-opt[aria-pressed="true"] .ctr-o-price { color: #c2338a; }
.ctr-sheet-done { min-height: 56px; border-radius: 14px; background: #1d1a24 !important; color: #f6f4f8 !important; font-weight: 800; font-size: 16px; }
.ctr-sheet-done:disabled { opacity: .4; }
.ctr-settle-total { font-size: 34px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.ctr-pay-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ctr-pay { min-height: 60px; border-radius: 14px; background: #1d1a24 !important; color: #fff !important; font-weight: 800; font-size: 16px; }
.ctr-cancel { align-self: center; padding: 8px 14px; color: #6f6879 !important; font-weight: 700; }
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
  .ctr-grid { grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); }
}
@media (prefers-reduced-motion: reduce) { .ctr-root * { transition: none !important; } }
`;
