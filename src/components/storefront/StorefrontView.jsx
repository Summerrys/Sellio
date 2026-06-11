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
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Coffee, UtensilsCrossed, IceCream, Salad, Sandwich,
  Drumstick, Tag, Gift, LayoutGrid, ShoppingCart, Clock
} from 'lucide-react';

// ── Category icon resolver ──────────────────────────────────────────────────
function getCategoryIcon(name = '') {
  const n = name.toLowerCase();
  if (/drink|beverage|coffee|tea|juice|milk|boba/.test(n)) return Coffee;
  if (/food|meal|rice|noodle|pasta|main/.test(n)) return UtensilsCrossed;
  if (/dessert|cake|sweet|pastry|ice.?cream/.test(n)) return IceCream;
  if (/snack|appetizer|starter/.test(n)) return Salad;
  if (/pizza|burger|sandwich|wrap/.test(n)) return Sandwich;
  if (/chicken|meat|beef|pork/.test(n)) return Drumstick;
  if (/set|combo|bundle|promo/.test(n)) return Tag;
  if (/merch|gift/.test(n)) return Gift;
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
function StorefrontHeader({ tenant, primaryColor, cartCount, onCartClick, onHistoryClick }) {
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

  const headerHeight = subLine ? 64 : 56;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      height: headerHeight,
      background: '#ffffff',
      display: 'flex', alignItems: 'center',
      padding: '0 14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      {/* Left: logo + name */}
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

      {/* Right: History + Cart buttons */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
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
  );
}

// ── Banner area (below header, behind it effectively) ─────────────────────
function StorefrontBanner({ primaryColor, bannerBgImage, positionX, positionY, headline, tagline }) {
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
      {(headline || tagline) && (
        <div style={{ position: 'absolute', bottom: 18, left: 16, right: 16, zIndex: 2 }}>
          {headline && <p style={{ color: 'white', fontWeight: 800, fontSize: 22, margin: '0 0 4px', textShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: 1.2 }}>{headline}</p>}
          {tagline && <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{tagline}</p>}
        </div>
      )}
    </div>
  );
}

// ── Category sidebar item ────────────────────────────────────────────────────
function CategorySidebarItem({ cat, isActive, primaryColor, onClick }) {
  const Icon = getCategoryIcon(cat.name);
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
      }}>{cat.name}</div>
    </button>
  );
}

// ── Main exported component ──────────────────────────────────────────────────
export default function StorefrontView({
  // preview mode: pass data directly
  previewMode = false,
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
}) {
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

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const featuredProducts = products.filter(p => p.is_featured === true);
  const hasFeatured = featuredProducts.length > 0;
  const categoriesWithProducts = categories.filter(cat => products.some(p => p.category_id === cat.id));
  const uncategorised = products.filter(p => !p.is_featured && !categories.some(c => c.id === p.category_id));

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
    const root = splitRightRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          setActiveCategory(intersecting[0].target.dataset.categoryId);
        }
      },
      { root, threshold: 0.1, rootMargin: '0px 0px -60% 0px' }
    );
    Object.values(categoryRefs.current).forEach(ref => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, [productLayout, categories.length, products.length]);

  const scrollToCategory = (categoryId) => {
    categoryRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveCategory(categoryId);
  };

  const handleAddToCart = (product, variant = null) => {
    if (onAddToCart) onAddToCart(product, variant);
  };

  const handleProductClick = (product) => {
    if (!previewMode) {
      setSelectedProduct(product);
      setActiveImageIndex(0);
    }
  };

  // Determine heights for split layout
  // Header is sticky at top (56px), banner is below header (220px min)
  // Split panel fills rest of viewport
  const splitPanelHeight = previewMode ? 300 : 'calc(100vh - 56px - 220px)';

  return (
    <div style={{
      fontFamily: `${storefrontConfig?.font_family || 'Inter'}, sans-serif`,
      maxWidth: previewMode ? '100%' : 480,
      margin: '0 auto',
      minHeight: '100vh',
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
      <StorefrontHeader
        tenant={tenant}
        primaryColor={primaryColor}
        cartCount={cartCount}
        onCartClick={() => setShowCart?.(true)}
        onHistoryClick={() => setShowOrderHistory?.(true)}
      />

      {/* ── BANNER (below header) ── */}
      <StorefrontBanner
        primaryColor={primaryColor}
        bannerBgImage={bannerBgImage}
        positionX={storefrontConfig?.banner_position_x}
        positionY={storefrontConfig?.banner_position_y}
        headline={storefrontConfig?.banner_headline}
        tagline={storefrontConfig?.banner_tagline}
      />

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
        overflow: productLayout === 'split' ? 'hidden' : 'visible',
        marginTop: -24,
        position: 'relative',
        zIndex: 2,
      }}>

        {/* ── SPLIT LAYOUT ── */}
        {productLayout === 'split' ? (
          <div style={{ display: 'flex', height: splitPanelHeight, overflow: 'hidden' }}>
            {/* Left category sidebar */}
            <div className="sf-no-scrollbar" style={{
              width: 'clamp(72px, 20vw, 100px)',
              flexShrink: 0,
              overflowY: 'auto',
              height: '100%',
              borderRight: '1px solid #f1f5f9',
              background: '#fafafa',
            }}>
              {hasFeatured && (
                <CategorySidebarItem
                  cat={{ id: '__deals__', name: "Today's Picks ⭐" }}
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
                />
              ))}
              {uncategorised.length > 0 && (
                <CategorySidebarItem
                  cat={{ id: 'other', name: 'Other' }}
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
              style={{ flex: 1, overflowY: 'auto', height: '100%', paddingBottom: 80 }}
            >
              {/* Special Deals section */}
              {hasFeatured && (
                <div ref={el => categoryRefs.current['__deals__'] = el} data-category-id="__deals__">
                  <p style={{ fontSize: 13, fontWeight: 700, padding: '12px 14px 6px', color: '#1e293b', margin: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1, borderBottom: '1px solid #f1f5f9' }}>Today's Picks ⭐</p>
                  <div style={{ padding: '4px 10px' }}>
                    {featuredProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} featured={true} />)}
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
                    }}>{cat.name}</p>
                    <div style={{ padding: '4px 10px' }}>
                      {catProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} />)}
                    </div>
                  </div>
                );
              })}
              {uncategorised.length > 0 && (
                <div ref={el => categoryRefs.current['other'] = el} data-category-id="other">
                  <p style={{ fontSize: 13, fontWeight: 700, padding: '12px 14px 6px', color: '#1e293b', margin: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1, borderBottom: '1px solid #f1f5f9' }}>Other</p>
                  <div style={{ padding: '4px 10px' }}>
                    {uncategorised.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={handleAddToCart} onProductClick={handleProductClick} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
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
          />
        )}

        {/* Powered by footer */}
        <div style={{ textAlign: 'center', padding: '16px 0 24px', color: '#c8d0dc', fontSize: 9, letterSpacing: '0.03em' }}>
          Powered by Sellio
        </div>
      </div>

      {/* Product detail modal — live mode only */}
      {!previewMode && selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          currency={currency}
          primaryColor={primaryColor}
          storefrontConfig={storefrontConfig}
          selectedVariants={selectedVariants}
          setSelectedVariants={setSelectedVariants}
          activeImageIndex={activeImageIndex}
          setActiveImageIndex={setActiveImageIndex}
          onAddToCart={handleAddToCart}
          onClose={() => { setSelectedProduct(null); setSelectedVariants({}); setActiveImageIndex(0); }}
        />
      )}
    </div>
  );
}

// ── Product row item (split layout) ─────────────────────────────────────────
function ProductRowItem({ product, currency, primaryColor, storefrontConfig, onAddToCart, onProductClick, featured = false }) {
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  return (
    <div
      onClick={() => onProductClick(product)}
      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8f9fa', cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {product.image_url
          ? <img src={product.image_url} style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: 72, height: 72, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🛍️</div>
        }
        {featured && (
          <span style={{ position: 'absolute', bottom: 4, left: 4, background: '#f59e0b', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', lineHeight: 1.6 }}>★ Featured</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
        {storefrontConfig?.show_product_description !== false && product.description && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.description}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {product.compare_at_price > product.price && (
            <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{currency} {parseFloat(product.compare_at_price).toFixed(2)}</span>
          )}
          <p style={{ fontSize: 13, fontWeight: 700, color: primaryColor, margin: 0 }}>{currency} {parseFloat(product.price).toFixed(2)}</p>
        </div>
      </div>
      {isOutOfStock
        ? <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, flexShrink: 0 }}>Sold out</span>
        : <button onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
            style={{ width: 30, height: 30, borderRadius: '50%', background: primaryColor, border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>+</button>
      }
    </div>
  );
}

// ── Non-split content (grid / list / carousel) ───────────────────────────────
function NonSplitContent({ products, categories, primaryColor, currency, storefrontConfig, showStockBadge, onAddToCart, onProductClick }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const featuredProducts = products.filter(p => p.is_featured === true);
  const specialDealProducts = products.filter(p => p.compare_at_price > p.price && !p.is_featured);
  const filteredProducts = products.filter(p =>
    selectedCategory === null || p.category_id === selectedCategory
  );
  const productLayout = storefrontConfig?.product_layout || 'grid';

  return (
    <>
      {storefrontConfig?.show_category_tabs !== false && categories.length > 0 && (
        <div className="sf-no-scrollbar" style={{ display: 'flex', gap: 8, padding: '14px 16px 0', overflowX: 'auto' }}>
          {[{ id: null, name: 'All' }, ...categories].map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: 'none',
              fontWeight: selectedCategory === cat.id ? 600 : 400,
              background: selectedCategory === cat.id ? primaryColor : '#f1f5f9',
              color: selectedCategory === cat.id ? 'white' : '#64748b',
            }}>{cat.name}</button>
          ))}
        </div>
      )}
      <div style={{ padding: '16px 16px 0' }}>
        {storefrontConfig?.show_featured !== false && featuredProducts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {storefrontConfig?.featured_section_title || "Today's Picks"} ⭐
            </p>
            {featuredProducts.map(product => <FeaturedCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} />)}
          </div>
        )}
        {specialDealProducts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              🏷️ Special Deals
            </p>
            {specialDealProducts.map(product => <FeaturedCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} />)}
          </div>
        )}
        {productLayout === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {filteredProducts.map(product => <GridCard key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} showStockBadge={showStockBadge} onAddToCart={onAddToCart} onProductClick={onProductClick} />)}
          </div>
        )}
        {productLayout === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredProducts.map(product => <ProductRowItem key={product.id} product={product} currency={currency} primaryColor={primaryColor} storefrontConfig={storefrontConfig} onAddToCart={onAddToCart} onProductClick={onProductClick} />)}
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

function FeaturedCard({ product, currency, primaryColor, storefrontConfig, showStockBadge, onAddToCart, onProductClick }) {
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  return (
    <div onClick={() => onProductClick(product)} style={{ display: 'flex', background: '#f8fafc', borderRadius: 14, overflow: 'hidden', marginBottom: 10, border: '0.5px solid #e5e7eb', cursor: 'pointer' }}>
      {product.image_url && <img src={product.image_url} style={{ width: 110, height: 110, objectFit: 'cover', flexShrink: 0 }} />}
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 3px', color: '#0f172a' }}>{product.name}</p>
          {storefrontConfig?.show_product_description !== false && product.description && (
            <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {product.compare_at_price > product.price && (
              <span style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>{currency} {parseFloat(product.compare_at_price).toFixed(2)}</span>
            )}
            <span style={{ fontSize: 15, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
          </div>
          {isOutOfStock && showStockBadge
            ? <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '4px 10px', borderRadius: 999 }}>Sold out</span>
            : !isOutOfStock && <button onClick={(e) => { e.stopPropagation(); onAddToCart(product); }} style={{ background: primaryColor, color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add +</button>
          }
        </div>
      </div>
    </div>
  );
}

function GridCard({ product, currency, primaryColor, storefrontConfig, showStockBadge, onAddToCart, onProductClick }) {
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
  return (
    <div onClick={() => onProductClick(product)} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ position: 'relative' }}>
        {product.image_url
          ? <img src={product.image_url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
          : <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛍️</div>
        }
        {isOutOfStock && showStockBadge && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 12 }}>Sold out</span>
          </div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }}>{product.name}</p>
        {storefrontConfig?.show_product_description !== false && product.description && (
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.description}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {product.compare_at_price > product.price && (
              <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>{currency} {parseFloat(product.compare_at_price).toFixed(2)}</span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
          </div>
          {!isOutOfStock && (
            <button onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
              style={{ width: 28, height: 28, borderRadius: '50%', background: primaryColor, color: 'white', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product detail modal ─────────────────────────────────────────────────────
function ProductDetailModal({ product, currency, primaryColor, storefrontConfig, selectedVariants, setSelectedVariants, activeImageIndex, setActiveImageIndex, onAddToCart, onClose }) {
  const allImages = [product.image_url, ...(product.images || [])].filter(Boolean);
  const activeImage = allImages[activeImageIndex];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', overflow: 'auto' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'relative', width: '90%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', borderRadius: 20, background: '#fff' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, width: 36, height: 36, borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {activeImage
          ? <img src={activeImage} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'contain', background: '#f8f9fa', borderRadius: '20px 20px 0 0' }} />
          : <div style={{ width: '100%', aspectRatio: '1/1', background: '#f8f9fa', borderRadius: '20px 20px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🛍️</div>
        }
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
          <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px', color: '#0f172a' }}>{product.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {product.compare_at_price > product.price && (
              <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' }}>{currency} {parseFloat(product.compare_at_price).toFixed(2)}</span>
            )}
            <span style={{ fontSize: 20, fontWeight: 700, color: primaryColor }}>{currency} {parseFloat(product.price).toFixed(2)}</span>
          </div>
          {product.description && <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>{product.description}</p>}
          {product.variants?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {product.variants.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 14 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: '#0f172a' }}>{group.name}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {group.options?.map((opt, oi) => (
                      <button key={oi} onClick={() => setSelectedVariants(prev => ({ ...prev, [gi]: opt }))}
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, border: selectedVariants[gi]?.label === opt.label ? `2px solid ${primaryColor}` : '0.5px solid #e5e7eb', background: selectedVariants[gi]?.label === opt.label ? '#f1f5f9' : 'none', cursor: 'pointer', fontWeight: 500, color: '#0f172a' }}>
                        {opt.label}{opt.price_modifier > 0 ? ` +${currency} ${opt.price_modifier.toFixed(2)}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              const combinedVariant = Object.values(selectedVariants).length > 0
                ? { label: Object.values(selectedVariants).map(v => v.label).join(', '), price_modifier: Object.values(selectedVariants).reduce((sum, v) => sum + (v.price_modifier || 0), 0) }
                : null;
              onAddToCart(product, combinedVariant);
              onClose();
            }}
            style={{ width: '100%', padding: 14, background: primaryColor, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Add to order · {currency} {(parseFloat(product.price) + Object.values(selectedVariants).reduce((sum, v) => sum + (v.price_modifier || 0), 0)).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}