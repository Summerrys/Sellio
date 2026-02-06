import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function OperatingHours({ tenantId }) {
  const queryClient = useQueryClient();

  const { data: businessHours = [] } = useQuery({
    queryKey: ['business-hours', tenantId],
    queryFn: async () => {
      return base44.entities.BusinessHours.filter({ tenant_id: tenantId });
    },
    enabled: !!tenantId,
  });

  const [hours, setHours] = useState(() => {
    const hoursMap = {};
    businessHours.forEach(h => {
      hoursMap[h.day_of_week] = h;
    });
    return hoursMap;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises = DAYS.map(day => {
        const existing = businessHours.find(h => h.day_of_week === day);
        const data = hours[day] || {
          tenant_id: tenantId,
          day_of_week: day,
          open_time: '09:00',
          close_time: '22:00',
          is_closed: false,
        };

        if (existing) {
          return base44.entities.BusinessHours.update(existing.id, data);
        } else {
          return base44.entities.BusinessHours.create(data);
        }
      });
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours'] });
      toast.success('Operating hours updated');
    },
  });

  const handleUpdate = (day, field, value) => {
    setHours({
      ...hours,
      [day]: {
        ...hours[day],
        tenant_id: tenantId,
        day_of_week: day,
        [field]: value,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Operating Hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {DAYS.map(day => {
            const dayHours = hours[day] || {};
            return (
              <div key={day} className="flex items-center gap-4 pb-4 border-b">
                <div className="w-28">
                  <p className="font-medium capitalize">{day}</p>
                </div>
                <Switch
                  checked={!dayHours.is_closed}
                  onCheckedChange={(checked) => handleUpdate(day, 'is_closed', !checked)}
                />
                {!dayHours.is_closed && (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={dayHours.open_time || '09:00'}
                      onChange={(e) => handleUpdate(day, 'open_time', e.target.value)}
                      className="w-32"
                    />
                    <span className="text-slate-500">to</span>
                    <Input
                      type="time"
                      value={dayHours.close_time || '22:00'}
                      onChange={(e) => handleUpdate(day, 'close_time', e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
                {dayHours.is_closed && (
                  <span className="text-slate-500 italic">Closed</span>
                )}
              </div>
            );
          })}
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="mt-4">
          {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Hours
        </Button>
      </CardContent>
    </Card>
  );
}