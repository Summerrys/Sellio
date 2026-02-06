import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CustomerMenu() {
  const params = new URLSearchParams(window.location.search);
  const tenantSlug = params.get('tenant');
  const tableId = params.get('table');

  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const { data: tenants = [] } = useQuery({
    queryKey: ['customerTenant', tenantSlug],
    queryFn: () => base44.entities.Tenant.filter({ slug: tenantSlug }),
    enabled: !!tenantSlug,
  });
  const tenant = tenants[0];

  const { data: table } = useQuery({
    queryKey: ['customerTable', tableId],
    queryFn: async () => {
      const tables = await base44.entities.TableEntity.filter({ id: tableId });
      return tables[0];
    },
    enabled: !!tableId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['customerCategories', tenant?.id],
    queryFn: () => base44.entities.Category.filter({ tenant_id: tenant.id, is_active: true }),
    enabled: !!tenant?.id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['customerProducts', tenant?.id],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenant.id, is_active: true }),
    enabled: !!tenant?.id,
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const items = cart.map(c => ({
        product_id: c.product.id,
        product_name: c.product.name,
        quantity: c.quantity,
        unit_price: c.product.price,
        total: c.product.price * c.quantity,
        notes: c.notes || '',
      }));
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      await base44.entities.Order.create({
        tenant_id: tenant.id,
        order_number: orderNumber,
        status: 'pending',
        type: tableId ? 'dine_in' : 'takeaway',
        table_id: tableId || '',
        table_name: table?.name || '',
        customer_name: customerName,
        items,
        subtotal,
        total_amount: subtotal,
        notes,
      });
    },
    onSuccess: () => {
      setCart([]);
      setShowCart(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    },
  });

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter(c => c.quantity > 0));
  };

  const cartTotal = cart.reduce((s, c) => s + (c.product.price * c.quantity), 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const filteredProducts = activeCategory === 'all' ? products : products.filter(p => p.category_id === activeCategory);

  if (!tenantSlug) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><p className="text-slate-400">Invalid menu link.</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{tenant?.name || 'Menu'}</h1>
              {table && <p className="text-xs text-slate-400">Table {table.name}</p>}
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-3">
          {filteredProducts.map(p => {
            const inCart = cart.find(c => c.product.id === p.id);
            return (
              <Card key={p.id} className="border-0 shadow-sm p-4 flex gap-4">
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
                  {p.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-base font-bold text-slate-900">${p.price?.toFixed(2)}</span>
                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQty(p.id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-semibold w-5 text-center">{inCart.quantity}</span>
                        <Button size="icon" className="h-7 w-7 rounded-full bg-slate-900 hover:bg-slate-800" onClick={() => updateQty(p.id, 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="h-8 bg-slate-900 hover:bg-slate-800 text-xs gap-1" onClick={() => addToCart(p)}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Floating Cart Button */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto">
            <Button
              onClick={() => setShowCart(true)}
              className="w-full h-14 bg-slate-900 hover:bg-slate-800 rounded-2xl shadow-xl text-sm font-medium flex items-center justify-between px-6"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span>{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-lg font-bold">${cartTotal.toFixed(2)}</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Your Order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto">
            {cart.map(c => (
              <div key={c.product.id} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{c.product.name}</p>
                  <p className="text-xs text-slate-400">${c.product.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-6 w-6 rounded-full" onClick={() => updateQty(c.product.id, -1)}>
                    {c.quantity === 1 ? <Trash2 className="w-3 h-3 text-red-500" /> : <Minus className="w-3 h-3" />}
                  </Button>
                  <span className="text-sm font-semibold w-5 text-center">{c.quantity}</span>
                  <Button size="icon" className="h-6 w-6 rounded-full bg-slate-900" onClick={() => updateQty(c.product.id, 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                  <span className="text-sm font-semibold w-14 text-right">${(c.product.price * c.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-3">
            <Input placeholder="Your name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            <Textarea placeholder="Special requests (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total</span><span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-12 bg-slate-900 hover:bg-slate-800 rounded-xl gap-2" onClick={() => orderMutation.mutate()} disabled={orderMutation.isPending}>
              <Send className="w-4 h-4" /> {orderMutation.isPending ? 'Placing Order...' : 'Place Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Banner */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-50 max-w-2xl mx-auto bg-green-500 text-white p-4 rounded-2xl shadow-xl flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6" />
            <div>
              <p className="font-semibold">Order Placed!</p>
              <p className="text-sm text-green-100">Your order has been sent to the kitchen.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}