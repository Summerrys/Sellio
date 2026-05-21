import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceDisplay from './PriceDisplay';

export default function ProductList({ products, onEdit, currency = 'SGD' }) {
  return (
    <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
      {products.map((product) => {
        const isOutOfStock = product.track_inventory && product.stock_quantity === 0;
        const isLowStock = product.track_inventory && product.stock_quantity > 0 && product.stock_quantity < product.low_stock_threshold;

        return (
          <div
            key={product.id}
            onClick={() => onEdit(product)}
            className={cn(
              "flex items-center gap-4 px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer transition-colors",
              !product.is_active && "opacity-60"
            )}
          >
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-5 h-5 text-slate-300" />
                </div>
              )}
            </div>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 truncate">{product.name}</span>
                {!product.is_active && (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
                {product.is_featured && (
                  <Badge className="bg-amber-500 text-white border-0 text-xs">Featured</Badge>
                )}
              </div>
              {product.sku && (
                <p className="text-xs text-slate-400 mt-0.5">SKU: {product.sku}</p>
              )}
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-[rgb(var(--color-primary))]">
                <PriceDisplay price={product.price} compareAtPrice={product.compare_at_price} currency={currency} />
              </p>
            </div>

            {/* Stock badge */}
            <div className="flex-shrink-0 w-32 text-right">
              {product.track_inventory ? (
                isOutOfStock ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Out of Stock
                  </Badge>
                ) : isLowStock ? (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                    Low Stock ({product.stock_quantity})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-600">
                    {product.stock_quantity} in stock
                  </Badge>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}