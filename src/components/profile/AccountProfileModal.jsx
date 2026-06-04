import React, { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';
import { useSubscription } from '@/hooks/useSubscription';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronRight, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

function SectionHeader({ title }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1 mb-2 mt-6 first:mt-0">
      {title}
    </p>
  );
}

function SectionCard({ children, className = '' }) {
  return (
    <div className={`border border-slate-100 rounded-xl p-4 bg-white space-y-3 ${className}`}>
      {children}
    </div>
  );
}

export default function AccountProfileModal({ open, onClose, user, subscription: propSubscription, onOpenPricing, clearAppUser }) {
  const { tenantId } = useTenant();
  const { subscription, tier } = useSubscription();
  const activeSub = subscription || propSubscription;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const [emailNotifs, setEmailNotifs] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  // Detect if user is email/password (not OAuth)
  const isEmailUser = !user?.app_metadata?.provider || user?.app_metadata?.provider === 'email';

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.full_name || '');
    setPhone(user.phone || '');
  }, [open, user]);

  if (!open) return null;

  const initial = fullName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';

  // Plan name
  const tierNames = { starter: 'Starter Plan', growth: 'Growth Plan', pro: 'Professional Plan' };
  const tierLabel = tierNames[tier] ?? (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) + ' Plan' : 'Starter Plan');

  // Status badge
  const statusConfig = (() => {
    switch (activeSub?.status) {
      case 'trial':    return { label: 'Trial',    color: 'bg-amber-100 text-amber-700' };
      case 'active':   return { label: 'Active',   color: 'bg-green-100 text-green-700' };
      case 'past_due': return { label: 'Past Due', color: 'bg-red-100 text-red-700' };
      case 'cancelled':return { label: 'Cancelled',color: 'bg-slate-100 text-slate-500' };
      default:         return { label: activeSub?.status || 'Unknown', color: 'bg-slate-100 text-slate-500' };
    }
  })();

  // Billing cycle
  const billingCycle = activeSub?.billing_cycle === 'yearly' ? 'Annual' : activeSub?.billing_cycle === 'monthly' ? 'Monthly' : null;

  // Date sublabel
  const periodEnd = activeSub?.current_period_end ? new Date(activeSub.current_period_end) : null;
  const dateLabel = (() => {
    if (!periodEnd) return null;
    if (activeSub?.status === 'trial')    return `Trial ends ${format(periodEnd, 'MMM d, yyyy')}`;
    if (activeSub?.status === 'active')   return `Renews ${format(periodEnd, 'MMM d, yyyy')}`;
    if (activeSub?.status === 'past_due') return 'Payment overdue';
    return null;
  })();

  const showUpgrade = ['trial', 'active', 'past_due'].includes(activeSub?.status) && tier !== 'pro';

  // Legacy planBadge for header badge
  const planBadge = `${tierLabel} · ${statusConfig.label}`;

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('app_users')
        .update({ full_name: fullName, phone })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setIsUpdatingPassword(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated');
      setShowPasswordForm(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = () => {
    clearAppUser?.();
    window.location.href = createPageUrl('Auth');
  };

  const handleDeleteAccount = () => {
    setShowDeleteAlert(false);
    toast.info('Please contact support to delete your account.');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white flex flex-col"
        style={{
          borderRadius: '20px 20px 0 0',
          maxHeight: '92vh',
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}>
          {/* Header */}
          <div className="flex flex-col items-center pt-4 pb-6">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mb-3"
              style={{ background: 'var(--color-primary-gradient, linear-gradient(135deg, #f97316, #ec4899, #8b5cf6))' }}
            >
              {initial}
            </div>
            <p className="text-lg font-bold text-slate-900">{fullName || user?.full_name || 'User'}</p>
            <p className="text-sm text-slate-400 mt-0.5">{user?.email}</p>
            <span
              className="mt-2 text-xs font-semibold px-3 py-1 rounded-full text-white"
              style={{ background: 'var(--color-primary-gradient, linear-gradient(135deg, #f97316, #ec4899, #8b5cf6))' }}
            >
              {planBadge}
            </span>
          </div>

          {/* My Profile */}
          <SectionHeader title="My Profile" />
          <SectionCard>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Full Name</Label>
              <Input className="h-10" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Phone</Label>
              <Input className="h-10" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+65 9123 4567" />
            </div>
            <Button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="w-full h-11 text-white gap-2"
              style={{ background: 'var(--color-primary-gradient)' }}
            >
              {isSavingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Profile'}
            </Button>
          </SectionCard>

          {/* Security — email users only */}
          {isEmailUser && (
            <>
              <SectionHeader title="Security" />
              <SectionCard className="space-y-0 p-0 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  Change Password
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showPasswordForm ? 'rotate-90' : ''}`} />
                </button>
                {showPasswordForm && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">New Password</Label>
                      <div className="relative">
                        <Input className="h-10 pr-10" type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowNewPw(!showNewPw)}>
                          {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">Confirm Password</Label>
                      <Input className="h-10" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
                    </div>
                    <Button
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                      className="w-full h-11 text-white"
                      style={{ background: 'var(--color-primary-gradient)' }}
                    >
                      {isUpdatingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</> : 'Update Password'}
                    </Button>
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {/* Subscription */}
          <SectionHeader title="Subscription" />
          <SectionCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{tierLabel}</p>
                {billingCycle && <p className="text-xs text-slate-400 mt-0.5">{billingCycle}</p>}
                {dateLabel && <p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p>}
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            {showUpgrade ? (
              <Button
                className="w-full h-11 text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)' }}
                onClick={() => { onClose(); onOpenPricing?.(); }}
              >
                Upgrade Plan
              </Button>
            ) : (
              <button className="text-xs text-slate-400 underline underline-offset-2">Manage Billing</button>
            )}
          </SectionCard>

          {/* Preferences */}
          <SectionHeader title="Preferences" />
          <SectionCard>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">Email notifications</p>
              <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">Order alerts</p>
              <Switch checked={orderAlerts} onCheckedChange={setOrderAlerts} />
            </div>
            <p className="text-xs text-slate-400">Notification settings coming soon</p>
          </SectionCard>

          {/* Danger Zone */}
          <SectionHeader title="Danger Zone" />
          <SectionCard>
            <Button
              variant="outline"
              className="w-full h-11 border-red-200 text-red-600 hover:bg-red-50"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
            <button
              className="w-full text-xs text-red-400 hover:text-red-600 py-1"
              onClick={() => setShowDeleteAlert(true)}
            >
              Delete Account
            </button>
          </SectionCard>
        </div>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your account? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAccount}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}