import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bell, Volume2, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const NOTIFICATION_TYPES = [
  { key: 'new_order', label: 'New Order', description: 'When a new order is placed' },
  { key: 'order_cancelled', label: 'Order Cancelled', description: 'When an order is cancelled' },
  { key: 'low_stock', label: 'Low Stock', description: 'When product stock is low' },
  { key: 'staff_joined', label: 'Staff Joined', description: 'When a new staff member joins' },
  { key: 'waiter_call', label: 'Waiter Call', description: 'When a customer calls for service' },
];

export default function NotificationPreferences({ userEmail, tenantId }) {
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['notification-preferences', userEmail],
    queryFn: async () => {
      const prefs = await base44.entities.NotificationPreference.filter({ user_email: userEmail });
      return prefs[0];
    },
    enabled: !!userEmail,
  });

  const [formData, setFormData] = useState(() => ({
    preferences: preferences?.preferences || {},
    quiet_hours: preferences?.quiet_hours || {
      enabled: false,
      start_time: '22:00',
      end_time: '08:00',
    },
  }));

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      if (preferences) {
        return base44.entities.NotificationPreference.update(preferences.id, data);
      } else {
        return base44.entities.NotificationPreference.create({
          ...data,
          user_email: userEmail,
          tenant_id: tenantId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences updated');
    },
  });

  const handleToggle = (type, channel, value) => {
    setFormData({
      ...formData,
      preferences: {
        ...formData.preferences,
        [type]: {
          ...formData.preferences[type],
          [channel]: value,
        },
      },
    });
  };

  const handleQuietHoursToggle = (field, value) => {
    setFormData({
      ...formData,
      quiet_hours: {
        ...formData.quiet_hours,
        [field]: value,
      },
    });
  };

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">Loading preferences...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Notification Type Grid */}
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b font-semibold text-sm">
            <div>Notification Type</div>
            <div className="flex items-center gap-2 justify-center">
              <Bell className="w-4 h-4" />
              In-App
            </div>
            <div className="flex items-center gap-2 justify-center">
              <Volume2 className="w-4 h-4" />
              Sound
            </div>
            <div className="flex items-center gap-2 justify-center">
              <Mail className="w-4 h-4" />
              Email
            </div>
          </div>

          {NOTIFICATION_TYPES.map((type) => {
            const typePrefs = formData.preferences[type.key] || {};
            return (
              <div key={type.key} className="grid grid-cols-4 gap-4 items-center py-3 border-b">
                <div>
                  <p className="font-medium text-slate-900">{type.label}</p>
                  <p className="text-xs text-slate-500">{type.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={typePrefs.in_app !== false}
                    onCheckedChange={(checked) => handleToggle(type.key, 'in_app', checked)}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={typePrefs.sound || false}
                    onCheckedChange={(checked) => handleToggle(type.key, 'sound', checked)}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={typePrefs.email || false}
                    onCheckedChange={(checked) => handleToggle(type.key, 'email', checked)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Quiet Hours */}
        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Quiet Hours</h4>
              <p className="text-sm text-slate-500">No sound or push notifications during these hours</p>
            </div>
            <Switch
              checked={formData.quiet_hours.enabled}
              onCheckedChange={(checked) => handleQuietHoursToggle('enabled', checked)}
            />
          </div>

          {formData.quiet_hours.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={formData.quiet_hours.start_time}
                  onChange={(e) => handleQuietHoursToggle('start_time', e.target.value)}
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={formData.quiet_hours.end_time}
                  onChange={(e) => handleQuietHoursToggle('end_time', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={() => updateMutation.mutate(formData)}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}