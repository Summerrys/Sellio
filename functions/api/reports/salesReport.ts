import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { success, error } from '../../lib/apiResponse.js';
import { authenticate } from '../../lib/apiAuth.js';

/**
 * GET /api/v1/reports/sales
 * Generate sales report
 */
Deno.serve(async (req) => {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    
    const { base44, tenant } = auth;
    const url = new URL(req.url);
    
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const groupBy = url.searchParams.get('groupBy') || 'day'; // day, week, month

    // Fetch orders in date range
    const orders = await base44.entities.Order.filter(
      { tenant_id: tenant.id },
      '-created_date'
    );

    // Filter by date range
    const filteredOrders = orders.filter(order => {
      if (order.status === 'cancelled') return false;
      const orderDate = new Date(order.created_date);
      if (from && orderDate < new Date(from)) return false;
      if (to && orderDate > new Date(to)) return false;
      return true;
    });

    // Calculate totals
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Group by period
    const groupedData = {};
    filteredOrders.forEach(order => {
      const date = new Date(order.created_date);
      let key;
      
      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const week = Math.floor(date.getDate() / 7);
        key = `${date.getFullYear()}-W${week}`;
      } else if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!groupedData[key]) {
        groupedData[key] = { revenue: 0, orders: 0 };
      }
      groupedData[key].revenue += order.total_amount || 0;
      groupedData[key].orders += 1;
    });

    // Format grouped data
    const chartData = Object.entries(groupedData).map(([period, data]) => ({
      period,
      revenue: data.revenue,
      orders: data.orders,
      averageValue: data.orders > 0 ? data.revenue / data.orders : 0,
    }));

    return success({
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        period: { from, to },
      },
      chartData,
    });
  } catch (err) {
    console.error('Sales report error:', err);
    return error(err.message || 'Failed to generate sales report');
  }
});