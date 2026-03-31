import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Receipt, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function TableCallAlerts({ tenantId }) {
  const queryClient = useQueryClient();
  const [audioPlayed, setAudioPlayed] = useState(false);

  const { data: calls = [] } = useQuery({
    queryKey: ['table-calls', tenantId],
    queryFn: async () => {
      return db.entities.TableCall.filter(
        { tenant_id: tenantId, status: 'pending' },
        '-created_date',
        20
      );
    },
    enabled: !!tenantId,
    refetchInterval: 5000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!tenantId) return;

    let unsubFn;
    db.entities.TableCall.subscribe((event) => {
      if (event.data?.tenant_id === tenantId) {
        queryClient.invalidateQueries({ queryKey: ['table-calls', tenantId] });
        if (event.type === 'create') {
          toast.info(`Table ${event.data.table_name} is calling!`, { duration: 5000 });
        }
      }
    }).then(fn => { unsubFn = fn; });

    return () => { if (unsubFn) unsubFn(); };
  }, [tenantId, queryClient]);

  const acknowledgeMutation = useMutation({
    mutationFn: async (callId) => {
      return db.entities.TableCall.update(callId, {
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-calls'] });
      toast.success('Call acknowledged');
    },
  });

  if (calls.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-amber-600 animate-pulse" />
          <h3 className="font-semibold text-amber-900">
            Table Calls ({calls.length})
          </h3>
        </div>

        <div className="space-y-3">
          {calls.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200"
            >
              <div className="flex items-center gap-3">
                {call.type === 'bill' ? (
                  <Receipt className="w-5 h-5 text-amber-600" />
                ) : (
                  <Bell className="w-5 h-5 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold text-slate-900">
                    Table {call.table_name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {call.type === 'bill' ? 'Requesting bill' : 'Calling waiter'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => acknowledgeMutation.mutate(call.id)}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Acknowledge
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}