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
import { MapPin, Clock, User, Printer, XCircle } from 'lucide-react';
import StatusBadge from '../ui-custom/StatusBadge';
import { formatMoney } from '@/lib/money';
import { useAppText } from '@/lib/appText';
import { formatAppDate } from '@/lib/appDates';

export default function OrderDetailDialog({ open, onOpenChange, order, onPrint, onCancel, currency }) {
  const { t } = useAppText();
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t('Order {order_number}', { order_number: order.order_number })}</span>
            <StatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">{t('Date & Time')}</p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <p className="font-medium text-slate-900">
                  {formatAppDate(new Date(order.created_date), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-500 mb-1">{t('Order Type')}</p>
              {order.type === 'dine_in' && order.table_name ? (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <p className="font-medium text-slate-900">{t('Table {table_name}', { table_name: order.table_name })}</p>
                </div>
              ) : (
                <Badge className="bg-purple-100 text-purple-700">
                  {order.type === 'takeaway' ? t('Takeaway') : t('Delivery')}
                </Badge>
              )}
            </div>

            {order.served_by && (
              <div>
                <p className="text-sm text-slate-500 mb-1">{t('Served By')}</p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  <p className="font-medium text-slate-900">{order.served_by}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-slate-500 mb-1">{t('Payment Status')}</p>
              <StatusBadge status={order.payment_status} />
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">{t('Order Items')}</h4>
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
                  <p className="font-medium text-slate-900">{formatMoney(item.total, currency)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Order Notes */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">{t('Special Instructions')}</h4>
              <p className="text-sm text-yellow-700">{order.notes}</p>
            </div>
          )}

          {/* Totals */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatMoney(order.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>{t('Tax')}</span>
              <span>{formatMoney(order.tax_amount, currency)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('Discount')}</span>
                <span>-{formatMoney(order.discount_amount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{formatMoney(order.total_amount, currency)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onPrint(order)}>
            <Printer className="w-4 h-4 mr-2" />
            {t('Print Receipt')}
          </Button>
          {order.status !== 'cancelled' && order.status !== 'completed' && (
            <Button variant="outline" className="text-red-600" onClick={() => onCancel(order)}>
              <XCircle className="w-4 h-4 mr-2" />
              {t('Cancel Order')}
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>{t('Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}