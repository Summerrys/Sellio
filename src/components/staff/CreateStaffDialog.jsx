import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '../tenant/TenantContext';
import { ROLE_TEMPLATES, INDUSTRY_ROLES } from '../tenant/TenantContext';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/functions';
import db from '@/lib/db';

export default function CreateStaffDialog({ open, onClose, onSuccess }) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role_id: '',
  });

  // Fetch roles for this tenant
  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenant?.id],
    queryFn: () => db.entities.Role.filter({ tenant_id: tenant?.id }),
    enabled: !!tenant?.id,
  });

  // Get industry-appropriate roles
  const availableRoleTypes = tenant?.industry ? INDUSTRY_ROLES[tenant.industry] || INDUSTRY_ROLES.other : INDUSTRY_ROLES.other;
  const filteredRoles = roles.filter(role => availableRoleTypes.includes(role.slug));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password || !formData.role_id) {
      alert('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Find selected role
      const selectedRole = roles.find(r => r.id === formData.role_id);

      // Create user in User entity
      await invokeFunction('data/core/user', {
        operation: 'create',
        data: {
          email: formData.email,
          full_name: formData.name,
          password: formData.password,
          role: 'user',
        },
      });

      // Create TenantUser record
      await invokeFunction('data/core/tenantUser', {
        operation: 'create',
        data: {
          tenant_id: tenant.id,
          user_email: formData.email,
          role_id: formData.role_id,
          role_name: selectedRole?.name || 'Staff',
          status: 'active',
          is_owner: false,
        },
      });

      onSuccess?.();
      onClose();
      setFormData({ name: '', email: '', password: '', role_id: '' });
    } catch (error) {
      console.error('Error creating staff:', error);
      alert('Failed to create staff member: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Staff Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>

          <div>
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Set initial password"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <Label>Role</Label>
            <Select value={formData.role_id} onValueChange={(value) => setFormData({ ...formData, role_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {filteredRoles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Staff
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}