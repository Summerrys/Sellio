import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, ChefHat, BellRing, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

const STATUS_STEPS = [
  { key: 'pending', label: 'Received', icon: Check },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: BellRing },
  { key: 'served', label: 'Served', icon: CheckCircle2 },
];

export default function CustomerOrder() {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState(null);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setOrderId(urlParams.get('orderId'));
    fetchTenantData();

    // Celebration animation
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  const fetchTenantData = async () => {
    try {
      const tenants = await base44.entities.Tenant.filter({ status: 'active' }, '-created_date', 1);
      if (tenants.length > 0) {
        setTenant(tenants[0]);
      }
    } catch (error) {
      console.error('Failed to load tenant:', error);
    }
  };

  const { data: order, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orders = await base44.entities.Order.filter({ id: orderId });
      return orders[0];
    },
    enabled: !!orderId,
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

  // Subscribe to real-time order updates
  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = base44.entities.Order.subscribe((event) => {
      if (event.id === orderId && event.type === 'update') {
        refetch();
      }
    });

    return unsubscribe;
  }, [orderId, refetch]);

  if (!order || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading order...</p>
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.findIndex(step => step.key === order.status);
  const isCompleted = order.status === 'completed' || order.status === 'served';

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <style>{`
        :root {
          --primary: ${tenant.settings?.theme?.primary_color || '#1e293b'};
          --primary-dark: ${tenant.settings?.theme?.primary_dark || '#0f172a'};
          --accent: ${tenant.settings?.theme?.accent_color || '#f59e0b'};
        }
      `}</style>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Order Placed!</h1>
          <p className="text-slate-600">Your order has been sent to the kitchen</p>
        </div>

        {/* Order Number */}
        <Card className="p-6 mb-6 text-center border-0 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">Order Number</p>
          <p className="text-3xl font-bold text-slate-900">{order.order_number}</p>
          {order.table_name && (
            <p className="text-slate-600 mt-2">Table {order.table_name}</p>
          )}
        </Card>

        {/* Status Tracker */}
        <Card className="p-6 mb-6 border-0 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-6">Order Status</h3>
          
          <div className="space-y-4">
            {STATUS_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              
              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive 
                      ? 'bg-[var(--primary)] text-white' 
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p className="text-sm text-[var(--accent)] font-medium">In progress...</p>
                    )}
                  </div>
                  {isActive && index < currentStepIndex && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                </div>
              );
            })}
          </div>

          {order.status === 'preparing' && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-blue-700">
                Estimated time: <strong>15-20 minutes</strong>
              </p>
            </div>
          )}

          {(order.status === 'ready' || order.status === 'served') && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg flex items-center gap-3">
              <BellRing className="w-5 h-5 text-green-600 animate-pulse" />
              <p className="text-sm text-green-700 font-medium">
                Your order is ready! Please ask a staff member.
              </p>
            </div>
          )}
        </Card>

        {/* Order Items */}
        <Card className="p-6 mb-6 border-0 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Order Items</h3>
          <div className="space-y-3">
            {order.items?.map((item, index) => (
              <div key={index} className="flex justify-between">
                <div className="flex-1">
                  <p className="font-medium text-slate-900">
                    {item.quantity}x {item.product_name}
                  </p>
                  {item.variant && (
                    <p className="text-sm text-slate-500">{item.variant}</p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-slate-400 italic">{item.notes}</p>
                  )}
                </div>
                <p className="font-medium text-slate-900">
                  {tenant.currency} {item.total.toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 mt-4 pt-4 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{tenant.currency} {order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span>{tenant.currency} {order.tax_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>{tenant.currency} {order.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => navigate(createPageUrl(`CustomerMenu?table=${order.table_id}`))}
            className="w-full h-12"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            Order More Items
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="w-full h-12"
          >
            Print Receipt
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-500">
          <p>Thank you for dining at {tenant.name}</p>
          <p className="mt-1">Powered by Apptelier</p>
        </div>
      </div>
    </div>
  );
}