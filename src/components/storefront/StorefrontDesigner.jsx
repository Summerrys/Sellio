import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { X, ArrowLeft, ExternalLink, Upload, Pencil, ImagePlus, ZoomIn, ZoomOut, RotateCcw, Monitor, Tablet, Smartphone, Check } from 'lucide-react';
import StorefrontView, {
  STOREFRONT_BANNER_DEFAULT_HEIGHT,
  STOREFRONT_BANNER_DEFAULT_ZOOM,
  getStorefrontBannerHeight,
  getStorefrontBannerZoom,
} from '@/components/storefront/StorefrontView';
import ImageEditModal from '@/components/onboarding/ImageEditModal';
import { LanguageProvider } from '@/lib/LanguageContext';
import { fetchStorefrontCatalog } from '@/lib/storefrontCatalog';
import { extractBannerEdgeColors, isValidBannerEdgeColor } from '@/lib/bannerEdgeColors';
import {
  STOREFRONT_TYPOGRAPHY_PERSONALITIES,
  STOREFRONT_TYPOGRAPHY_SCALES,
  getStorefrontTypographyPersonality,
  getStorefrontTypographyScale,
} from '@/lib/storefrontTypography';

const TABS = [
  { id: 'banner', label: 'Banner' },
  { id: 'menu', label: 'Menu' },
  { id: 'style', label: 'Style' },
];

const PREVIEW_DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1280, height: 800, icon: Monitor },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1112, icon: Tablet },
  { id: 'mobile', label: 'Mobile', width: 390, height: 844, icon: Smartphone },
];

const PREVIEW_BROWSER_BAR_HEIGHT = 36;
const PREVIEW_FRAME_BORDER = 2;

const DRAWER_HANDLE_ONLY = 48;
const MIN_DRAWER = DRAWER_HANDLE_ONLY;

const DEFAULTS = {
  banner_headline: '',
  banner_tagline: '',
  banner_height: 'medium',
  banner_height_px: STOREFRONT_BANNER_DEFAULT_HEIGHT,
  banner_zoom: STOREFRONT_BANNER_DEFAULT_ZOOM,
  banner_bg_color: '#fb923c',
  banner_bg_image_url: '',
  banner_edge_left_color: null,
  banner_edge_right_color: null,
  banner_position_x: 50,
  banner_position_y: 50,
  show_promo_ticker: true,
  product_layout: 'grid',
  menu_density: 'comfortable',
  show_featured: true,
  featured_section_title: "Today's Picks",
  show_category_tabs: true,
  show_product_description: true,
  show_stock_badge: true,
  font_family: 'Inter',
  typography_scale: 'balanced',
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

const COLOR_PRESETS = [
  '#f97316', '#ef4444', '#f43f5e', '#7c3aed', '#3b82f6',
  '#0d9488', '#10b981', '#f59e0b', '#475569', '#111827',
];

function PremiumColorPicker({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(70);
  const [brightness, setBrightness] = useState(80);
  const [hexInput, setHexInput] = useState(value || '#fb923c');
  const gradientBoxRef = useRef(null);
  const hueBarRef = useRef(null);

  const hsvToHex = (h, s, v) => {
    s /= 100; v /= 100;
    const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };

  const hexToHsv = (hex) => {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60); if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : Math.round(d / max * 100), v: Math.round(max * 100) };
  };

  useEffect(() => {
    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
      const hsv = hexToHsv(value);
      setHue(hsv.h); setSaturation(hsv.s); setBrightness(hsv.v);
      setHexInput(value);
    }
  }, [value]);

  const currentColor = hsvToHex(hue, saturation, brightness);

  const handleGradientClick = (e) => {
    const rect = gradientBoxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newS = Math.round(x * 100);
    const newV = Math.round((1 - y) * 100);
    setSaturation(newS); setBrightness(newV);
    const hex = hsvToHex(hue, newS, newV);
    setHexInput(hex); onChange(hex);
  };

  const handleGradientTouch = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = gradientBoxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
    const newS = Math.round(x * 100);
    const newV = Math.round((1 - y) * 100);
    setSaturation(newS); setBrightness(newV);
    const hex = hsvToHex(hue, newS, newV);
    setHexInput(hex); onChange(hex);
  };

  const handleHueClick = (e) => {
    const rect = hueBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newH = Math.round(x * 360);
    setHue(newH);
    const hex = hsvToHex(newH, saturation, brightness);
    setHexInput(hex); onChange(hex);
  };

  const handleHueTouch = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = hueBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const newH = Math.round(x * 360);
    setHue(newH);
    const hex = hsvToHex(newH, saturation, brightness);
    setHexInput(hex); onChange(hex);
  };

  const handleHexInput = (val) => {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const hsv = hexToHsv(val);
      setHue(hsv.h); setSaturation(hsv.s); setBrightness(hsv.v);
      onChange(val);
    }
  };

  const thumbX = `${saturation}%`;
  const thumbY = `${100 - brightness}%`;
  const hueX = `${(hue / 360) * 100}%`;
  const pureHueColor = hsvToHex(hue, 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        onClick={() => setShowPicker(p => !p)}
        style={{
          width: '100%', height: 44, borderRadius: 10, background: value || '#fb923c',
          cursor: 'pointer', border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'opacity 0.15s',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
          {showPicker ? 'Close picker ↑' : 'Tap to pick colour ↓'}
        </span>
      </div>

      {showPicker && (
        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            ref={gradientBoxRef}
            onClick={handleGradientClick}
            onTouchMove={handleGradientTouch}
            onTouchStart={handleGradientTouch}
            style={{
              width: '100%', height: 150, borderRadius: 10, position: 'relative',
              background: pureHueColor, cursor: 'crosshair', touchAction: 'none',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, white, transparent)', borderRadius: 10 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, black)', borderRadius: 10 }} />
            <div style={{
              position: 'absolute', left: thumbX, top: thumbY,
              width: 20, height: 20, borderRadius: '50%',
              border: '3px solid white',
              background: currentColor,
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }} />
          </div>

          <div
            ref={hueBarRef}
            onClick={handleHueClick}
            onTouchMove={handleHueTouch}
            onTouchStart={handleHueTouch}
            style={{
              width: '100%', height: 24, borderRadius: 12, position: 'relative',
              background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              cursor: 'pointer', touchAction: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{
              position: 'absolute', left: hueX, top: '50%',
              width: 28, height: 28, borderRadius: '50%',
              background: pureHueColor,
              border: '3px solid white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: currentColor, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.08)' }} />
            <div style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>#</span>
              <input
                value={hexInput.replace('#', '')}
                onChange={e => handleHexInput('#' + e.target.value)}
                maxLength={6}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', background: 'transparent' }}
                placeholder="fb923c"
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {COLOR_PRESETS.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => { onChange(color); setHexInput(color); setShowPicker(false); const hsv = hexToHsv(color); setHue(hsv.h); setSaturation(hsv.s); setBrightness(hsv.v); }}
            style={{
              width: 28, height: 28, borderRadius: '50%', background: color,
              border: (value || '').toLowerCase() === color ? '2.5px solid #0f172a' : '2px solid transparent',
              cursor: 'pointer', flexShrink: 0, position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              outline: (value || '').toLowerCase() === color ? '2px solid white' : 'none',
              outlineOffset: -4,
            }}
          >
            {(value || '').toLowerCase() === color && (
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Banner tab content — colour + promotional ticker controls only.
function BannerTabContent({ form, onChange }) {
  const currentColor = form.banner_bg_color || '#6366f1';
  const tickerEnabled = form.show_promo_ticker !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionLabel>Brand Colour</SectionLabel>
        <PremiumColorPicker value={currentColor} onChange={v => onChange('banner_bg_color', v)} />
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
        <Toggle
          checked={tickerEnabled}
          onChange={v => onChange('show_promo_ticker', v)}
          label="Show Headline & Tagline"
        />
        {tickerEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            <div>
              <SectionLabel>Headline</SectionLabel>
              <Input value={form.banner_headline || ''} onChange={e => onChange('banner_headline', e.target.value)} placeholder="e.g. Order fresh, eat happy" />
            </div>
            <div>
              <SectionLabel>Tagline</SectionLabel>
              <Input value={form.banner_tagline || ''} onChange={e => onChange('banner_tagline', e.target.value)} placeholder="e.g. Fast delivery · Fresh daily" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Interactive banner overlay — sits on top of the StorefrontView preview at exact banner position.
// Its height comes from the same normalizer used by the public storefront.
const PREVIEW_HEADER_H = 56;
const clampBannerPosition = value => Math.max(0, Math.min(100, Number(value) || 0));
const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pointerMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function readImageFileDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to inspect image dimensions.'));
    };
    image.src = objectUrl;
  });
}

function BannerCanvasOverlay({ form, onChange, tenantId, scaleFactor = 1 }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Unified pointer gesture state. Pointer Events cover mouse, pen and touch;
  // updates are limited to one React change per animation frame so dragging
  // stays smooth even on lower-powered phones and tablets.
  const overlayRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const frameRef = useRef(null);
  const pendingTransformRef = useRef(null);
  const liveTransform = useRef({
    x: form.banner_position_x ?? 50,
    y: form.banner_position_y ?? 50,
    zoom: getStorefrontBannerZoom(form.banner_zoom),
  });
  const [gestureActive, setGestureActive] = useState(false);
  const [displayZoom, setDisplayZoom] = useState(getStorefrontBannerZoom(form.banner_zoom));
  const [bannerMetrics, setBannerMetrics] = useState(null);

  const applyBannerEdgeColors = useCallback(async (imageUrl) => {
    try {
      const colors = await extractBannerEdgeColors(imageUrl);
      onChange('banner_edge_left_color', colors.left);
      onChange('banner_edge_right_color', colors.right);
      return colors;
    } catch {
      // The storefront renderer keeps a neutral fallback if a remote image
      // cannot be sampled (for example due to a temporary CORS/network issue).
      return null;
    }
  }, [onChange]);

  // Backfill older banners when their Design Store preview is opened. New
  // uploads are sampled before their upload flow finishes below.
  useEffect(() => {
    if (
      !form.banner_bg_image_url
      || (
        isValidBannerEdgeColor(form.banner_edge_left_color)
        && isValidBannerEdgeColor(form.banner_edge_right_color)
      )
    ) return;

    let cancelled = false;
    extractBannerEdgeColors(form.banner_bg_image_url)
      .then(colors => {
        if (cancelled) return;
        onChange('banner_edge_left_color', colors.left);
        onChange('banner_edge_right_color', colors.right);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [
    form.banner_bg_image_url,
    form.banner_edge_left_color,
    form.banner_edge_right_color,
    onChange,
  ]);

  // Measure the real shared banner instead of assuming a fixed header offset.
  // This keeps the gesture surface aligned when the promo marquee mounts,
  // header content wraps, or the device changes orientation.
  useEffect(() => {
    const host = overlayRef.current?.parentElement;
    const banner = host?.querySelector('[data-storefront-banner="true"]');
    if (!host || !banner) return;
    let frame = null;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const hostRect = host.getBoundingClientRect();
        const bannerRect = banner.getBoundingClientRect();
        const renderedScale = Math.max(0.01, scaleFactor || 1);
        setBannerMetrics({
          top: (bannerRect.top - hostRect.top) / renderedScale,
          height: bannerRect.height / renderedScale,
        });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(banner);
    window.addEventListener('resize', update);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [form.banner_height_px, form.banner_headline, form.banner_tagline, scaleFactor]);

  useEffect(() => {
    if (gestureActive) return;
    const next = {
      x: form.banner_position_x ?? 50,
      y: form.banner_position_y ?? 50,
      zoom: getStorefrontBannerZoom(form.banner_zoom),
    };
    liveTransform.current = next;
    setDisplayZoom(next.zoom);
  }, [form.banner_position_x, form.banner_position_y, form.banner_zoom, gestureActive]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const scheduleTransform = (nextTransform) => {
    const next = {
      x: clampBannerPosition(nextTransform.x),
      y: clampBannerPosition(nextTransform.y),
      zoom: getStorefrontBannerZoom(nextTransform.zoom),
    };
    liveTransform.current = next;
    pendingTransformRef.current = next;
    setDisplayZoom(next.zoom);
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingTransformRef.current;
      if (!pending) return;
      onChange('banner_position_x', pending.x);
      onChange('banner_position_y', pending.y);
      onChange('banner_zoom', pending.zoom);
    });
  };

  const beginGesture = () => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const midpoint = pointerMidpoint(points[0], points[1]);
      const startTransform = {
        ...liveTransform.current,
        // Pinch around the point between the merchant's fingers.
        x: clampBannerPosition((midpoint.x - rect.left) / rect.width * 100),
        y: clampBannerPosition((midpoint.y - rect.top) / rect.height * 100),
      };
      scheduleTransform(startTransform);
      gestureRef.current = {
        mode: 'pinch',
        startDistance: Math.max(1, pointerDistance(points[0], points[1])),
        startMidpoint: midpoint,
        startTransform,
      };
    } else if (points.length === 1) {
      gestureRef.current = {
        mode: 'drag',
        startPoint: points[0],
        startTransform: { ...liveTransform.current },
      };
    }
  };

  const handlePointerDown = (e) => {
    if (!form.banner_bg_image_url || e.target.closest('[data-no-drag]')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGestureActive(true);
    beginGesture();
  };

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const points = [...pointersRef.current.values()];

    if (points.length >= 2) {
      if (gestureRef.current?.mode !== 'pinch') beginGesture();
      const gesture = gestureRef.current;
      if (!gesture || gesture.mode !== 'pinch') return;
      const midpoint = pointerMidpoint(points[0], points[1]);
      const zoom = getStorefrontBannerZoom(
        gesture.startTransform.zoom * (pointerDistance(points[0], points[1]) / gesture.startDistance)
      );
      scheduleTransform({
        x: gesture.startTransform.x - ((midpoint.x - gesture.startMidpoint.x) / rect.width * 100),
        y: gesture.startTransform.y - ((midpoint.y - gesture.startMidpoint.y) / rect.height * 100),
        zoom,
      });
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture || gesture.mode !== 'drag' || points.length !== 1) return;
    const dragScale = Math.max(1, gesture.startTransform.zoom);
    scheduleTransform({
      ...gesture.startTransform,
      x: gesture.startTransform.x - ((points[0].x - gesture.startPoint.x) / rect.width * 100 / dragScale),
      y: gesture.startTransform.y - ((points[0].y - gesture.startPoint.y) / rect.height * 100 / dragScale),
    });
  };

  const handlePointerEnd = (e) => {
    pointersRef.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    if (pointersRef.current.size > 0) {
      beginGesture();
    } else {
      gestureRef.current = null;
      setGestureActive(false);
    }
  };

  const adjustZoom = (delta) => {
    scheduleTransform({ ...liveTransform.current, zoom: liveTransform.current.zoom + delta });
  };

  const resetTransform = () => {
    scheduleTransform({ x: 50, y: 50, zoom: STOREFRONT_BANNER_DEFAULT_ZOOM });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!tenantId) { toast.error('Tenant not loaded yet'); return; }

    try {
      const dimensions = await readImageFileDimensions(file);
      const aspectRatio = dimensions.width / dimensions.height;
      const isThreeToOne = Math.abs(aspectRatio - 3) <= 0.15;
      const isRecommendedResolution = dimensions.width >= 2400 && dimensions.height >= 800;
      if (!isThreeToOne || !isRecommendedResolution) {
        toast.warning(
          `For the most consistent banner, use 2400 × 800 px (3:1). This image is ${dimensions.width} × ${dimensions.height} px and will still be uploaded.`
        );
      }
    } catch {
      // Dimension guidance must never block a valid image upload.
    }

    setUploading(true);
    const supabase = await getSupabase();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${tenantId}/storefront/banner-bg.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error('Upload failed: ' + error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
    const nextImageUrl = publicUrl.split('?')[0] + '?t=' + Date.now();
    onChange('banner_bg_image_url', nextImageUrl);
    onChange('banner_edge_left_color', null);
    onChange('banner_edge_right_color', null);
    onChange('banner_position_x', 50);
    onChange('banner_position_y', 50);
    onChange('banner_zoom', STOREFRONT_BANNER_DEFAULT_ZOOM);
    await applyBannerEdgeColors(nextImageUrl);
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
    onChange('banner_edge_left_color', null);
    onChange('banner_edge_right_color', null);
    onChange('banner_position_x', 50);
    onChange('banner_position_y', 50);
    onChange('banner_zoom', STOREFRONT_BANNER_DEFAULT_ZOOM);
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
      const nextImageUrl = publicUrl.split('?')[0] + '?t=' + Date.now();
      onChange('banner_bg_image_url', nextImageUrl);
      onChange('banner_edge_left_color', null);
      onChange('banner_edge_right_color', null);
      onChange('banner_position_x', 50);
      onChange('banner_position_y', 50);
      onChange('banner_zoom', STOREFRONT_BANNER_DEFAULT_ZOOM);
      await applyBannerEdgeColors(nextImageUrl);
      toast.success('Banner updated');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
    setUploading(false);
  };

  const hasImage = !!form.banner_bg_image_url;
  const topOffset = bannerMetrics?.top ?? PREVIEW_HEADER_H * scaleFactor;
  const bannerH = bannerMetrics?.height ?? getStorefrontBannerHeight(form.banner_height_px) * scaleFactor;

  return (
    <>
      {/* Positioned overlay exactly over the banner area */}
      <div
        ref={overlayRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onPointerDown={hasImage ? handlePointerDown : undefined}
        onPointerMove={hasImage ? handlePointerMove : undefined}
        onPointerUp={hasImage ? handlePointerEnd : undefined}
        onPointerCancel={hasImage ? handlePointerEnd : undefined}
        style={{
          position: 'absolute',
          top: topOffset,
          left: 0, right: 0,
          height: bannerH,
          zIndex: 10,
          cursor: hasImage ? (gestureActive ? 'grabbing' : 'grab') : 'pointer',
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
            {!uploading && (
              <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>
                Recommended 2400 × 800 px · 3:1
              </span>
            )}
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
            {/* Zoom controls work with a mouse as well as touch pinch. */}
            <div data-no-drag="true" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(6px)', zIndex: 20 }}>
              <button data-no-drag="true" type="button" aria-label="Zoom out" onClick={(e) => { e.stopPropagation(); adjustZoom(-0.1); }} style={{ width: 26, height: 26, border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.14)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ZoomOut size={13} />
              </button>
              <button data-no-drag="true" type="button" aria-label="Reset banner position and zoom" onClick={(e) => { e.stopPropagation(); resetTransform(); }} style={{ minWidth: 50, height: 26, border: 'none', borderRadius: 999, background: 'transparent', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, fontWeight: 700 }}>
                <RotateCcw size={11} /> {Math.round(displayZoom * 100)}%
              </button>
              <button data-no-drag="true" type="button" aria-label="Zoom in" onClick={(e) => { e.stopPropagation(); adjustZoom(0.1); }} style={{ width: 26, height: 26, border: 'none', borderRadius: '50%', background: 'rgba(255,255,255,0.14)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ZoomIn size={13} />
              </button>
            </div>
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
            <div style={{ position: 'absolute', bottom: 6, left: 8, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '3px 8px', color: 'white', fontSize: 10, fontWeight: 500, pointerEvents: 'none' }}>
              2400 × 800 · 3:1 recommended
            </div>
            {/* Drag hint */}
            <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '3px 8px', color: 'white', fontSize: 10, fontWeight: 500, pointerEvents: 'none' }}>
              ✥ Drag · Pinch to zoom
            </div>
          </>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {editModalOpen && form.banner_bg_image_url && (
        <ImageEditModal
          src={form.banner_bg_image_url.split('?')[0]}
          themeColor={form.banner_bg_color || '#6366f1'}
          cropAspectRatio={3}
          preserveResolution={true}
          title="Edit Banner"
          recommendation="Recommended size: 2400 × 800 px (3:1)"
          onSave={handleEditSave}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </>
  );
}

const MENU_LAYOUTS = [
  { value: 'grid', label: 'Grid', description: 'Image-focused cards' },
  { value: 'list', label: 'List', description: 'More product detail' },
  { value: 'split', label: 'Split', description: 'Category sidebar' },
];

// Designer selections use a fixed editor accent so merchant theme colours
// cannot hide the selected state.
const DESIGNER_SELECTION_COLOR = '#7c3aed';

function getDesignerChoiceStyle(selected) {
  return {
    border: `2px solid ${selected ? DESIGNER_SELECTION_COLOR : '#e2e8f0'}`,
    background: selected ? '#f5f3ff' : '#ffffff',
    boxShadow: selected ? '0 3px 10px rgba(124,58,237,0.10)' : 'none',
    boxSizing: 'border-box',
    transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
  };
}

function DesignerSelectionBadge({ selected }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', minHeight: 22, marginTop: 8 }}>
      {selected && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '3px 6px', borderRadius: 999, background: DESIGNER_SELECTION_COLOR, color: '#ffffff',
          fontSize: 11, fontWeight: 700, lineHeight: '16px', maxWidth: '100%', boxSizing: 'border-box', flexWrap: 'wrap',
        }}>
          <Check size={12} strokeWidth={3} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>Selected</span>
        </span>
      )}
    </span>
  );
}

function LayoutPreview({ type, active }) {
  const ink = active ? DESIGNER_SELECTION_COLOR : '#94a3b8';
  const pale = active ? '#ddd6fe' : '#e2e8f0';
  const tile = { background: pale, borderRadius: 2 };

  if (type === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        {[0, 1, 2].map(item => (
          <div key={item} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ ...tile, width: 12, height: 12, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 3, borderRadius: 2, background: ink, opacity: 0.75, marginBottom: 3 }} />
              <div style={{ height: 2, width: '65%', borderRadius: 2, background: '#cbd5e1' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'split') {
    return (
      <div style={{ display: 'flex', gap: 5, width: '100%', height: '100%' }}>
        <div style={{ width: 15, borderRadius: 3, background: pale, display: 'flex', flexDirection: 'column', gap: 4, padding: 3 }}>
          {[0, 1, 2].map(item => <div key={item} style={{ height: 3, borderRadius: 2, background: ink, opacity: item === 0 ? 0.9 : 0.35 }} />)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map(item => (
            <div key={item} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <div style={{ ...tile, width: 10, height: 10 }} />
              <div style={{ height: 3, flex: 1, borderRadius: 2, background: item === 0 ? ink : '#cbd5e1', opacity: 0.75 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, width: '100%' }}>
      {[0, 1, 2, 3].map(item => (
        <div key={item} style={{ ...tile, height: 17, border: `1px solid ${active && item === 0 ? ink : 'transparent'}` }} />
      ))}
    </div>
  );
}

function LayoutChoiceCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      aria-label={option.label}
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...getDesignerChoiceStyle(selected),
        minWidth: 0, padding: 9, borderRadius: 12, cursor: 'pointer', textAlign: 'center',
      }}
    >
      <div style={{ height: 52, padding: 7, borderRadius: 8, background: selected ? '#ede9fe' : '#f8fafc', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <LayoutPreview type={option.value} active={selected} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', lineHeight: 1.3 }}>{option.label}</div>
      <DesignerSelectionBadge selected={selected} />
    </button>
  );
}

function MenuTabContent({ form, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ paddingBottom: 16 }}>
        <SectionLabel>Layout</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {MENU_LAYOUTS.map(option => (
            <LayoutChoiceCard
              key={option.value}
              option={option}
              selected={(form.product_layout || 'grid') === option.value}
              onSelect={() => onChange('product_layout', option.value)}
            />
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, paddingBottom: 8 }}>
        <Toggle
          checked={form.show_category_tabs !== false}
          onChange={v => onChange('show_category_tabs', v)}
          label="Category navigation"
        />
        <div style={{ paddingTop: 10, paddingBottom: 8 }}>
          <SectionLabel>Product density</SectionLabel>
          <PillToggle
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            value={form.menu_density || 'comfortable'}
            onChange={v => onChange('menu_density', v)}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, paddingBottom: 8 }}>
        <Toggle
          checked={form.show_featured !== false}
          onChange={v => onChange('show_featured', v)}
          label="Featured section"
        />
        {form.show_featured !== false && (
          <div style={{ paddingBottom: 8 }}>
            <SectionLabel>Title</SectionLabel>
            <Input value={form.featured_section_title || ''} onChange={e => onChange('featured_section_title', e.target.value)} placeholder="e.g. Today's Picks" className="text-sm" />
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, paddingBottom: 8 }}>
        <SectionLabel>Product cards</SectionLabel>
        <Toggle
          checked={form.show_product_description !== false}
          onChange={v => onChange('show_product_description', v)}
          label="Descriptions"
        />
        <Toggle
          checked={form.show_stock_badge !== false}
          onChange={v => onChange('show_stock_badge', v)}
          label="Stock status"
        />
      </div>
    </div>
  );
}

function StyleTabContent({ form, onChange }) {
  const selectedPersonality = getStorefrontTypographyPersonality(form.font_family);
  const selectedScale = getStorefrontTypographyScale(form.typography_scale);

  return (
    <div>
      <SectionLabel>Font</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {STOREFRONT_TYPOGRAPHY_PERSONALITIES.map(personality => {
          const selected = selectedPersonality.value === personality.value;
          return (
            <button
              key={personality.value}
              type="button"
              aria-label={personality.fontName}
              aria-pressed={selected}
              onClick={() => onChange('font_family', personality.value)}
              style={{
                ...getDesignerChoiceStyle(selected),
                minWidth: 0, minHeight: 110, padding: 12, borderRadius: 14,
                textAlign: 'left', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, lineHeight: 1.3, fontWeight: 700, color: '#1e293b' }}>{personality.fontName}</div>
              <div style={{ fontFamily: personality.stack, color: '#0f172a', fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 8 }}>Sample</div>
              <DesignerSelectionBadge selected={selected} />
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 16, paddingTop: 14 }}>
        <SectionLabel>Text size</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
          {STOREFRONT_TYPOGRAPHY_SCALES.map(option => {
            const selected = (form.typography_scale || 'balanced') === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={selected}
                onClick={() => onChange('typography_scale', option.value)}
                style={{
                  ...getDesignerChoiceStyle(selected),
                  minWidth: 0, padding: '10px 5px', borderRadius: 11,
                  color: '#334155', cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: selectedPersonality.stack, fontSize: 20 * option.multiplier, fontWeight: 700, lineHeight: 1.2 }}>Aa</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 7, lineHeight: 1.3 }}>{option.label}</div>
                <DesignerSelectionBadge selected={selected} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 16, paddingTop: 14 }}>
        <SectionLabel>Preview</SectionLabel>
        <div
          aria-live="polite"
          style={{
            padding: 14, borderRadius: 14, border: '1px solid #e2e8f0',
            background: 'linear-gradient(145deg, #ffffff, #f8fafc)',
            fontFamily: selectedPersonality.stack,
            boxShadow: '0 5px 16px rgba(15,23,42,0.05)',
          }}
        >
          <div style={{ fontSize: 22 * selectedScale, fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>Sample</div>
        </div>
      </div>
    </div>
  );
}

// Desktop editor panel (left side, ≥1024px)
function DesktopEditorControls({ form, onChange }) {
  const [activeTab, setActiveTab] = useState('banner');

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '16px 20px', paddingBottom: 24 }}>
        {activeTab === 'banner' && <BannerTabContent form={form} onChange={onChange} />}
        {activeTab === 'menu' && <MenuTabContent form={form} onChange={onChange} />}
        {activeTab === 'style' && <StyleTabContent form={form} onChange={onChange} />}
      </div>
    </div>
  );
}

// Mobile full-canvas layout with floating drawer
function MobileCanvasLayout({ form, onChange, tenantId, previewData, handleSave, saving }) {
  const [drawerTab, setDrawerTab] = useState('banner');
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_HANDLE_ONLY);
  const [jumpAnimating, setJumpAnimating] = useState(true);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const drawerRef = useRef(null);
  const drawerHeightRef = useRef(DRAWER_HANDLE_ONLY);
  const gestureRef = useRef(null);
  const dragFrameRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
  }, []);

  const primaryColor = form.banner_bg_color || '#fb923c';
  const MAX_DRAWER = Math.max(MIN_DRAWER, Math.round(window.innerHeight * 0.50));
  const drawerExpanded = drawerHeight > DRAWER_HANDLE_ONLY;
  const drawerTransition = 'height 280ms cubic-bezier(0.22, 1, 0.36, 1)';

  const cancelDragFrame = () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  };

  const snapDrawer = (targetH) => {
    cancelDragFrame();
    const nextHeight = Math.max(MIN_DRAWER, Math.min(MAX_DRAWER, targetH));
    drawerHeightRef.current = nextHeight;
    setIsDraggingDrawer(false);
    setDrawerHeight(nextHeight);
  };

  const startDrawerDrag = (e) => {
    if (!e.isPrimary || e.button !== 0 || gestureRef.current) return;
    setJumpAnimating(false);
    suppressClickRef.current = false;
    const startHeight = drawerRef.current?.getBoundingClientRect().height ?? drawerHeightRef.current;
    gestureRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight,
      currentHeight: startHeight,
      lastY: e.clientY,
      lastTime: e.timeStamp,
      velocity: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrawerDrag = (e) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const delta = gesture.startY - e.clientY;
    // Ignore finger jitter so a tap still reliably toggles the drawer.
    if (!gesture.moved && Math.abs(delta) < 6) return;
    if (!gesture.moved) {
      gesture.moved = true;
      setIsDraggingDrawer(true);
    }
    const elapsed = e.timeStamp - gesture.lastTime;
    if (elapsed > 0) gesture.velocity = (gesture.lastY - e.clientY) / elapsed;
    gesture.lastY = e.clientY;
    gesture.lastTime = e.timeStamp;
    gesture.currentHeight = Math.max(MIN_DRAWER, Math.min(MAX_DRAWER, gesture.startHeight + delta));
    drawerHeightRef.current = gesture.currentHeight;
    // At most one height update per display frame while following the finger.
    if (dragFrameRef.current === null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        if (gestureRef.current === gesture) setDrawerHeight(gesture.currentHeight);
      });
    }
  };

  const endDrawerDrag = (e) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (!gesture.moved) return; // The button click below handles taps.
    suppressClickRef.current = true;
    const velocity = e.timeStamp - gesture.lastTime < 100 ? gesture.velocity : 0;
    const midpoint = (MIN_DRAWER + MAX_DRAWER) / 2;
    const shouldOpen = Math.abs(velocity) > 0.35
      ? velocity > 0
      : gesture.currentHeight >= midpoint;
    snapDrawer(shouldOpen ? MAX_DRAWER : DRAWER_HANDLE_ONLY);
  };

  const cancelDrawerDrag = (e) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    suppressClickRef.current = false;
    const midpoint = (MIN_DRAWER + MAX_DRAWER) / 2;
    snapDrawer(gesture.startHeight >= midpoint ? MAX_DRAWER : DRAWER_HANDLE_ONLY);
  };

  const toggleDrawer = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setJumpAnimating(false);
    snapDrawer(drawerHeightRef.current >= MAX_DRAWER - 1 ? DRAWER_HANDLE_ONLY : MAX_DRAWER);
  };

  const canvasHeight = `calc(100% - ${drawerHeight}px)`;

  return (
    <>
      {/* Canvas and drawer move together; inner scrolling stays contained. */}
      <div
        className="sellio-designer-canvas"
        onClick={() => { if (drawerExpanded) snapDrawer(DRAWER_HANDLE_ONLY); }}
        style={{
          height: canvasHeight, overflow: 'auto', background: '#f0f2f7', position: 'relative',
          overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
          transition: isDraggingDrawer ? 'none' : drawerTransition,
        }}
      >
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

      <div
        ref={drawerRef}
        className={`sellio-designer-drawer${jumpAnimating && !drawerExpanded ? ' sellio-designer-drawer-hint' : ''}`}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: drawerHeight,
          background: 'white',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          transition: isDraggingDrawer ? 'none' : drawerTransition,
          zIndex: 100,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <style>{`
          @keyframes sellioDrawerHint {
            0%, 75%, 100% { transform: translateY(0); }
            20% { transform: translateY(-14px); }
            40% { transform: translateY(0); }
            55% { transform: translateY(-7px); }
          }
          .sellio-designer-drawer-hint {
            animation: sellioDrawerHint 1.8s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .sellio-designer-drawer-hint { animation: none; }
            .sellio-designer-drawer, .sellio-designer-canvas { transition: none !important; }
          }
        `}</style>
        {/* The line stays small; the full-width touch target is 48px tall. */}
        <button
          type="button"
          aria-label={drawerExpanded ? 'Close design controls' : 'Open design controls'}
          aria-expanded={drawerExpanded}
          aria-controls="sellio-mobile-design-controls"
          onPointerDown={startDrawerDrag}
          onPointerMove={moveDrawerDrag}
          onPointerUp={endDrawerDrag}
          onPointerCancel={cancelDrawerDrag}
          onLostPointerCapture={cancelDrawerDrag}
          onClick={toggleDrawer}
          style={{
            height: DRAWER_HANDLE_ONLY, width: '100%', padding: 0, border: 'none',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isDraggingDrawer ? 'grabbing' : 'grab', flexShrink: 0,
            touchAction: 'none', userSelect: 'none',
          }}
        >
          <span
            style={{ display: 'block', width: 48, height: 5, borderRadius: 3, background: primaryColor, opacity: 0.85 }}
          />
        </button>

        {/* Keep content mounted so opening and closing do not flash or reset fields. */}
        <div
          id="sellio-mobile-design-controls"
          aria-hidden={!drawerExpanded}
          inert={drawerExpanded ? undefined : ''}
          style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', gap: 6, padding: '4px 16px 0', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDrawerTab(tab.id);
                  snapDrawer(MAX_DRAWER);
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

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 16px' }}>
            {drawerTab === 'banner' && <BannerTabContent form={form} onChange={onChange} />}
            {drawerTab === 'menu' && <MenuTabContent form={form} onChange={onChange} />}
            {drawerTab === 'style' && <StyleTabContent form={form} onChange={onChange} />}
          </div>

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
        </div>
      </div>
    </>
  );
}

function DesktopPreviewWorkspace({ form, onChange, tenantId, previewData }) {
  const [deviceId, setDeviceId] = useState('desktop');
  const [zoomMode, setZoomMode] = useState('fit');
  const [previewScale, setPreviewScale] = useState(1);
  const stageAreaRef = useRef(null);

  const device = PREVIEW_DEVICES.find(option => option.id === deviceId) || PREVIEW_DEVICES[0];
  const frameHeight = device.height + PREVIEW_BROWSER_BAR_HEIGHT + PREVIEW_FRAME_BORDER;
  const previewIsDesktop = device.width >= 768;
  const previewIsLandscape = device.width > device.height;

  useEffect(() => {
    const stageArea = stageAreaRef.current;
    if (!stageArea) return;

    const updateScale = () => {
      if (zoomMode === 'actual') {
        setPreviewScale(1);
        return;
      }

      const rect = stageArea.getBoundingClientRect();
      const horizontalRoom = Math.max(1, rect.width - 40);
      const verticalRoom = Math.max(1, rect.height - 32);
      const nextScale = Math.min(
        1,
        horizontalRoom / device.width,
        verticalRoom / frameHeight
      );
      setPreviewScale(Math.max(0.35, nextScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stageArea);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [device.width, frameHeight, zoomMode]);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#eef2f7' }}>
      <div style={{
        minHeight: 58,
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.94)',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <div>
          <p style={{ margin: 0, color: '#0f172a', fontSize: 13, fontWeight: 700 }}>Live storefront</p>
          <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 11 }}>Preview uses the exact selected viewport</p>
        </div>

        <div role="group" aria-label="Preview device" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#f1f5f9' }}>
          {PREVIEW_DEVICES.map(option => {
            const Icon = option.icon;
            const selected = option.id === device.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setDeviceId(option.id)}
                style={{
                  height: 34, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: 'none', borderRadius: 9, background: selected ? 'white' : 'transparent',
                  color: selected ? '#0f172a' : '#64748b',
                  boxShadow: selected ? '0 1px 4px rgba(15,23,42,0.12)' : 'none',
                  fontSize: 12, fontWeight: selected ? 700 : 500, cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                {option.label}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Preview zoom" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 10, background: '#f1f5f9' }}>
          {[
            { id: 'fit', label: `Fit · ${Math.round(previewScale * 100)}%` },
            { id: 'actual', label: '100%' },
          ].map(option => {
            const selected = option.id === zoomMode;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setZoomMode(option.id)}
                style={{
                  height: 30, padding: '0 10px', border: 'none', borderRadius: 7,
                  background: selected ? 'white' : 'transparent', color: selected ? '#0f172a' : '#64748b',
                  boxShadow: selected ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
                  fontSize: 11, fontWeight: selected ? 700 : 500, cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={stageAreaRef}
        style={{
          flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'block',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{
          position: 'relative',
          width: device.width * previewScale,
          height: frameHeight * previewScale,
          flexShrink: 0,
          margin: '0 auto',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: device.width,
            transform: `scale(${previewScale})`, transformOrigin: 'top left',
            background: 'white',
            border: '1px solid #cbd5e1', borderRadius: 14,
            boxShadow: '0 20px 50px rgba(15,23,42,0.18)',
          }}>
            <div style={{
              height: PREVIEW_BROWSER_BAR_HEIGHT, padding: '0 12px', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              borderRadius: '13px 13px 0 0', color: '#64748b', fontSize: 11,
            }}>
              <div aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
              </div>
              <span style={{
                maxWidth: '60%', padding: '4px 14px', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                border: '1px solid #e2e8f0', borderRadius: 999, background: 'white',
              }}>
                sellio.apptelier.sg/store
              </span>
              <span style={{ minWidth: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {device.width} × {device.height}
              </span>
            </div>

            <div
              key={device.id}
              style={{
                height: device.height, overflowY: 'auto', overflowX: 'hidden',
                position: 'relative', borderRadius: '0 0 13px 13px',
                overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
                background: '#f8fafc',
              }}
            >
              <StorefrontView
                previewMode={true}
                tenant={previewData.tenant}
                storefrontConfig={form}
                theme={null}
                products={previewData.products}
                categories={previewData.categories}
                cart={[]}
                cartCount={0}
                cartTotal={0}
                setShowCart={() => {}}
                setShowOrderHistory={() => {}}
                onAddToCart={() => {}}
                isDesktop={previewIsDesktop}
                isLandscape={previewIsLandscape}
              />
              <BannerCanvasOverlay
                form={form}
                onChange={onChange}
                tenantId={tenantId}
                scaleFactor={previewScale}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StorefrontDesignerInner({ open, onClose, tenantId, tenantSlug }) {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [previewProducts, setPreviewProducts] = useState([]);
  const [previewCategories, setPreviewCategories] = useState([]);
  const [previewTenant, setPreviewTenant] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const storeUrl = `https://sellio.apptelier.sg/store/${tenantSlug}?preview=true`;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setLeaveDialogOpen(false);
    if (open) {
      setTimeout(() => setVisible(true), 10);
      loadConfig();
    } else {
      setVisible(false);
    }
  }, [open]);

  const loadConfig = async () => {
    const supabase = await getSupabase();
    const draftKey = `storefront_draft_${tenantId}`;
    let draftForm = null;

    try {
      const draft = sessionStorage.getItem(draftKey);
      if (draft) draftForm = JSON.parse(draft);
    } catch {
      sessionStorage.removeItem(draftKey);
    }

    try {
      const [configRes, catalog, tenantRes, themeRes] = await Promise.all([
        supabase.from('storefront_configs').select('*').eq('tenant_id', tenantId).maybeSingle(),
        fetchStorefrontCatalog(supabase, tenantId),
        supabase.from('tenants').select('name, logo_url, currency, address, settings').eq('id', tenantId).maybeSingle(),
        supabase.from('theme_configs').select('primary_color').eq('tenant_id', tenantId).maybeSingle(),
      ]);

      const tenantPrimaryColor = themeRes.data?.primary_color || null;
      setForm(draftForm
        ? { ...DEFAULTS, ...draftForm }
        : configRes.data
          ? { ...DEFAULTS, ...configRes.data }
          : { ...DEFAULTS, ...(tenantPrimaryColor ? { banner_bg_color: tenantPrimaryColor } : {}) }
      );
      setPreviewProducts(catalog.products);
      setPreviewCategories(catalog.categories);
      setPreviewTenant(tenantRes.data);
    } catch (error) {
      toast.error(`Unable to refresh storefront preview: ${error.message || 'Unknown error'}`);
    }
  };

  // Keep an already-open Design Store canvas aligned with Products. Realtime
  // handles edits from this or another tab; focus/visibility refreshes provide
  // a second path after the browser or device has been suspended.
  useEffect(() => {
    if (!open || !tenantId) return;

    let cancelled = false;
    let channel = null;
    let refreshInFlight = false;

    const refreshCatalog = async () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const supabase = await getSupabase();
        const catalog = await fetchStorefrontCatalog(supabase, tenantId);
        if (!cancelled) {
          setPreviewProducts(catalog.products);
          setPreviewCategories(catalog.categories);
        }
      } catch {
        // The next Realtime/focus event retries; keep the current preview stable.
      } finally {
        refreshInFlight = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshCatalog();
    };

    window.addEventListener('focus', refreshCatalog);
    document.addEventListener('visibilitychange', handleVisibility);

    getSupabase().then(supabase => {
      if (cancelled) return;
      channel = supabase
        .channel(`storefront_designer_catalog_${tenantId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` }, refreshCatalog)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${tenantId}` }, refreshCatalog)
        .subscribe();
    });

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshCatalog);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) channel.unsubscribe();
    };
  }, [open, tenantId]);

  const closeDesigner = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleClose = () => {
    const draft = sessionStorage.getItem(`storefront_draft_${tenantId}`);
    if (draft) {
      setLeaveDialogOpen(true);
      return;
    }
    closeDesigner();
  };

  const handleDiscardAndClose = () => {
    sessionStorage.removeItem(`storefront_draft_${tenantId}`);
    setLeaveDialogOpen(false);
    closeDesigner();
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
      'banner_edge_left_color', 'banner_edge_right_color',
      'banner_height', 'banner_height_px', 'banner_position_x', 'banner_position_y', 'banner_zoom',
      'show_promo_ticker', 'product_layout', 'menu_density',
      'show_featured', 'featured_section_title', 'show_category_tabs',
      'show_product_description', 'show_stock_badge', 'font_family', 'typography_scale',
    ];

    const payload = {};
    for (const key of ALLOWED) {
      const val = form[key];
      if (key === 'banner_position_x' || key === 'banner_position_y') {
        payload[key] = Number.isFinite(Number(val)) ? Math.round(Number(val)) : 50;
      } else if (key === 'banner_height_px') {
        payload[key] = getStorefrontBannerHeight(val);
      } else if (key === 'banner_zoom') {
        payload[key] = getStorefrontBannerZoom(val);
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
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent
          overlayClassName="z-[210] bg-black/50"
          className="z-[211] w-[calc(100%-2rem)] max-w-sm rounded-2xl border-slate-200 bg-white p-6 text-slate-900"
        >
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              Your store design has unsaved changes. Keep editing to save them, or discard them and leave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:space-x-0">
            <AlertDialogCancel className="mt-0 rounded-xl">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-purple-600 text-white hover:bg-purple-700"
              onClick={handleDiscardAndClose}
            >
              Discard &amp; leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              />
              {/* Desktop Save */}
              <div className="flex gap-2 p-4 border-t border-slate-100 bg-white flex-shrink-0">
                <Button onClick={handleSave} disabled={saving} className="flex-1 rounded-full"
                  style={{ background: 'var(--color-primary-gradient)', color: 'white', border: 'none', fontWeight: 600 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>

            <DesktopPreviewWorkspace
              form={form}
              onChange={handleChange}
              tenantId={tenantId}
              previewData={{
                tenant: previewTenant,
                products: previewProducts,
                categories: previewCategories,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function StorefrontDesigner(props) {
  return (
    <LanguageProvider>
      <StorefrontDesignerInner {...props} />
    </LanguageProvider>
  );
}