/**
 * StorefrontView — the single shared component rendered by BOTH:
 *   1. pages/Storefront.jsx (live public store)
 *   2. StorefrontDesigner preview canvas
 *
 * Props when used in preview mode:
 *   previewMode: true
 *   tenant, storefrontConfig, products, categories — passed in directly
 *
 * Props when used in live mode:
 *   All state is managed internally via useParams + Supabase fetches
 */
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from 'react';
import {
  Coffee, UtensilsCrossed, IceCream, Salad, Sandwich,
  Drumstick, Tag, Gift, LayoutGrid, ShoppingCart, Clock,
  Cpu, Glasses, Shirt, Trophy, BookOpen, Home, PawPrint,
  Gem, Wrench, Scissors, Sparkles, Search, X, Plus
} from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { useLanguage, useTranslatedText, useTranslatedTexts } from '@/lib/LanguageContext';

// ── Currency symbol helper ───────────────────────────────────────────────────
// Returns display symbol: SGD→"$", MYR→"RM ", USD→"$", GBP→"£", EUR→"€"
const getCurrencySymbol = (c) => ({ SGD:'$', MYR:'RM ', USD:'$', AUD:'A$', GBP:'£', EUR:'€' }[c] || (c + ' '));

// ── Category icon resolver ──────────────────────────────────────────────────
function getCategoryIcon(name = '') {
  const n = name.toLowerCase();
  // F&B
  if (/drink|beverage|coffee|tea|juice|milk|boba|bubble/.test(n)) return Coffee;
  if (/food|meal|rice|noodle|pasta|main|dinner|lunch/.test(n)) return UtensilsCrossed;
  if (/dessert|cake|sweet|pastry|ice.?cream|waffle|crepe/.test(n)) return IceCream;
  if (/snack|appetizer|starter|side/.test(n)) return Salad;
  if (/pizza|burger|sandwich|wrap|toast/.test(n)) return Sandwich;
  if (/chicken|meat|beef|pork|seafood|fish/.test(n)) return Drumstick;
  if (/set|combo|bundle|promo|deal/.test(n)) return Tag;
  // Retail
  if (/electron|gadget|tech|device|phone|computer|laptop|tablet/.test(n)) return Cpu;
  if (/eyewear|glasses|spectacle|sunglass|lens|optical/.test(n)) return Glasses;
  if (/cloth|fashion|apparel|wear|shirt|dress|pant|shoe|bag|accessory/.test(n)) return Shirt;
  if (/beauty|skincare|cosmetic|makeup|hair|health|wellness/.test(n)) return Sparkles;
  if (/toy|game|sport|outdoor|hobby/.test(n)) return Trophy;
  if (/book|stationery|office|school/.test(n)) return BookOpen;
  if (/home|furniture|decor|kitchen|garden/.test(n)) return Home;
  if (/pet|animal/.test(n)) return PawPrint;
  if (/jewel|watch|ring|necklace/.test(n)) return Gem;
  if (/merch|gift|souvenir/.test(n)) return Gift;
  // Services
  if (/repair|consult|appointment|service/.test(n)) return Wrench;
  if (/salon|spa|nail|massage/.test(n)) return Scissors;
  return LayoutGrid;
}

// ── Hex color → rgba(r, g, b, alpha) helper ─────────────────────────────────
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Sticky header bar ────────────────────────────────────────────────────────
const StorefrontHeader = forwardRef(function StorefrontHeader({ tenant, primaryColor, cartCount, onCartClick, onHistoryClick, showBackButton = false, isDesktop = false, searchOpen, setSearchOpen, searchQuery, setSearchQuery }, ref) {
  const branchName = tenant?.settings?.branch_name;
  const address = tenant?.address || '';
  const truncatedAddress = address.length > 25 ? address.slice(0, 25) + '…' : address;

  let subLine = '';
  if (branchName && truncatedAddress) {
    subLine = `📍 ${branchName} · ${truncatedAddress}`;
  } else if (branchName) {
    subLine = `📍 ${branchName}`;
  } else if (truncatedAddress) {
    subLine = `📍 ${truncatedAddress}`;
  }

  const tintBg = hexToRgba(primaryColor, 0.10);
  const iconBtnBase = { width: 36, height: 36, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
  const iconBtnNeutral = { ...iconBtnBase, background: tintBg };

  const headerHeight = (subLine ? 64 : 56) + 20;

  return (
    <>
    <div ref={ref} style={{
      position: 'sticky', top: 0, zIndex: 50,
      height: headerHeight,
      background: '#ffffff',
      display: 'flex', alignItems: 'center',
      padding: '0 14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      {/* Left: logo + name */}
      {showBackButton && (
        <button
          onClick={() => window.location.href = '/Dashboard'}
          style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {tenant?.logo_url ? (
          <div style={{ ...iconBtnBase, background: '#f1f5f9', overflow: 'hidden', padding: 0, flexShrink: 0 }}>
            <img src={tenant.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ ...iconBtnBase, background: '#f1f5f9', fontWeight: 700, fontSize: 16, color: '#374151', flexShrink: 0 }}>
            {tenant?.name?.[0] || 'S'}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#111827', fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tenant?.name || ''}
          </div>
          {subLine && (
            <a
              href={address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'block', color: '#6b7280', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, textDecoration: 'none' }}
            >
              {subLine}
            </a>
          )}
        </div>
      </div>

      {/* Right: Language toggle, then History + Cart. Search moved to a
          scroll-triggered floating button (see ScrollSearchButton below) since
          it now needs to work regardless of which section is on screen, not
          just live in the header. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <LanguageToggle primaryColor={primaryColor} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onHistoryClick} style={iconBtnNeutral}>
            <Clock size={17} color="#374151" />
          </button>
          <button onClick={onCartClick} style={{ ...iconBtnNeutral, position: 'relative' }}>
            <ShoppingCart size={17} color="#374151" />
            {cartCount > 0 && (
              <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  );
});

// ── Banner area (below header, behind it effectively) ─────────────────────
function StorefrontBanner({ primaryColor, bannerBgImage, positionX, positionY }) {
  return (
    <div style={{
      width: '100%',
      height: 'clamp(220px, 25vw, 300px)',
      flexShrink: 0,
      position: 'relative',
      ...(bannerBgImage
        ? { backgroundImage: `url('${bannerBgImage}')`, backgroundSize: 'cover', backgroundPosition: `${positionX ?? 50}% ${positionY ?? 50}%`, backgroundRepeat: 'no-repeat' }
        : { background: primaryColor }
      ),
    }}>
      {/* No dark overlay — image displays at full brightness */}
    </div>
  );
}

// Scrolling promo ticker — sits right at the bottom edge of the banner, where
// the old static headline/tagline text used to be. Messages are joined into
// one continuous string with a separator and duplicated once so the loop
// wraps seamlessly with no visible gap or jump.
function PromoMarquee({ messages, primaryColor }) {
  if (!messages || messages.length === 0) return null;
  const joined = messages.join('   •   ');
  return (
    <div style={{
      background: primaryColor, overflow: 'hidden', padding: '7px 0', whiteSpace: 'nowrap',
    }}>
      <style>{`
        @keyframes sfPromoScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .sf-promo-track { display: inline-block; animation: sfPromoScroll ${Math.max(12, messages.join(' ').length * 0.25)}s linear infinite; }
      `}</style>
      <div className="sf-promo-track">
        <span style={{ color: 'white', fontSize: 13, fontWeight: 600, paddingRight: 40 }}>{joined}</span>
        <span style={{ color: 'white', fontSize: 13, fontWeight: 600, paddingRight: 40 }}>{joined}</span>
      </div>
    </div>
  );
}

// ── Category sidebar item ────────────────────────────────────────────────────
function CategorySidebarItem({ cat, isActive, primaryColor, onClick, contentMap = {} }) {
  const Icon = getCategoryIcon(cat.name);
  const catName = contentMap[cat.name] || cat.name;
  const tintBg = hexToRgba(primaryColor, 0.08);
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'center', padding: '12px 6px',
        border: 'none', cursor: 'pointer',
        background: isActive ? tintBg : 'transparent',
        borderLeft: isActive ? `3px solid ${primaryColor}` : '3px solid transparent',
        transition: 'all 0.15s', display: 'block',
      }}
    >
      <Icon size={20} style={{ color: isActive ? '#374151' : '#9ca3af', display: 'block', margin: '0 auto 4px' }} />
      <div style={{
        fontSize: 10, fontWeight: isActive ? 600 : 400,
        color: isActive ? '#374151' : '#6b7280',
        lineHeight: 1.25, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
      }}>{catName}</div>
    </button>
  );
}

// ── Main exported component ──────────────────────────────────────────────────
export default function StorefrontView({
  // preview mode: pass data directly
  previewMode = false,
  showBackButton = false,
  onProductModalChange,
  tenant: tenantProp,
  storefrontConfig: storefrontConfigProp,
  theme: themeProp,
  products: productsProp,
  categories: categoriesProp,
  // live mode: pass state setters (optional — live mode manages internally)
  cart = [],
  setCart,
  showCart,
  setShowCart,
  showOrderHistory,
  setShowOrderHistory,
  onAddToCart,
  cartCount = 0,
  cartTotal = 0,
  isDesktop: isDesktopProp,
}) {
  const { t } = useLanguage();
  const tenant = tenantProp;
  const storefrontConfig = storefrontConfigProp;
  const theme = themeProp;
  const products = productsProp || [];
  const categories = categoriesProp || [];

  const primaryColor = storefrontConfig?.banner_bg_color || theme?.primary_color || '#6366f1';
  const currency = tenant?.currency || 'SGD';
  const productLayout = storefrontConfig?.product_layout || 'split';
  const bannerBgImage = storefrontConfig?.banner_bg_image_url || null;
  const showStockBadge = storefrontConfig?.show_stock_badge !== false;

  // Split layout state
  const [activeCategory, setActiveCategory] = useState(null);
  const categoryRefs = useRef({});
  const splitRightRef = useRef(null);
  const rootRef = useRef(null);

  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(84);
  // ResizeObserver instead of a naive every-render measurement - reacts
  // properly to font-load reflow, orientation change, or the subline
  // appearing/disappearing, without re-measuring on every single render.
  useEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const splitSearchBarRef = useRef(null);
  const [splitSearchBarHeight, setSplitSearchBarHeight] = useState(0);
  useEffect(() => {
    if (!splitSearchBarRef.current) { setSplitSearchBarHeight(0); return; }
    const el = splitSearchBarRef.current;
    const update = () => setSplitSearchBarHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewMode, searchOpen]);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [itemNotes, setItemNotes] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Screen-size-based (not staff-mode-based, per merchant's explicit direction) -
  // a customer browsing on their own tablet benefits from this too, not just
  // staff taking orders. Prefers the isDesktop prop (passed down from
  // Storefront.jsx, which owns the persistent cart sidebar this needs to stay
  // in sync with); falls back to computing it locally for preview mode, where
  // no such prop is passed.
  const [isDesktopFallback, setIsDesktopFallback] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    if (isDesktopProp !== undefined) return;
    const check = () => setIsDesktopFallback(window.innerWidth >= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [isDesktopProp]);
  const isDesktop = isDesktopProp !== undefined ? isDesktopProp : isDesktopFallback;

  // Portrait vs landscape, independent of the isDesktop breakpoint - a merchant
  // asked specifically for 3 Grid columns on tablet portrait and 4 on
  // landscape, so this needs its own check rather than reusing width alone.
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' && window.innerWidth > window.innerHeight);
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  const [showFloatingSearch, setShowFloatingSearch] = useState(false);
  useEffect(() => {
    if (!previewMode) {
      const handleScroll = () => setShowFloatingSearch(window.scrollY > 180);
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
    // Preview mode never scrolls the real window — StorefrontView sits inside
    // a fixed-height, internally-scrolling container owned by StorefrontDesigner
    // (the mobile canvas or the desktop phone mockup). Walk up from our own
    // root node to find that scrollable ancestor rather than assuming a fixed
    // DOM depth, since the two preview layouts nest it differently.
    let el = rootRef.current?.parentElement;
    let scrollParent = null;
    let depth = 0;
    while (el && depth < 8) {
      const cs = window.getComputedStyle(el);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') { scrollParent = el; break; }
      el = el.parentElement;
      depth++;
    }
    if (!scrollParent) return;
    const handleScroll = () => setShowFloatingSearch(scrollParent.scrollTop > 180);
    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [previewMode]);

  const featuredProducts = products.filter(p => p.is_featured === true);
  const hasFeatured = featuredProducts.length > 0;
  const categoriesWithProducts = categories.filter(cat => products.some(p => p.category_id === cat.id));
  const uncategorised = products.filter(p => !p.is_featured && !categories.some(c => c.id === p.category_id));

  // ── One batched translation request covers EVERY piece of merchant content
  // on this page (all product names/descriptions, all category names, the
  // featured section title) — regardless of which layout is active. This
  // replaces what used to be a separate network call per product card.
  const allContentTexts = useMemo(() => {
    const s = new Set();
    products.forEach(p => { if (p.name) s.add(p.name); if (p.description) s.add(p.description); });
    categories.forEach(c => { if (c.name) s.add(c.name); });
    if (storefrontConfig?.featured_section_title) s.add(storefrontConfig.featured_section_title);
    return [...s];
  }, [products, categories, storefrontConfig?.featured_section_title]);
  const contentMap = useTranslatedTexts(allContentTexts);
  const tr = (text) => contentMap[text] || text;

  // Promotional marquee - replaces the old static headline/tagline overlay on
  // the banner, which just repeated the business name already shown right
  // below it. Reuses those same two fields as an optional custom override
  // (so a merchant who already set them keeps seeing their own text, no
  // re-configuration needed) - when both are empty, falls back to
  // auto-generating from Featured items and Special Deals, so every merchant
  // gets a working promo banner with zero setup.
  const promoMessages = useMemo(() => {
    const custom = [storefrontConfig?.banner_headline, storefrontConfig?.banner_tagline].filter(Boolean);
    if (custom.length > 0) return custom;
    const specialDeals = products.filter(p => p.compare_at_price > p.price && !p.is_featured);
    const auto = [
      ...featuredProducts.map(p => `⭐ ${tr(p.name)}`),
      ...specialDeals.map(p => `🏷️ ${tr(p.name)} — now ${getCurrencySymbol(currency)}${parseFloat(p.price).toFixed(2)}`),
    ];
    return auto;
  }, [storefrontConfig?.banner_headline, storefrontConfig?.banner_tagline, featuredProducts, products, contentMap, currency]);

  // Filters by name and description (merchants often put distinguishing detail
  // in the description), independent of which layout is active. When a search
  // is active it takes over the product list entirely - category/split
  // sectioning is temporarily bypassed rather than trying to search within
  // each section separately.
  const searchActive = searchQuery.trim().length > 0;
  const searchedProducts = searchActive
    ? products.filter(p => {
        const q = searchQuery.trim().toLowerCase();
        const name = (contentMap[p.name] || p.name || '').toLowerCase();
        const desc = (contentMap[p.description] || p.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
    : null;

  // Set first active section on load (deals first if present)
  useEffect(() => {
    if (!activeCategory) {
      if (hasFeatured) setActiveCategory('__deals__');
      else if (categoriesWithProducts.length > 0) setActiveCategory(categoriesWithProducts[0].id);
    }
  }, [hasFeatured, categoriesWithProducts.length]);

  // Intersection observer for active category tracking
  useEffect(() => {
    if (productLayout !== 'split') return;
    const root = previewMode ? splitRightRef.current : null;
    if (previewMode && !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          setActiveCategory(intersecting[0].target.dataset.categoryId);
        }
      },
      { root, threshold: 0.1, rootMargin: previewMode ? '0px 0px -60% 0px' : `-${headerHeight + 40}px 0px -60% 0px` }
    );
    Object.values(categoryRefs.current).forEach(ref => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, [productLayout, categories.length, products.length, previewMode, headerHeight]);

  const scrollToCategory = (categoryId) => {
    categoryRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveCategory(categoryId);
  };

  const handleAddToCart = (product, variant = null, notes = null) => {
    if (onAddToCart) onAddToCart(product, variant, notes);
  };

  const handleProductClick = (product) => {
    if (!previewMode) {
      setSelectedProduct(product);
      setActiveImageIndex(0);
      onProductModalChange?.(true);
    }
  };

  // Determine heights for split layout
  // Header is sticky at top (56px), banner is below header (220px min)
  // Split panel fills rest of viewport
  // Split's height/overflow used to be capped and clipped in preview mode
  // (fixed 300px, hidden overflow) so it would fit inside the small mockup
  // frame without needing real scroll wiring. That meant the menu never fully
  // loaded in preview and left dead grey space below it. Now that preview's
  // outer canvas/mockup container is the thing that scrolls (same idea as the
  // live page), Split can flow at its natural height in both modes.
  const splitPanelHeight = 'auto';
  const splitPanelOverflow = 'visible';

  return (
    <div ref={rootRef} style={{
      fontFamily: `${storefrontConfig?.font_family || 'Inter'}, sans-serif`,
      maxWidth: (previewMode || isDesktop) ? '100%' : 480,
      margin: '0 auto',
      minHeight: previewMode ? '100%' : '100vh',
      background: '#f8fafc',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        .sf-no-scrollbar::-webkit-scrollbar { display: none; }
        .sf-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── STICKY HEADER ── */}
      <PromoMarquee messages={promoMessages} primaryColor={primaryColor} />

      <StorefrontHeader
        ref={headerRef}
        tenant={tenant}
        primaryColor={primaryColor}
        cartCount={cartCount}
        onCartClick={() => setShowCart?.(true)}
        onHistoryClick={() => setShowOrderHistory?.(true)}
        showBackButton={showBackButton}
        isDesktop={isDesktop}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* ── BANNER (below header) ── */}
      <div style={{ position: 'relative' }}>
        <StorefrontBanner
          primaryColor={primaryColor}
          bannerBgImage={bannerBgImage}
          positionX={storefrontConfig?.banner_position_x}
          positionY={storefrontConfig?.banner_position_y}
        />
      </div>

      {/* ── ANNOUNCEMENT BAR ── */}
      {storefrontConfig?.show_announcement_bar && storefrontConfig?.announcement_text && (
        <div style={{ background: `${primaryColor}20`, padding: '10px 16px', textAlign: 'center' }}>
          <p style={{ color: primaryColor, fontSize: 13, fontWeight: 500, margin: 0 }}>📢 {storefrontConfig.announcement_text}</p>
        </div>
      )}

      {/* ── WHITE CONTENT SHEET ── */}
      <div style={{
        background: 'white',
        borderRadius: '20px 20px 0 0',
        flex: 1,
        overflow: (productLayout === 'split' && !searchActive) ? 'hidden' : 'visible',
        marginTop: -24,
        position: 'relative',
        zIndex: 2,
      }}>

        {searchActive ? (
          <div style={{ padding: '16px 16px 40px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 12px' }}>
              {searchedProducts.length} result{searchedProducts.length === 1 ? '' : 's'} for "{searchQuery.trim()}"
            </p>
            {searchedProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                <p style={{ fontSize: 32, margin: '0 0 12px' }}>🔍</p>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>No products match "{searchQuery.trim()}"</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isDesktop ? (isLandscape ? 4 : 3) : 2}, 1fr)`, gap: 10 }}>
                {searchedProducts.map(product => (
                  <GridCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={handleAddToCart} onProductClick={handleProductClick} contentMap={contentMap} />
                ))}
              </div>
            )}
          </div>
        ) : productLayout === 'split' ? (
          <>
          {(showFloatingSearch || searchOpen) && (
            <div style={{ position: 'fixed', top: headerHeight + 10, right: 14, zIndex: 45 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSearchOpen(v => !v)}
                  style={{
                    width: 34, height: 34, borderRadius: '50%', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: searchOpen ? primaryColor : 'white',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                  }}
                >
                  <Search size={16} color={searchOpen ? 'white' : primaryColor} />
                </button>
              </div>
              {searchOpen && (
                <div style={{ marginTop: 8, width: 240, padding: 8, borderRadius: 12, background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search menu..."
                      style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', height: splitPanelHeight, overflow: splitPanelOverflow }}>
            {/* Left category sidebar - sticky below the header+search bar on
                live/desktop so it stays pinned and visible as the now-
                naturally-flowing content scrolls past it, matching how it
                used to behave with its own bounded internal scroll. */}
            <div className="sf-no-scrollbar" style={{
              width: isDesktop ? 180 : 'clamp(72px, 20vw, 100px)',
              flexShrink: 0,
              overflowY: 'auto',
              position: 'sticky',
              top: headerHeight,
              // 100vh is the real browser viewport, not the small preview
              // mockup frame — in preview just let the sidebar size to its own
              // content instead of forcing a viewport-relative height.
              height: previewMode ? undefined : `calc(100vh - ${headerHeight}px)`,
              borderRight: '1px solid #f1f5f9',
              background: '#fafafa',
            }}>
              {hasFeatured && (
                <CategorySidebarItem
                  cat={{ id: '__deals__', name: `${t('todaysPicks')} ⭐` }}
                  isActive={activeCategory === '__deals__'}
                  primaryColor={primaryColor}
                  onClick={() => scrollToCategory('__deals__')}
                />
              )}
              {categoriesWithProducts.map(cat => (
                <CategorySidebarItem
                  key={cat.id}
                  cat={cat}
                  isActive={activeCategory === cat.id}
                  primaryColor={primaryColor}
                  onClick={() => scrollToCategory(cat.id)}
                  contentMap={contentMap}
                />
              ))}
              {uncategorised.length > 0 && (
                <CategorySidebarItem
                  cat={{ id: 'other', name: t('other') }}
                  isActive={activeCategory === 'other'}
                  primaryColor={primaryColor}
                  onClick={() => scrollToCategory('other')}
                />
              )}
            </div>

            {/* Right product panel */}
            <div
              id="split-right-panel"
              ref={splitRightRef}
              className="sf-no-scrollbar"
              style={previewMode
                ? { flex: 1, overflowY: 'auto', height: '100%', paddingBottom: 80 }
                : { flex: 1, paddingBottom: 80 }
              }
            >
              {/* Special Deals section */}
              {hasFeatured && (
                <div ref={el => categoryRefs.current['__deals__'] = el} data-category-id="__deals__">
                  <p style={{ fontSize: 13, fontWeight: 700, padding: '12px 14px 6px', color: '#1e293b', margin: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1, borderBottom: '1px solid #f1f5f9' }}>{t('todaysPicks')} ⭐</p>
                  <div style={{ padding: '4px 10px' }}>
                    {featuredProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} featured={true} contentMap={contentMap} isDesktop={isDesktop} />)}
                  </div>
                </div>
              )}
              {categoriesWithProducts.map(cat => {
                const catProducts = products.filter(p => p.category_id === cat.id && !p.is_featured);
                if (!catProducts.length) return null;
                return (
                  <div
                    key={cat.id}
                    ref={el => categoryRefs.current[cat.id] = el}
                    data-category-id={cat.id}
                  >
                    <p style={{
                      fontSize: 13, fontWeight: 700, padding: '12px 14px 6px',
                      color: '#1e293b', margin: 0, position: 'sticky', top: 0,
                      background: 'white', zIndex: 1, borderBottom: '1px solid #f1f5f9',
                    }}>{tr(cat.name)}</p>
                    <div style={{ padding: '4px 10px' }}>
                      {catProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} contentMap={contentMap} isDesktop={isDesktop} />)}
                    </div>
                  </div>
                );
              })}
              {uncategorised.length > 0 && (
                <div ref={el => categoryRefs.current['other'] = el} data-category-id="other">
                  <p style={{ fontSize: 13, fontWeight: 700, padding: '12px 14px 6px', color: '#1e293b', margin: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1, borderBottom: '1px solid #f1f5f9' }}>{t('other')}</p>
                  <div style={{ padding: '4px 10px' }}>
                    {uncategorised.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} contentMap={contentMap} isDesktop={isDesktop} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
        ) : (
          /* ── OTHER LAYOUTS ── */
          <NonSplitContent
            products={products}
            categories={categories}
            primaryColor={primaryColor}
            currency={currency}
            storefrontConfig={storefrontConfig}
            showStockBadge={showStockBadge}
            onAddToCart={handleAddToCart}
            onProductClick={handleProductClick}
            contentMap={contentMap}
            isDesktop={isDesktop}
            isLandscape={isLandscape}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showStickyBar={showFloatingSearch}
            headerHeight={headerHeight}
          />
        )}

        {/* Powered by footer */}
        <div style={{ textAlign: 'center', padding: '16px 0 24px', color: '#c8d0dc', fontSize: 9, letterSpacing: '0.03em' }}>
          Powered by{' '}
          <span style={{ fontWeight: 700, background: 'linear-gradient(90deg, #fb923c, #e0449a, #8b2fc9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Sellio
          </span>
        </div>
      </div>

      {/* Product detail modal - live mode only */}
      {!previewMode && selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          currency={currency}
          primaryColor={primaryColor}
          storefrontConfig={storefrontConfig}
          selectedVariants={selectedVariants}
          setSelectedVariants={setSelectedVariants}
          itemNotes={itemNotes}
          setItemNotes={setItemNotes}
          activeImageIndex={activeImageIndex}
          setActiveImageIndex={setActiveImageIndex}
          onAddToCart={handleAddToCart}
          onClose={() => { setSelectedProduct(null); setSelectedVariants({}); setItemNotes(''); setActiveImageIndex(0); onProductModalChange?.(false); }}
          contentMap={contentMap}
        />
      )}
    </div>
  );
}

// ── Product row item (split layout) ─────────────────────────────────────────
function ProductRowItem({ product, currency, primaryColor, storefrontConfig, onAddToCart, onProductClick, featured = false, contentMap = {}, isDesktop = false }) {
  const { t } = useLanguage();
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  const name = contentMap[product.name] || product.name;
  const description = contentMap[product.description] || product.description;
  const thumbSize = isDesktop ? 92 : 72;
  return (
    <div
      onClick={() => onProductClick(product)}
      style={{ display: 'flex', gap: isDesktop ? 14 : 10, alignItems: 'center', padding: isDesktop ? '14px 0' : '10px 0', borderBottom: '1px solid #f8f9fa', cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {product.image_url
          ? <img src={product.image_url} style={{ width: thumbSize, height: thumbSize, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: thumbSize, height: thumbSize, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🛍️</div>
        }
        {featured && (
          <span style={{ position: 'absolute', bottom: 4, left: 4, background: '#f59e0b', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', lineHeight: 1.6 }}>★ Featured</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: isDesktop ? 15 : 13, margin: '0 0 2px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        {storefrontConfig?.show_product_description !== false && product.description && (
          isDesktop
            ? <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</p>
            : <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{description}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {product.compare_at_price > product.price && (
            <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{getCurrencySymbol(currency)}{parseFloat(product.compare_at_price).toFixed(2)}</span>
          )}
          <p style={{ fontSize: 13, fontWeight: 700, color: primaryColor, margin: 0 }}>{getCurrencySymbol(currency)}{parseFloat(product.price).toFixed(2)}</p>
        </div>
      </div>
      {isOutOfStock
        ? <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, flexShrink: 0 }}>{t('soldOut')}</span>
        : <button onClick={(e) => { e.stopPropagation(); if (product.variants?.length > 0) { onProductClick(product); } else { onAddToCart(product); } }}
            style={{ width: 30, height: 30, borderRadius: '50%', background: primaryColor, border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>+</button>
      }
    </div>
  );
}

// ── Non-split content (grid / list / carousel) ───────────────────────────────
function NonSplitContent({ products, categories, primaryColor, currency, storefrontConfig, showStockBadge, onAddToCart, onProductClick, contentMap, isDesktop = false, isLandscape = false, searchOpen, setSearchOpen, searchQuery, setSearchQuery, showStickyBar = false, headerHeight = 84 }) {
  const { t } = useLanguage();
  const tr = (text) => contentMap[text] || text;
  const [selectedCategory, setSelectedCategory] = useState(null);
  const featuredProducts = products.filter(p => p.is_featured === true);
  const specialDealProducts = products.filter(p => p.compare_at_price > p.price && !p.is_featured);
  const filteredProducts = products.filter(p =>
    p.is_featured !== true && (selectedCategory === null || p.category_id === selectedCategory)
  );
  const productLayout = storefrontConfig?.product_layout || 'grid';
  const isGrid = productLayout === 'grid';
  // 3 columns on tablet portrait, 4 on landscape, per the merchant's explicit
  // spec - not the fluid auto-fill used before, which didn't reliably land on
  // those exact counts.
  const gridColumns = isDesktop ? (isLandscape ? 4 : 3) : 2;

  return (
    <>
      <div style={{ position: 'sticky', top: headerHeight, zIndex: 45, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 10px 16px' }}>
          {storefrontConfig?.show_category_tabs !== false && categories.length > 0 && (
            <div className="sf-no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
              {[{ id: null, name: t('all') }, ...categories].map(cat => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
                  flexShrink: 0, padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: 'none',
                  fontWeight: selectedCategory === cat.id ? 600 : 400,
                  background: selectedCategory === cat.id ? primaryColor : '#f1f5f9',
                  color: selectedCategory === cat.id ? 'white' : '#64748b',
                }}>{tr(cat.name)}</button>
              ))}
            </div>
          )}
          <button
            onClick={() => setSearchOpen?.(v => !v)}
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: searchOpen ? primaryColor : `${primaryColor}1A` }}
          >
            <Search size={16} color={searchOpen ? 'white' : primaryColor} />
          </button>
        </div>
        {searchOpen && (
          <div style={{ padding: '0 14px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery?.(e.target.value)}
                placeholder="Search menu..."
                style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: 13, outline: 'none' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery?.('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {storefrontConfig?.show_featured !== false && featuredProducts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {storefrontConfig?.featured_section_title ? tr(storefrontConfig.featured_section_title) : t('todaysPicks')} ⭐
            </p>
            {isGrid ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: 10 }}>
                {featuredProducts.map(product => <GridCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} />)}
              </div>
            ) : (
              featuredProducts.map(product => <FeaturedCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} />)
            )}
          </div>
        )}
        {specialDealProducts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              🏷️ {t('specialDeals')}
            </p>
            {isGrid ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: 10 }}>
                {specialDealProducts.map(product => <GridCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} />)}
              </div>
            ) : (
              specialDealProducts.map(product => <FeaturedCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} />)
            )}
          </div>
        )}
        {productLayout === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: 10 }}>
            {filteredProducts.map(product => <GridCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} />)}
          </div>
        )}
        {productLayout === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: isDesktop ? 640 : 'none' }}>
            {filteredProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={onAddToCart} onProductClick={onProductClick} contentMap={contentMap} isDesktop={isDesktop} />)}
          </div>
        )}
        {filteredProducts.length === 0 && featuredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}>🛍️</p>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No products found</p>
          </div>
        )}
      </div>
    </>
  );
}

function FeaturedCard({ product, currency, primaryColor, storefrontConfig, showStockBadge, onAddToCart, onProductClick, contentMap = {} }) {
  const { t } = useLanguage();
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  const name = contentMap[product.name] || product.name;
  const description = contentMap[product.description] || product.description;
  return (
    <div onClick={() => onProductClick(product)} style={{ display: 'flex', background: '#f8fafc', borderRadius: 14, overflow: 'hidden', marginBottom: 10, border: '0.5px solid #e5e7eb', cursor: 'pointer' }}>
      {product.image_url && <img src={product.image_url} style={{ width: 110, height: 110, objectFit: 'cover', flexShrink: 0 }} />}
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 3px', color: '#0f172a' }}>{name}</p>
          {storefrontConfig?.show_product_description !== false && product.description && (
            <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description}</p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {product.compare_at_price > product.price && (
              <span style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>{getCurrencySymbol(currency)}{parseFloat(product.compare_at_price).toFixed(2)}</span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: primaryColor }}>{getCurrencySymbol(currency)}{parseFloat(product.price).toFixed(2)}</span>
          </div>
          {isOutOfStock && showStockBadge
            ? <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '4px 10px', borderRadius: 999 }}>{t('soldOut')}</span>
            : !isOutOfStock && <button onClick={(e) => { e.stopPropagation(); if (product.variants?.length > 0) { onProductClick(product); } else { onAddToCart(product); } }} style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('addToOrder')}</button>
          }
        </div>
      </div>
    </div>
  );
}

function GridCard({ product, currency, primaryColor, storefrontConfig, showStockBadge, onAddToCart, onProductClick, contentMap = {} }) {
  const { t } = useLanguage();
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  const name = contentMap[product.name] || product.name;
  const description = contentMap[product.description] || product.description;
  return (
    <div onClick={() => onProductClick(product)} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ position: 'relative' }}>
        {product.image_url
          ? <img src={product.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
          : <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛍️</div>
        }
        {isOutOfStock && showStockBadge && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 12 }}>{t('soldOut')}</span>
          </div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{name}</p>
        {storefrontConfig?.show_product_description !== false && product.description && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{description}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {product.compare_at_price > product.price && (
              <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{getCurrencySymbol(currency)}{parseFloat(product.compare_at_price).toFixed(2)}</span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>{getCurrencySymbol(currency)}{parseFloat(product.price).toFixed(2)}</span>
          </div>
          {!isOutOfStock && (
            <button onClick={(e) => { e.stopPropagation(); if (product.variants?.length > 0) { onProductClick(product); } else { onAddToCart(product); } }}
              style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, color: 'white', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product detail modal ─────────────────────────────────────────────────────
function ProductDetailModal({ product, currency, primaryColor, storefrontConfig, selectedVariants, setSelectedVariants, itemNotes, setItemNotes, activeImageIndex, setActiveImageIndex, onAddToCart, onClose, contentMap = {} }) {
  const { t } = useLanguage();
  const name = contentMap[product.name] || product.name;
  const description = contentMap[product.description] || product.description;
  const allImages = [product.image_url, ...(product.images || [])].filter(Boolean);
  const activeImage = allImages[activeImageIndex];
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef(null);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && activeImageIndex < allImages.length - 1) {
        setActiveImageIndex(activeImageIndex + 1);
      } else if (diff < 0 && activeImageIndex > 0) {
        setActiveImageIndex(activeImageIndex - 1);
      }
    }
    touchStartX.current = null;
  };

  return (
    <>
      {/* Lightbox */}
      {lightboxOpen && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => setLightboxOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <button onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <img src={activeImage} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
          {allImages.length > 1 && (
            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {allImages.map((_, idx) => (
                <div key={idx} style={{ width: idx === activeImageIndex ? 20 : 7, height: 7, borderRadius: 4, background: idx === activeImageIndex ? 'white' : 'rgba(255,255,255,0.4)', transition: 'all 0.2s' }} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', overflow: 'auto' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'relative', width: '90%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, background: '#fff' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, width: 36, height: 36, borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>

          {/* Main image with swipe and tap-to-lightbox */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={() => activeImage && setLightboxOpen(true)}
            style={{ cursor: activeImage ? 'zoom-in' : 'default', position: 'relative' }}
          >
            {activeImage
              ? <img src={activeImage} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'contain', background: '#f8f9fa', borderRadius: '20px 20px 0 0', display: 'block' }} />
              : <div style={{ width: '100%', aspectRatio: '1/1', background: '#f8f9fa', borderRadius: '20px 20px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🛍️</div>
            }
            {/* Swipe dots */}
            {allImages.length > 1 && (
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                {allImages.map((_, idx) => (
                  <div key={idx} style={{ width: idx === activeImageIndex ? 16 : 6, height: 6, borderRadius: 3, background: idx === activeImageIndex ? primaryColor : 'rgba(255,255,255,0.7)', transition: 'all 0.2s' }} />
                ))}
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {allImages.length > 1 && (
            <div style={{ padding: '8px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '0.5px solid #e5e7eb' }}>
              {allImages.map((img, idx) => (
                <button key={idx} onClick={() => setActiveImageIndex(idx)} style={{ width: 60, height: 60, flexShrink: 0, borderRadius: 8, border: activeImageIndex === idx ? `2px solid ${primaryColor}` : '0.5px solid #e5e7eb', background: '#f8f9fa', padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
                  <img src={img} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: '20px' }}>
            <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px', color: '#0f172a' }}>{name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {product.compare_at_price > product.price && (
                <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' }}>{getCurrencySymbol(currency)}{parseFloat(product.compare_at_price).toFixed(2)}</span>
              )}
              <span style={{ fontSize: 20, fontWeight: 700, color: primaryColor }}>{getCurrencySymbol(currency)}{parseFloat(product.price).toFixed(2)}</span>
            </div>
            {product.description && <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>{description}</p>}
            {(() => {
              const normaliseVariants = (rawVariants, basePrice) => {
                if (!rawVariants?.length) return [];
                if (rawVariants[0]?.options) return rawVariants;
                const KNOWN = ['size','color','colour','addon','flavour','flavor','type','option','variant'];
                const firstItem = rawVariants[0];
                const keys = Object.keys(firstItem || {});
                const vKey = keys.find(k => KNOWN.includes(k.toLowerCase())) || keys.find(k => k !== 'price' && k !== 'price_modifier');
                if (vKey) {
                  const prices = rawVariants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
                  const base = parseFloat(basePrice) > 0 ? parseFloat(basePrice) : (prices.length ? Math.min(...prices) : 0);
                  const groupName = vKey.charAt(0).toUpperCase() + vKey.slice(1).toLowerCase();
                  return [{ name: groupName, options: rawVariants.map(v => ({ label: String(v[vKey] || ''), price_modifier: Math.max(0, Math.round((parseFloat(v.price || 0) - base) * 100) / 100) })) }];
                }
                return [{ name: 'Options', options: rawVariants.map(v => ({ label: v.name || v.label || '', price_modifier: v.price_modifier || 0 })) }];
              };

              const normalisedVariants = normaliseVariants(product.variants, product.price);
              if (!normalisedVariants.length) return null;

              return (
                <div style={{ marginBottom: 16 }}>
                  {normalisedVariants.map((group, gi) => {
                    // FIX: selection behavior never actually looked at group.type —
                    // every group behaved as single-select (clicking replaced the
                    // previous choice), even for 'addon' groups where a customer
                    // should be able to pick several (e.g. extra egg + extra pork).
                    // 'addon' groups now toggle independently; everything else
                    // (size/color/other) keeps the original single-select behavior
                    // unchanged, so this doesn't affect any other product's existing
                    // single-choice options.
                    const isMultiSelect = group.type === 'addon';
                    const selectedForGroup = selectedVariants[gi];
                    const selectedList = isMultiSelect ? (Array.isArray(selectedForGroup) ? selectedForGroup : []) : null;
                    return (
                    <div key={gi} style={{ marginBottom: 14 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: '#0f172a' }}>{group.name || (isMultiSelect ? 'Add-ons' : 'Options')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {(group.options || []).map((opt, oi) => {
                          const isSelected = isMultiSelect
                            ? selectedList.some(v => v.label === opt.label)
                            : selectedForGroup?.label === opt.label;
                          const handleClick = () => {
                            if (isMultiSelect) {
                              setSelectedVariants(prev => {
                                const current = Array.isArray(prev[gi]) ? prev[gi] : [];
                                const exists = current.some(v => v.label === opt.label);
                                const next = exists ? current.filter(v => v.label !== opt.label) : [...current, opt];
                                return { ...prev, [gi]: next };
                              });
                            } else {
                              setSelectedVariants(prev => ({ ...prev, [gi]: opt }));
                            }
                          };
                          return (
                            <button key={oi} onClick={handleClick}
                              style={{ padding: '8px 10px', borderRadius: 14, border: isSelected ? `2px solid ${primaryColor}` : '1.5px solid #e2e8f0', background: isSelected ? `${primaryColor}15` : 'white', cursor: 'pointer', fontWeight: isSelected ? 700 : 500, color: isSelected ? primaryColor : '#374151', transition: 'all 0.15s', fontSize: 13, textAlign: 'center', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {opt.label}{opt.price_modifier > 0 ? ` +${getCurrencySymbol(currency)}${parseFloat(opt.price_modifier).toFixed(2)}` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: '#0f172a' }}>Special Request (optional)</p>
              <textarea
                value={itemNotes}
                onChange={e => setItemNotes(e.target.value)}
                placeholder="e.g. No onions, extra spicy..."
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <button
              onClick={() => {
                // Flattens both single-select picks (plain objects) and multi-select
                // picks (arrays) into one combined label/price, so everything
                // downstream (cart, order storage, Kitchen Display, receipts) still
                // just sees one string — none of that needs to change.
                const allSelected = Object.values(selectedVariants).flatMap(v => Array.isArray(v) ? v : (v ? [v] : []));
                const combinedVariant = allSelected.length > 0
                  ? { label: allSelected.map(v => v.label).join(', '), price_modifier: allSelected.reduce((sum, v) => sum + (v.price_modifier || 0), 0) }
                  : null;
                // FIX: notes used to only exist as one order-wide field collected at
                // checkout — there was no way to attach a note to a specific item, so
                // adding a second item later (e.g. via Edit Order) had nowhere for its
                // own note to go. Each cart item now carries its own optional note.
                onAddToCart(product, combinedVariant, itemNotes.trim() || null);
                onClose();
              }}
              style={{ width: '100%', padding: 14, background: primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              {t('addToOrder')} · {getCurrencySymbol(currency)}{(parseFloat(product.price) + Object.values(selectedVariants).flatMap(v => Array.isArray(v) ? v : (v ? [v] : [])).reduce((sum, v) => sum + (v.price_modifier || 0), 0)).toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}