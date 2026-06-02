import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, ArrowLeft, ExternalLink, RefreshCw, ImageIcon, Upload, Eye, Pencil } from 'lucide-react';

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

const MIN_BANNER_HEIGHT = 100;
const MAX_BANNER_HEIGHT = 400;

const DEFAULTS = {
  banner_headline: '',
  banner_tagline: '',
  banner_height: 'medium',
  banner_height_px: 220,
  banner_bg_color: '#fb923c',
  banner_bg_image_url: '',
  banner_position_x: 50,
  banner_position_y: 50,
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

function DraggableBannerImage({ src, positionX, positionY, onPositionChange }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: positionX, y: positionY });

  useEffect(() => {
    currentPos.current = { x: positionX, y: positionY };
  }, [positionX, positionY]);

  const getEventPos = (e) => {
    if (e.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  };

  const handleStart = (e) => {
    isDragging.current = true;
    lastPos.current = getEventPos(e);
    e.preventDefault();
  };

  const handleMove = (e) => {
    if (!isDragging.current || !containerRef.current) return;
    const pos = getEventPos(e);
    const dx = pos.x - lastPos.current.x;
    const dy = pos.y - lastPos.current.y;
    lastPos.current = pos;
    const rect = containerRef.current.getBoundingClientRect();
    const newX = Math.max(0, Math.min(100, currentPos.current.x - (dx / rect.width * 100)));
    const newY = Math.max(0, Math.min(100, currentPos.current.y - (dy / rect.height * 100)));
    currentPos.current = { x: newX, y: newY };
    if (containerRef.current) {
      containerRef.current.style.backgroundPosition = `${newX}% ${newY}%`;
    }
    e.preventDefault();
  };

  const handleEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onPositionChange(currentPos.current.x, currentPos.current.y);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      style={{
        width: '100%',
        height: 160,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        position: 'relative',
        backgroundImage: `url('${src}')`,
        backgroundSize: 'cover',
        backgroundPosition: `${positionX}% ${positionY}%`,
        backgroundRepeat: 'no-repeat',
        touchAction: 'none',
      }}
    >
      <div style={{
        position: 'absolute', bottom: 8, right: 8,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        borderRadius: 8,
        padding: '4px 10px',
        display: 'flex', alignItems: 'center', gap: 4,
        color: 'white', fontSize: 11, fontWeight: 500,
        pointerEvents: 'none',
      }}>
        ✥ Drag to reposition
      </div>
    </div>
  );
}

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

function EditorControls({ form, onChange, tenantId, onImageUploaded, storeUrl, iframeRef, reloadIframe, onOpenPreview }) {
  const [activeTab, setActiveTab] = useState('banner');
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [bannerHeightPx, setBannerHeightPx] = useState(
    form.banner_height_px || (form.banner_height === 'small' ? 160 : form.banner_height === 'large' ? 300 : 220)
  );

  const startResize = (e) => {
    e.preventDefault();
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startHeight = bannerHeightPx;
    const onMove = (moveEvent) => {
      const y = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const delta = y - startY;
      const newHeight = Math.max(MIN_BANNER_HEIGHT, Math.min(MAX_BANNER_HEIGHT, startHeight + delta));
      setBannerHeightPx(newHeight);
      const named = newHeight < 180 ? 'small' : newHeight > 260 ? 'large' : 'medium';
      onChange('banner_height', named);
      onChange('banner_height_px', Math.round(newHeight));
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const handleRemoveBannerImage = async () => {
    if (!form.banner_bg_image_url) return;
    const supabase = await getSupabase();
    const url = form.banner_bg_image_url;
    const bucketPrefix = '/object/public/product-images/';
    const pathStart = url.indexOf(bucketPrefix);
    if (pathStart !== -1) {
      const storagePath = decodeURIComponent(url.slice(pathStart + bucketPrefix.length).split('?')[0]);
      await supabase.storage.from('product-images').remove([storagePath]);
    }
    onChange('banner_bg_image_url', '');
    await supabase.from('storefront_configs').upsert(
      { tenant_id: tenantId, banner_bg_image_url: null },
      { onConflict: 'tenant_id' }
    );
    reloadIframe();
    toast.success('Banner image removed');
  };

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
    const finalUrl = publicUrl + '?t=' + Date.now();
    onChange('banner_bg_image_url', finalUrl);
    // Immediately persist to DB (don't wait for debounce)
    await supabase.from('storefront_configs').upsert(
      { tenant_id: tenantId, banner_bg_image_url: finalUrl },
      { onConflict: 'tenant_id' }
    );
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

            {/* 1. Banner Preview with resize handle */}
            <div>
              <SectionLabel>Banner Preview</SectionLabel>
              <div style={{ position: 'relative', userSelect: 'none' }}>
                {/* Banner preview */}
                <div
                  onMouseDown={form.banner_bg_image_url ? undefined : undefined}
                  style={{
                    width: '100%',
                    height: bannerHeightPx,
                    borderRadius: '12px 12px 0 0',
                    overflow: 'hidden',
                    backgroundImage: form.banner_bg_image_url ? `url('${form.banner_bg_image_url}')` : 'none',
                    background: form.banner_bg_image_url ? undefined : (form.banner_bg_color || '#6366f1'),
                    backgroundSize: 'cover',
                    backgroundPosition: `${form.banner_position_x ?? 50}% ${form.banner_position_y ?? 50}%`,
                    cursor: form.banner_bg_image_url ? 'grab' : 'default',
                    position: 'relative',
                  }}
                >
                  {/* Drag-to-reposition for image */}
                  {form.banner_bg_image_url && (() => {
                    const containerRef = React.createRef();
                    return (
                      <div
                        ref={containerRef}
                        onMouseDown={(e) => {
                          const startX = e.clientX, startY = e.clientY;
                          const startPX = form.banner_position_x ?? 50;
                          const startPY = form.banner_position_y ?? 50;
                          const onMove = (me) => {
                            const rect = e.currentTarget.closest('div').getBoundingClientRect();
                            const newX = Math.max(0, Math.min(100, startPX - ((me.clientX - startX) / rect.width * 100)));
                            const newY = Math.max(0, Math.min(100, startPY - ((me.clientY - startY) / rect.height * 100)));
                            onChange('banner_position_x', newX);
                            onChange('banner_position_y', newY);
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                          e.preventDefault();
                        }}
                        style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
                      >
                        <div style={{
                          position: 'absolute', bottom: 8, right: 8,
                          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                          borderRadius: 8, padding: '4px 10px',
                          display: 'flex', alignItems: 'center', gap: 4,
                          color: 'white', fontSize: 11, fontWeight: 500, pointerEvents: 'none',
                        }}>✥ Drag to reposition</div>
                      </div>
                    );
                  })()}
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={startResize}
                  onTouchStart={startResize}
                  style={{
                    height: 20,
                    background: 'white',
                    borderRadius: '0 0 12px 12px',
                    border: '1px solid #e2e8f0',
                    borderTop: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'ns-resize',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ width: 32, height: 4, borderRadius: 2, background: '#cbd5e1' }} />
                </div>
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                ↕ Drag to resize banner · {Math.round(bannerHeightPx)}px
              </p>
            </div>

            {/* 1b. Background Image */}
            <div>
              <SectionLabel>Background Image</SectionLabel>
              {form.banner_bg_image_url ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Upload size={12} />
                    Replace image
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveBannerImage}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    width: '100%',
                    height: 80,
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
                options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'split', label: 'Split' }, { value: 'carousel', label: 'Carousel' }]}
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
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false);
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

  const autoSave = async (currentForm) => {
    const supabase = await getSupabase();
    await supabase
      .from('storefront_configs')
      .upsert({ tenant_id: tenantId, ...currentForm }, { onConflict: 'tenant_id' });
    reloadIframe();
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      autoSave(form);
    }, 800);
    return () => clearTimeout(timer);
  }, [
    form.product_layout,
    form.products_per_row,
    form.show_category_tabs,
    form.show_featured,
    form.show_product_description,
    form.show_stock_badge,
    form.banner_bg_color,
    form.banner_headline,
    form.banner_tagline,
    form.banner_height,
    form.show_announcement_bar,
    form.announcement_text,
    form.font_family,
    form.banner_bg_image_url,
    form.banner_position_x,
    form.banner_position_y,
    form.banner_height_px,
  ]);

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
              onOpenPreview={() => setShowPreviewDrawer(true)}
            />

            {/* Desktop Save */}
            <div className="hidden lg:flex gap-2 p-4 border-t border-slate-100 bg-white flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowPreviewDrawer(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  border: '1.5px solid var(--color-primary)',
                  borderRadius: 999, padding: '8px 16px',
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--color-primary)',
                  background: 'none', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Eye size={14} />
                Preview
              </button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full"
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
          <button
            type="button"
            onClick={() => setShowPreviewDrawer(true)}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              border: '1.5px solid var(--color-primary)',
              borderRadius: 999,
              padding: '10px 0',
              fontSize: 14, fontWeight: 500,
              color: 'var(--color-primary)',
              background: 'none', cursor: 'pointer',
            }}
          >
            <Eye size={14} />
            Preview
          </button>
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

        {/* ── PREVIEW DRAWER ── */}
        {showPreviewDrawer && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            borderRadius: '20px 20px 0 0',
            animation: 'slideUp 0.3s ease',
            overflow: 'hidden',
          }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Store Preview</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12, color: 'var(--color-primary)',
                    display: 'flex', alignItems: 'center', gap: 4,
                    textDecoration: 'none', fontWeight: 500,
                  }}
                >
                  <ExternalLink size={12} />
                  Open
                </a>
                <button
                  onClick={() => setShowPreviewDrawer(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <X size={16} color="#64748b" />
                </button>
              </div>
            </div>
            <iframe
              src={storeUrl + '?t=' + Date.now()}
              style={{ flex: 1, width: '100%', border: 'none', minHeight: 0 }}
              title="Store Preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}