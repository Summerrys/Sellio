import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '../tenant/TenantContext';

const ZONES = ['Indoor', 'Outdoor', 'Private Room', 'Bar Area', 'Patio', 'VIP Section'];

export default function TableFormDialog({ open, onOpenChange, table, tenantId }) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [formData, setFormData] = useState({
    name: '',
    zone: 'Indoor',
    capacity: 4,
    status: 'available',
    notes: '',
  });

  useEffect(() => {
    if (table) {
      setFormData({
        name: table.name || '',
        zone: table.zone || 'Indoor',
        capacity: table.capacity || 4,
        status: table.status || 'available',
        notes: table.notes || '',
      });
    } else {
      setFormData({
        name: '',
        zone: 'Indoor',
        capacity: 4,
        status: 'available',
        notes: '',
      });
    }
  }, [table, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (table) {
        // Update existing table
        const updateData = {
          name: formData.name,
          zone: formData.zone || null,
          capacity: parseInt(formData.capacity) || 4,
          status: formData.status,
          notes: formData.notes || null,
        };
        const res = await base44.functions.invoke('manageTable', { action: 'update', tenant_id: tenantId, table_id: table.id, table_data: updateData });
        return res.data?.table;
      } else {
        // Create new table — pre-generate ID so it can be embedded in qr_code_url
        console.log('Creating table with tenantId:', tenantId, 'slug:', tenant?.slug);
        if (!tenantId || !tenant?.slug) {
          throw new Error('Tenant not loaded yet. Please refresh and try again.');
        }
        const newTableId = crypto.randomUUID();
        const qrCodeUrl = `https://sellio.apptelier.sg/order/${tenant.slug}/${newTableId}`;
        const createData = {
          id: newTableId,
          tenant_id: tenantId,
          name: formData.name,
          zone: formData.zone || null,
          capacity: parseInt(formData.capacity) || 4,
          status: 'available',
          notes: formData.notes || null,
          qr_code_url: qrCodeUrl,
        };
        const res = await base44.functions.invoke('manageTable', { action: 'create', tenant_id: tenantId, table_data: createData });
        return res.data?.table;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', tenantId] });
      toast.success(table ? 'Table updated' : 'Table created with QR code');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save table');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{table ? 'Edit Table' : 'Add Table'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Table Number/Label *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. T1, Patio 1, Window Seat A"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Capacity (Seats)</Label>
              <Input
                type="number"
                min="1"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Section/Zone</Label>
              <Select value={formData.zone} onValueChange={(value) => setFormData({ ...formData, zone: value })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map(zone => (
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional information..."
              className="mt-1.5 h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !formData.name}
            className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              table ? 'Update Table' : 'Create Table'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}