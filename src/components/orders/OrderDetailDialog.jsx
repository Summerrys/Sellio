import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { MapPin, Clock, User, Printer, XCircle } from 'lucide-react';
import StatusBadge from '../ui-custom/StatusBadge';

export default function OrderDetailDialog({ open, onOpenChange, order, onPrint, onCancel, currency }) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Order {order.order_number}</span>
            <StatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">Date & Time</p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <p className="font-medium text-slate-900">
                  {format(new Date(order.created_date), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-500 mb-1">Order Type</p>
              {order.type === 'dine_in' && order.table_name ? (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <p className="font-medium text-slate-900">Table {order.table_name}</p>
                </div>
              ) : (
                <Badge className="bg-purple-100 text-purple-700">
                  {order.type === 'takeaway' ? 'Takeaway' : 'Delivery'}
                </Badge>
              )}
            </div>

            {order.served_by && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Served By</p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  <p className="font-medium text-slate-900">{order.served_by}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-500 mb-1">Payment Status</p>
              <StatusBadge status={order.payment_status} />
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Order Items</h4>
            <div className="space-y-3">
              {order.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start pb-3 border-b border-slate-100">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {item.quantity}x {item.product_name}
                    </p>
                    {item.variant && (
                      <p className="text-sm text-slate-500">{item.variant}</p>
                    )}
                    {item.notes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-2">
                        <p className="text-xs text-yellow-700">{item.notes}</p>
                      </div>
                    )}
                  </div>
                  <p className="font-medium text-slate-900">{currency} {item.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Order Notes */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">Special Instructions</h4>
              <p className="text-sm text-yellow-700">{order.notes}</p>
            </div>
          )}

          {/* Totals */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{currency} {order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span>{currency} {order.tax_amount.toFixed(2)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{currency} {order.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{currency} {order.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onPrint(order)}>
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
          {order.status !== 'cancelled' && order.status !== 'completed' && (
            <Button variant="outline" className="text-red-600" onClick={() => onCancel(order)}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Order
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}