import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const schema = z.object({
  email: z.string().email('Valid email is required'),
  full_name: z.string().min(2, 'Name is required'),
  role_id: z.string().min(1, 'Please select a role'),
});

export default function InviteStaffDialog({ open, onOpenChange, tenantId }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm({
    resolver: zodResolver(schema),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => base44.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId && open,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      // Invite user to the app
      await base44.users.inviteUser(data.email, 'user');

      // Find the selected role
      const role = roles.find(r => r.id === data.role_id);

      // Create tenant user record
      return base44.entities.TenantUser.create({
        tenant_id: tenantId,
        user_email: data.email,
        role_id: data.role_id,
        role_name: role?.name || 'Staff',
        status: 'invited',
        is_owner: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', tenantId] });
      toast.success('Invitation sent successfully');
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  const onSubmit = (data) => {
    inviteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite Staff Member
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Email Address *</Label>
            <Input
              {...register('email')}
              placeholder="staff@example.com"
              className="mt-1.5"
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <Label>Full Name *</Label>
            <Input
              {...register('full_name')}
              placeholder="John Doe"
              className="mt-1.5"
            />
            {errors.full_name && (
              <p className="text-xs text-red-500 mt-1">{errors.full_name.message}</p>
            )}
          </div>

          <div>
            <Label>Role *</Label>
            <Select
              value={watch('role_id')}
              onValueChange={(v) => setValue('role_id', v)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a role" />
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              An invitation email will be sent to the user. They'll need to accept and set a password to access the system.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}