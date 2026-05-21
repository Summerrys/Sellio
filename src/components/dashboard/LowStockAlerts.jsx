import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Package } from 'lucide-react';

export default function LowStockAlerts({ tenantId }) {
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, product:products(name, image_url, track_inventory, is_active)')
        .eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!tenantId,
  });

  const lowStockItems = inventoryItems.filter(item =>
    item.product?.track_inventory &&
    item.product?.is_active &&
    item.current_stock > 0 &&
    item.current_stock < item.low_stock_threshold
  );

  return (
    <Card className="p-6 border-0 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-slate-900">Low Stock Alerts</h3>
        {lowStockItems.length > 0 && (
          <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">
            {lowStockItems.length}
          </span>
        )}
      </div>

      {lowStockItems.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-slate-500">All items well stocked!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lowStockItems.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex-1">
                <p className="font-medium text-slate-900">{item.product?.name}</p>
                <p className="text-sm text-amber-700">
                  Only {item.current_stock} left
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-xs">
                Restock
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}