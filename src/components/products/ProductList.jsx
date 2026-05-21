import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceDisplay from './PriceDisplay';

function getStockStatus(product) {
  if (!product.track_inventory) return { isOutOfStock: false, isLowStock: false, currentStock: null };
  const inv = product.inventory?.[0];
  const currentStock = inv?.current_stock ?? product.stock_quantity ?? 0;
  const threshold = inv?.low_stock_threshold ?? product.low_stock_threshold ?? 5;
  return {
    isOutOfStock: currentStock === 0,
    isLowStock: currentStock > 0 && currentStock < threshold,
    currentStock,
  };
}

export default function ProductList({ products, onEdit, currency = 'SGD' }) {
  return (
    <div className="flex flex-col gap-3">
      {products.map((product) => {
        const { isOutOfStock, isLowStock, currentStock } = getStockStatus(product);

        return (
          <div
            key={product.id}
            onClick={() => onEdit(product)}
            className={cn(
              "flex gap-3 bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:shadow-md transition-shadow",
              !product.is_active && "opacity-60"
            )}
          >
            {/* Image */}
            <div className="w-20 h-20 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-7 h-7 text-slate-300" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm text-slate-900 line-clamp-1">{product.name}</p>
                <div className="flex gap-1 flex-shrink-0">
                  {!product.is_active && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                  {product.is_featured && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">Featured</span>
                  )}
                </div>
              </div>
              {product.description && (
                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{product.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="font-semibold text-sm" style={{ color: 'rgb(var(--color-primary))' }}>
                  <PriceDisplay price={product.price} compareAtPrice={product.compare_at_price} currency={currency} />
                </p>
                {isOutOfStock && (
                  <span style={{
                    background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: '600',
                    padding: '2px 8px', borderRadius: '999px', border: '1px solid #fca5a5',
                  }}>Out of Stock</span>
                )}
                {isLowStock && (
                  <span style={{
                    background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '600',
                    padding: '2px 8px', borderRadius: '999px', border: '1px solid #fcd34d',
                  }}>Low Stock ({currentStock})</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}