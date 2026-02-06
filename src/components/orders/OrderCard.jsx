import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function OrderCard({ order, onStatusChange, onClick, currency }) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const created = new Date(order.created_date);
      const minutes = Math.floor((now - created) / 60000);
      setElapsedTime(minutes);
    }, 1000);

    return () => clearInterval(interval);
  }, [order.created_date]);

  const getTimerColor = () => {
    if (elapsedTime > 30) return 'text-red-600 font-bold';
    if (elapsedTime > 20) return 'text-amber-600 font-semibold';
    return 'text-slate-600';
  };

  const statusActions = {
    pending: { label: 'Accept', nextStatus: 'confirmed' },
    confirmed: { label: 'Start Preparing', nextStatus: 'preparing' },
    preparing: { label: 'Mark Ready', nextStatus: 'ready' },
    ready: { label: 'Mark Served', nextStatus: 'served' },
  };

  const action = statusActions[order.status];

  return (
    <Card 
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: order.status === 'pending' ? '#f59e0b' : 'transparent' }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-bold text-lg text-slate-900">{order.order_number}</h4>
          <p className="text-xs text-slate-500">
            {format(new Date(order.created_date), 'HH:mm')}
          </p>
        </div>
        <div className={`flex items-center gap-1 ${getTimerColor()}`}>
          <Clock className="w-4 h-4" />
          <span className="text-sm font-semibold">{elapsedTime}m</span>
        </div>
      </div>

      {/* Table/Type */}
      <div className="flex items-center gap-2 mb-3">
        {order.type === 'dine_in' && order.table_name ? (
          <Badge className="bg-blue-100 text-blue-700">
            <MapPin className="w-3 h-3 mr-1" />
            Table {order.table_name}
          </Badge>
        ) : (
          <Badge className="bg-purple-100 text-purple-700">
            {order.type === 'takeaway' ? 'Takeaway' : 'Delivery'}
          </Badge>
        )}
      </div>

      {/* Items */}
      <div className="space-y-1.5 mb-3">
        {order.items?.slice(0, 3).map((item, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-medium text-slate-900">{item.quantity}x</span>{' '}
            <span className="text-slate-700">{item.product_name}</span>
            {item.variant && (
              <span className="text-slate-500 text-xs"> ({item.variant})</span>
            )}
            {item.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-1">
                <AlertCircle className="w-3 h-3 inline mr-1 text-yellow-600" />
                <span className="text-xs text-yellow-700">{item.notes}</span>
              </div>
            )}
          </div>
        ))}
        {order.items?.length > 3 && (
          <p className="text-xs text-slate-400">+{order.items.length - 3} more items</p>
        )}
      </div>

      {/* Special Instructions */}
      {order.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
          <p className="text-xs text-yellow-700 font-medium">Note: {order.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="font-bold text-slate-900">{currency} {order.total_amount.toFixed(2)}</span>
        {action && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(order.id, action.nextStatus);
            }}
            className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
          >
            {action.label}
          </Button>
        )}
      </div>
    </Card>
  );
}