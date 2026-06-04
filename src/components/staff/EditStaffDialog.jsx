import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const schema = z.object({
  role_id: z.string().min(1, 'Please select a role'),
  status: z.enum(['active', 'invited', 'suspended']),
});

export default function EditStaffDialog({ open, onOpenChange, staff, tenantId }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useTenant();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      role_id: staff?.role_id || '',
      status: staff?.status || 'active',
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => db.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId && open,
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const role = roles.find(r => r.id === data.role_id);
      const supabase = await getSupabase();
      const { error } = await supabase.from('tenant_users').update({
        role_id: data.role_id,
        role_name: role?.name || staff.role_name,
        status: data.status,
      }).eq('id', staff.id).eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
      toast.success('Staff updated successfully');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update staff');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.entities.TenantUser.delete(staff.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
      toast.success('Staff removed from team');
      setShowDeleteDialog(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove staff');
    },
  });

  const onSubmit = (data) => {
    updateMutation.mutate(data);
  };

  if (!staff) return null;

  // Prevent editing yourself or owners
  const canEdit = !staff.is_owner && staff.user_email !== currentUser?.email;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Mobile Number</Label>
              <Input
                value={(() => {
                  if (staff.user_phone) return staff.user_phone;
                  // Derive from email: strip @sellio.app, then strip leading country code
                  const digits = staff.user_email?.replace(/@sellio\.app$/, '') || '';
                  // Check longest match first to avoid partial matches (e.g. 60 vs 6)
                  const countryCodes = ['63', '66', '62', '65', '60'];
                  for (const cc of countryCodes) {
                    if (digits.startsWith(cc)) return digits.slice(cc.length);
                  }
                  return digits;
                })()}
                disabled
                className="mt-1.5 bg-slate-50"
              />
            </div>

            <div>
              <Label>Role *</Label>
              <Select
                value={watch('role_id')}
                onValueChange={(v) => setValue('role_id', v)}
                disabled={!canEdit}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.role_id && (
                <p className="text-xs text-red-500 mt-1">{errors.role_id.message}</p>
              )}
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => setValue('status', v)}
                disabled={!canEdit}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {staff.is_owner && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  This user is an owner and cannot be edited or removed.
                </p>
              </div>
            )}

            {staff.user_email === currentUser?.email && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  You cannot edit your own account.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending || !canEdit}
                  className="flex-1 text-white"
                  style={{ background: 'var(--color-primary-gradient)' }}
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{staff.user_email}</strong> from your team? 
              They will lose access to this business immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Staff'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}