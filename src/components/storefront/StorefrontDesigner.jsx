import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { X, ArrowLeft, ExternalLink, Upload, Eye } from 'lucide-react';

const FONTS = [
  { value: 'Inter', label: 'Inter', style: { fontFamily: 'Inter, sans-serif' } },
  { value: 'Georgia', label: 'Serif', style: { fontFamily: 'Georgia, serif' } },
  { value: 'Nunito', label: 'Rounded', style: { fontFamily: 'Nunito, sans-serif' } },
  { value: 'monospace', label: 'Mono', style: { fontFamily: 'monospace' } },
];

const TABS = [
  { id: 'banner', label: 'Preview' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'menu', label: 'Menu' },
  { id: 'typography', label: 'Typography' },
  { id: 'preview', label: 'Full Preview' },
];

const MIN_BANNER_HEIGHT = 80;
const MAX_BANNER_HEIGHT = 280;

const DEFAULTS = {
  banner_headline: '',
  banner_tagline: '',
  banner_height: 'medium',
  banner_height_px: 200,
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

function DraggableBannerImage({ src, positionX, positionY, onPositionChange, height }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: positionX, y: positionY });

  // Sync position when props change
  useEffect(() => {
    currentPos.current = { x: positionX, y: positionY };
    if (containerRef.current) {
      containerRef.current.style.backgroundPosition = `${positionX}% ${positionY}%`;
    }
  }, [positionX, positionY]);

  // Sync height when prop changes
  useEffect(() => {
    if (containerRef.current && height) {
      containerRef.current.style.height = `${height}px`;
    }
  }, [height]);

  const getEventPos = (e) => ({
    x: e.touches?.[0]?.clientX ?? e.clientX,
    y: e.touches?.[0]?.clientY ?? e.clientY,
  });

  const handleStart = (e) => {
    isDragging.current = true;
    lastPos.current = getEventPos(e);
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
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
    containerRef.current.style.backgroundPosition = `${newX}% ${newY}%`;
    e.preventDefault();
  };

  const handleEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = 'grab';
    onPositionChange(currentPos.current.x, currentPos.current.y);
  };

  // Strip cache-busting param for CSS background
  const cleanSrc = src?.split('?')[0] || src;

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
        height: height || 200,
        borderRadius: '12px 12px 0 0',
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        backgroundImage: `url("${cleanSrc}")`,
        backgroundSize: 'cover',
        backgroundPosition: `${positionX}% ${positionY}%`,
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#f1f5f9',
      }}
    >
      <div style={{
        position: 'absolute', bottom: 8, right: 8,
        background: 'rgba(0,0,0,0.5)',
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

function FloatingBannerControls({ form, onChange, tenantId, fileInputRef, handleRemoveBannerImage, handleBannerImageUpload, uploading }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      background: 'white',
      borderRadius: '20px 20px 0 0',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      transition: 'transform 0.3s ease',
      zIndex: 50,
    }}>
      {/* Handle + toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '14px 20px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0', position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 8 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginTop: 6 }}>
          {form.banner_bg_image_url ? '🖼️ Banner Image · tap to edit' : '🖼️ Banner Settings'}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 6 }}>▼</span>
      </div>

      {/* Upload / Replace (always visible) */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1, padding: '10px', borderRadius: 12,
            border: '1.5px dashed #cbd5e1', background: '#f8fafc',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'inherit',
          }}
        >
          <Upload size={14} />
          {uploading ? 'Uploading...' : (form.banner_bg_image_url ? 'Replace image' : 'Upload banner image')}
        </button>
        {form.banner_bg_image_url && (
          <button
            type="button"
            onClick={handleRemoveBannerImage}
            style={{
              padding: '10px 14px', borderRadius: 12,
              border: '1.5px solid #fee2e2', background: '#fff5f5',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'inherit',
            }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div style={{ padding: '0 16px 20px', borderTop: '1px solid #f1f5f9', paddingTop: 14, maxHeight: '45vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Background Colour</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={form.banner_bg_color || '#6366f1'} onChange={e => onChange('banner_bg_color', e.target.value)}
                style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
              <input type="text" value={form.banner_bg_color || '#6366f1'} onChange={e => onChange('banner_bg_color', e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'monospace', outline: 'none', color: '#1e293b' }} />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Used when no image is set</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Headline</div>
            <input type="text" value={form.banner_headline || ''} onChange={e => onChange('banner_headline', e.target.value)}
              placeholder="e.g. Order fresh, eat happy"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Tagline</div>
            <input type="text" value={form.banner_tagline || ''} onChange={e => onChange('banner_tagline', e.target.value)}
              placeholder="e.g. Fast delivery · Fresh daily"
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1e293b', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function StorefrontMiniPreview({ form, tenant, products, categories, onBannerDrag, interactive }) {
  const primaryColor = form.banner_bg_color || '#6366f1';
  const cleanBannerUrl = form.banner_bg_image_url?.split('?')[0];

  const displayProducts = (products || []).slice(0, 6);

  const bannerRef = useRef(null);
  const isDragging = useRef(false);
  const lastDragPos = useRef({ x: 0, y: 0 });
  const livePos = useRef({ x: form.banner_position_x ?? 50, y: form.banner_position_y ?? 50 });

  // Sync livePos when props change
  useEffect(() => {
    livePos.current = { x: form.banner_position_x ?? 50, y: form.banner_position_y ?? 50 };
  }, [form.banner_position_x, form.banner_position_y]);

  const handleBannerDragStart = (e) => {
    if (!form.banner_bg_image_url) return;
    isDragging.current = true;
    lastDragPos.current = { x: e.clientX, y: e.clientY };
    if (bannerRef.current) bannerRef.current.style.cursor = 'grabbing';
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current || !bannerRef.current) return;
      const dx = me.clientX - lastDragPos.current.x;
      const dy = me.clientY - lastDragPos.current.y;
      lastDragPos.current = { x: me.clientX, y: me.clientY };
      const rect = bannerRef.current.getBoundingClientRect();
      livePos.current.x = Math.max(0, Math.min(100, livePos.current.x - (dx / rect.width * 100)));
      livePos.current.y = Math.max(0, Math.min(100, livePos.current.y - (dy / rect.height * 100)));
      bannerRef.current.style.backgroundPosition = `${livePos.current.x}% ${livePos.current.y}%`;
    };
    const onUp = () => {
      isDragging.current = false;
      if (bannerRef.current) bannerRef.current.style.cursor = 'grab';
      onBannerDrag?.(livePos.current.x, livePos.current.y);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleBannerTouchStart = (e) => {
    if (!form.banner_bg_image_url) return;
    const touch = e.touches[0];
    isDragging.current = true;
    lastDragPos.current = { x: touch.clientX, y: touch.clientY };
    const onMove = (te) => {
      if (!isDragging.current || !bannerRef.current) return;
      const t = te.touches[0];
      const dx = t.clientX - lastDragPos.current.x;
      const dy = t.clientY - lastDragPos.current.y;
      lastDragPos.current = { x: t.clientX, y: t.clientY };
      const rect = bannerRef.current.getBoundingClientRect();
      livePos.current.x = Math.max(0, Math.min(100, livePos.current.x - (dx / rect.width * 100)));
      livePos.current.y = Math.max(0, Math.min(100, livePos.current.y - (dy / rect.height * 100)));
      bannerRef.current.style.backgroundPosition = `${livePos.current.x}% ${livePos.current.y}%`;
      te.preventDefault();
    };
    const onEnd = () => {
      isDragging.current = false;
      onBannerDrag?.(livePos.current.x, livePos.current.y);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    e.preventDefault();
  };

  return (
    <div style={{
      width: 390,
      minHeight: 844,
      background: 'white',
      borderRadius: 40,
      overflow: 'hidden',
      boxShadow: '0 24px 72px rgba(0,0,0,0.18)',
      fontFamily: form.font_family ? `'${form.font_family}', sans-serif` : 'Inter, sans-serif',
      position: 'relative',
    }}>
      {/* BANNER */}
      <div
        ref={bannerRef}
        onMouseDown={interactive ? handleBannerDragStart : undefined}
        onTouchStart={interactive ? handleBannerTouchStart : undefined}
        style={{
          height: 240,
          position: 'relative',
          cursor: interactive && form.banner_bg_image_url ? 'grab' : 'default',
          ...(cleanBannerUrl
            ? { backgroundImage: `url("${cleanBannerUrl}")`, backgroundSize: 'cover', backgroundPosition: `${form.banner_position_x ?? 50}% ${form.banner_position_y ?? 50}%` }
            : { background: primaryColor }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tenant?.logo_url && (
              <img src={tenant.logo_url} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.8)' }} />
            )}
            <span style={{ color: 'white', fontWeight: 700, fontSize: 15, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
              {tenant?.name || 'Store Name'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, background: '#94a3b8' }} />
              </div>
            ))}
          </div>
        </div>
        {(form.banner_headline || form.banner_tagline) && (
          <div style={{ position: 'absolute', bottom: 50, left: 16, right: 16 }}>
            {form.banner_headline && (
              <p style={{ color: 'white', fontWeight: 800, fontSize: 22, margin: '0 0 4px', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                {form.banner_headline}
              </p>
            )}
            {form.banner_tagline && (
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: 0 }}>
                {form.banner_tagline}
              </p>
            )}
          </div>
        )}
        {form.banner_bg_image_url && interactive && (
          <div style={{
            position: 'absolute', bottom: 60, right: 10,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            borderRadius: 8, padding: '3px 8px',
            color: 'white', fontSize: 10, fontWeight: 500,
            pointerEvents: 'none',
          }}>
            ✥ Drag to reposition
          </div>
        )}
      </div>

      {/* WHITE CONTENT SHEET */}
      <div style={{ background: 'white', borderRadius: '24px 24px 0 0', marginTop: -24, position: 'relative', zIndex: 2, minHeight: 600 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0', margin: '12px auto 0' }} />

        {form.show_announcement_bar && form.announcement_text && (
          <div style={{ margin: '10px 16px 0', background: `${primaryColor}18`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: primaryColor, fontWeight: 500, textAlign: 'center' }}>
            📢 {form.announcement_text}
          </div>
        )}

        {form.show_category_tabs !== false && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {['All', ...(categories || []).map(c => c.name)].slice(0, 5).map((cat, i) => (
              <div key={cat} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: i === 0 ? 600 : 400, background: i === 0 ? primaryColor : '#f1f5f9', color: i === 0 ? 'white' : '#64748b' }}>
                {cat}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '12px 16px 0' }}>
          {form.product_layout === 'list' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f8f9fa', alignItems: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 10, background: p.image_url ? `url('${p.image_url}') center/cover` : '#f1f5f9', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    {form.show_product_description !== false && p.description && (
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{p.description}</p>
                    )}
                    <p style={{ fontSize: 13, fontWeight: 700, color: primaryColor, margin: 0 }}>{p.price?.toFixed(2)}</p>
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white', fontSize: 18, fontWeight: 300 }}>+</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${form.products_per_row || 2}, 1fr)`, gap: 10 }}>
              {displayProducts.map(p => (
                <div key={p.id} style={{ borderRadius: 14, overflow: 'hidden', background: '#fafafa', border: '1px solid #f1f5f9' }}>
                  <div style={{ height: 100, background: p.image_url ? `url('${p.image_url}') center/cover` : '#f1f5f9' }} />
                  <div style={{ padding: '8px 10px 10px' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 2px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: primaryColor, margin: 0 }}>{p.price?.toFixed(2)}</p>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16 }}>+</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

function EditorControls({ form, onChange, tenantId, onImageUploaded, onOpenPreview, previewData }) {
  const [activeTab, setActiveTab] = useState('banner');
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [hoveringBanner, setHoveringBanner] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [bannerHeightPx, setBannerHeightPx] = useState(
    form.banner_height_px || (form.banner_height === 'small' ? 160 : form.banner_height === 'large' ? 300 : 220)
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const bannerPreviewRef = useRef(null);

  const startResize = (e) => {
    e.preventDefault();
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startHeight = bannerHeightPx;
    let finalHeight = startHeight;
    const onMove = (moveEvent) => {
      const y = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const delta = y - startY;
      finalHeight = Math.max(MIN_BANNER_HEIGHT, Math.min(MAX_BANNER_HEIGHT, startHeight + delta));
      // Update DOM directly — no React re-render during drag
      setBannerHeightPx(finalHeight);
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      // Only call onChange once on release
      const named = finalHeight < 180 ? 'small' : finalHeight > 260 ? 'large' : 'medium';
      onChange('banner_height', named);
      onChange('banner_height_px', Math.round(finalHeight));
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
    const cleanUrl = publicUrl.split('?')[0];
    // Use clean URL + cache-bust for in-memory state (forces browser refresh)
    onChange('banner_bg_image_url', cleanUrl + '?t=' + Date.now());
    // Save clean URL (no ?t=) to DB so it loads correctly on next open
    await supabase.from('storefront_configs').upsert(
      { tenant_id: tenantId, banner_bg_image_url: cleanUrl },
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
        style={
          activeTab === 'preview'
            ? { padding: 0, background: '#f8fafc' }
            : (activeTab === 'banner' && isMobile)
              ? { padding: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
              : { padding: '16px 20px', paddingBottom: 24 }
        }
      >

        {/* ── BANNER TAB: MOBILE = full canvas, DESKTOP = accordion ── */}
        {activeTab === 'banner' && isMobile && (
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#f0f2f7' }}>
            <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
              <StorefrontMiniPreview
                form={form}
                tenant={previewData?.tenant}
                products={previewData?.products}
                categories={previewData?.categories}
                onBannerDrag={(x, y) => { onChange('banner_position_x', x); onChange('banner_position_y', y); }}
                interactive={true}
              />
            </div>
            <FloatingBannerControls
              form={form}
              onChange={onChange}
              tenantId={tenantId}
              fileInputRef={fileInputRef}
              handleRemoveBannerImage={handleRemoveBannerImage}
              handleBannerImageUpload={handleBannerImageUpload}
              uploading={uploading}
            />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
          </div>
        )}

        {activeTab === 'banner' && !isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. Banner Preview with resize handle */}
            <div>
              <SectionLabel>Banner Preview</SectionLabel>
              <div style={{ position: 'relative', userSelect: 'none', marginBottom: 8 }}>
                {form.banner_bg_image_url ? (
                  <div
                    onMouseEnter={() => setHoveringBanner(true)}
                    onMouseLeave={() => setHoveringBanner(false)}
                    style={{ position: 'relative' }}
                  >
                    <DraggableBannerImage
                      src={form.banner_bg_image_url}
                      positionX={form.banner_position_x ?? 50}
                      positionY={form.banner_position_y ?? 50}
                      height={bannerHeightPx}
                      onPositionChange={(x, y) => {
                        onChange('banner_position_x', x);
                        onChange('banner_position_y', y);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRemoveBannerImage}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 26, height: 26, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 20,
                      }}
                    >
                      <X size={12} color="white" />
                    </button>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                        borderRadius: 10, padding: '8px 14px',
                        display: (hoveringBanner || window.innerWidth < 768) ? 'flex' : 'none',
                        alignItems: 'center', gap: 6,
                        cursor: 'pointer', color: 'white', fontSize: 12, fontWeight: 600,
                        zIndex: 20, pointerEvents: 'all',
                      }}
                    >
                      <Upload size={13} color="white" />
                      {uploading ? 'Uploading...' : 'Replace'}
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '100%', height: bannerHeightPx, borderRadius: '12px 12px 0 0', background: form.banner_bg_color || '#6366f1' }} />
                )}
                <div
                  onMouseDown={startResize}
                  onTouchStart={startResize}
                  style={{ height: 20, background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', borderTop: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize', userSelect: 'none' }}
                >
                  <div style={{ width: 32, height: 4, borderRadius: 2, background: '#cbd5e1' }} />
                </div>
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                ↕ Drag to resize banner · {Math.round(bannerHeightPx)}px
              </p>
            </div>

            {!form.banner_bg_image_url && (
              <div>
                <SectionLabel>Background Image</SectionLabel>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ width: '100%', height: 80, border: '2px dashed #cbd5e1', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8', background: '#f8fafc', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#64748b'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8'; }}
                >
                  <Upload className="w-5 h-5" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{uploading ? 'Uploading...' : 'Upload banner image'}</span>
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />

            <div>
              <SectionLabel>Background Colour</SectionLabel>
              <div className="flex items-center gap-3">
                <input type="color" value={form.banner_bg_color} onChange={e => onChange('banner_bg_color', e.target.value)}
                  style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
                <Input value={form.banner_bg_color} onChange={e => onChange('banner_bg_color', e.target.value)} className="w-32 font-mono text-sm" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Used when no image is set</p>
            </div>

            <div>
              <SectionLabel>Headline</SectionLabel>
              <Input value={form.banner_headline} onChange={e => onChange('banner_headline', e.target.value)} placeholder="e.g. Order fresh, eat happy" />
            </div>

            <div>
              <SectionLabel>Tagline</SectionLabel>
              <Input value={form.banner_tagline} onChange={e => onChange('banner_tagline', e.target.value)} placeholder="e.g. Fast delivery · Fresh daily" />
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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px 0',
            background: '#f8fafc',
            minHeight: '100%',
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', color: '#94a3b8',
              marginBottom: 12, textTransform: 'uppercase',
            }}>
              Preview — updates instantly
            </p>
            <div style={{
              transform: 'scale(0.72)',
              transformOrigin: 'top center',
              width: 390,
              flexShrink: 0,
              marginBottom: `calc((390px * 0.72) - 390px)`,
            }}>
              <StorefrontMiniPreview
                form={form}
                tenant={previewData?.tenant}
                products={previewData?.products}
                categories={previewData?.categories}
              />
            </div>
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
  const [previewProducts, setPreviewProducts] = useState([]);
  const [previewCategories, setPreviewCategories] = useState([]);
  const [previewTenant, setPreviewTenant] = useState(null);
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

    // Check for unsaved draft first
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

    // No draft — fetch from DB
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

  // Persist unsaved form to sessionStorage
  useEffect(() => {
    if (!open || !tenantId) return;
    sessionStorage.setItem(`storefront_draft_${tenantId}`, JSON.stringify(form));
  }, [form]);

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
              onImageUploaded={() => {}}
              onOpenPreview={() => setShowPreviewDrawer(true)}
              previewData={{ tenant: previewTenant, products: previewProducts, categories: previewCategories }}
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
            {/* Preview label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 390 * 0.65, marginBottom: 16 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 999,
                padding: '4px 12px', fontSize: 12, color: '#64748b', fontWeight: 500,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                📱 Live Preview
              </div>
            </div>

            {/* Phone frame */}
            <div style={{ transform: 'scale(0.65)', transformOrigin: 'top center', width: 390, flexShrink: 0 }}>
              <StorefrontMiniPreview
                form={form}
                tenant={previewTenant}
                products={previewProducts}
                categories={previewCategories}
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
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', width: 390, flexShrink: 0 }}>
                <StorefrontMiniPreview
                  form={form}
                  tenant={previewTenant}
                  products={previewProducts}
                  categories={previewCategories}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}