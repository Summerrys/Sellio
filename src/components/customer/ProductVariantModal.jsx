import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Minus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProductVariantModal({ open, onOpenChange, product, onAddToCart, currency }) {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  if (!product) return null;

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, quantity, specialInstructions);
    setSelectedVariant(null);
    setQuantity(1);
    setSpecialInstructions('');
  };

  const totalPrice = (product.price + (selectedVariant?.price_modifier || 0)) * quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Product Image */}
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-48 rounded-lg object-cover"
            />
          )}

          {/* Description */}
          {product.description && (
            <p className="text-slate-600">{product.description}</p>
          )}

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div>
              <Label className="text-base mb-3 block">Select Option *</Label>
              <div className="space-y-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all",
                      selectedVariant?.id === variant.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        selectedVariant?.id === variant.id
                          ? "border-[var(--primary)] bg-[var(--primary)]"
                          : "border-slate-300"
                      )}>
                        {selectedVariant?.id === variant.id && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="font-medium text-slate-900">{variant.name}</span>
                    </div>
                    {variant.price_modifier !== 0 && (
                      <span className="text-sm font-semibold text-slate-700">
                        {variant.price_modifier > 0 ? '+' : ''}{currency} {variant.price_modifier.toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <Label className="text-base mb-3 block">Quantity</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-xl font-semibold w-12 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Special Instructions */}
          <div>
            <Label className="text-base mb-2 block">Special Instructions (Optional)</Label>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g., No onions, extra sauce..."
              className="h-20"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          <Button
            onClick={handleAdd}
            disabled={product.variants?.length > 0 && !selectedVariant}
            className="w-full h-12 text-lg font-semibold"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Add to Cart - {currency} {totalPrice.toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}