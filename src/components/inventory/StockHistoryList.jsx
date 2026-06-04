import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';

export default function StockHistoryList({ tenantId }) {
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      setIsLoading(true);
      const supabase = await getSupabase();
      const [{ data: historyData }, { data: productData }] = await Promise.all([
        supabase
          .from('stock_history')
          .select('id, created_date, product_id, product_name, old_stock, new_stock, change_amount, notes, changed_by')
          .eq('tenant_id', tenantId)
          .order('created_date', { ascending: false })
          .limit(100),
        supabase
          .from('products')
          .select('id, image_url')
          .eq('tenant_id', tenantId),
      ]);
      const prodMap = Object.fromEntries((productData || []).map(p => [p.id, p]));
      setProducts(prodMap);
      setHistory(historyData || []);
      setIsLoading(false);
    };
    load();
  }, [tenantId]);

  if (isLoading) {
    return <div className="text-center py-12 text-slate-400 text-sm">Loading history...</div>;
  }

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
        const isPositive = (entry.change_amount ?? 0) > 0;
        const imageUrl = products[entry.product_id]?.image_url || null;
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
            {imageUrl ? (
              <img src={imageUrl} alt={entry.product_name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
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
                {isPositive ? `+${entry.change_amount}` : entry.change_amount}
              </span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                {entry.created_date ? format(new Date(entry.created_date), 'MMM d, HH:mm') : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}