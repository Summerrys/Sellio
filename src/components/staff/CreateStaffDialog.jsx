import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useTenant } from '../tenant/TenantContext';
import db from '@/lib/db';

const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6a3R1dGVlZGJ0bmF4ZmR5bHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzY2NzIsImV4cCI6MjA5MDU1MjY3Mn0.zZL0Tyizzj3U8JTggYYKZ8BFrhDOKAzwISGNPJDAFzg';

const COUNTRY_CODES = [
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+60', label: '🇲🇾 +60' },
];

export default function CreateStaffDialog({ open, onClose, onSuccess }) {
  const { tenantId } = useTenant();
  const [form, setForm] = useState({
    fullName: '',
    countryCode: '+65',
    phone: '',
    password: '',
    confirmPassword: '',
    roleId: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => db.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const set = (field) => (e) => {
    setError('');
    setForm((prev) => ({ ...prev, [field]: typeof e === 'string' ? e : e.target.value }));
  };

  const validate = () => {
    if (!form.fullName.trim()) return 'Full name is required';
    if (!form.phone.trim()) return 'Mobile number is required';
    if (!/^\d{7,12}$/.test(form.phone.trim())) return 'Enter a valid mobile number';
    if (!form.password) return 'Password is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    if (!form.roleId) return 'Please select a role';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError('');
    try {
      const fullPhone = `${form.countryCode}${form.phone.trim()}`;
      const selectedRole = roles.find((r) => r.id === form.roleId);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/createStaffUser`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            tenantId,
            fullName: form.fullName.trim(),
            phone: fullPhone,
            password: form.password,
            roleId: form.roleId,
            roleName: selectedRole?.name || '',
          }),
        }
      );

      const data = await response.json();
      console.log('→ createStaffUser response:', response.status, data);
      if (!response.ok) throw new Error(data.error || 'Failed to create staff');

      // Persist local phone number (no country code) on the tenant_users row
      const localPhone = form.phone.trim();
      const generatedEmail = `${form.countryCode.replace('+', '')}${localPhone}@sellio.app`;
      const supabase = await getSupabase();
      await supabase
        .from('tenant_users')
        .update({ user_phone: localPhone })
        .eq('tenant_id', tenantId)
        .eq('user_email', generatedEmail);

      toast.success('Staff account created successfully');
      const supabaseCheck = await getSupabase();
      const { data: { session } } = await supabaseCheck.auth.getSession();
      console.log('Staff created, owner session preserved:', session?.user?.email);
      setForm({ fullName: '', countryCode: '+65', phone: '', password: '', confirmPassword: '', roleId: '' });
      onSuccess?.();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open) {
      setError('');
      setForm({ fullName: '', countryCode: '+65', phone: '', password: '', confirmPassword: '', roleId: '' });
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label>Full Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="e.g. Sarah Tan"
              value={form.fullName}
              onChange={set('fullName')}
            />
          </div>

          {/* Mobile Number */}
          <div className="space-y-1.5">
            <Label>Mobile Number <span className="text-red-500">*</span></Label>
            <div className="flex gap-2">
              <Select value={form.countryCode} onValueChange={set('countryCode')}>
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="82228103"
                value={form.phone}
                onChange={set('phone')}
                inputMode="numeric"
                className="flex-1"
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label>Role <span className="text-red-500">*</span></Label>
            <Select value={form.roleId} onValueChange={set('roleId')}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label>Password <span className="text-red-500">*</span></Label>
            <Input
              type="password"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={set('password')}
            />
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <Label>Confirm Password <span className="text-red-500">*</span></Label>
            <Input
              type="password"
              placeholder="Re-enter password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
            />
          </div>

          {/* Inline Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-[2] text-white"
            style={{ background: 'var(--color-primary-gradient)' }}
          >
            {loading ? 'Creating...' : 'Create Account'}
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading} className="flex-1">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}