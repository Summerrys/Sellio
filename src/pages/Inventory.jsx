import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, AlertTriangle, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function Inventory() {
  const { tenantId, user } = useTenant();
  const queryClient = useQueryClient();
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'restock', quantity_change: 0, notes: '' });
  const [search, setSearch] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['inventoryProducts', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['inventoryLogs', tenantId],
    queryFn: () => base44.entities.InventoryLog.filter({ tenant_id: tenantId }, '-created_date', 50),
    enabled: !!tenantId,
  });

  const adjustMutation = useMutation({
    mutationFn: async (data) => {
      const product = selectedProduct;
      const before = product.stock_quantity || 0;
      const change = data.type === 'restock' || data.type === 'return' ? Math.abs(data.quantity_change) : -Math.abs(data.quantity_change);
      const after = before + change;
      await base44.entities.Product.update(product.id, { stock_quantity: Math.max(0, after) });
      await base44.entities.InventoryLog.create({
        tenant_id: tenantId,
        product_id: product.id,
        product_name: product.name,
        type: data.type,
        quantity_change: change,
        quantity_before: before,
        quantity_after: Math.max(0, after),
        notes: data.notes,
        performed_by: user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryProducts'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryLogs'] });
      setShowAdjust(false);
      setSelectedProduct(null);
    },
  });

  const openAdjust = (product) => { setSelectedProduct(product); setAdjustForm({ type: 'restock', quantity_change: 0, notes: '' }); setShowAdjust(true); };

  const filtered = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <PermissionGate permission="inventory.read">
      <PageHeader title="Inventory" description="Track stock levels and adjustments" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Stock Levels</h2>
            <div className="relative max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
            </div>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={Package} title="No products" description="Add products first to manage inventory." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs uppercase tracking-wider font-semibold text-slate-500">Product</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold text-slate-500">Stock</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold text-slate-500">Threshold</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold text-slate-500">Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const isLow = (p.stock_quantity || 0) <= (p.low_stock_threshold || 5);
                  const isOut = (p.stock_quantity || 0) === 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium text-slate-900">{p.name}</TableCell>
                      <TableCell className={`text-sm font-semibold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>{p.stock_quantity || 0}</TableCell>
                      <TableCell className="text-sm text-slate-400">{p.low_stock_threshold || 5}</TableCell>
                      <TableCell>
                        {isOut ? (
                          <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Out of stock</span>
                        ) : isLow ? (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Low stock</span>
                        ) : (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">In stock</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAdjust(p)}>Adjust</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No activity yet</div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
              {logs.slice(0, 20).map(log => (
                <div key={log.id} className="px-6 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-900">{log.product_name}</span>
                    <span className={`text-xs font-semibold ${log.quantity_change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {log.quantity_change >= 0 ? '+' : ''}{log.quantity_change}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 capitalize">{log.type} · {log.created_date ? format(new Date(log.created_date), 'MMM d, h:mm a') : ''}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Adjust Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adjust Stock — {selectedProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-center text-3xl font-bold text-slate-900">{selectedProduct?.stock_quantity || 0} <span className="text-sm font-normal text-slate-400">current</span></div>
            <div><Label>Type</Label>
              <Select value={adjustForm.type} onValueChange={v => setAdjustForm({ ...adjustForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['restock', 'sale', 'adjustment', 'waste', 'return'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" min="0" value={adjustForm.quantity_change} onChange={e => setAdjustForm({ ...adjustForm, quantity_change: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>Notes (optional)</Label><Input value={adjustForm.notes} onChange={e => setAdjustForm({ ...adjustForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button onClick={() => adjustMutation.mutate(adjustForm)} disabled={adjustForm.quantity_change === 0 || adjustMutation.isPending} className="bg-slate-900 hover:bg-slate-800">
              {adjustMutation.isPending ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}