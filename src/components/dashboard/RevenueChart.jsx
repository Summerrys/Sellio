import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import db from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export default function RevenueChart({ tenantId }) {
  const [period, setPeriod] = useState('7days');

  const { data: orders = [] } = useQuery({
    queryKey: ['revenueOrders', tenantId],
    queryFn: () => db.entities.Order.filter({ 
      tenant_id: tenantId,
      payment_status: 'paid'
    }),
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

    const revenue = dayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    return {
      date: format(date, 'MMM dd'),
      revenue: parseFloat(revenue.toFixed(2)),
    };
  });

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <Card className="p-6 border-0 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Revenue</h3>
          <p className="text-2xl font-bold text-[rgb(var(--color-primary))] mt-1">
            ${totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={period === '7days' ? 'default' : 'outline'}
            onClick={() => setPeriod('7days')}
            className={period === '7days' ? 'bg-[rgb(var(--color-primary))]' : ''}
          >
            7 Days
          </Button>
          <Button
            size="sm"
            variant={period === '30days' ? 'default' : 'outline'}
            onClick={() => setPeriod('30days')}
            className={period === '30days' ? 'bg-[rgb(var(--color-primary))]' : ''}
          >
            30 Days
          </Button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
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