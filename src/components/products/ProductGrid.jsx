import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceDisplay from './PriceDisplay';

export default function ProductGrid({ products, onEdit, currency = 'SGD' }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.map((product) => {
        const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
        const isLowStock = product.track_inventory && product.stock_quantity > 0 && product.stock_quantity < product.low_stock_threshold;

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
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
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
                <span className="text-xs text-red-600 font-medium">Out of Stock</span>
              )}
              {isLowStock && (
                <span className="text-xs text-amber-600 font-medium">Low Stock ({product.stock_quantity})</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}