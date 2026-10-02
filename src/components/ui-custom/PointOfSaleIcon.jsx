import React from 'react';

export default function PointOfSaleIcon({ strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="11" y="2" width="9" height="5" rx="1" />
      <path d="M15 7v3M6.5 10h11l2 6h-15z" />
      <path d="M8 12h2m4 0h2M7.5 14h2m4 0h2" />
      <rect x="3" y="16" width="18" height="5" rx="1.5" />
      <path d="M10 18.5h4" />
    </svg>
  );
}
