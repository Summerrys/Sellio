import React, { useState, useEffect, useRef } from 'react';
import { useTenant } from '@/components/tenant/TenantContext';
import { getSupabase } from '@/lib/supabaseClient';
import { shrinkImage, checkPhoto, LOGO_MAX_SIDE, LONG_CACHE } from '@/lib/imageShrink';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Building2, MapPin, Camera, X, Save, Percent, Loader2, Pencil, Hash, Receipt, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import PrinterSettings from '@/components/settings/PrinterSettings';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { explainError, showError } from '@/lib/plainError';
import ErrorNote from '@/components/ui-custom/ErrorNote';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useSettingsDraft from '@/hooks/useSettingsDraft';
import { useAppReloadGuard } from '@/lib/AppRefreshContext';
import ImageEditModal from '@/components/onboarding/ImageEditModal';
import { INDUSTRY_OPTIONS, normalizeIndustry } from '@/lib/industry';
import { cn } from '@/lib/utils';
import AddressMap from '@/components/ui-custom/AddressMap';
import { COUNTRIES, countryNamed, countryForCurrency, taxNameFor } from '@/lib/countries';

// FIX: previously had its own local INDUSTRIES + normaliseIndustry copy, separate
// from onboarding's — the two lists could (and did) drift. Both now import from
// src/lib/industry.js.
const INDUSTRIES = INDUSTRY_OPTIONS;

// Sellio's countries (lib/countries.js): each one's currency, phone example, time zones and tax
// presets. Country and currency go together, and both lock after the shop's first order
// (changing the currency then would make its old prices and reports wrong).
const CURRENCY_NAMES = { SGD: 'Singapore Dollar', MYR: 'Malaysian Ringgit', IDR: 'Indonesian Rupiah' };
const CURRENCIES = COUNTRIES.map((c) => ({ value: c.currency, label: `${c.currency} — ${CURRENCY_NAMES[c.currency]}` }));
const DEFAULT_BUSINESS_HOURS = [
    { day: 'monday',    label: 'Mon', enabled: true,  open: '09:00', close: '22:00' },
    { day: 'tuesday',   label: 'Tue', enabled: true,  open: '09:00', close: '22:00' },
    { day: 'wednesday', label: 'Wed', enabled: true,  open: '09:00', close: '22:00' },
    { day: 'thursday',  label: 'Thu', enabled: true,  open: '09:00', close: '22:00' },
    { day: 'friday',    label: 'Fri', enabled: true,  open: '09:00', close: '22:00' },
    { day: 'saturday',  label: 'Sat', enabled: false, open: '09:00', close: '22:00' },
    { day: 'sunday',    label: 'Sun', enabled: false, open: '09:00', close: '22:00' },
  ];

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// Wraps just the actual form controls in a section — not the section's own
// expand/collapse header, which should stay clickable either way so a
// view-only user can still open a section to read it. <fieldset disabled>
// turns off every input/select/switch/button inside at once (className=
// "contents" keeps it from affecting layout). The transparent overlay is a
// belt-and-suspenders catch for clicks landing on already-disabled elements,
// which don't reliably fire pointer events across browsers — the overlay
// always will, and is what actually shows the no-access message.
function GatedFields({ canEdit, onBlocked, children, className }) {
  if (canEdit) return <fieldset className={cn('contents', className)}>{children}</fieldset>;
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-0 z-20 cursor-not-allowed" onClick={onBlocked} />
      <fieldset disabled className="contents">{children}</fieldset>
    </div>
  );
}

export default function BusinessProfileTab({ tenant, tenantId, refreshVersion = 0 }) {
  const { hasPermission, canUseFeature } = useTenant();
  const canEditSettings = hasPermission('settings.edit');
  // Receipts, printers and kitchen auto-print aren't on a free personal shop's plan.
  const canPrint = !canUseFeature || canUseFeature('can_print');
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [orderSettingsOpen, setOrderSettingsOpen] = useState(false);
  const [businessHoursOpen, setBusinessHoursOpen] = useState(false);
  const [businessHours, setBusinessHours, applyRemoteHours, markHoursSaved] = useSettingsDraft(tenantId, DEFAULT_BUSINESS_HOURS);
  const [isSavingHours, setIsSavingHours] = useState(false);
  // Why the last save of the hours didn't go through; stays above Save Hours until the next try.
  const [hoursNote, setHoursNote] = useState(null);
  useAppReloadGuard(() => ({ dirty: false, busy: isSaving || isSavingHours || isUploadingLogo }));
  const [form, setForm, applyRemoteForm, markFormSaved] = useSettingsDraft(tenantId, {
    name: '',
    branch_name: '',
    industry: '',
    country: '',
    phone: '',
    currency: 'SGD',
    timezone: 'Asia/Singapore',
    address: '',
    tax_rate: '',
    tax_inclusive: false,
    order_id_prefix: 'ORD',
    order_id_start: 1,
    receipt_paper_size: 'thermal_80',
    receipt_show_logo: true,
    receipt_show_tax: true,
    receipt_show_order_number: true,
    receipt_footer: '',
  });

  // The logo saves on its own, as soon as it's chosen, edited or removed (Alvin, 10 Nov 2026: a
  // new logo "did not load or save it" — it waited for Save Changes at the foot of the page).
  // logoPreview: the shop's logo as saved (or none).
  const [logoPreview, setLogoPreview] = useState(null);
  const [shownLogo, setShownLogo] = useState(null);
  const [brokenLogo, setBrokenLogo] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  // Why the last save didn't go through; stays above Save Changes until the next try.
  const [saveNote, setSaveNote] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showLogoEditor, setShowLogoEditor] = useState(false);
  const uploadingRef = useRef(false);
  uploadingRef.current = isUploadingLogo;

  useEffect(() => {
    if (!tenant) return;
    // The logo as saved, unless one is being saved right now.
    if (!uploadingRef.current) setLogoPreview(tenant.logo_url || null);
    const settings = tenant.settings || {};
    const storedCurrency = tenant.currency || 'SGD';
    const country = countryForCurrency(storedCurrency)?.name || tenant.country || 'Singapore';
    const nextForm = {
      name: tenant.name || '',
      branch_name: settings.branch_name || '',
      industry: normalizeIndustry(tenant.industry),
      country,
      phone: tenant.phone || '',
      currency: storedCurrency,
      timezone: tenant.timezone || countryNamed(country)?.timezone || 'Asia/Singapore',
      address: tenant.address || '',
      tax_rate: settings.tax_rate != null ? String(settings.tax_rate) : '',
      tax_inclusive: settings.tax_inclusive || false,
      order_id_prefix: tenant.order_id_prefix || 'ORD',
      order_id_start: tenant.order_id_start || 1,
      receipt_paper_size: tenant.receipt_paper_size || 'thermal_80',
      receipt_show_logo: tenant.receipt_show_logo !== false,
      receipt_show_tax: tenant.receipt_show_tax !== false,
      receipt_show_order_number: tenant.receipt_show_order_number !== false,
      receipt_footer: tenant.receipt_footer || '',
    };
    applyRemoteForm(nextForm);
  }, [tenant, tenantId, applyRemoteForm, refreshVersion]);

  const { data: savedBusinessHours } = useQuery({
    queryKey: ['businessHours', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!savedBusinessHours) return;
    applyRemoteHours(DEFAULT_BUSINESS_HOURS.map(row => {
      const found = savedBusinessHours.find(day => day.day_of_week === row.day);
      return found ? { ...row, enabled: !found.is_closed, open: found.open_time || '09:00', close: found.close_time || '22:00' } : row;
    }));
  }, [savedBusinessHours, applyRemoteHours, refreshVersion]);

  // A country's currency and time zone come with it (the time zone stays when it's one of the
  // country's own).
  const withCountry = (prev, name) => {
    const cfg = countryNamed(name);
    if (!cfg) return { ...prev, country: name };
    const zoneKept = cfg.zones.some((z) => z.zone === prev.timezone);
    return { ...prev, country: name, currency: cfg.currency, timezone: zoneKept ? prev.timezone : cfg.timezone };
  };

  const handleCountryChange = (country) => {
    setForm(prev => withCountry(prev, country));
  };

  const handleCurrencyChange = (currency) => {
    const country = countryForCurrency(currency)?.name || form.country;
    setForm(prev => ({ ...withCountry(prev, country), currency }));
  };

  // Country and currency lock once the shop has an order.
  const { data: hasOrders = false } = useQuery({
    queryKey: ['shopHasOrders', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  });
  const currentCountry = countryNamed(form.country);

  // The shop's logo address, saved now; the page header shows it straight away.
  const saveLogoUrl = async (url) => {
    const supabase = await getSupabase();
    const { error } = await supabase.from('tenants').update({ logo_url: url }).eq('id', tenantId);
    if (error) throw error;
    setLogoPreview(url || null);
    queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
  };

  // A logo photo: shrunk, uploaded and saved as the shop's logo.
  const saveLogoImage = async (image) => {
    setIsUploadingLogo(true);
    try {
      const supabase = await getSupabase();
      const logo = await shrinkImage(image, { maxSide: LOGO_MAX_SIDE });
      const path = `${tenantId}/logo/${Date.now()}.${logo.ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, logo.blob, { upsert: true, contentType: logo.type, cacheControl: LONG_CACHE });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      await saveLogoUrl(publicUrl);
      toast.success('Logo saved');
    } catch (err) {
      showError(err, 'Couldn’t save the logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // A photo that didn't come through whole is refused here (see imageShrink.js).
    try {
      await checkPhoto(file);
    } catch (err) {
      if (err?.friendly) {
        showError(err, 'Couldn’t use that photo');
        return;
      }
    }
    await saveLogoImage(file);
  };

  // Removed at once, with Undo in case it was a slip.
  const handleRemoveLogo = async () => {
    const before = logoPreview;
    setIsUploadingLogo(true);
    try {
      await saveLogoUrl('');
      toast.success('Logo removed', before ? {
        action: { label: 'Undo', onClick: () => { saveLogoUrl(before).catch((err) => showError(err, 'Couldn’t put the logo back')); } },
      } : undefined);
    } catch (err) {
      showError(err, 'Couldn’t remove the logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogoEditSave = async (imageData) => {
    if (!imageData) { await handleRemoveLogo(); return; }
    try {
      const res = await fetch(imageData);
      await saveLogoImage(await res.blob());
    } catch (err) {
      showError(err, 'Couldn’t save the logo');
    }
  };

  const handleSave = async () => {
    if (!canEditSettings) return; // defense-in-depth; Save button is hidden without this permission
    setIsSaving(true);
    setSaveNote(null);
    try {
      const supabase = await getSupabase();
      const existingSettings = tenant?.settings || {};
      const { error } = await supabase.from('tenants').update({
        name: form.name,
        industry: form.industry,
        country: form.country,
        phone: form.phone,
        currency: form.currency,
        timezone: form.timezone,
        address: form.address,
        order_id_prefix: form.order_id_prefix || 'ORD',
        order_id_start: parseInt(form.order_id_start) || 1,
        receipt_paper_size: form.receipt_paper_size,
        receipt_show_logo: form.receipt_show_logo,
        receipt_show_tax: form.receipt_show_tax,
        receipt_show_order_number: form.receipt_show_order_number,
        receipt_footer: form.receipt_footer || null,
        settings: {
          ...existingSettings,
          branch_name: form.branch_name,
          tax_rate: form.tax_rate !== '' ? parseFloat(form.tax_rate) : null,
          tax_inclusive: form.tax_inclusive,
        },
      }).eq('id', tenantId);
      if (error) throw error;
      markFormSaved({ ...form });
      queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
      toast.success('Business settings saved');
    } catch (err) {
      setSaveNote(explainError(err, { title: 'Couldn’t save your business settings' }));
    } finally {
      setIsSaving(false);
    }
  };

  const saveBusinessHours = async () => {
    if (!canEditSettings) return; // defense-in-depth; button is disabled without this permission
    setIsSavingHours(true);
    setHoursNote(null);
    try {
      const supabase = await getSupabase();
      const rows = businessHours.map(row => ({
        tenant_id: tenantId,
        day_of_week: row.day,
        open_time: row.enabled ? row.open : null,
        close_time: row.enabled ? row.close : null,
        is_closed: !row.enabled,
      }));
      await supabase.from('business_hours').delete().eq('tenant_id', tenantId);
      const { error } = await supabase.from('business_hours').insert(rows);
      if (error) throw error;
      markHoursSaved(businessHours);
      queryClient.invalidateQueries({ queryKey: ['businessHours', tenantId] });
      toast.success('Business hours saved');
    } catch (err) {
      setHoursNote(explainError(err, { title: 'Couldn’t save your opening hours' }));
    } finally {
      setIsSavingHours(false);
    }
  };

  const updateHour = (day, field, value) => {
    setBusinessHours(prev => prev.map(row => row.day === day ? { ...row, [field]: value } : row));
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const showNoAccessMessage = () => toast.error("You don't have access to edit these settings.");

  return (
    <div className="max-w-2xl space-y-6">
      {/* Business Identity */}
      <Card className="border border-slate-100 shadow-sm p-6 space-y-6">
        <Section icon={Building2} title="Business Identity">
        <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage} className="space-y-6">
          <div className="flex flex-col items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            {logoPreview ? (
              <>
                <div
                  className="relative rounded-xl border border-slate-200 bg-slate-50 shadow-sm flex items-center justify-center overflow-hidden cursor-pointer"
                  style={{ width: 200, height: 120, margin: '0 auto' }}
                  // A logo that can't be shown: a tap chooses it again (the editor couldn't open it).
                  onClick={() => (brokenLogo === logoPreview ? fileInputRef.current?.click() : setShowLogoEditor(true))}
                >
                  {isUploadingLogo ? (
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  ) : (
                    <>
                      <img
                        src={logoPreview}
                        alt="Logo"
                        onLoad={() => setShownLogo(logoPreview)}
                        onError={() => setBrokenLogo(logoPreview)}
                        style={{ maxWidth: 200, maxHeight: 120, objectFit: 'contain', display: 'block', opacity: shownLogo === logoPreview ? 1 : 0 }}
                      />
                      {shownLogo !== logoPreview && (
                        brokenLogo === logoPreview
                          ? <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">Couldn’t show the logo. Tap to choose it again.</span>
                          : <Loader2 data-testid="logo-loading" className="absolute w-6 h-6 text-slate-400 animate-spin" />
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
                    onClick={e => { e.stopPropagation(); setShowLogoEditor(true); }}
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
                <button onClick={handleRemoveLogo} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5">
                  <X className="w-3 h-3" /> Remove logo
                </button>
              </>
            ) : (
              <div
                className="rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors bg-slate-50"
                style={{ width: 200, height: 120, margin: '0 auto' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-7 h-7 text-slate-400 mb-1.5" />
                <span className="text-xs font-medium text-slate-500">Upload Logo</span>
                <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG up to 10MB</span>
              </div>
            )}
          </div>

          <div className="flex flex-col min-[480px]:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs text-slate-600 mb-1 block">Business Name</Label>
              <Input className="h-10" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. My Café Pte Ltd" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-600 mb-1 block">Branch Name</Label>
              <Input className="h-10" value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="e.g. City Centre" />
            </div>
          </div>

          {/* A home seller can sell anything, so their shop has no industry. */}
          {tenant?.seller_type !== 'individual' && (
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Industry Type</Label>
            <Select value={form.industry} onValueChange={v => set('industry', v)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map(i => (
                  <SelectItem key={i.value} value={i.value} disabled={i.disabled}>
                    <div className="flex items-center gap-2">
                      <span className={i.disabled ? 'opacity-60' : ''}>{i.label}</span>
                      {i.disabled && (
                        <span
                          className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{
                            background: 'linear-gradient(135deg, rgba(251,146,60,0.12), rgba(139,92,246,0.12))',
                            color: '#8b5cf6',
                            border: '1px solid rgba(139,92,246,0.25)',
                          }}
                        >
                          ✨ Coming Soon
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
        </GatedFields>
        </Section>
      </Card>

      {/* Location & Contact */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors" onClick={() => setLocationOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
              <MapPin className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Location & Contact</h3>
          </div>
          {locationOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {locationOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-100">
          <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage} className="space-y-4">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Country</Label>
                <Select value={form.country} onValueChange={handleCountryChange} disabled={hasOrders}>
                  <SelectTrigger className="h-10" data-testid="business-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Currency</Label>
                <Select value={form.currency} onValueChange={handleCurrencyChange} disabled={hasOrders}>
                  <SelectTrigger className="h-10" data-testid="business-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasOrders && (
              <p className="text-xs text-slate-500 -mt-2" data-testid="country-locked">
                Country and currency can't change once your shop has orders: its prices and reports are in {form.currency}.
              </p>
            )}
            {(currentCountry?.zones.length || 0) > 1 && (
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Time zone</Label>
                <Select value={form.timezone} onValueChange={v => set('timezone', v)}>
                  <SelectTrigger className="h-10" data-testid="business-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currentCountry.zones.map(z => <SelectItem key={z.zone} value={z.zone}>{z.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">Your shop's day, reports and limits follow this time.</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Phone</Label>
              <Input className="h-10" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder={currentCountry?.phone.example || '+X XXXX XXXX'} />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Address</Label>
              <Input className="h-10" value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Street, City" />
            </div>
          </GatedFields>
          {/* The address on a map, the same place the store page's 📍 opens. Outside the
              gated fields: looking at it or opening Maps changes nothing. */}
          <AddressMap
            address={form.address}
            country={form.country}
            title="Map of your store address"
            hint="Shown on your store page. Check the pin; wrong spot? Add the postal code."
            testId="business-address-map"
          />
          </div>
        )}
      </Card>

      {/* Business Hours */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors" onClick={() => setBusinessHoursOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Business Hours</h3>
          </div>
          {businessHoursOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {businessHoursOpen && (
          <div className="px-6 pb-6 border-t border-slate-100">
          <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage}>
            <div className="pt-4 space-y-3">
              {businessHours.map(row => (
                <div key={row.day} className="flex items-center gap-3">
                  <Switch checked={row.enabled} onCheckedChange={v => updateHour(row.day, 'enabled', v)} />
                  <span className="text-sm font-medium text-slate-700 w-8 flex-shrink-0">{row.label}</span>
                  {row.enabled ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <input
                        type="time"
                        value={row.open}
                        onChange={e => updateHour(row.day, 'open', e.target.value)}
                        style={{ width: 0, flex: 1, height: 36, padding: '0 8px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', background: 'white', minWidth: 0 }}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>to</span>
                      <input
                        type="time"
                        value={row.close}
                        onChange={e => updateHour(row.day, 'close', e.target.value)}
                        style={{ width: 0, flex: 1, height: 36, padding: '0 8px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', background: 'white', minWidth: 0 }}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 flex-1">Closed</span>
                  )}
                </div>
              ))}
            </div>
            <ErrorNote note={hoursNote} onDismiss={() => setHoursNote(null)} className="mt-4" />
            <Button
              onClick={saveBusinessHours}
              disabled={isSavingHours || !canEditSettings}
              className="mt-4 h-9 gap-2 w-full"
              style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}
            >
              {isSavingHours ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save Hours</>}
            </Button>
          </GatedFields>
          </div>
        )}
      </Card>

      {/* Tax Settings */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors" onClick={() => setTaxOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
              <Percent className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Tax Settings</h3>
          </div>
          {taxOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {taxOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-100">
          <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage} className="space-y-4">
            <div className="pt-4">
              <Label className="text-xs text-slate-600 mb-1 block">Tax Rate (%)</Label>
              <Input className="h-10" type="number" min="0" max="100" step="0.1" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} placeholder={`e.g. ${currentCountry?.tax.rate || 0}`} />
              {(currentCountry?.taxPresets.length || 0) > 0 && (
                <div className="flex flex-wrap gap-2 mt-2" data-testid="tax-presets">
                  {currentCountry.taxPresets.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => set('tax_rate', String(p.rate))}
                      className={cn('h-8 px-3 rounded-full border text-xs font-semibold',
                        String(p.rate) === String(form.tax_rate) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              {form.country === 'Indonesia' && (
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">PBJT is the regional tax on food and drink (up to 10%, set by your region). PPN is VAT, for VAT-registered sellers.</p>
              )}
            </div>
            <div className="flex items-start justify-between gap-4 py-1">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Prices include tax</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">When enabled, product prices shown to customers already include tax. When disabled, tax will be added on top at checkout.</p>
              </div>
              <Switch checked={form.tax_inclusive} onCheckedChange={v => set('tax_inclusive', v)} />
            </div>
          </GatedFields>
          </div>
        )}
      </Card>

      {/* Receipt Settings */}
      {canPrint && (
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
          onClick={() => setReceiptOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
              <Receipt className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Receipt Settings</h3>
          </div>
          {receiptOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {receiptOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-100">
          <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage} className="space-y-4">
            {/* Paper Size */}
            <div className="pt-4">
              <Label className="text-xs text-slate-600 mb-2 block">Paper Size</Label>
              <div className="flex gap-2">
                {[
                  { value: 'thermal_58', label: 'Thermal 58mm' },
                  { value: 'thermal_80', label: 'Thermal 80mm' },
                  { value: 'a4', label: 'A4' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('receipt_paper_size', opt.value)}
                    className="flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all"
                    style={form.receipt_paper_size === opt.value
                      ? { background: 'var(--color-primary-gradient)', color: '#fff', borderColor: 'transparent' }
                      : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            {[
              { key: 'receipt_show_logo', label: 'Show Logo on receipt' },
              { key: 'receipt_show_tax', label: 'Show Tax breakdown' },
              { key: 'receipt_show_order_number', label: 'Show Order Number' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-1">
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <Switch checked={form[key]} onCheckedChange={v => set(key, v)} />
              </div>
            ))}

            {/* Footer message */}
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Footer Message</Label>
              <Textarea
                value={form.receipt_footer}
                onChange={e => set('receipt_footer', e.target.value)}
                placeholder="e.g. Thank you for dining with us!"
                className="resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Printer connection */}
            <PrinterSettings tenantId={tenantId} merchantName={form.name} receiptPaperSize={form.receipt_paper_size}
              currency={form.currency} tax={{ name: taxNameFor(form, form.tax_rate), rate: Number(form.tax_rate) || 0 }} />
          </GatedFields>
          </div>
        )}
      </Card>
      )}

      {/* Order Settings */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors" onClick={() => setOrderSettingsOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-gradient, #6366f1)' }}>
              <Hash className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Order Settings</h3>
          </div>
          {orderSettingsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {orderSettingsOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-100">
          <GatedFields canEdit={canEditSettings} onBlocked={showNoAccessMessage} className="space-y-4">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Order ID Prefix</Label>
                <Input className="h-10 uppercase" maxLength={6} value={form.order_id_prefix} onChange={e => set('order_id_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ORD" />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Starting Number</Label>
                <Input className="h-10" type="number" min={1} value={form.order_id_start} onChange={e => set('order_id_start', e.target.value)} placeholder="1" />
                <p className="text-[11px] text-slate-400 mt-1">New orders will be numbered from this value. Existing order numbers are unaffected.</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Preview</p>
              <p className="text-xl font-bold text-slate-800 font-mono">
                {(form.order_id_prefix || 'ORD')}-{String(parseInt(form.order_id_start) || 1).padStart(6, '0')}
              </p>
            </div>
          </GatedFields>
          </div>
        )}
      </Card>

      {showLogoEditor && logoPreview && (
        <ImageEditModal
          src={logoPreview}
          themeColor="var(--color-primary-gradient, #6366f1)"
          onSave={handleLogoEditSave}
          onClose={() => setShowLogoEditor(false)}
        />
      )}
      <ErrorNote note={saveNote} onDismiss={() => setSaveNote(null)} />
      {canEditSettings ? (
        <Button
          onClick={handleSave}
          disabled={isSaving || isUploadingLogo}
          className="h-11 gap-2 w-full sm:w-auto"
          style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}
        >
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </Button>
      ) : (
        <p className="text-xs text-slate-400">You have view-only access to Settings.</p>
      )}
    </div>
  );
}