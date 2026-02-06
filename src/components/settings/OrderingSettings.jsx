import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderingSettings({ tenant }) {
  const queryClient = useQueryClient();
  const settings = tenant?.settings?.ordering || {};
  
  const [formData, setFormData] = useState({
    enable_dine_in: settings.enable_dine_in !== false,
    enable_takeaway: settings.enable_takeaway !== false,
    auto_accept_orders: settings.auto_accept_orders || false,
    prep_time_default: settings.prep_time_default || 20,
    alert_threshold: settings.alert_threshold || 20,
    enable_table_management: settings.enable_table_management !== false,
    min_order_amount: settings.min_order_amount || 0,
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Tenant.update(tenant.id, {
        settings: {
          ...tenant.settings,
          ordering: data,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Ordering settings updated');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5" />
          Ordering Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Order Types */}
          <div className="space-y-3">
            <h4 className="font-semibold">Order Types</h4>
            <div className="flex items-center justify-between">
              <Label>Enable Dine-In Ordering</Label>
              <Switch
                checked={formData.enable_dine_in}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_dine_in: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Takeaway</Label>
              <Switch
                checked={formData.enable_takeaway}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_takeaway: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Table Management</Label>
              <Switch
                checked={formData.enable_table_management}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_table_management: checked })}
              />
            </div>
          </div>

          {/* Order Processing */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-semibold">Order Processing</h4>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-Accept Orders</Label>
                <p className="text-xs text-slate-500">Orders automatically confirmed</p>
              </div>
              <Switch
                checked={formData.auto_accept_orders}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_accept_orders: checked })}
              />
            </div>
          </div>

          {/* Timing */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-semibold">Timing</h4>
            <div>
              <Label htmlFor="prep-time">Default Preparation Time (minutes)</Label>
              <Input
                id="prep-time"
                type="number"
                value={formData.prep_time_default}
                onChange={(e) => setFormData({ ...formData, prep_time_default: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="alert-threshold">Kitchen Alert Threshold (minutes)</Label>
              <Input
                id="alert-threshold"
                type="number"
                value={formData.alert_threshold}
                onChange={(e) => setFormData({ ...formData, alert_threshold: parseInt(e.target.value) })}
              />
              <p className="text-xs text-slate-500 mt-1">Timer turns red after this many minutes</p>
            </div>
          </div>

          {/* Minimum Order */}
          <div className="border-t pt-4">
            <Label htmlFor="min-order">Minimum Order Amount (optional)</Label>
            <Input
              id="min-order"
              type="number"
              step="0.01"
              value={formData.min_order_amount}
              onChange={(e) => setFormData({ ...formData, min_order_amount: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-slate-500 mt-1">Leave as 0 for no minimum</p>
          </div>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}