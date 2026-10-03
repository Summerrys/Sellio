import React, { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Store, Truck, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { emptySellingForm, sellingFormFrom, sellingPayload } from '@/lib/shopSelling';

// "How you sell" for a free shop: self-collection, delivery (postage & courier
// included or an extra charge), pre-orders. Used in the setup steps and in
// Settings → Selling. Saved with save_shop_selling, which checks everything again.
function Section({ icon: Icon, title, description, checked, onChange, children, testId }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid={testId}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      </div>
      {checked && <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function SellingSettingsForm({ tenantId, currencySymbol = '$', onSaved, saveLabel = 'Save' }) {
  const [form, setForm] = useState(emptySellingForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('my_shop_selling', { p_tenant_id: tenantId });
        if (error) throw error;
        if (!cancelled) setForm(sellingFormFrom(data?.saved ? data : null));
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not load your selling settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const set = (section, key, value) => setForm(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc('save_shop_selling', { p_tenant_id: tenantId, p_settings: sellingPayload(form) });
      if (error) throw error;
      setForm(sellingFormFrom(data));
      toast.success('Selling settings saved');
      onSaved?.(data);
    } catch (err) {
      toast.error(err.message || 'Could not save your selling settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (loadError) return <p className="text-sm text-red-600 py-6 text-center">{loadError}</p>;

  const c = form.collection;
  const d = form.delivery;
  const p = form.preorder;

  return (
    <div className="space-y-3" data-testid="selling-settings">
      <Section
        icon={Store}
        title="Self-collection"
        description="Buyers collect their order from you."
        checked={c.enabled}
        onChange={v => set('collection', 'enabled', v)}
        testId="selling-collection"
      >
        <Field label="Area shown on your store page (optional)" hint="For example: Tampines, near Blk 201" htmlFor="sell-area">
          <Input id="sell-area" value={c.area} maxLength={60} onChange={e => set('collection', 'area', e.target.value)} placeholder="Tampines" />
        </Field>
        <Field label="Collection address" hint="Buyers see this only after you accept their order." htmlFor="sell-address">
          <Textarea id="sell-address" value={c.address} maxLength={300} rows={2} onChange={e => set('collection', 'address', e.target.value)} placeholder="Blk 201 Tampines St 21, #01-123, Singapore 520201" />
        </Field>
        <Field label="Collection notes (optional)" htmlFor="sell-cnotes">
          <Input id="sell-cnotes" value={c.notes} maxLength={200} onChange={e => set('collection', 'notes', e.target.value)} placeholder="Weekdays after 6pm, at the lift lobby" />
        </Field>
      </Section>

      <Section
        icon={Truck}
        title="Delivery (postage & courier)"
        description="You send the order to the buyer."
        checked={d.enabled}
        onChange={v => set('delivery', 'enabled', v)}
        testId="selling-delivery"
      >
        <div className="space-y-2" role="radiogroup" aria-label="Postage and courier">
          <p className="text-xs font-medium text-slate-600">Postage & courier</p>
          {[
            { value: 'included', label: 'Included in my prices', hint: 'Buyers pay nothing extra for delivery.' },
            { value: 'extra', label: 'Extra charge', hint: 'Added to the buyer’s total at checkout.' },
          ].map(opt => (
            <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${d.fee_mode === opt.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              <input
                type="radio"
                name="delivery-fee-mode"
                value={opt.value}
                checked={d.fee_mode === opt.value}
                onChange={() => set('delivery', 'fee_mode', opt.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{opt.label}</span>
                <span className="block text-[11px] text-slate-500">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {d.fee_mode === 'extra' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Delivery charge (${currencySymbol.trim()})`} htmlFor="sell-fee">
              <Input id="sell-fee" inputMode="decimal" value={d.fee} onChange={e => set('delivery', 'fee', e.target.value)} placeholder="5.00" />
            </Field>
            <Field label={`Free from (${currencySymbol.trim()}, optional)`} hint="Free delivery for orders of this amount or more." htmlFor="sell-free">
              <Input id="sell-free" inputMode="decimal" value={d.free_above} onChange={e => set('delivery', 'free_above', e.target.value)} placeholder="50.00" />
            </Field>
          </div>
        )}
        <Field label="Areas you deliver to (optional)" htmlFor="sell-areas">
          <Input id="sell-areas" value={d.areas} maxLength={200} onChange={e => set('delivery', 'areas', e.target.value)} placeholder="All of Singapore" />
        </Field>
        <Field label="Delivery notes (optional)" hint="For example: by Grab or Lalamove; SingPost, 3–5 working days." htmlFor="sell-dnotes">
          <Input id="sell-dnotes" value={d.notes} maxLength={300} onChange={e => set('delivery', 'notes', e.target.value)} placeholder="SingPost, 3–5 working days" />
        </Field>
      </Section>

      <Section
        icon={CalendarDays}
        title="Pre-orders"
        description="Buyers choose the date they want their order."
        checked={p.enabled}
        onChange={v => set('preorder', 'enabled', v)}
        testId="selling-preorder"
      >
        <Field label="Days of notice you need" hint="0 means buyers can choose today." htmlFor="sell-days">
          <Input
            id="sell-days"
            type="number"
            min={0}
            max={30}
            step={1}
            value={p.min_days}
            onChange={e => set('preorder', 'min_days', e.target.value === '' ? '' : Math.max(0, Math.min(30, Math.floor(Number(e.target.value)) || 0)))}
            className="w-28"
          />
        </Field>
      </Section>

      {!c.enabled && !d.enabled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Turn on self-collection, delivery, or both.</p>
      )}

      <Button onClick={save} disabled={saving || (!c.enabled && !d.enabled)} className="w-full h-11" data-testid="selling-save">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</> : saveLabel}
      </Button>
    </div>
  );
}
