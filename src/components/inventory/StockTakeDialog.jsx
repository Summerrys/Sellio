import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '../tenant/TenantContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function StockTakeDialog({ open, onOpenChange, products, tenantId }) {
  const queryClient = useQueryClient();
  const { user } = useTenant();
  const [step, setStep] = useState('count'); // 'count' or 'review'
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState('');

  const discrepancies = products
    .map(product => ({
      ...product,
      counted: counts[product.id] !== undefined ? counts[product.id] : null,
      expected: product.stock_quantity || 0,
      difference: counts[product.id] !== undefined ? counts[product.id] - (product.stock_quantity || 0) : 0,
    }))
    .filter(p => p.counted !== null && p.difference !== 0);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const supabase = await getSupabase();
      for (const item of discrepancies) {
        const { error: productError } = await supabase
          .from('products')
          .update({ stock_quantity: item.counted, updated_date: new Date().toISOString() })
          .eq('id', item.id)
          .eq('tenant_id', tenantId);
        if (productError) throw productError;

        const { error: logError } = await supabase
          .from('inventory_logs')
          .insert({
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            product_id: item.id,
            product_name: item.name,
            type: 'adjustment',
            quantity_change: item.difference,
            quantity_before: item.expected,
            quantity_after: item.counted,
            notes: `Stock take: ${notes}`,
            performed_by: user?.email || 'Unknown',
            created_date: new Date().toISOString(),
          });
        if (logError) throw logError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs', tenantId] });
      toast.success('Stock take completed');
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to complete stock take');
    },
  });

  const resetForm = () => {
    setStep('count');
    setCounts({});
    setNotes('');
  };

  const handleCountChange = (productId, value) => {
    setCounts(prev => ({
      ...prev,
      [productId]: Math.max(0, parseInt(value) || 0)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'count' ? 'Physical Stock Count' : 'Review Discrepancies'}
          </DialogTitle>
        </DialogHeader>

        {step === 'count' ? (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                Enter the actual physical count for each product. Items with no changes will be skipped.
              </p>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {products.map((product) => (
                <div key={product.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{product.name}</p>
                    <p className="text-sm text-slate-500">
                      System: {product.stock_quantity || 0}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Actual count"
                    value={counts[product.id] ?? ''}
                    onChange={(e) => handleCountChange(product.id, e.target.value)}
                    className="w-32"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Stock take notes..."
                className="mt-1.5"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-amber-700">
                  {discrepancies.length} discrepancies found
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {discrepancies.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      Expected: {item.expected} → Counted: {item.counted}
                    </p>
                  </div>
                  <Badge className={item.difference > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {item.difference > 0 ? '+' : ''}{item.difference}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === 'count' ? (
            <Button
              onClick={() => setStep('review')}
              disabled={Object.keys(counts).length === 0}
              className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
            >
              Review ({discrepancies.length} changes)
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('count')}>
                Back
              </Button>
              <Button
                onClick={() => reconcileMutation.mutate()}
                disabled={reconcileMutation.isPending}
                className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
              >
                {reconcileMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirm & Update
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}