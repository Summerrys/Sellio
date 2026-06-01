import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, ArrowLeft, ExternalLink, RefreshCw, ImageIcon, Upload, Eye } from 'lucide-react';

const FONTS = [
  { value: 'Inter', label: 'Inter', style: { fontFamily: 'Inter, sans-serif' } },
  { value: 'Georgia', label: 'Serif', style: { fontFamily: 'Georgia, serif' } },
  { value: 'Nunito', label: 'Rounded', style: { fontFamily: 'Nunito, sans-serif' } },
  { value: 'monospace', label: 'Mono', style: { fontFamily: 'monospace' } },
];

const TABS = [
  { id: 'banner', label: 'Banner' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'menu', label: 'Menu' },
  { id: 'typography', label: 'Typography' },
  { id: 'preview', label: 'Preview' },
];

const DEFAULTS = {
  banner_headline: '',
  banner_tagline: '',
  banner_height: 'medium',
  banner_bg_color: '#fb923c',
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

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>
      {children}
    </p>
  );
}

function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 4, background: '#f1f5f9', borderRadius: 12, width: 'fit-content' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: value === opt.value ? 600 : 400,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: value === opt.value ? 'white' : 'transparent',
            color: value === opt.value ? 'var(--color-text-primary, #0f172a)' : '#94a3b8',
            boxShadow: value === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {description && (
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? 'var(--color-primary-gradient)' : '#e2e8f0',
          position: 'relative',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s ease',
        }} />
      </button>
    </div>
  );
}

function EditorControls({ form, onChange, tenantId, onImageUploaded, storeUrl, iframeRef, reloadIframe }) {
  const [activeTab, setActiveTab] = useState('banner');
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleBannerImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!tenantId) {
      toast.error('Tenant not loaded yet');
      return;
    }
    setUploading(true);
    const supabase = await getSupabase();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${tenantId}/storefront/banner-bg.${ext}`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error('Banner upload error:', error);
      toast.error('Upload failed: ' + error.message);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
    onChange('banner_bg_image_url', publicUrl + '?t=' + Date.now());
    toast.success('Banner image uploaded');
    onImageUploaded?.();
    setUploading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Premium pill tab bar */}
      <div
        className="tab-bar"
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}
      >
        <style>{`.tab-bar::-webkit-scrollbar { display: none; }`}</style>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '6px 16px',
              borderRadius: 999,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              ...(activeTab === tab.id
                ? {
                    background: 'var(--color-primary-gradient)',
                    color: 'white',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    border: 'none',
                  }
                : {
                    background: '#f1f5f9',
                    color: '#64748b',
                    fontWeight: 400,
                    border: 'none',
                  }
              ),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="flex-1 overflow-y-auto"
        style={activeTab === 'preview'
          ? { position: 'relative', overflow: 'hidden', padding: 0 }
          : { padding: '16px 20px', paddingBottom: 24 }
        }
      >

        {/* ── BANNER TAB ── */}
        {activeTab === 'banner' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. Background Image — first for visual impact */}
            <div>
              <SectionLabel>Background Image</SectionLabel>
              {form.banner_bg_image_url ? (
                <div className="relative">
                  <img
                    src={form.banner_bg_image_url}
                    alt=""
                    style={{ width: '100%', height: 128, objectFit: 'cover', borderRadius: 12, display: 'block' }}
                  />
                  <button
                    type="button"
                    onClick={() => onChange('banner_bg_image_url', '')}
                    className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    width: '100%',
                    height: 128,
                    border: '2px dashed #cbd5e1',
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: '#94a3b8',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#64748b'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8'; }}
                >
                  <Upload className="w-5 h-5" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{uploading ? 'Uploading...' : 'Upload banner image'}</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
            </div>

            {/* 2. Background Colour */}
            <div>
              <SectionLabel>Background Colour</SectionLabel>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.banner_bg_color}
                  onChange={e => onChange('banner_bg_color', e.target.value)}
                  style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', padding: 2 }}
                />
                <Input
                  value={form.banner_bg_color}
                  onChange={e => onChange('banner_bg_color', e.target.value)}
                  className="w-32 font-mono text-sm"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Used when no image is set</p>
            </div>

            {/* 3. Headline */}
            <div>
              <SectionLabel>Headline</SectionLabel>
              <Input
                value={form.banner_headline}
                onChange={e => onChange('banner_headline', e.target.value)}
                placeholder="e.g. Order fresh, eat happy"
              />
            </div>

            {/* 4. Tagline */}
            <div>
              <SectionLabel>Tagline</SectionLabel>
              <Input
                value={form.banner_tagline}
                onChange={e => onChange('banner_tagline', e.target.value)}
                placeholder="e.g. Fast delivery · Fresh daily"
              />
            </div>

            {/* 5. Banner Height */}
            <div>
              <SectionLabel>Banner Height</SectionLabel>
              <PillToggle
                options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
                value={form.banner_height}
                onChange={v => onChange('banner_height', v)}
              />
            </div>
          </div>
        )}

        {/* ── ANNOUNCEMENT TAB ── */}
        {activeTab === 'announcement' && (
          <div>
            <Toggle
              checked={form.show_announcement_bar}
              onChange={v => onChange('show_announcement_bar', v)}
              label="Show announcement bar"
              description="Displays a top bar on your storefront"
            />
            {form.show_announcement_bar && (
              <div style={{ marginTop: 16, animation: 'fadeIn 0.15s ease' }}>
                <SectionLabel>Announcement text</SectionLabel>
                <Input
                  value={form.announcement_text}
                  onChange={e => onChange('announcement_text', e.target.value)}
                  placeholder="e.g. Free delivery on orders above $30"
                />
              </div>
            )}
          </div>
        )}

        {/* ── MENU TAB ── */}
        {activeTab === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <SectionLabel>Product layout</SectionLabel>
              <PillToggle
                options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'carousel', label: 'Carousel' }]}
                value={form.product_layout}
                onChange={v => onChange('product_layout', v)}
              />
            </div>

            {form.product_layout === 'grid' && (
              <div>
                <SectionLabel>Items per row</SectionLabel>
                <PillToggle
                  options={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}
                  value={form.products_per_row}
                  onChange={v => onChange('products_per_row', Number(v))}
                />
              </div>
            )}

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              <SectionLabel>Display options</SectionLabel>
              <Toggle
                checked={form.show_featured}
                onChange={v => onChange('show_featured', v)}
                label="Featured section"
                description="Highlight top picks for customers"
              />
              {form.show_featured && (
                <div style={{ paddingBottom: 8 }}>
                  <Input
                    value={form.featured_section_title}
                    onChange={e => onChange('featured_section_title', e.target.value)}
                    placeholder="Section title"
                    className="text-sm"
                  />
                </div>
              )}
              <Toggle
                checked={form.show_category_tabs}
                onChange={v => onChange('show_category_tabs', v)}
                label="Category tabs"
                description="Let customers filter by category"
              />
              <Toggle
                checked={form.show_product_description}
                onChange={v => onChange('show_product_description', v)}
                label="Product descriptions"
                description="Show description on product cards"
              />
              <Toggle
                checked={form.show_stock_badge}
                onChange={v => onChange('show_stock_badge', v)}
                label="Stock badge"
                description="Show in stock / out of stock indicator"
              />
            </div>
          </div>
        )}

        {/* ── PREVIEW TAB ── */}
        {activeTab === 'preview' && (
          <div style={{ position: 'absolute', inset: 0, top: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em' }}>LIVE PREVIEW</span>
              <button
                type="button"
                onClick={reloadIframe}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                <RefreshCw style={{ width: 12, height: 12 }} />
                Refresh
              </button>
            </div>
            <iframe
              ref={iframeRef}
              src={storeUrl}
              style={{ flex: 1, width: '100%', border: 'none', minHeight: 0 }}
              title="Store Preview"
            />
          </div>
        )}

        {/* ── TYPOGRAPHY TAB ── */}
        {activeTab === 'typography' && (
          <div>
            <SectionLabel>Choose a font for your storefront</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FONTS.map(font => (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => onChange('font_family', font.value)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: form.font_family === font.value
                      ? `2px solid transparent`
                      : '1px solid #f1f5f9',
                    borderLeft: form.font_family === font.value
                      ? '3px solid var(--color-primary)'
                      : '1px solid #f1f5f9',
                    background: form.font_family === font.value ? '#f8fafc' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ ...font.style, fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                    {font.label}
                  </div>
                  <div style={{ ...font.style, fontSize: 12, color: '#94a3b8' }}>
                    Fresh food, great vibes.
                  </div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} className="flex">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Slide-in panel */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'white',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── TOP BAR ── */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: 'white',
            borderBottom: '1px solid #f1f5f9',
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back
          </button>

          <h2 style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, margin: 0 }}>Design your store</h2>

          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-primary)',
              border: '1.5px solid var(--color-primary)',
              borderRadius: 999,
              padding: '4px 12px',
              textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Open Store
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        </div>

        {/* ── BODY ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Editor */}
          <div
            className="flex flex-col overflow-hidden border-r border-slate-100"
            style={{ width: '100%', maxWidth: 360 }}
          >
            <EditorControls
              form={form}
              onChange={handleChange}
              tenantId={tenantId}
              onImageUploaded={reloadIframe}
              storeUrl={storeUrl}
              iframeRef={iframeRef}
              reloadIframe={reloadIframe}
            />

            {/* Desktop Save */}
            <div className="hidden lg:block p-4 border-t border-slate-100 bg-white flex-shrink-0">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-full"
                style={{ background: 'var(--color-primary-gradient)', color: 'white', border: 'none', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          {/* Right: Live Preview (desktop only) */}
          <div
            className="hidden lg:flex flex-1 flex-col items-center overflow-auto"
            style={{ background: '#f8fafc', padding: '32px 32px 32px 32px', position: 'relative' }}
          >
            {/* Preview label + refresh */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 390 * 0.75, marginBottom: 16 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 12,
                color: '#64748b',
                fontWeight: 500,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                📱 Live Preview
              </div>
              <button
                type="button"
                onClick={reloadIframe}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  cursor: 'pointer',
                  color: '#64748b',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#0f172a'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                title="Refresh preview"
              >
                <RefreshCw style={{ width: 13, height: 13 }} />
              </button>
            </div>

            {/* Phone frame */}
            <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', width: 390, height: 844, flexShrink: 0 }}>
              <iframe
                ref={iframeRef}
                src={storeUrl}
                style={{
                  width: 390,
                  height: 844,
                  border: 'none',
                  borderRadius: 40,
                  boxShadow: '0 24px 72px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
                  display: 'block',
                }}
                title="Store Preview"
              />
            </div>
          </div>
        </div>

        {/* ── MOBILE BOTTOM BAR ── */}
        <div
          className="lg:hidden flex gap-3 flex-shrink-0"
          style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: 'white' }}
        >
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              border: '1.5px solid var(--color-primary)',
              borderRadius: 999,
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-primary)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink style={{ width: 14, height: 14 }} />
            Preview Store
          </a>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-primary-gradient)',
              color: 'white',
              border: 'none',
              borderRadius: 999,
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}