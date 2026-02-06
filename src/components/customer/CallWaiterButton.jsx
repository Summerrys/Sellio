import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function CallWaiterButton({ tableId, tableName, tenantId }) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCallWaiter = async () => {
    setIsLoading(true);
    try {
      await base44.entities.TableCall.create({
        tenant_id: tenantId,
        table_id: tableId,
        table_name: tableName,
        type: 'waiter',
        status: 'pending',
      });

      toast.success('Waiter has been called!');
      
      // Listen for acknowledgement
      const unsubscribe = base44.entities.TableCall.subscribe((event) => {
        if (
          event.type === 'update' &&
          event.data?.table_id === tableId &&
          event.data?.status === 'acknowledged'
        ) {
          setIsAcknowledged(true);
          toast.success('Waiter is on the way!');
          unsubscribe();
          
          // Reset after 10 seconds
          setTimeout(() => setIsAcknowledged(false), 10000);
        }
      });
    } catch (error) {
      toast.error('Failed to call waiter. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCallWaiter}
      disabled={isLoading || isAcknowledged}
      variant={isAcknowledged ? 'default' : 'outline'}
      className={`gap-2 ${
        isAcknowledged ? 'bg-green-600 hover:bg-green-700' : ''
      }`}
    >
      {isAcknowledged ? (
        <>
          <Check className="w-4 h-4" />
          Waiter is coming
        </>
      ) : (
        <>
          <Bell className="w-4 h-4" />
          Call Waiter
        </>
      )}
    </Button>
  );
}