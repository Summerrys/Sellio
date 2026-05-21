import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, AlertCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import PriceDisplay from './PriceDisplay';

export default function ProductGrid({ products, onEdit, currency = 'SGD' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => (
        <Card
          key={product.id}
          className={cn(
            "group border-0 shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer",
            !product.is_active && "opacity-60"
          )}
          onClick={() => onEdit(product)}
        >
          {/* Image */}
          <div className="aspect-square bg-slate-100 relative overflow-hidden">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-12 h-12 text-slate-300" />
              </div>
            )}
            {!product.is_active && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Badge variant="secondary" className="bg-white text-slate-700">
                  Inactive
                </Badge>
              </div>
            )}
            {product.is_featured && (
              <div className="absolute top-2 left-2">
                <Badge className="bg-amber-500 text-white border-0">
                  Featured
                </Badge>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className="font-semibold text-slate-900 mb-1 truncate">
              {product.name}
            </h3>
            <p className="text-sm text-slate-500 mb-3 line-clamp-2">
              {product.description || 'No description'}
            </p>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-[rgb(var(--color-primary))]">
                  <PriceDisplay
                    price={product.price}
                    compareAtPrice={product.compare_at_price}
                    currency={currency}
                  />
                </p>
                {product.cost_price && (
                  <p className="text-xs text-slate-400">
                    Cost: {currency} {product.cost_price.toFixed(2)}
                  </p>
                )}
              </div>
              
              {/* Stock Badge — only when inventory tracking is enabled */}
              {product.track_inventory === true && product.stock_quantity !== null && (
                <div className="text-right">
                  {product.stock_quantity === 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Out of Stock
                    </Badge>
                  ) : product.stock_quantity <= (product.low_stock_threshold || 5) ? (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                      Low Stock ({product.stock_quantity})
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-600">
                      {product.stock_quantity} in stock
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}