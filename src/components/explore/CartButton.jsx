import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCartCount } from '@/lib/shopCart';

// The cart icon (Explore's header, a listing's header) and its number: everything in
// this phone's carts, from every shop.

// 'round': on a listing's round button (as in the design); 'bar': in a header row, like
// the Chats button's count next to it.
export function CartBadge({ count, look = 'round' }) {
  if (!(count > 0)) return null;
  const className = look === 'bar'
    ? 'absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center'
    : 'absolute -top-1 -right-1 min-w-[20px] h-5 px-[5px] rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center border-2 border-white';
  return <span aria-hidden="true" className={className}>{count > 99 ? '99+' : count}</span>;
}

export const cartLabel = (count) => (count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart');

export default function CartLink({ className = '' }) {
  const count = useCartCount();
  return (
    <Link
      to="/explore/cart"
      aria-label={cartLabel(count)}
      title="Cart"
      className={`relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-slate-700 hover:bg-slate-100 ${className}`}
    >
      <ShoppingCart className="w-5 h-5" />
      <CartBadge count={count} look="bar" />
    </Link>
  );
}
