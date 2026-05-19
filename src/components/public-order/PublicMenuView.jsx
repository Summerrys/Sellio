import { useState } from 'react';
import { ShoppingCart, MapPin, UtensilsCrossed, Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PublicMenuView({ tenant, table, categories, products, cart, setCart, currency, gradientStyle, onViewCart }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = products.filter(p => {
    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.total, 0);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice }
          : i
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        total: product.price,
        image_url: product.image_url || null,
      }];
    });
  };

  const getItemQty = (productId) => cart.find(i => i.productId === productId)?.quantity || 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            {tenant.logo_url
              ? <img src={tenant.logo_url} alt={tenant.name} className="h-10 w-10 object-contain rounded-lg flex-shrink-0" />
              : (
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ background: gradientStyle }}>
                  {tenant.name?.charAt(0)}
                </div>
              )
            }
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">{tenant.name}</h1>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span>{table.name}</span>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search menu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="overflow-x-auto hide-scrollbar px-4 pb-3">
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                  selectedCategory === 'all' ? 'pub-pill-active text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                )}
                style={selectedCategory === 'all' ? { background: gradientStyle } : {}}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                    selectedCategory === cat.id ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                  )}
                  style={selectedCategory === cat.id ? { background: gradientStyle } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? 'No items found' : 'No items available'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                qty={getItemQty(product.id)}
                onAdd={() => addToCart(product)}
                onRemove={() => {
                  setCart(prev => {
                    const item = prev.find(i => i.productId === product.id);
                    if (!item) return prev;
                    if (item.quantity === 1) return prev.filter(i => i.productId !== product.id);
                    return prev.map(i => i.productId === product.id
                      ? { ...i, quantity: i.quantity - 1, total: (i.quantity - 1) * i.unitPrice }
                      : i
                    );
                  });
                }}
                gradientStyle={gradientStyle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={onViewCart}
              className="w-full h-14 rounded-2xl text-white font-semibold text-base flex items-center justify-between px-5 shadow-lg active:scale-[0.98] transition-transform"
              style={{ background: gradientStyle }}
            >
              <div className="flex items-center gap-2">
                <div className="bg-white/20 rounded-lg px-2 py-0.5 text-sm font-bold">{cartCount}</div>
                <ShoppingCart className="w-5 h-5" />
                <span>View Cart</span>
              </div>
              <span>{currency} {cartTotal.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, currency, qty, onAdd, onRemove, gradientStyle }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col">
      <div className="relative aspect-square bg-slate-100">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex items-center justify-center">
              <UtensilsCrossed className="w-8 h-8 text-slate-300" />
            </div>
          )
        }
      </div>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 flex-1 mb-1">{product.name}</p>
        <p className="text-sm font-bold text-slate-900 mb-2">{currency} {Number(product.price).toFixed(2)}</p>
        {qty === 0 ? (
          <button
            onClick={onAdd}
            className="w-full h-9 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
            style={{ background: gradientStyle }}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        ) : (
          <div className="flex items-center justify-between bg-slate-100 rounded-xl overflow-hidden h-9">
            <button onClick={onRemove} className="w-9 h-9 text-slate-700 text-xl font-bold flex items-center justify-center active:bg-slate-200 transition-colors">−</button>
            <span className="text-sm font-bold text-slate-800">{qty}</span>
            <button onClick={onAdd} className="w-9 h-9 text-white text-xl font-bold flex items-center justify-center active:opacity-80 transition-opacity rounded-xl" style={{ background: gradientStyle }}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}