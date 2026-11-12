import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt } from 'lucide-react';
import { formatMoney } from '@/lib/money';

export default function SessionBillView({ orders, currency, onRequestBill, billRequested }) {
  const subtotal = orders.reduce((sum, order) => sum + order.subtotal, 0);
  const tax = orders.reduce((sum, order) => sum + order.tax_amount, 0);
  const total = orders.reduce((sum, order) => sum + order.total_amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Session Bill
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Orders Summary */}
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="border-b border-slate-100 pb-3">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-slate-700">
                  Order {order.order_number}
                </span>
                <span className="font-medium text-slate-900">
                  {formatMoney(order.total_amount, currency)}
                </span>
              </div>
              <div className="text-sm text-slate-500 space-y-1">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {item.quantity}x {item.product_name}
                      {item.variant ? ` (${item.variant})` : ''}
                    </span>
                    <span>{formatMoney(item.total, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Tax</span>
            <span>{formatMoney(tax, currency)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Total</span>
            <span>{formatMoney(total, currency)}</span>
          </div>
        </div>

        {/* Request Bill Button */}
        <Button
          onClick={onRequestBill}
          disabled={billRequested}
          className="w-full"
          size="lg"
        >
          {billRequested ? 'Bill Requested - Waiter Coming' : 'Request Bill'}
        </Button>

        <p className="text-xs text-center text-slate-500">
          Payment will be processed at your table
        </p>
      </CardContent>
    </Card>
  );
}