import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Minus, Trash2, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

export default function CartDrawer({ open, onOpenChange, cart, setCart, tenant, tableId }) {
  const navigate = useNavigate();
  const [orderNote, setOrderNote] = useState('');

  const updateQuantity = (itemId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return {
          ...item,
          quantity: newQty,
          total: item.unitPrice * newQty,
        };
      }
      return item;
    }));
  };

  const removeItem = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const taxRate = 0.08; // 8% GST
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      // Generate order number
      const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

      // Prepare order items
      const items = cart.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        variant: item.variant?.name || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
        notes: item.specialInstructions || null,
      }));

      // Create order
      const order = await base44.entities.Order.create({
        tenant_id: tenant.id,
        order_number: orderNumber,
        status: 'pending',
        type: 'dine_in',
        table_id: tableId,
        table_name: cart[0]?.table_name || 'Unknown',
        items,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        notes: orderNote,
        payment_status: 'unpaid',
      });

      return order;
    },
    onSuccess: (order) => {
      toast.success('Order placed successfully!');
      navigate(createPageUrl(`CustomerOrder?orderId=${order.id}`));
      setCart([]);
      setOrderNote('');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to place order');
    },
  });

  if (cart.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh]">
          <SheetHeader>
            <SheetTitle>Your Cart</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center justify-center h-full py-12">
            <ShoppingBag className="w-16 h-16 text-slate-300 mb-4" />
            <p className="text-slate-500 text-lg">Your cart is empty</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>Your Cart ({cart.length} items)</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-4">
          {/* Cart Items */}
          {cart.map((item) => (
            <div key={item.id} className="flex gap-3 pb-4 border-b border-slate-100">
              {item.product.image_url && (
                <img
                  src={item.product.image_url}
                  alt={item.product.name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-slate-900">{item.product.name}</h4>
                {item.variant && (
                  <p className="text-sm text-slate-500">{item.variant.name}</p>
                )}
                {item.specialInstructions && (
                  <p className="text-xs text-slate-400 italic mt-1">{item.specialInstructions}</p>
                )}
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.id, -1)}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.id, 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">
                      {tenant.currency} {item.total.toFixed(2)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-600"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Order Note */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Add Order Note (Optional)</Label>
            <Textarea
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="e.g., No cutlery needed, allergies, etc."
              className="h-20"
            />
          </div>
        </div>

        <SheetFooter className="border-t border-slate-200 pt-4 space-y-3">
          {/* Totals */}
          <div className="w-full space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{tenant.currency} {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax (8%)</span>
              <span>{tenant.currency} {taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{tenant.currency} {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Place Order Button */}
          <Button
            onClick={() => placeOrderMutation.mutate()}
            disabled={placeOrderMutation.isPending}
            className="w-full h-14 text-lg font-semibold"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {placeOrderMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Placing Order...
              </>
            ) : (
              `Place Order - ${tenant.currency} ${total.toFixed(2)}`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}