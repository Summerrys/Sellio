import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, UserPlus, DollarSign } from 'lucide-react';
import { isWithinInterval } from 'date-fns';

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

// customers: every customer row for this tenant (not date-filtered directly — a
// customer's total_orders/total_spent are running lifetime totals maintained by
// the app on every order, not per-period figures). "New" here means their very
// first order fell inside the selected date range; "Returning" means they placed
// an order in range but had ordered before that range started.
export default function CustomerInsights({ customers, dateRange, currency, themeColors }) {
  const activeInRange = customers.filter(c =>
    c.last_order_at && dateRange?.from && dateRange?.to &&
    isWithinInterval(new Date(c.last_order_at), { start: dateRange.from, end: dateRange.to })
  );

  const newCustomers = activeInRange.filter(c =>
    c.first_order_at && dateRange?.from && dateRange?.to &&
    isWithinInterval(new Date(c.first_order_at), { start: dateRange.from, end: dateRange.to })
  );
  const returningCustomers = activeInRange.filter(c => !newCustomers.includes(c));

  const totalSpent = activeInRange.reduce((sum, c) => sum + (c.total_spent || 0), 0);
  const avgSpend = activeInRange.length > 0 ? totalSpent / activeInRange.length : 0;

  const topSpenders = [...customers]
    .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    .slice(0, 10);

  const breakdownData = [
    { name: 'New', value: newCustomers.length },
    { name: 'Returning', value: returningCustomers.length },
  ].filter(d => d.value > 0);

  const COLORS = [themeColors.accent, themeColors.primary];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        <StatCard
          label="Active Customers"
          value={activeInRange.length}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="New"
          value={newCustomers.length}
          icon={UserPlus}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Avg Spend"
          value={`${currency} ${avgSpend.toFixed(2)}`}
          icon={DollarSign}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
      </div>

      {activeInRange.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No customer activity in this period
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">New vs. Returning</CardTitle>
            </CardHeader>
            <CardContent className="px-1 sm:px-6 pb-3 sm:pb-6">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={breakdownData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {breakdownData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f1f5f9', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-sm sm:text-base">Top Spenders (All Time)</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="space-y-1">
                {topSpenders.map((c, idx) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base font-bold text-slate-200 w-5 flex-shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 text-xs sm:text-sm truncate">{c.name || c.phone || 'Guest'}</p>
                        <p className="text-[10px] sm:text-xs text-slate-400">{c.total_orders || 0} orders</p>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm font-bold flex-shrink-0 ml-2" style={{ color: themeColors.primary }}>
                      {currency} {(c.total_spent || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
