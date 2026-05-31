import React, { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Building2, MapPin, Phone, Globe, Camera, X, Save, Percent, Tag, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const INDUSTRIES = [
  'F&B', 'Cafe', 'Restaurant', 'Food', 'Retail', 'Fashion', 'Electronics',
  'Beauty & Wellness', 'Healthcare', 'Education', 'Services', 'Other'
];

const COUNTRIES = ['Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Philippines', 'Other'];
const CURRENCIES = ['SGD', 'MYR', 'USD', 'EUR', 'GBP', 'THB', 'IDR', 'PHP'];

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

  useEffect(() => {
    if (!tenant) return;
    const settings = tenant.settings || {};
    setForm({
      name: tenant.name || '',
      branch_name: settings.branch_name || '',
      industry: tenant.industry || '',
      country: tenant.country || '',
      phone: tenant.phone || '',
      currency: tenant.currency || 'SGD',
      address: tenant.address || '',
      tax_rate: settings.tax_rate != null ? String(settings.tax_rate) : '',
      tax_inclusive: settings.tax_inclusive || false,
      logo_url: tenant.logo_url || '',
    });
    setLogoPreview(tenant.logo_url || null);
  }, [tenant]);

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
          {/* Logo */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
              {logoPreview ? (
                <div
                  className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-medium">Change</span>
                  </div>
                </div>
              ) : (
                <div
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-[10px] text-slate-400 text-center leading-tight">Upload<br />Logo</span>
                </div>
              )}
              {logoPreview && (
                <button
                  onClick={handleRemoveLogo}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Business Name</Label>
                <Input className="h-10" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. My Café Pte Ltd" />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Branch Name</Label>
                <Input className="h-10" value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="e.g. Orchard Road Branch" />
              </div>
            </div>
          </div>

          {/* Industry */}
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Industry Type</Label>
            <Select value={form.industry} onValueChange={v => set('industry', v)}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
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
              <Select value={form.country} onValueChange={v => set('country', v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Currency</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Phone</Label>
            <Input className="h-10" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+65 9123 4567" />
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
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-slate-700">Prices include tax</p>
              <p className="text-xs text-slate-400">Tax is already factored into listed prices</p>
            </div>
            <Switch checked={form.tax_inclusive} onCheckedChange={v => set('tax_inclusive', v)} />
          </div>
        </Section>
      </Card>

      {/* Save Button */}
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