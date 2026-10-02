import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, PackageX, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { inventoryStatus } from '@/lib/reportData';

function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="p-2.5 sm:p-4">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1.5 sm:mb-2 ${iconBg}`}>
          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${iconColor}`} />
        </div>
        <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</p>
        <p className="text-sm sm:text-xl font-bold text-slate-900 leading-tight mt-0.5 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

// stockHistory: rows from stock_history within the selected date range (these DO
// carry product_name directly, captured at adjustment time).
// inventoryItems: current stock levels (not date-filtered — a live snapshot).
// Stock alerts only cover items with "Track Inventory" switched on; items left on
// "Unlimited" keep a stored count of 0 that means nothing, so they are skipped
// (same rule as the Dashboard: 0 = out of stock, below the item's level = low).
export default function InventoryReport({ stockHistory, inventoryItems, products = [], themeColors }) {
  const stock = inventoryStatus(products, inventoryItems);
  const alerts = [...stock.out, ...stock.low];

  // Adjustments over time
  const adjustmentsByDate = stockHistory.reduce((acc, h) => {
    const date = format(new Date(h.created_date), 'MMM dd');
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  const adjustmentData = Object.entries(adjustmentsByDate).map(([date, count]) => ({ date, count })).reverse();

  // Most-adjusted products
  const productActivity = stockHistory.reduce((acc, h) => {
    const key = h.product_name || 'Unknown product';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const mostActive = Object.entries(productActivity)
    .map(([name, count]) => ({ name: name.length > 18 ? name.substring(0, 18) + '...' : name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        <StatCard
          label="Out of Stock"
          value={stock.out.length}
          icon={PackageX}
          iconBg="bg-red-50"
          iconColor="text-red-500"
        />
        <StatCard
          label="Low Stock"
          value={stock.low.length}
          icon={AlertTriangle}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          label="Adjustments"
          value={stockHistory.length}
          icon={RefreshCw}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
      </div>

      {stock.trackedCount === 0 ? (
        <div className="p-3 sm:p-4 rounded-xl border border-slate-100 bg-slate-50 text-xs sm:text-sm text-slate-500" data-testid="stock-none-tracked">
          No items track stock yet, so there are no stock alerts. To get them, switch on Track Inventory for an item on the Products page.
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-3 sm:p-4 rounded-xl border border-emerald-100 bg-emerald-50/60 text-xs sm:text-sm text-emerald-700" data-testid="stock-all-ok">
          {stock.trackedCount === 1
            ? 'The 1 item that tracks stock is above its low-stock level.'
            : `All ${stock.trackedCount} items that track stock are above their low-stock level.`}
        </div>
      ) : (
        <Card className="border-slate-100 shadow-sm">
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-sm sm:text-base text-red-600">Needs Restocking ({alerts.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5" data-testid="stock-alerts">
              {alerts.slice(0, 12).map((item) => (
                <div
                  key={item.product_id}
                  className={`p-2.5 sm:p-3 rounded-xl border ${item.status === 'out' ? 'bg-red-50/60 border-red-100' : 'bg-amber-50/60 border-amber-100'}`}
                >
                  <p className="font-medium text-slate-800 text-xs sm:text-sm truncate">{item.name}</p>
                  <p className={`text-[10px] sm:text-xs ${item.status === 'out' ? 'text-red-500' : 'text-amber-600'}`}>
                    {item.status === 'out' ? 'Out of stock' : `${item.stock} left`} · level {item.threshold}
                  </p>
                </div>
              ))}
              {alerts.length > 12 && (
                <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl flex items-center justify-center">
                  <p className="text-slate-500 text-xs sm:text-sm">+{alerts.length - 12} more</p>
                </div>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-2">
              Only items with Track Inventory switched on are checked ({stock.trackedCount}).
            </p>
          </CardContent>
        </Card>
      )}

      {stockHistory.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No stock adjustments in this period
        </div>
      ) : (
        <>
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">Stock Adjustments Over Time</CardTitle>
            </CardHeader>
            <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={adjustmentData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                  <Bar dataKey="count" fill={themeColors.primary} radius={[6, 6, 0, 0]} barSize={18} name="Adjustments" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">Most Adjusted Products</CardTitle>
            </CardHeader>
            <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={mostActive} layout="vertical" margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                  <Bar dataKey="count" fill={themeColors.accent} radius={[0, 6, 6, 0]} barSize={14} name="Times adjusted" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
