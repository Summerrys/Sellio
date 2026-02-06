import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ProductCard from '../components/customer/ProductCard';
import ProductVariantModal from '../components/customer/ProductVariantModal';
import CartDrawer from '../components/customer/CartDrawer';
import { ShoppingCart, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CustomerMenu() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [tenant, setTenant] = useState(null);
  const [tableId, setTableId] = useState(null);

  // Get tenant slug and table ID from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    setTableId(tableParam);

    // In production, extract tenant slug from subdomain
    // For now, use default tenant (first one) or get from localStorage
    fetchTenantData();
  }, []);

  const fetchTenantData = async () => {
    try {
      const tenants = await base44.entities.Tenant.filter({ status: 'active' }, '-created_date', 1);
      if (tenants.length > 0) {
        setTenant(tenants[0]);
      }
    } catch (error) {
      console.error('Failed to load tenant:', error);
    }
  };

  const { data: table } = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => base44.entities.TableEntity.filter({ id: tableId })[0],
    enabled: !!tableId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenant?.id],
    queryFn: () => base44.entities.Category.filter({ tenant_id: tenant.id, is_active: true }, 'sort_order'),
    enabled: !!tenant?.id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenant.id, is_active: true }),
    enabled: !!tenant?.id,
  });

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchQuery || 
      product.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product, variant = null, quantity = 1, specialInstructions = '') => {
    const cartItem = {
      id: `${product.id}-${variant?.id || 'base'}-${Date.now()}`,
      product,
      variant,
      quantity,
      specialInstructions,
      unitPrice: product.price + (variant?.price_modifier || 0),
      total: (product.price + (variant?.price_modifier || 0)) * quantity,
    };

    setCart(prev => [...prev, cartItem]);
    setSelectedProduct(null);
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading restaurant...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <style>{`
        :root {
          --primary: ${tenant.settings?.theme?.primary_color || '#1e293b'};
          --primary-dark: ${tenant.settings?.theme?.primary_dark || '#0f172a'};
          --accent: ${tenant.settings?.theme?.accent_color || '#f59e0b'};
        }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            {tenant.logo_url && (
              <img src={tenant.logo_url} alt={tenant.name} className="h-10 object-contain" />
            )}
            <h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1>
            {table && (
              <Badge className="bg-[var(--primary)] text-white">
                <MapPin className="w-3 h-3 mr-1" />
                Table {table.name}
              </Badge>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="overflow-x-auto hide-scrollbar px-4 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                selectedCategory === 'all'
                  ? "bg-[var(--primary)] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              All Items
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                  selectedCategory === cat.id
                    ? "bg-[var(--primary)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            {searchQuery ? 'No items found' : 'No items available'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={(qty, instructions) => {
                  if (product.variants?.length > 0) {
                    setSelectedProduct(product);
                  } else {
                    addToCart(product, null, qty, instructions);
                  }
                }}
                currency={tenant.currency || 'SGD'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-40">
          <div className="max-w-2xl mx-auto">
            <Button
              onClick={() => setShowCart(true)}
              className="w-full h-14 text-lg font-semibold gap-3"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <ShoppingCart className="w-5 h-5" />
              View Cart ({cartItemCount})
              <span className="ml-auto">{tenant.currency} {cartTotal.toFixed(2)}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Variant Selection Modal */}
      <ProductVariantModal
        open={!!selectedProduct}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        product={selectedProduct}
        onAddToCart={addToCart}
        currency={tenant.currency || 'SGD'}
      />

      {/* Cart Drawer */}
      <CartDrawer
        open={showCart}
        onOpenChange={setShowCart}
        cart={cart}
        setCart={setCart}
        tenant={tenant}
        tableId={tableId}
      />

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}