import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationSettings({ tenant }) {
  const queryClient = useQueryClient();
  const settings = tenant?.settings?.notifications || {};
  
  const [formData, setFormData] = useState({
    new_order_sound: settings.new_order_sound !== false,
    low_stock_email: settings.low_stock_email !== false,
    daily_summary_email: settings.daily_summary_email || false,
    staff_notifications: settings.staff_notifications !== false,
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Tenant.update(tenant.id, {
        settings: {
          ...tenant.settings,
          notifications: data,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Notification settings updated');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <Label>New Order Sound Alert</Label>
            <p className="text-sm text-slate-500">Play sound when new order arrives</p>
          </div>
          <Switch
            checked={formData.new_order_sound}
            onCheckedChange={(checked) => setFormData({ ...formData, new_order_sound: checked })}
          />
        </div>

        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <Label>Low Stock Email Alerts</Label>
            <p className="text-sm text-slate-500">Email when products are low in stock</p>
          </div>
          <Switch
            checked={formData.low_stock_email}
            onCheckedChange={(checked) => setFormData({ ...formData, low_stock_email: checked })}
          />
        </div>

        <div className="flex items-center justify-between pb-3 border-b">
          <div>
            <Label>Daily Summary Email</Label>
            <p className="text-sm text-slate-500">Receive daily sales report via email</p>
          </div>
          <Switch
            checked={formData.daily_summary_email}
            onCheckedChange={(checked) => setFormData({ ...formData, daily_summary_email: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Staff Notifications</Label>
            <p className="text-sm text-slate-500">Enable notifications for staff members</p>
          </div>
          <Switch
            checked={formData.staff_notifications}
            onCheckedChange={(checked) => setFormData({ ...formData, staff_notifications: checked })}
          />
        </div>

        <Button
          onClick={() => updateMutation.mutate(formData)}
          disabled={updateMutation.isPending}
          className="mt-4"
        >
          {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}