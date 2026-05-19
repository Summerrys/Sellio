import React from 'react';

/**
 * Renders price with optional strikethrough compare_at_price.
 * Shows strikethrough only when compare_at_price > price.
 */
export default function PriceDisplay({ price, compareAtPrice, currency = 'SGD', className = '' }) {
  const showStrikethrough = compareAtPrice && compareAtPrice > price;

  if (showStrikethrough) {
    return (
      <span className={className}>
        <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '0.85em', marginRight: '6px' }}>
          {currency} {parseFloat(compareAtPrice).toFixed(2)}
        </span>
        <span style={{ fontWeight: '600' }}>
          {currency} {parseFloat(price).toFixed(2)}
        </span>
      </span>
    );
  }

  return (
    <span className={className} style={{ fontWeight: '600' }}>
      {currency} {parseFloat(price).toFixed(2)}
    </span>
  );
}