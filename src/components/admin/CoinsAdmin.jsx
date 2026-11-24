import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { amISellioAdmin } from '@/lib/appFeedback';
import { coinsAdminOverview, coinsAdminSave } from '@/lib/referral';
import { Switch } from '@/components/ui/switch';
import ExploreTabBar, { TAB_BAR_SPACE } from '@/components/explore/ExploreTabBar';

// /admin/coins — Admin → Coins: Sellio Coins' rules and the stall items' prices, for Sellio's
// admins (Alvin, 24 Nov 2026: "Make those items easier for me to manage my own so that I can
// change the amount of coins needed on my admin side"). The database checks the admin again and
// every value's range (coins_admin_save), and logs each change (app.coins_admin_log). An item
// taken off sale stays on the stalls that have it; the starting look is always free; awnings
// aren't sold (every stall wears Sellio's). English only: it's for Sellio's own team.

// The rules, with the ranges the database allows (app.coins_setting_keys).
const RULES = [
  { key: 'drop_max_value', label: 'Street coin value', min: 1, max: 5, unit: 'coins at most',
    help: 'Each coin on Pop-up Street is worth 1 up to this. Coins already on the street keep their value until tomorrow.' },
  { key: 'daily_cap', label: 'Daily limit', min: 0, max: 1000, unit: 'coins a day',
    help: 'The most a player earns in a day from street coins and shop visits together. 0 means no limit.' },
  { key: 'referral_coins_free', label: 'Referral: a home seller', min: 0, max: 100000, unit: 'coins',
    help: 'For bringing in a home seller, paid when their free shop lists its first item.' },
  { key: 'referral_coins_merchant', label: 'Referral: a business', min: 0, max: 100000, unit: 'coins',
    help: 'For bringing in a business, paid at its first payment. A home seller who moves to a paid plan tops this up to the business amount.' },
  { key: 'referral_free_code_uses', label: 'A home seller’s code earns', min: 0, max: 1000, unit: 'times',
    help: 'How many shops a free home seller’s code earns for. 0 means no limit. A business’s code has no limit.' },
];
const SLOT_NAMES = { sign: 'Signboards', lights: 'Lights', decor: 'Decor' };

const whole = (text, min, max) => {
  const value = Number(String(text).trim());
  return String(text).trim() !== '' && Number.isInteger(value) && value >= min && value <= max ? value : null;
};

function Field({ id, value, onChange, invalid, width = 'w-24' }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
      aria-invalid={invalid ? 'true' : undefined}
      className={`${width} h-10 px-3 rounded-xl border text-right text-[15px] font-semibold tabular-nums focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 bg-red-50/40 focus:ring-red-200' : 'border-slate-200 focus:ring-amber-200'}`}
    />
  );
}

export default function CoinsAdmin() {
  const { appUser } = useAppUser() || {};
  const account = String(appUser?.email || '').trim().toLowerCase();
  const [admin, setAdmin] = useState(null); // null while checking
  const [state, setState] = useState('loading'); // loading | denied | error | ready
  const [data, setData] = useState(null); // coins_admin_overview's answer
  const [rules, setRules] = useState({}); // key → text in the field
  const [items, setItems] = useState({}); // id → { price: text, active }
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Coins · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!account) { setAdmin(false); return undefined; }
    let cancelled = false;
    setAdmin(null);
    amISellioAdmin().then((yes) => { if (!cancelled) setAdmin(yes); });
    return () => { cancelled = true; };
  }, [account]);

  const show = useCallback((answer) => {
    setData(answer);
    setRules(Object.fromEntries(RULES.map((r) => [r.key, String(answer?.settings?.[r.key] ?? '')])));
    setItems(Object.fromEntries((answer?.items || []).map((i) => [i.id, { price: String(i.price), active: !!i.active }])));
  }, []);

  useEffect(() => {
    if (admin === null) { setState('loading'); return undefined; }
    if (!admin) { setState('denied'); return undefined; }
    let cancelled = false;
    setState('loading');
    coinsAdminOverview().then((answer) => { if (!cancelled) { show(answer); setState('ready'); } }, () => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [admin, reloadKey, show]);

  // What changed, and whether every field holds a value the database takes.
  const { settings, changedItems, invalid } = useMemo(() => {
    const out = { settings: {}, changedItems: [], invalid: new Set() };
    if (!data) return out;
    for (const r of RULES) {
      const value = whole(rules[r.key] ?? '', r.min, r.max);
      if (value === null) out.invalid.add(r.key);
      else if (value !== Number(data.settings?.[r.key])) out.settings[r.key] = value;
    }
    for (const item of data.items || []) {
      if (item.starter) continue;
      const edit = items[item.id];
      if (!edit) continue;
      const price = whole(edit.price, 0, 100000);
      if (price === null) { out.invalid.add(item.id); continue; }
      const change = { id: item.id };
      if (price !== item.price) change.price = price;
      if (edit.active !== !!item.active) change.active = edit.active;
      if (Object.keys(change).length > 1) out.changedItems.push(change);
    }
    return out;
  }, [data, rules, items]);
  const changes = Object.keys(settings).length + changedItems.length;

  const save = async () => {
    if (saving || !changes || invalid.size) return;
    setSaving(true);
    try {
      show(await coinsAdminSave(settings, changedItems));
      toast.success(changes === 1 ? 'Saved 1 change.' : `Saved ${changes} changes.`);
    } catch (error) {
      toast.error(error?.message || 'Couldn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const slots = useMemo(() => {
    const out = [];
    for (const item of data?.items || []) {
      let group = out.find((g) => g.slot === item.slot);
      if (!group) { group = { slot: item.slot, items: [] }; out.push(group); }
      group.items.push(item);
    }
    return out;
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="coins-admin">
      <header className="bg-slate-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-xl mx-auto px-5 pt-4">
          <h1 className="m-0 text-[28px] leading-[34px] font-extrabold text-slate-900">Sellio Coins</h1>
          <p className="mt-0.5 mb-0 text-sm text-slate-600">Coin prices, the daily limit and referral coins</p>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-5 pt-3 space-y-3" style={{ paddingBottom: `calc(${TAB_BAR_SPACE} + 76px)` }}>
        {state === 'loading' && <div className="bg-white rounded-2xl border border-slate-200 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>}
        {state === 'denied' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="coins-admin-denied">
            <p className="m-0 text-sm font-semibold text-slate-900">This page is for Sellio’s admins.</p>
          </section>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="m-0 text-sm text-slate-600">We couldn’t load Sellio Coins just now.</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && data && (
          <>
            <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100" data-testid="coins-admin-rules">
              <h2 className="m-0 px-4 pt-3.5 pb-2 text-[15px] font-bold text-slate-900">Rules</h2>
              {RULES.map((r) => (
                <div key={r.key} className="px-4 py-3 flex items-start gap-3">
                  <label htmlFor={`rule-${r.key}`} className="flex-1 min-w-0">
                    <span className="block text-[15px] leading-5 font-semibold text-slate-900">{r.label}</span>
                    <span className="block mt-0.5 text-[13px] leading-[18px] text-slate-500">{r.help}</span>
                    {invalid.has(r.key) && <span className="block mt-1 text-[13px] font-semibold text-red-600">A whole number from {r.min} to {r.max}.</span>}
                  </label>
                  <span className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Field id={`rule-${r.key}`} value={rules[r.key] ?? ''} invalid={invalid.has(r.key)} onChange={(v) => setRules((s) => ({ ...s, [r.key]: v }))} />
                    <span className="text-[11px] text-slate-400">{r.unit}</span>
                  </span>
                </div>
              ))}
            </section>

            {slots.map((group) => (
              <section key={group.slot} className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100" data-testid={`coins-admin-${group.slot}`}>
                <h2 className="m-0 px-4 pt-3.5 pb-2 text-[15px] font-bold text-slate-900">{SLOT_NAMES[group.slot] || group.slot}</h2>
                {group.items.map((item) => {
                  const edit = items[item.id] || { price: String(item.price), active: !!item.active };
                  return (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-3" data-testid={`coins-item-${item.code}`}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] leading-5 font-semibold text-slate-900">{item.name}</span>
                        <span className="block text-[12px] leading-4 text-slate-500">
                          {item.starter ? 'Starting look: free, always on' : `${item.owners} ${item.owners === 1 ? 'stall has' : 'stalls have'} it${edit.active ? '' : ' · off sale'}`}
                        </span>
                        {invalid.has(item.id) && <span className="block mt-1 text-[12px] font-semibold text-red-600">A whole number from 0 to 100000.</span>}
                      </span>
                      {!item.starter && (
                        <>
                          <span className="flex items-center gap-1.5">
                            <Coins className="w-4 h-4 text-amber-500" aria-hidden="true" />
                            <Field id={`price-${item.id}`} width="w-20" value={edit.price} invalid={invalid.has(item.id)}
                              onChange={(v) => setItems((s) => ({ ...s, [item.id]: { ...edit, price: v } }))} />
                          </span>
                          <Switch checked={edit.active} onCheckedChange={(on) => setItems((s) => ({ ...s, [item.id]: { ...edit, active: on } }))}
                            aria-label={`${item.name} on sale`} data-testid={`coins-item-${item.code}-active`} />
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}

            <section className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 text-[13px] leading-5 text-slate-600" data-testid="coins-admin-totals">
              <p className="m-0"><b className="text-slate-900">{data.players?.wallets ?? 0}</b> players hold <b className="text-slate-900">{data.players?.coins ?? 0}</b> coins.</p>
              <p className="m-0 mt-1">
                Referrals: <b className="text-slate-900">{data.referrals?.sellers ?? 0}</b> home sellers and <b className="text-slate-900">{data.referrals?.businesses ?? 0}</b> businesses earned
                {' '}<b className="text-slate-900">{data.referrals?.coins ?? 0}</b> coins; <b className="text-slate-900">{data.referrals?.waiting ?? 0}</b> still to list or pay.
              </p>
              <p className="m-0 mt-1 text-slate-500">Awnings aren’t sold: stalls on Pop-up Street wear Sellio’s purple and white, businesses its orange and white.</p>
            </section>
          </>
        )}
      </main>

      {state === 'ready' && (
        <div className="fixed inset-x-0 z-20 px-5" style={{ bottom: `calc(${TAB_BAR_SPACE} + 8px)` }}>
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-[13px] text-slate-600" data-testid="coins-admin-changes">
              {invalid.size ? 'Fix the fields in red to save.' : changes ? `${changes} ${changes === 1 ? 'change' : 'changes'} to save` : 'No changes'}
            </span>
            <button type="button" onClick={save} disabled={saving || !changes || invalid.size > 0}
              className="h-10 px-5 rounded-full bg-slate-900 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40" data-testid="coins-admin-save">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
            </button>
          </div>
        </div>
      )}
      <ExploreTabBar active="me" />
    </div>
  );
}
