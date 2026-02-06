import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus } from 'lucide-react';

export default function ProductCard({ product, onAddToCart, currency }) {
  const [quantity, setQuantity] = useState(1);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleAdd = () => {
    onAddToCart(quantity, instructions);
    setQuantity(1);
    setInstructions('');
    setShowInstructions(false);
  };

  const truncateText = (text, maxLength = 80) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-4 p-4">
        {/* Product Image */}
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
          />
        )}

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-lg mb-1">{product.name}</h3>
          <p className="text-[var(--accent)] font-bold text-lg mb-2">
            {currency} {product.price.toFixed(2)}
          </p>
          
          {product.description && (
            <div>
              <p className="text-sm text-slate-600">
                {expanded ? product.description : truncateText(product.description)}
              </p>
              {product.description.length > 80 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-sm text-[var(--primary)] font-medium mt-1"
                >
                  {expanded ? 'Show less' : 'See more'}
                </button>
              )}
            </div>
          )}

          {/* Quantity Controls */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold w-8 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <Button
              onClick={handleAdd}
              className="ml-auto"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Add to Cart
            </Button>
          </div>

          {/* Special Instructions */}
          {showInstructions ? (
            <Input
              placeholder="Special instructions (optional)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-2 text-sm"
            />
          ) : (
            <button
              onClick={() => setShowInstructions(true)}
              className="text-sm text-slate-500 hover:text-slate-700 mt-2"
            >
              + Add special instructions
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}