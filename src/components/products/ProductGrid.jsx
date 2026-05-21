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

export default function ProductGrid({ products, onEdit, currency = 'SGD' }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.map((product) => {
        const { isOutOfStock, isLowStock, currentStock } = getStockStatus(product);

        return (
          <div
            key={product.id}
            onClick={() => onEdit(product)}
            className={cn(
              "bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow",
              !product.is_active && "opacity-60"
            )}
          >
            <div className="aspect-square bg-slate-100 overflow-hidden relative">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-10 h-10 text-slate-300" />
                </div>
              )}
              {!product.is_active && (
                <div className="absolute top-2 right-2">
                  <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded">Inactive</span>
                </div>
              )}
              {product.is_featured && (
                <div className="absolute top-2 left-2">
                  <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">Featured</span>
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="font-semibold text-sm text-slate-900 line-clamp-1">{product.name}</p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: 'rgb(var(--color-primary))' }}>
                <PriceDisplay price={product.price} compareAtPrice={product.compare_at_price} currency={currency} />
              </p>
              {isOutOfStock && (
                <span style={{
                  background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: '600',
                  padding: '2px 8px', borderRadius: '999px', border: '1px solid #fca5a5',
                  display: 'inline-block', marginTop: '4px',
                }}>Out of Stock</span>
              )}
              {isLowStock && (
                <span style={{
                  background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '600',
                  padding: '2px 8px', borderRadius: '999px', border: '1px solid #fcd34d',
                  display: 'inline-block', marginTop: '4px',
                }}>Low Stock ({currentStock})</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}