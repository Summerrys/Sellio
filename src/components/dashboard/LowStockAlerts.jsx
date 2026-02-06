import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Package } from 'lucide-react';

export default function LowStockAlerts({ tenantId }) {
  const { data: products = [] } = useQuery({
    queryKey: ['lowStockProducts', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const lowStockItems = products.filter(p => 
    (p.stock_quantity || 0) <= (p.low_stock_threshold || 5)
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
          {lowStockItems.slice(0, 5).map((product) => (
            <div key={product.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex-1">
                <p className="font-medium text-slate-900">{product.name}</p>
                <p className="text-sm text-amber-700">
                  Only {product.stock_quantity || 0} left
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