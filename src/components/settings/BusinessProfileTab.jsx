import React, { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Building2, MapPin, Camera, X, Save, Percent, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import ImageEditModal from '@/components/onboarding/ImageEditModal';

const INDUSTRIES = [
  { value: 'f&b', label: 'F&B / Cafe / Restaurant' },
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
];

const COUNTRIES = ['Singapore', 'Malaysia'];

const CURRENCIES = [
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'MYR', label: 'MYR — Malaysian Ringgit' },
];

const COUNTRY_CONFIG = {
  Singapore: { currency: 'SGD', phonePlaceholder: '+65 9123 4567' },
  Malaysia:  { currency: 'MYR', phonePlaceholder: '+60 12 345 6789' },
};
const CURRENCY_TO_COUNTRY = { SGD: 'Singapore', MYR: 'Malaysia' };

function normaliseIndustry(raw) {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (/f.?b|cafe|restaurant|food/i.test(lower)) return 'f&b';
  if (/retail|fashion|electronics/i.test(lower)) return 'retail';
  if (/service|beauty|wellness|health|education/i.test(lower)) return 'service';
  if (['f&b', 'retail', 'service'].includes(lower)) return lower;
  return raw;
}

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

export default function BusinessProfileTab({ tenant, tenantId }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    branch_name: '',
    industry: '',
    country: '',
    phone: '',
    currency: 'SGD',
    address: '',
    tax_rate: '',
    tax_inclusive: false,
    logo_url: '',
  });

  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showLogoEditor, setShowLogoEditor] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    const settings = tenant.settings || {};
    const storedCurrency = tenant.currency || 'SGD';
    const country = CURRENCY_TO_COUNTRY[storedCurrency] || tenant.country || 'Singapore';
    setForm({
      name: tenant.name || '',
      branch_name: settings.branch_name || '',
      industry: normaliseIndustry(tenant.industry),
      country,
      phone: tenant.phone || '',
      currency: storedCurrency,
      address: tenant.address || '',
      tax_rate: settings.tax_rate != null ? String(settings.tax_rate) : '',
      tax_inclusive: settings.tax_inclusive || false,
      logo_url: tenant.logo_url || '',
    });
    setLogoPreview(tenant.logo_url || null);
  }, [tenant]);

  const handleCountryChange = (country) => {
    const cfg = COUNTRY_CONFIG[country];
    setForm(prev => ({ ...prev, country, currency: cfg?.currency || prev.currency }));
  };

  const handleCurrencyChange = (currency) => {
    const country = CURRENCY_TO_COUNTRY[currency] || form.country;
    setForm(prev => ({ ...prev, currency, country }));
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setForm(prev => ({ ...prev, logo_url: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadLogo = async () => {
    if (!logoFile) return form.logo_url;
    setIsUploadingLogo(true);
    const supabase = await getSupabase();
    const ext = logoFile.name.split('.').pop();
    const path = `${tenantId}/logo/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, logoFile, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
    setIsUploadingLogo(false);
    return publicUrl;
  };

  const handleLogoEditSave = async (imageData) => {
    if (!imageData) { handleRemoveLogo(); return; }
    setIsUploadingLogo(true);
    try {
      const supabase = await getSupabase();
      const res = await fetch(imageData);
      const blob = await res.blob();
      const path = `${tenantId}/logo/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      setLogoPreview(publicUrl);
      setLogoFile(null);
      setForm(prev => ({ ...prev, logo_url: publicUrl }));
    } catch (err) {
      toast.error('Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const supabase = await getSupabase();
      const logoUrl = await uploadLogo();
      const existingSettings = tenant?.settings || {};
      const { error } = await supabase.from('tenants').update({
        name: form.name,
        industry: form.industry,
        country: form.country,
        phone: form.phone,
        currency: form.currency,
        address: form.address,
        logo_url: logoUrl,
        settings: {
          ...existingSettings,
          branch_name: form.branch_name,
          tax_rate: form.tax_rate !== '' ? parseFloat(form.tax_rate) : null,
          tax_inclusive: form.tax_inclusive,
        },
      }).eq('id', tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
      toast.success('Business settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="max-w-2xl space-y-6">
      {/* Business Identity */}
      <Card className="border border-slate-100 shadow-sm p-6 space-y-6">
        <Section icon={Building2} title="Business Identity">
          <div className="flex flex-col items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            {logoPreview ? (
              <>
                <div
                  className="relative rounded-xl border border-slate-200 bg-slate-50 shadow-sm flex items-center justify-center overflow-hidden cursor-pointer"
                  style={{ width: 200, height: 120, margin: '0 auto' }}
                  onClick={() => setShowLogoEditor(true)}
                >
                  {isUploadingLogo ? (
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  ) : (
                    <img src={logoPreview} alt="Logo" style={{ maxWidth: 200, maxHeight: 120, objectFit: 'contain', display: 'block' }} />
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
              <Input className="h-10" value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="e.g. Orchard Road" />
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Industry Type</Label>
            <Select value={form.industry} onValueChange={v => set('industry', v)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Section>
      </Card>

      {/* Location & Contact */}
      <Card className="border border-slate-100 shadow-sm p-6 space-y-4">
        <Section icon={MapPin} title="Location & Contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Country</Label>
              <Select value={form.country} onValueChange={handleCountryChange}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Currency</Label>
              <Select value={form.currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Phone</Label>
            <Input
              className="h-10"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder={COUNTRY_CONFIG[form.country]?.phonePlaceholder || '+X XXXX XXXX'}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Address</Label>
            <Input className="h-10" value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Street, City" />
          </div>
        </Section>
      </Card>

      {/* Tax Settings */}
      <Card className="border border-slate-100 shadow-sm p-6 space-y-4">
        <Section icon={Percent} title="Tax Settings">
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Tax Rate (%)</Label>
            <Input
              className="h-10"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.tax_rate}
              onChange={e => set('tax_rate', e.target.value)}
              placeholder="e.g. 9"
            />
          </div>
          <div className="flex items-start justify-between gap-4 py-1">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">Prices include tax</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                When enabled, product prices shown to customers already include tax.
                When disabled, tax will be added on top at checkout.
              </p>
            </div>
            <Switch checked={form.tax_inclusive} onCheckedChange={v => set('tax_inclusive', v)} />
          </div>
        </Section>
      </Card>

      {showLogoEditor && logoPreview && (
        <ImageEditModal
          src={logoPreview}
          themeColor="var(--color-primary-gradient, #6366f1)"
          onSave={handleLogoEditSave}
          onClose={() => setShowLogoEditor(false)}
        />
      )}

      <Button
        onClick={handleSave}
        disabled={isSaving || isUploadingLogo}
        className="h-11 gap-2 w-full sm:w-auto"
        style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}
      >
        {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
      </Button>
    </div>
  );
}