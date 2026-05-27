import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import QRCode from 'qrcode';
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

export default function TableFormDialog({ open, onOpenChange, table, tenantId, tenant }) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [existingZones, setExistingZones] = useState([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    zone: '',
    capacity: 4,
    status: 'available',
    notes: '',
  });

  // Fetch existing zones when dialog opens
  useEffect(() => {
    if (!open || !tenantId) return;
    const fetchZones = async () => {
      const supabase = await getSupabase();
      const { data: zoneData } = await supabase
        .from('tables')
        .select('zone')
        .eq('tenant_id', tenantId)
        .not('zone', 'is', null);
      const zones = [...new Set(zoneData?.map(t => t.zone).filter(Boolean))];
      setExistingZones(zones);
    };
    fetchZones();
  }, [open, tenantId]);

  useEffect(() => {
    if (table) {
      setFormData({
        name: table.name || '',
        zone: table.zone || '',
        capacity: table.capacity || 4,
        status: table.status || 'available',
        notes: table.notes || '',
      });
    } else {
      setFormData({ name: '', zone: '', capacity: 4, status: 'available', notes: '' });
    }
    setNewZoneName('');
  }, [table, open]);

  const handleZoneChange = (value) => {
    setFormData({ ...formData, zone: value });
    if (value !== '__new__') setNewZoneName('');
  };

  const saveQRToStorage = async (db, tableId, tableName, orderingUrl) => {
    try {
      const dataUrl = await QRCode.toDataURL(orderingUrl, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = `${tenantId}/qr-codes/${tableId}.png`;
      const { error: uploadError } = await db.storage
        .from('product-images')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = db.storage.from('product-images').getPublicUrl(path);
      await db.from('tables').update({ qr_image_url: urlData.publicUrl }).eq('id', tableId);
      return urlData.publicUrl;
    } catch (e) {
      console.warn('QR save warning:', e.message);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!tenantId || !tenant?.slug) {
      toast.error('Store not loaded. Please refresh and try again.');
      return;
    }

    setIsLoading(true);
    try {
      const db = await getSupabase();
      const tableId = table?.id || crypto.randomUUID();
      const qrCodeUrl = `https://sellio.apptelier.sg/order/${tenant.slug}/${tableId}`;

      const resolvedZone = formData.zone === '__new__' ? newZoneName.trim() || null : formData.zone?.trim() || null;

      const payload = {
        id: tableId,
        tenant_id: tenantId,
        name: formData.name.trim(),
        zone: resolvedZone,
        capacity: parseInt(formData.capacity) || 4,
        status: formData.status || 'available',
        notes: formData.notes?.trim() || null,
        qr_code_url: qrCodeUrl,
      };

      console.log(table ? 'Updating table:' : 'Inserting table:', payload);

      if (table?.id) {
        const { error } = await db
          .from('tables')
          .update(payload)
          .eq('id', table.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('tables')
          .insert(payload);
        if (error) throw error;
        // Save QR to storage immediately after creation (non-blocking)
        saveQRToStorage(db, tableId, formData.name, qrCodeUrl);
      }

      queryClient.invalidateQueries({ queryKey: ['tables', tenantId] });
      toast.success(table ? 'Table updated' : 'Table created');
      onOpenChange(false);
    } catch (error) {
      console.error('Table save error:', error);
      toast.error(`Failed to save table: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

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
              <Select value={formData.zone} onValueChange={handleZoneChange}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {existingZones.map(zone => (
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                  ))}
                  <SelectItem value="__new__">＋ Create new zone</SelectItem>
                </SelectContent>
              </Select>
              {formData.zone === '__new__' && (
                <Input
                  placeholder="Enter zone name e.g. Outdoor, VIP, Bar"
                  className="mt-2"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                />
              )}
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
            onClick={handleSubmit}
            disabled={isLoading || !formData.name}
            className="w-full text-white"
            style={{ background: 'var(--color-primary-gradient)' }}
          >
            {isLoading ? (
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