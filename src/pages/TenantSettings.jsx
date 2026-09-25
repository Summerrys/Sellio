import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PermissionGate from '../components/tenant/PermissionGate';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ThemeSelector from '../components/theme/ThemeSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useProductTour } from '@/hooks/useProductTour';
import TourGuide from '@/components/tour/TourGuide';
import { getSettingsSteps } from '@/components/tour/tourSteps';
import {
  Building2, Save, Palette, AlertTriangle,
  Loader2, QrCode, X, RefreshCw, Users
} from 'lucide-react';
import { toast } from 'sonner';
import BusinessProfileTab from '../components/settings/BusinessProfileTab';
import UserManagement from './UserManagement';
import PricingModal from '../components/subscription/PricingModal';

export default function TenantSettings() {
  return (
    <RequirePermission permission="settings.view">
      <TenantSettingsContent />
    </RequirePermission>
  );
}

function PaymentQRTab({ tenant, tenantId }) {
  const { hasPermission } = useTenant();
  // Payment QR changes follow the "Modify Payments" permission; everyone who
  // can open Settings can still see the QR (view-only).
  const canEditPayments = hasPermission('payments.edit');
  const queryClient = useQueryClient();
  const paymentQRInputRef = useRef(null);

  const [paymentQRPreview, setPaymentQRPreview] = useState(null);
  const [paymentQRLabel, setPaymentQRLabel] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isUploadingQR, setIsUploadingQR] = useState(false);
  const [isSavingQR, setIsSavingQR] = useState(false);
  const [qrHovered, setQrHovered] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    const settings = tenant.settings || {};
    setPaymentQRPreview(tenant.payment_qr_url || null);
    setPaymentQRLabel(tenant.payment_qr_label || '');
    setPaymentReference(tenant.payment_reference || '');
  }, [tenant]);

  const handlePaymentQRUpload = async (e) => {
    if (!canEditPayments) return; // defense-in-depth; upload controls are hidden without this permission
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploadingQR(true);
    const supabase = await getSupabase();
    const path = `${tenantId}/payment-qr/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
    if (error) { toast.error('Failed to upload QR'); setIsUploadingQR(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
    await supabase.from('tenants').update({ payment_qr_url: publicUrl }).eq('id', tenantId);
    setPaymentQRPreview(publicUrl);
    setIsUploadingQR(false);
    queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
    toast.success('QR uploaded');
  };

  const handleRemovePaymentQR = async () => {
    if (!canEditPayments) return;
    const supabase = await getSupabase();
    await supabase.from('tenants').update({ payment_qr_url: null }).eq('id', tenantId);
    setPaymentQRPreview(null);
    queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
  };

  const handleSavePaymentQR = async () => {
    if (!canEditPayments) return;
    setIsSavingQR(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from('tenants').update({
        payment_qr_label: paymentQRLabel,
        payment_reference: paymentReference,
      }).eq('id', tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
      toast.success('Payment settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save payment settings');
    } finally {
      setIsSavingQR(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <Card className="border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col items-center gap-5">
          <div className="w-full text-center">
            <p className="text-sm font-semibold text-slate-800 mb-1">Payment QR Code</p>
            <p className="text-xs text-slate-400">
              Upload your PayNow, Touch N Go, DuitNow or any payment QR.<br />
              Shown to customers after they place an order.
            </p>
          </div>

          <input
            ref={paymentQRInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePaymentQRUpload}
          />

          {paymentQRPreview ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="relative"
                style={{ width: 200, height: 200 }}
                onMouseEnter={() => setQrHovered(true)}
                onMouseLeave={() => setQrHovered(false)}
              >
                {isUploadingQR ? (
                  <div className="w-full h-full rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  </div>
                ) : (
                  <img
                    src={paymentQRPreview}
                    alt="Payment QR"
                    className="rounded-2xl border border-slate-200 bg-white object-contain"
                    style={{ width: 200, height: 200, padding: 8 }}
                  />
                )}

                {/* X — top right */}
                {canEditPayments && (
                  <button
                    type="button"
                    onClick={handleRemovePaymentQR}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors z-10"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                )}

                {/* Replace — center overlay */}
                {canEditPayments && (
                  <button
                    type="button"
                    onClick={() => paymentQRInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center transition-opacity rounded-2xl"
                    style={{ opacity: qrHovered ? 1 : 0 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-white" />
                    </div>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">QR uploaded ✓</p>
            </div>
          ) : (
            <div
              onClick={() => canEditPayments && paymentQRInputRef.current?.click()}
              className={`border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center transition-colors bg-slate-50 ${canEditPayments ? 'cursor-pointer hover:border-slate-400' : 'cursor-default'}`}
              style={{ width: 200, height: 200 }}
            >
              {isUploadingQR ? (
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              ) : canEditPayments ? (
                <>
                  <QrCode className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-500">Click to upload</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">PNG, JPG supported</p>
                </>
              ) : (
                <>
                  <QrCode className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-400">No QR uploaded</p>
                </>
              )}
            </div>
          )}

          <div className="w-full space-y-3">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Payment label (shown to customer)</Label>
              <Input
                className="h-10"
                value={paymentQRLabel}
                onChange={e => setPaymentQRLabel(e.target.value)}
                placeholder="e.g. Scan to pay via PayNow"
                disabled={!canEditPayments}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Payment reference (optional)</Label>
              <Input
                className="h-10"
                value={paymentReference}
                onChange={e => setPaymentReference(e.target.value)}
                placeholder="e.g. UEN 12345678A"
                disabled={!canEditPayments}
              />
            </div>
          </div>

          {canEditPayments ? (
            <Button
              onClick={handleSavePaymentQR}
              disabled={isSavingQR}
              className="h-11 gap-2 w-full"
              style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}
            >
              {isSavingQR ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
            </Button>
          ) : (
            <p className="text-xs text-slate-400 text-center">You have view-only access to Settings.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function TenantSettingsContent() {
  const { tenantId, tenant, subscription } = useTenant();
  const settingsTour = useProductTour('settings');
  const queryClient = useQueryClient();

  const [settingsTab, setSettingsTab] = useState('business');
  const { hasPermission: canAccess } = useTenant();
  const canSeeUsersTab = canAccess('staff.view') || canAccess('roles.view');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  return (
    <PermissionGate permission="settings.view">
      <PageHeader title="Settings" description="Configure your business and manage roles" />

      {settingsTour.isOwner && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Need a refresher?</p>
              <p className="text-xs text-slate-500 truncate">Replay the onboarding tour anytime.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="flex-shrink-0" onClick={settingsTour.replayTour}>
            Replay Tour
          </Button>
        </div>
      )}

      <div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
          <button
            data-tour="settings-business-tab"
            onClick={() => setSettingsTab('business')}
            className="flex-1 h-9 rounded-lg text-[11px] sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-1.5"
            style={settingsTab === 'business' ? { background: 'var(--color-primary-gradient)', color: '#fff' } : { background: 'transparent', color: '#64748b' }}
          >
            <Building2 className="w-4 h-4" /> Business
          </button>
          <button
            data-tour="settings-payment-tab"
            onClick={() => setSettingsTab('payment_qr')}
            className="flex-1 h-9 rounded-lg text-[11px] sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-1.5"
            style={settingsTab === 'payment_qr' ? { background: 'var(--color-primary-gradient)', color: '#fff' } : { background: 'transparent', color: '#64748b' }}
          >
            <QrCode className="w-4 h-4" /> Payment QR
          </button>
          <button
            data-tour="settings-theme-tab"
            onClick={() => setSettingsTab('theme')}
            className="flex-1 h-9 rounded-lg text-[11px] sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-1.5"
            style={settingsTab === 'theme' ? { background: 'var(--color-primary-gradient)', color: '#fff' } : { background: 'transparent', color: '#64748b' }}
          >
            <Palette className="w-4 h-4" /> Theme
          </button>
          {canSeeUsersTab && (
          <button
            data-tour="settings-users-tab"
            onClick={() => setSettingsTab('users')}
            className="flex-1 h-9 rounded-lg text-[11px] sm:text-sm font-medium transition-all flex items-center justify-center gap-1 sm:gap-1.5"
            style={settingsTab === 'users' ? { background: 'var(--color-primary-gradient)', color: '#fff' } : { background: 'transparent', color: '#64748b' }}
          >
            <Users className="w-4 h-4" /> Users
          </button>
          )}
        </div>

        {settingsTab === 'business' && (
          <div className="max-w-2xl mx-auto">
            <BusinessProfileTab tenant={tenant} tenantId={tenantId} />
          </div>
        )}
        {settingsTab === 'payment_qr' && (
          <div className="max-w-2xl mx-auto">
            <PaymentQRTab tenant={tenant} tenantId={tenantId} />
          </div>
        )}
        {settingsTab === 'theme' && (
          <div className="max-w-2xl mx-auto">
            <ThemeSelector variant="full" />
          </div>
        )}
        {settingsTab === 'users' && canSeeUsersTab && (
          <UserManagement embedded={true} onUpgrade={() => setShowPricingModal(true)} />
        )}
      </div>

      {settingsTour.eligible && (
        <TourGuide
          steps={getSettingsSteps()}
          run={settingsTour.eligible}
          onFinish={settingsTour.completeStage}
          tour={settingsTour}
        />
      )}

      {/* Account Deletion Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!isDeleting) setShowDeleteConfirm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              This will <strong>permanently delete</strong> your business account, all products, orders, staff, and settings. This cannot be undone.
            </p>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700 space-y-1">
              <p>• All products and categories will be removed</p>
              <p>• All order history will be erased</p>
              <p>• All staff accounts will be revoked</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">
                Type <span className="font-mono font-semibold text-slate-800">DELETE</span> to confirm
              </Label>
              <Input
                className="mt-1 h-11"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                disabled={isDeleting}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              className="h-11 bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={async () => {
                setIsDeleting(true);
                try {
                  const res = await base44.functions.invoke('deleteTenantWithCascade', { tenant_id: tenantId });
                  if (res.data?.success) {
                    toast.success('Account deleted. Redirecting...');
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                  } else {
                    throw new Error(res.data?.error || 'Deletion failed');
                  }
                } catch (err) {
                  toast.error(err.message || 'Failed to delete account. Please contact support.');
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} tenantId={tenantId} currentTier={subscription?.tier ?? null} />
    </PermissionGate>
  );
}