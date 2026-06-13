import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, AlertCircle, Package, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceDisplay from './PriceDisplay';

function StockBadge({ product }) {
  if (product.track_inventory !== true) {
    return <Badge variant="outline" className="text-slate-500 border-slate-300">Unlimited</Badge>;
  }
  const stock = product.current_stock ?? product.stock_quantity ?? 0;
  const threshold = product.low_stock_threshold ?? 10;
  if (stock === 0) {
    return <Badge className="bg-red-100 text-red-700 border-red-300 gap-1"><AlertCircle className="w-3 h-3" />Out of Stock</Badge>;
  }
  if (stock > 0 && stock < threshold) {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Low Stock ({stock})</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 border-green-300" style={{ color: '#166534' }}>{stock} in stock</Badge>;
}

export default function ProductGrid({ products, onEdit, currency = 'SGD', viewMode = 'list', selectionMode = false, selectedIds = new Set(), onLongPress, onToggleSelect }) {

  const makeLongPressProps = (productId, onEditFn) => {
    let timer = null;
    let moved = false;
    return {
      onTouchStart: () => { moved = false; timer = setTimeout(() => { if (!moved) onLongPress?.(productId); }, 500); },
      onTouchMove: () => { moved = true; clearTimeout(timer); },
      onTouchEnd: () => { clearTimeout(timer); if (!moved && selectionMode) onToggleSelect?.(productId); else if (!moved && !selectionMode) onEditFn(); },
      onMouseDown: () => { timer = setTimeout(() => onLongPress?.(productId), 500); },
      onMouseUp: () => clearTimeout(timer),
      onMouseLeave: () => clearTimeout(timer),
      onClick: () => { if (selectionMode) onToggleSelect?.(productId); else onEditFn(); },
      style: { userSelect: 'none', WebkitUserSelect: 'none' },
    };
  };

  if (viewMode === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {products.map((product) => (
          <div
            key={product.id}
            {...makeLongPressProps(product.id, () => onEdit(product))}
            style={{
              display: 'flex', gap: '12px', background: selectedIds.has(product.id) ? 'rgba(var(--color-primary), 0.06)' : 'white',
              borderRadius: '12px', border: `0.5px solid ${selectedIds.has(product.id) ? 'rgb(var(--color-primary))' : '#e5e7eb'}`,
              padding: '12px', cursor: 'pointer',
              opacity: product.is_active === false ? 0.6 : 1,
              transition: 'all 0.15s',
              userSelect: 'none', WebkitUserSelect: 'none',
            }}
          >
            {selectionMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 20 }}>
                {selectedIds.has(product.id)
                  ? <CheckCircle2 size={18} color="rgb(var(--color-primary))" />
                  : <Circle size={18} color="#cbd5e1" />
                }
              </div>
            )}
            <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Package className="w-8 h-8 text-slate-300" />
              )}
              {product.is_featured && (
                <span style={{ position: 'absolute', top: 3, left: 3, background: '#fbbf24', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 999 }}>⭐</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                {product.is_featured && <Badge className="bg-amber-500 text-white border-0 text-[10px] px-1.5 py-0">Featured</Badge>}
                {product.is_active === false && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.description}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
                <p style={{ color: 'rgb(var(--color-primary))', fontWeight: 600, fontSize: 14, margin: 0 }}>
                  <PriceDisplay price={product.price} compareAtPrice={product.compare_at_price} currency={currency} />
                </p>
                <StockBadge product={product} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Grid view
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((product) => (
        <Card
          key={product.id}
          {...makeLongPressProps(product.id, () => onEdit(product))}
          className={cn(
            "group border-0 shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer",
            !product.is_active && "opacity-60",
            selectedIds.has(product.id) && "ring-2 ring-[rgb(var(--color-primary))]"
          )}
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="aspect-square bg-slate-100 relative overflow-hidden" style={{ position: 'relative' }}>
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-12 h-12 text-slate-300" />
              </div>
            )}
            {!product.is_active && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Badge variant="secondary" className="bg-white text-slate-700">Inactive</Badge>
              </div>
            )}
            {product.is_featured && (
              <span style={{ position: 'absolute', top: 8, left: 8, background: '#fbbf24', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, zIndex: 1 }}>⭐ Featured</span>
            )}
            {selectionMode && (
              <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                {selectedIds.has(product.id)
                  ? <CheckCircle2 size={22} color="rgb(var(--color-primary))" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                  : <Circle size={22} color="white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                }
              </div>
            )}
          </div>
          <div className="p-3">
            <h3 className="font-semibold text-slate-900 mb-1 truncate text-sm">{product.name}</h3>
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <p className="text-sm font-bold text-[rgb(var(--color-primary))]">
                <PriceDisplay price={product.price} compareAtPrice={product.compare_at_price} currency={currency} />
              </p>
              <StockBadge product={product} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}