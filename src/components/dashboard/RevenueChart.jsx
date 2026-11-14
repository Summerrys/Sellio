import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSalesSince } from '@/lib/salesOrders';
import { orderTotal } from '@/lib/reportData';
import { formatMoney } from '@/lib/money';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { useAppText } from '@/lib/appText';
import { formatAppDate } from '@/lib/appDates';

// Sales per day: paid, not cancelled, not deleted (the Reports rule), read in pages of
// 1,000 by lib/salesOrders.js. This used to be db.entities.Order.filter(), which returns
// 50 rows in no particular order, so once a shop had more than 50 paid orders the chart
// was built from old ones and recent days showed $0.

export default function RevenueChart({ tenantId, currency }) {
  const { t } = useAppText();
  const [period, setPeriod] = useState('7days');

  // One fetch covers both views: the last 30 days, from local midnight.
  const since = startOfDay(subDays(new Date(), 29));
  const { data: orders = [] } = useQuery({
    queryKey: ['revenueOrders', tenantId, format(since, 'yyyy-MM-dd')],
    queryFn: () => fetchSalesSince(tenantId, since),
    enabled: !!tenantId,
  });

  const days = period === '7days' ? 7 : 30;
  const chartData = Array.from({ length: days }, (_, i) => {
    const date = subDays(new Date(), days - 1 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayOrders = orders.filter(o => {
      const orderDate = format(new Date(o.created_date), 'yyyy-MM-dd');
      return orderDate === dateStr;
    });

    const revenue = dayOrders.reduce((sum, o) => sum + orderTotal(o), 0);

    return {
      date: formatAppDate(date, 'MMM dd'),
      revenue: parseFloat(revenue.toFixed(2)),
    };
  });

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <Card className="p-6 border-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('Revenue')}</h3>
          <p className="text-2xl font-bold text-[rgb(var(--color-primary))] mt-1">
            {formatMoney(totalRevenue, currency)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={period === '7days' ? 'default' : 'outline'}
            onClick={() => setPeriod('7days')}
            className={period === '7days' ? 'bg-[rgb(var(--color-primary))]' : ''}
          >
            {t('7 Days')}
          </Button>
          <Button
            size="sm"
            variant={period === '30days' ? 'default' : 'outline'}
            onClick={() => setPeriod('30days')}
            className={period === '30days' ? 'bg-[rgb(var(--color-primary))]' : ''}
          >
            {t('30 Days')}
          </Button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [formatMoney(value, currency), t('Revenue')]}
            contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="rgb(var(--color-primary))"
            strokeWidth={2}
            dot={{ fill: 'rgb(var(--color-primary))', r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}