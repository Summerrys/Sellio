import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function StockHistoryList({ tenantId }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['stockHistory', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('stock_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_date', { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!tenantId,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-slate-400">Loading history...</div>;
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
        const isPositive = entry.change_amount > 0;
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
            {/* Change badge */}
            <div style={{
              flexShrink: 0,
              minWidth: '52px',
              textAlign: 'center',
              padding: '4px 8px',
              borderRadius: '8px',
              background: isPositive ? '#dcfce7' : '#fee2e2',
              color: isPositive ? '#166534' : '#991b1b',
              fontWeight: '700',
              fontSize: '14px',
            }}>
              {isPositive ? `+${entry.change_amount}` : entry.change_amount}
            </div>

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
                {entry.changed_by ? ` · ${entry.changed_by}` : ''}
              </p>
            </div>

            {/* Timestamp */}
            <div style={{ flexShrink: 0, fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
              {entry.created_date ? format(new Date(entry.created_date), 'MMM d, HH:mm') : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}