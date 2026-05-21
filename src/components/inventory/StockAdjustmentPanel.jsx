import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../tenant/TenantContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Minus, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ADJUSTMENT_TYPES = [
  { value: 'restock', label: 'Restock', icon: Plus, color: 'text-green-600' },
  { value: 'sale', label: 'Sale/Used', icon: Minus, color: 'text-blue-600' },
  { value: 'waste', label: 'Damaged/Waste', icon: AlertCircle, color: 'text-red-600' },
  { value: 'adjustment', label: 'Adjustment', icon: AlertCircle, color: 'text-amber-600' },
];

export default function StockAdjustmentPanel({ open, onOpenChange, product, tenantId }) {
  const queryClient = useQueryClient();
  const { user } = useTenant();
  const [adjustmentType, setAdjustmentType] = useState('restock');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', tenantId],
    queryFn: () => base44.entities.Supplier.filter({ tenant_id: tenantId, is_active: true }),
    enabled: !!tenantId && open,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const quantityChange = adjustmentType === 'restock' || adjustmentType === 'adjustment'
        ? quantity
        : -Math.abs(quantity);
      
      const newStock = (product.stock_quantity || 0) + quantityChange;

      // Update product stock
      await base44.entities.Product.update(product.id, {
        stock_quantity: Math.max(0, newStock)
      });

      // Create inventory log
      await base44.entities.InventoryLog.create({
        tenant_id: tenantId,
        product_id: product.id,
        product_name: product.name,
        type: adjustmentType,
        quantity_change: quantityChange,
        quantity_before: product.stock_quantity || 0,
        quantity_after: Math.max(0, newStock),
        notes,
        performed_by: user?.email || 'Unknown',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs', tenantId] });
      toast.success('Stock updated successfully');
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update stock');
    },
  });

  const resetForm = () => {
    setAdjustmentType('restock');
    setQuantity(0);
    setNotes('');
    setSupplierId('');
  };

  if (!product) return null;

  const newStock = adjustmentType === 'restock' || adjustmentType === 'adjustment'
    ? (product.stock_quantity || 0) + quantity
    : (product.stock_quantity || 0) - Math.abs(quantity);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Adjust Stock - {product.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Current Stock Display */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-sm text-slate-500 mb-1">Current Stock</p>
            <p className="text-3xl font-bold text-slate-900">{product.stock_quantity || 0}</p>
            {product.image_url && (
              <img src={product.image_url} alt={product.name} className="w-16 h-16 rounded-lg object-cover mt-3" />
            )}
          </div>

          {/* Adjustment Type */}
          <div>
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {ADJUSTMENT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => setAdjustmentType(type.value)}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      adjustmentType === type.value
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary-50))]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${type.color} mx-auto mb-1`} />
                    <p className="text-xs font-medium text-slate-700">{type.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label>Quantity</Label>
            <div className="flex items-center gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(0, quantity - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="text-center text-lg font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Supplier (for restocks) */}
          {adjustmentType === 'restock' && (
            <div>
              <Label>Supplier (Optional)</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notes / Reason</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details about this adjustment..."
              className="mt-2 h-24"
            />
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700 mb-2">
              <strong>New Stock:</strong> {Math.max(0, newStock)}
            </p>
            <p className="text-sm text-blue-600">
              {adjustmentType === 'restock' ? '+' : '-'}{quantity} units
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => adjustMutation.mutate()}
            disabled={adjustMutation.isPending || quantity === 0}
            className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
          >
            {adjustMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Stock'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}