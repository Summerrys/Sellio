import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function StockHistoryList() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem('stock_history') || '[]');
    setHistory(data);
  }, []);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-slate-500">No inventory changes recorded yet</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {history.map((entry) => {
        const isPositive = entry.change > 0;
        return (
          <div
            key={entry.id}
            style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {/* Product image */}
            {entry.product_image ? (
              <img src={entry.product_image} alt={entry.product_name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🛍️</div>
            )}

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.product_name || 'Unknown product'}
              </p>
              {entry.notes && (
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.notes}
                </p>
              )}
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                {entry.old_stock} → {entry.new_stock} units
              </p>
            </div>

            {/* Change badge + timestamp */}
            <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: '8px',
                background: isPositive ? '#dcfce7' : '#fee2e2',
                color: isPositive ? '#166534' : '#991b1b',
                fontWeight: '700',
                fontSize: '13px',
              }}>
                {isPositive ? `+${entry.change}` : entry.change}
              </span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                {entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, HH:mm') : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}