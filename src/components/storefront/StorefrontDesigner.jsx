import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, ArrowLeft, ExternalLink, Upload, ChevronDown, ChevronUp, Pencil, ImagePlus } from 'lucide-react';
import StorefrontView from '@/components/storefront/StorefrontView';
import ImageEditModal from '@/components/onboarding/ImageEditModal';

const FONTS = [
  { value: 'Inter', label: 'Inter', style: { fontFamily: 'Inter, sans-serif' } },
  { value: 'Georgia', label: 'Serif', style: { fontFamily: 'Georgia, serif' } },
  { value: 'Nunito', label: 'Rounded', style: { fontFamily: 'Nunito, sans-serif' } },
  { value: 'monospace', label: 'Mono', style: { fontFamily: 'monospace' } },
];

// 2 tabs only
const TABS = [
  { id: 'banner', label: 'Banner' },
  { id: 'menu', label: 'Menu' },
];

const MIN_BANNER_HEIGHT = 120;
const MAX_BANNER_HEIGHT = 360;
const DRAWER_HANDLE_ONLY = 28;
const DRAWER_TABS_VISIBLE = 80;
const MIN_DRAWER = DRAWER_HANDLE_ONLY;

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
            padding: '6px 16px', borderRadius: 8, fontSize: 13,
            fontWeight: value === opt.value ? 600 : 400,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s ease',
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
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, width: 44, height: 24, borderRadius: 12,
          background: checked ? 'var(--color-primary-gradient)' : '#e2e8f0',
          position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.2s ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20,
          borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s ease',
        }} />
      </button>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid #f1f5f9' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>{title}</span>
        {open ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

// Banner tab content — colour + text only (image upload lives on the banner canvas)
function BannerTabContent({ form, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionLabel>Background Colour</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={form.banner_bg_color || '#6366f1'} onChange={e => onChange('banner_bg_color', e.target.value)}
            style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
          <Input value={form.banner_bg_color || ''} onChange={e => onChange('banner_bg_color', e.target.value)} className="w-32 font-mono text-sm" />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">Fallback when no image is set</p>
      </div>
      <div>
        <SectionLabel>Headline</SectionLabel>
        <Input value={form.banner_headline || ''} onChange={e => onChange('banner_headline', e.target.value)} placeholder="e.g. Order fresh, eat happy" />
      </div>
      <div>
        <SectionLabel>Tagline</SectionLabel>
        <Input value={form.banner_tagline || ''} onChange={e => onChange('banner_tagline', e.target.value)} placeholder="e.g. Fast delivery · Fresh daily" />
      </div>
    </div>
  );
}

// Interactive banner overlay — sits on top of the StorefrontView preview at exact banner position
// HEADER_H = 56px (StorefrontHeader), BANNER_H = 220px (StorefrontBanner, matches clamp min)
const PREVIEW_HEADER_H = 56;
const PREVIEW_BANNER_H = 220;

function BannerCanvasOverlay({ form, onChange, tenantId, scaleFactor = 1 }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Drag-to-reposition state
  const overlayRef = useRef(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const livePos = useRef({ x: form.banner_position_x ?? 50, y: form.banner_position_y ?? 50 });

  useEffect(() => {
    livePos.current = { x: form.banner_position_x ?? 50, y: form.banner_position_y ?? 50 };
  }, [form.banner_position_x, form.banner_position_y]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!tenantId) { toast.error('Tenant not loaded yet'); return; }
    setUploading(true);
    const supabase = await getSupabase();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${tenantId}/storefront/banner-bg.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error('Upload failed: ' + error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
    onChange('banner_bg_image_url', publicUrl.split('?')[0] + '?t=' + Date.now());
    setUploading(false);
    toast.success('Banner image uploaded');
    if (e.target) e.target.value = '';
  };

  const handleRemove = async () => {
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
    toast.success('Banner image removed');
  };

  const handleEditSave = async (dataUrl) => {
    if (!dataUrl || !tenantId) return;
    setUploading(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const supabase = await getSupabase();
      const path = `${tenantId}/storefront/banner-bg.jpg`;
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      onChange('banner_bg_image_url', publicUrl.split('?')[0] + '?t=' + Date.now());
      toast.success('Banner updated');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
    setUploading(false);
  };

  // Drag-to-reposition (mouse + touch)
  const handleDragStart = (e) => {
    if (!form.banner_bg_image_url) return;
    if (e.target.closest('[data-no-drag]')) return;
    isDragging.current = true;
    lastPos.current = { x: e.clientX ?? e.touches?.[0]?.clientX, y: e.clientY ?? e.touches?.[0]?.clientY };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      const cx = me.clientX ?? me.touches?.[0]?.clientX;
      const cy = me.clientY ?? me.touches?.[0]?.clientY;
      const dx = cx - lastPos.current.x;
      const dy = cy - lastPos.current.y;
      lastPos.current = { x: cx, y: cy };
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Invert drag: dragging right moves focal point left
      livePos.current.x = Math.max(0, Math.min(100, livePos.current.x - (dx / rect.width * 100)));
      livePos.current.y = Math.max(0, Math.min(100, livePos.current.y - (dy / rect.height * 100)));
      onChange('banner_position_x', livePos.current.x);
      onChange('banner_position_y', livePos.current.y);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const hasImage = !!form.banner_bg_image_url;
  const topOffset = PREVIEW_HEADER_H * scaleFactor;
  const bannerH = PREVIEW_BANNER_H * scaleFactor;

  return (
    <>
      {/* Positioned overlay exactly over the banner area */}
      <div
        ref={overlayRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseDown={hasImage ? handleDragStart : undefined}
        onTouchStart={hasImage ? handleDragStart : undefined}
        style={{
          position: 'absolute',
          top: topOffset,
          left: 0, right: 0,
          height: bannerH,
          zIndex: 10,
          cursor: hasImage ? 'grab' : 'pointer',
          touchAction: 'none',
        }}
        onClick={!hasImage ? () => fileInputRef.current?.click() : undefined}
      >
        {/* No image: centered upload prompt */}
        {!hasImage && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.18)',
            border: hovering ? '2px dashed rgba(255,255,255,0.9)' : '2px dashed rgba(255,255,255,0.5)',
            borderRadius: 14, padding: '14px 24px', cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s',
            ...(hovering ? { background: 'rgba(255,255,255,0.28)' } : {}),
          }}>
            <ImagePlus size={22} color="white" />
            <span style={{ color: 'white', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {uploading ? 'Uploading...' : 'Banner image'}
            </span>
          </div>
        )}

        {/* Has image: overlay controls */}
        {hasImage && (
          <>
            {/* Remove × */}
            <button
              data-no-drag="true"
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}
            >
              <X size={12} color="white" />
            </button>
            {/* Edit pencil */}
            <button
              data-no-drag="true"
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditModalOpen(true); }}
              style={{ position: 'absolute', top: 8, left: 42, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}
            >
              <Pencil size={12} color="white" />
            </button>
            {/* Replace — shown on hover */}
            {hovering && (
              <button
                data-no-drag="true"
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', border: 'none', borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'white', fontSize: 12, fontWeight: 600, zIndex: 20 }}
              >
                <Upload size={13} /> {uploading ? 'Uploading...' : 'Replace'}
              </button>
            )}
            {/* Drag hint */}
            <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '3px 8px', color: 'white', fontSize: 10, fontWeight: 500, pointerEvents: 'none' }}>
              ✥ Drag to reposition
            </div>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {editModalOpen && form.banner_bg_image_url && (
        <ImageEditModal
          src={form.banner_bg_image_url.split('?')[0]}
          themeColor={form.banner_bg_color || '#6366f1'}
          onSave={handleEditSave}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </>
  );
}

// Menu tab content with collapsible Announcement + Typography
function MenuTabContent({ form, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Product layout */}
      <div style={{ paddingBottom: 20 }}>
        <SectionLabel>Product layout</SectionLabel>
        <PillToggle
          options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }, { value: 'split', label: 'Split' }, { value: 'carousel', label: 'Carousel' }]}
          value={form.product_layout}
          onChange={v => onChange('product_layout', v)}
        />
        {form.product_layout === 'grid' && (
          <div style={{ marginTop: 16 }}>
            <SectionLabel>Items per row</SectionLabel>
            <PillToggle
              options={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}
              value={form.products_per_row}
              onChange={v => onChange('products_per_row', Number(v))}
            />
          </div>
        )}
      </div>

      {/* Display options */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, paddingBottom: 8 }}>
        <SectionLabel>Display options</SectionLabel>
        <Toggle checked={form.show_featured} onChange={v => onChange('show_featured', v)} label="Featured section" description="Highlight top picks for customers" />
        {form.show_featured && (
          <div style={{ paddingBottom: 8 }}>
            <Input value={form.featured_section_title} onChange={e => onChange('featured_section_title', e.target.value)} placeholder="Section title" className="text-sm" />
          </div>
        )}
        <Toggle checked={form.show_category_tabs} onChange={v => onChange('show_category_tabs', v)} label="Category tabs" description="Let customers filter by category" />
        <Toggle checked={form.show_product_description} onChange={v => onChange('show_product_description', v)} label="Product descriptions" description="Show description on product cards" />
        <Toggle checked={form.show_stock_badge} onChange={v => onChange('show_stock_badge', v)} label="Stock badge" description="Show in stock / out of stock indicator" />
      </div>

      {/* Announcement — collapsible */}
      <CollapsibleSection title="Announcement">
        <Toggle
          checked={form.show_announcement_bar}
          onChange={v => onChange('show_announcement_bar', v)}
          label="Show announcement bar"
          description="Displays a top bar on your storefront"
        />
        {form.show_announcement_bar && (
          <div style={{ marginTop: 12 }}>
            <SectionLabel>Announcement text</SectionLabel>
            <Input value={form.announcement_text} onChange={e => onChange('announcement_text', e.target.value)} placeholder="e.g. Free delivery on orders above $30" />
          </div>
        )}
      </CollapsibleSection>

      {/* Typography — collapsible */}
      <CollapsibleSection title="Typography">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          {FONTS.map(font => (
            <button
              key={font.value}
              type="button"
              onClick={() => onChange('font_family', font.value)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                border: form.font_family === font.value ? '2px solid transparent' : '1px solid #f1f5f9',
                borderLeft: form.font_family === font.value ? '3px solid var(--color-primary)' : '1px solid #f1f5f9',
                background: form.font_family === font.value ? '#f8fafc' : 'white',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{ ...font.style, fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{font.label}</div>
              <div style={{ ...font.style, fontSize: 12, color: '#94a3b8' }}>Fresh food, great vibes.</div>
            </button>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// Desktop editor panel (left side, ≥1024px)
function DesktopEditorControls({ form, onChange, tenantId }) {
  const [activeTab, setActiveTab] = useState('banner');

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="tab-bar" style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
        <style>{`.tab-bar::-webkit-scrollbar { display: none; }`}</style>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              whiteSpace: 'nowrap', flexShrink: 0, padding: '6px 16px', borderRadius: 999, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
              ...(activeTab === tab.id
                ? { background: 'var(--color-primary-gradient)', color: 'white', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', border: 'none' }
                : { background: '#f1f5f9', color: '#64748b', fontWeight: 400, border: 'none' }),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 20px', paddingBottom: 24 }}>
        {activeTab === 'banner' && <BannerTabContent form={form} onChange={onChange} />}
        {activeTab === 'menu' && <MenuTabContent form={form} onChange={onChange} />}
      </div>
    </div>
  );
}

// Mobile full-canvas layout with floating drawer
function MobileCanvasLayout({ form, onChange, tenantId, previewData, handleSave, saving }) {
  const [drawerTab, setDrawerTab] = useState('banner');
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_HANDLE_ONLY);
  const isDraggingDrawer = useRef(false);
  const drawerHeightRef = useRef(DRAWER_HANDLE_ONLY);

  const MAX_DRAWER = Math.round(window.innerHeight * 0.55);

  const startDrawerDrag = (e) => {
    e.preventDefault();
    isDraggingDrawer.current = true;
    const startY = e.touches?.[0]?.clientY ?? e.clientY;
    const startH = drawerHeightRef.current;
    let currentH = startH;

    const onMove = (me) => {
      const y = me.touches?.[0]?.clientY ?? me.clientY;
      const delta = startY - y;
      currentH = Math.max(MIN_DRAWER, Math.min(MAX_DRAWER, startH + delta));
      drawerHeightRef.current = currentH;
      setDrawerHeight(currentH);
    };
    const onEnd = () => {
      isDraggingDrawer.current = false;
      let snapped;
      if (currentH < DRAWER_HANDLE_ONLY + 30) snapped = DRAWER_HANDLE_ONLY;
      else if (currentH < DRAWER_TABS_VISIBLE + 60) snapped = DRAWER_TABS_VISIBLE;
      else snapped = MAX_DRAWER;
      drawerHeightRef.current = snapped;
      setDrawerHeight(snapped);
      setDrawerExpanded(snapped >= MAX_DRAWER);
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

  const canvasHeight = `calc(100vh - 52px - ${drawerHeight}px)`;

  return (
    <>
      {/* Canvas area — uses exact same StorefrontView as live store */}
      <div style={{ height: canvasHeight, overflow: 'auto', background: '#f0f2f7', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <StorefrontView
            previewMode={true}
            tenant={previewData?.tenant}
            storefrontConfig={form}
            theme={null}
            products={previewData?.products || []}
            categories={previewData?.categories || []}
            cart={[]}
            cartCount={0}
            cartTotal={0}
            setShowCart={() => {}}
            setShowOrderHistory={() => {}}
            onAddToCart={() => {}}
          />
          <BannerCanvasOverlay form={form} onChange={onChange} tenantId={tenantId} scaleFactor={1} />
        </div>
      </div>

      {/* Floating bottom drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: drawerHeight,
        background: 'white',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        transition: isDraggingDrawer.current ? 'none' : 'height 0.3s ease',
        zIndex: 100,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div
          onMouseDown={startDrawerDrag}
          onTouchStart={startDrawerDrag}
          style={{ padding: '10px 0 4px', cursor: 'ns-resize', flexShrink: 0, touchAction: 'none' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0', margin: '0 auto' }} />
        </div>

        {/* Tab bar */}
        {drawerHeight >= DRAWER_TABS_VISIBLE - 10 && (
          <div style={{ display: 'flex', gap: 6, padding: '4px 16px 0', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDrawerTab(tab.id);
                  const newH = MAX_DRAWER;
                  drawerHeightRef.current = newH;
                  setDrawerHeight(newH);
                  setDrawerExpanded(true);
                }}
                style={{
                  flexShrink: 0, whiteSpace: 'nowrap',
                  padding: '6px 14px', borderRadius: 999,
                  fontSize: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: drawerTab === tab.id ? 'var(--color-primary-gradient)' : '#f1f5f9',
                  color: drawerTab === tab.id ? 'white' : '#64748b',
                  fontWeight: drawerTab === tab.id ? 600 : 400,
                  boxShadow: drawerTab === tab.id ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        {drawerExpanded && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 16px' }}>
            {drawerTab === 'banner' && <BannerTabContent form={form} onChange={onChange} />}
            {drawerTab === 'menu' && <MenuTabContent form={form} onChange={onChange} />}
          </div>
        )}

        {/* Save button */}
        {drawerExpanded && (
          <div style={{ padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #f1f5f9', flexShrink: 0, background: 'white' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '13px', borderRadius: 999, border: 'none',
                background: 'var(--color-primary-gradient)', color: 'white',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

    </>
  );
}

export default function StorefrontDesigner({ open, onClose, tenantId, tenantSlug }) {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [previewProducts, setPreviewProducts] = useState([]);
  const [previewCategories, setPreviewCategories] = useState([]);
  const [previewTenant, setPreviewTenant] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const storeUrl = `https://sellio.apptelier.sg/store/${tenantSlug}`;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    const draft = sessionStorage.getItem(`storefront_draft_${tenantId}`);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setForm({ ...DEFAULTS, ...parsed });
        const [productsRes, categoriesRes, tenantRes] = await Promise.all([
          supabase.from('products').select('id, name, description, price, image_url, category_id, is_active').eq('tenant_id', tenantId).or('is_active.eq.true,is_active.is.null').limit(12),
          supabase.from('categories').select('id, name').eq('tenant_id', tenantId),
          supabase.from('tenants').select('name, logo_url, currency').eq('id', tenantId).maybeSingle(),
        ]);
        setPreviewProducts(productsRes.data || []);
        setPreviewCategories(categoriesRes.data || []);
        setPreviewTenant(tenantRes.data);
        return;
      } catch {}
    }
    const [configRes, productsRes, categoriesRes, tenantRes] = await Promise.all([
      supabase.from('storefront_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('products').select('id, name, description, price, image_url, category_id, is_active').eq('tenant_id', tenantId).or('is_active.eq.true,is_active.is.null').limit(12),
      supabase.from('categories').select('id, name').eq('tenant_id', tenantId),
      supabase.from('tenants').select('name, logo_url, currency').eq('id', tenantId).maybeSingle(),
    ]);
    setForm(configRes.data ? { ...DEFAULTS, ...configRes.data } : { ...DEFAULTS });
    setPreviewProducts(productsRes.data || []);
    setPreviewCategories(categoriesRes.data || []);
    setPreviewTenant(tenantRes.data);
  };

  const handleClose = () => {
    const draft = sessionStorage.getItem(`storefront_draft_${tenantId}`);
    if (draft) {
      const leave = window.confirm('You have unsaved changes. Leave without saving?');
      if (!leave) return;
      sessionStorage.removeItem(`storefront_draft_${tenantId}`);
    }
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleChange = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!open || !tenantId) return;
    sessionStorage.setItem(`storefront_draft_${tenantId}`, JSON.stringify(form));
  }, [form]);

  const handleSave = async () => {
    setSaving(true);
    const supabase = await getSupabase();

    const ALLOWED = [
      'banner_headline', 'banner_tagline', 'banner_bg_color', 'banner_bg_image_url',
      'banner_height', 'banner_height_px', 'banner_position_x', 'banner_position_y',
      'show_announcement_bar', 'announcement_text', 'product_layout', 'products_per_row',
      'show_featured', 'featured_section_title', 'show_category_tabs',
      'show_product_description', 'show_stock_badge', 'font_family',
    ];

    const payload = {};
    for (const key of ALLOWED) {
      const val = form[key];
      if (key === 'banner_position_x' || key === 'banner_position_y') {
        payload[key] = Number.isFinite(Number(val)) ? Math.round(Number(val)) : 50;
      } else if (key === 'banner_height_px') {
        payload[key] = Number.isFinite(Number(val)) ? Math.round(Number(val)) : 220;
      } else if (key === 'products_per_row') {
        payload[key] = Number.isFinite(Number(val)) ? Number(val) : 2;
      } else {
        payload[key] = val ?? null;
      }
    }

    const { data: existing } = await supabase
      .from('storefront_configs').select('id').eq('tenant_id', tenantId).maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase.from('storefront_configs').update(payload).eq('tenant_id', tenantId));
    } else {
      ({ error } = await supabase.from('storefront_configs').insert({ tenant_id: tenantId, ...payload }));
    }

    setSaving(false);
    if (error) {
      toast.error('Save failed: ' + error.message);
    } else {
      sessionStorage.removeItem(`storefront_draft_${tenantId}`);
      toast.success('Storefront saved ✓');
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} className="flex">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      <div style={{
        position: 'absolute', inset: 0, background: 'white',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 300ms ease',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* TOP BAR */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', background: 'white', borderBottom: '1px solid #f1f5f9',
          flexShrink: 0, zIndex: 200,
        }}>
          <button type="button" onClick={handleClose}
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back
          </button>
          <h2 style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, margin: 0 }}>Design your store</h2>
          <a href={storeUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 999, padding: '4px 12px', textDecoration: 'none', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Open Store
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        </div>

        {/* BODY */}
        {isMobile ? (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <MobileCanvasLayout
              form={form}
              onChange={handleChange}
              tenantId={tenantId}
              previewData={{ tenant: previewTenant, products: previewProducts, categories: previewCategories }}
              handleSave={handleSave}
              saving={saving}
            />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-col overflow-hidden border-r border-slate-100" style={{ width: '100%', maxWidth: 360 }}>
              <DesktopEditorControls
                form={form}
                onChange={handleChange}
                tenantId={tenantId}
              />
              {/* Desktop Save */}
              <div className="flex gap-2 p-4 border-t border-slate-100 bg-white flex-shrink-0">
                <Button onClick={handleSave} disabled={saving} className="flex-1 rounded-full"
                  style={{ background: 'var(--color-primary-gradient)', color: 'white', border: 'none', fontWeight: 600 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>

            {/* Right: WYSIWYG Live Preview using the exact same StorefrontView */}
            <div className="flex flex-1 flex-col items-center overflow-auto" style={{ background: '#f0f2f7', padding: '24px 32px', position: 'relative' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 12px', fontSize: 12, color: '#64748b', fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                📱 Live Preview
              </div>
              <div style={{ width: 375, flexShrink: 0, border: '8px solid #1e293b', borderRadius: 36, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
                <div style={{ height: 500, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
                  <StorefrontView
                    previewMode={true}
                    tenant={previewTenant}
                    storefrontConfig={form}
                    theme={null}
                    products={previewProducts}
                    categories={previewCategories}
                    cart={[]}
                    cartCount={0}
                    cartTotal={0}
                    setShowCart={() => {}}
                    setShowOrderHistory={() => {}}
                    onAddToCart={() => {}}
                  />
                  <BannerCanvasOverlay form={form} onChange={handleChange} tenantId={tenantId} scaleFactor={1} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}