import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import OrderStatusTracker from '../components/customer/OrderStatusTracker';
import CallWaiterButton from '../components/customer/CallWaiterButton';
import SessionBillView from '../components/customer/SessionBillView';
import { ArrowLeft, Phone, ShoppingBag, Receipt } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function OrderTracking() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [billRequested, setBillRequested] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get('orderId'));
  }, []);

  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orders = await base44.entities.Order.filter({ id: orderId });
      return orders[0];
    },
    enabled: !!orderId,
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant', order?.tenant_id],
    queryFn: async () => {
      const tenants = await base44.entities.Tenant.filter({ id: order.tenant_id });
      return tenants[0];
    },
    enabled: !!order?.tenant_id,
  });

  const { data: table } = useQuery({
    queryKey: ['table', order?.table_id],
    queryFn: async () => {
      if (!order?.table_id) return null;
      const tables = await base44.entities.TableEntity.filter({ id: order.table_id });
      return tables[0];
    },
    enabled: !!order?.table_id,
  });

  // Get all orders for this table session
  const { data: sessionOrders = [] } = useQuery({
    queryKey: ['session-orders', order?.table_id],
    queryFn: async () => {
      if (!order?.table_id) return [];
      return base44.entities.Order.filter(
        { table_id: order.table_id, tenant_id: order.tenant_id },
        '-created_date',
        20
      );
    },
    enabled: !!order?.table_id,
  });

  // Real-time order updates
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = base44.entities.Order.subscribe((event) => {
      if (event.data?.id === orderId || event.data?.table_id === order?.table_id) {
        queryClient.invalidateQueries({ queryKey: ['order', orderId] });
        queryClient.invalidateQueries({ queryKey: ['session-orders'] });
      }
    });

    return unsubscribe;
  }, [orderId, order?.table_id, queryClient]);

  const handleOrderMore = () => {
    navigate(
      createPageUrl('CustomerMenu') +
        `?tenantSlug=${tenant.slug}&tableId=${order.table_id}`
    );
  };

  const handleRequestBill = async () => {
    try {
      await base44.entities.TableCall.create({
        tenant_id: order.tenant_id,
        table_id: order.table_id,
        table_name: order.table_name,
        type: 'bill',
        status: 'pending',
      });
      setBillRequested(true);
    } catch (error) {
      console.error('Failed to request bill:', error);
    }
  };

  if (!order || !tenant) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading order...</p>
      </div>
    );
  }

  const activeOrders = sessionOrders.filter(
    (o) => !['cancelled', 'completed'].includes(o.status)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div
        className="text-white p-6 pb-32"
        style={{ background: `rgb(var(--color-primary))` }}
      >
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/20 mb-4"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-4 mb-4">
            {tenant.logo_url && (
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="w-16 h-16 rounded-lg bg-white"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">{tenant.name}</h1>
              {table && (
                <p className="text-white/80">Table {table.name}</p>
              )}
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <p className="text-white/80 text-sm mb-1">Order Number</p>
            <p className="text-3xl font-bold">{order.order_number}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto -mt-24 px-6 pb-6 space-y-6">
        {/* Action Buttons */}
        {table && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleOrderMore}
              variant="outline"
              className="bg-white gap-2 h-12"
            >
              <ShoppingBag className="w-4 h-4" />
              Order More
            </Button>
            <Button
              onClick={() => setShowBill(!showBill)}
              variant="outline"
              className="bg-white gap-2 h-12"
            >
              <Receipt className="w-4 h-4" />
              View Bill
            </Button>
          </div>
        )}

        {/* Bill View */}
        {showBill && activeOrders.length > 0 && (
          <SessionBillView
            orders={activeOrders}
            currency={tenant.currency}
            onRequestBill={handleRequestBill}
            billRequested={billRequested}
          />
        )}

        {/* Order Status */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Order Status</h2>
            <OrderStatusTracker order={order} />
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Order</h3>
            <div className="space-y-3">
              {order.items?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-start pb-3 border-b border-slate-100 last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {item.quantity}x {item.product_name}
                    </p>
                    {item.variant && (
                      <p className="text-sm text-slate-500">{item.variant}</p>
                    )}
                    {item.notes && (
                      <p className="text-sm text-slate-500 italic">{item.notes}</p>
                    )}
                  </div>
                  <p className="font-medium text-slate-900">
                    {tenant.currency} {item.total.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span>
                  {tenant.currency} {order.total_amount.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Orders */}
        {sessionOrders.length > 1 && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                All Table Orders
              </h3>
              <div className="space-y-2">
                {sessionOrders.map((sessionOrder) => (
                  <div
                    key={sessionOrder.id}
                    className="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {sessionOrder.order_number}
                      </p>
                      <p className="text-sm text-slate-500 capitalize">
                        {sessionOrder.status.replace('_', ' ')}
                      </p>
                    </div>
                    <p className="font-medium text-slate-900">
                      {tenant.currency} {sessionOrder.total_amount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Need Help Section */}
        {table && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Need Help?</h3>
              <div className="grid gap-3">
                <CallWaiterButton
                  tableId={order.table_id}
                  tableName={order.table_name}
                  tenantId={order.tenant_id}
                />
                {tenant.phone && (
                  <Button variant="outline" asChild>
                    <a href={`tel:${tenant.phone}`} className="gap-2">
                      <Phone className="w-4 h-4" />
                      Call Restaurant
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}