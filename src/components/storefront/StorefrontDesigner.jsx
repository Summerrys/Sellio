import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  X, ArrowLeft, ExternalLink, RefreshCw,
  Type, Image, Layout, Megaphone
} from 'lucide-react';

const FONTS = [
  { value: 'Inter', label: 'Inter', style: { fontFamily: 'Inter, sans-serif' } },
  { value: 'Georgia', label: 'Serif', style: { fontFamily: 'Georgia, serif' } },
  { value: 'Nunito', label: 'Rounded', style: { fontFamily: 'Nunito, sans-serif' } },
  { value: 'monospace', label: 'Mono', style: { fontFamily: 'monospace' } },
];

const TABS = [
  { id: 'banner', label: 'Banner', icon: Image },
  { id: 'announcement', label: 'Announce', icon: Megaphone },
  { id: 'menu', label: 'Menu', icon: Layout },
  { id: 'typography', label: 'Typography', icon: Type },
];

const DEFAULTS = {
  banner_headline: '',
  banner_tagline: '',
  banner_height: 'medium',
  banner_bg_color: '#6366f1',
  banner_bg_image_url: '',
  show_announcement_bar: false,
  announcement_text: '',
  product_layout: 'grid',
  products_per_row: 2,
  show_featured: true,
  featured_section_title: "Today's Picks",
  show_category_tabs: true,
  show_product_description: true,
  show_stock_badge: true,
  font_family: 'Inter',
};

function PillToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === opt.value
              ? 'bg-white shadow text-slate-900'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function EditorControls({ form, onChange, tenantId, onImageUploaded }) {
  const [activeTab, setActiveTab] = useState('banner');
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleBannerImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const supabase = await getSupabase();
    const path = `${tenantId}/storefront/banner-bg.jpg`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      onChange('banner_bg_image_url', publicUrl + '?t=' + Date.now());
      onImageUploaded?.();
    } else {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-slate-100 bg-white sticky top-0 z-10">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-indigo-600 border-b-2 border-indigo-500'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {activeTab === 'banner' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Headline</label>
              <Input
                value={form.banner_headline}
                onChange={e => onChange('banner_headline', e.target.value)}
                placeholder="e.g. Order fresh, eat happy"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Tagline</label>
              <Input
                value={form.banner_tagline}
                onChange={e => onChange('banner_tagline', e.target.value)}
                placeholder="e.g. Fast delivery · Fresh daily"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Banner height</label>
              <PillToggle
                options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
                value={form.banner_height}
                onChange={v => onChange('banner_height', v)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Background colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.banner_bg_color}
                  onChange={e => onChange('banner_bg_color', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <Input
                  value={form.banner_bg_color}
                  onChange={e => onChange('banner_bg_color', e.target.value)}
                  className="w-32 font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Background image</label>
              {form.banner_bg_image_url ? (
                <div className="relative">
                  <img src={form.banner_bg_image_url} alt="" className="w-full h-24 object-cover rounded-lg border" />
                  <button
                    onClick={() => onChange('banner_bg_image_url', '')}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-white rounded-full shadow flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-slate-600" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-20 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm"
                >
                  <Image className="w-5 h-5" />
                  {uploading ? 'Uploading...' : 'Upload image'}
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
            </div>
          </>
        )}

        {activeTab === 'announcement' && (
          <>
            <Toggle
              checked={form.show_announcement_bar}
              onChange={v => onChange('show_announcement_bar', v)}
              label="Show announcement bar"
            />
            {form.show_announcement_bar && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Announcement text</label>
                <Input
                  value={form.announcement_text}
                  onChange={e => onChange('announcement_text', e.target.value)}
                  placeholder="e.g. Free delivery on orders above $30"
                />
              </div>
            )}
          </>
        )}

        {activeTab === 'menu' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Product layout</label>
              <PillToggle
                options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'carousel', label: 'Carousel' }]}
                value={form.product_layout}
                onChange={v => onChange('product_layout', v)}
              />
            </div>
            {form.product_layout === 'grid' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Items per row</label>
                <PillToggle
                  options={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}
                  value={form.products_per_row}
                  onChange={v => onChange('products_per_row', Number(v))}
                />
              </div>
            )}
            <div className="border-t border-slate-100 pt-3 space-y-0.5">
              <Toggle checked={form.show_featured} onChange={v => onChange('show_featured', v)} label="Show featured section" />
              {form.show_featured && (
                <div className="pl-0 pb-2">
                  <Input
                    value={form.featured_section_title}
                    onChange={e => onChange('featured_section_title', e.target.value)}
                    placeholder="Section title"
                    className="text-sm"
                  />
                </div>
              )}
              <Toggle checked={form.show_category_tabs} onChange={v => onChange('show_category_tabs', v)} label="Show category tabs" />
              <Toggle checked={form.show_product_description} onChange={v => onChange('show_product_description', v)} label="Show descriptions" />
              <Toggle checked={form.show_stock_badge} onChange={v => onChange('show_stock_badge', v)} label="Show stock badge" />
            </div>
          </>
        )}

        {activeTab === 'typography' && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-3">Font family</label>
            <div className="space-y-2">
              {FONTS.map(font => (
                <button
                  key={font.value}
                  onClick={() => onChange('font_family', font.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    form.font_family === font.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span style={font.style} className="text-base font-medium text-slate-900">{font.label}</span>
                  <span className="text-xs text-slate-400 ml-2" style={font.style}>Aa Bb Cc</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StorefrontDesigner({ open, onClose, tenantId, tenantSlug }) {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const iframeRef = useRef(null);
  const storeUrl = `https://sellio.apptelier.sg/store/${tenantSlug}`;

  // Animate in/out
  useEffect(() => {
    if (open) {
      setTimeout(() => setVisible(true), 10);
      loadConfig();
    } else {
      setVisible(false);
    }
  }, [open]);

  const loadConfig = async () => {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from('storefront_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (data) {
      setForm({ ...DEFAULTS, ...data });
    } else {
      setForm({ ...DEFAULTS });
    }
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleChange = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('storefront_configs')
      .upsert({ tenant_id: tenantId, ...form }, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) {
      toast.error('Save failed');
    } else {
      toast.success('Storefront updated ✓');
      reloadIframe();
    }
  };

  const reloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = storeUrl + '?t=' + Date.now();
    }
  };

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
      className="flex"
    >
      {/* Slide-in panel */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'white',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-100 bg-white flex-shrink-0 z-10">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h2 className="font-semibold text-slate-900 text-sm">Design your store</h2>
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 transition-colors text-sm font-medium"
          >
            Open store
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Editor controls */}
          <div
            className="flex flex-col overflow-hidden border-r border-slate-100"
            style={{ width: '100%', maxWidth: 360 }}
          >
            <EditorControls
              form={form}
              onChange={handleChange}
              tenantId={tenantId}
              onImageUploaded={reloadIframe}
            />
            {/* Desktop save button */}
            <div className="p-4 border-t border-slate-100 bg-white hidden md:block">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none' }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          {/* Right: Live preview (desktop only) */}
          <div className="hidden md:flex flex-1 flex-col items-center bg-slate-100 overflow-auto p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm font-medium text-slate-500">Live Preview</span>
              <button
                onClick={reloadIframe}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 rounded-md px-2 py-1"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
            <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', width: 390, height: 844, flexShrink: 0 }}>
              <iframe
                ref={iframeRef}
                src={storeUrl}
                style={{
                  width: 390,
                  height: 844,
                  border: 'none',
                  borderRadius: 40,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                  display: 'block',
                }}
                title="Store Preview"
              />
            </div>
          </div>
        </div>

        {/* Mobile bottom bar */}
        <div className="md:hidden flex gap-3 p-4 border-t border-slate-100 bg-white flex-shrink-0">
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-3 text-sm font-medium text-slate-700"
          >
            <ExternalLink className="w-4 h-4" />
            Preview Store
          </a>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}