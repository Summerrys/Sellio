import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PermissionGate from '../components/tenant/PermissionGate';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_TEMPLATES } from '../components/tenant/TenantContext';
import PageHeader from '../components/ui-custom/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ThemeSelector from '../components/theme/ThemeSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2, Shield, Plus, Pencil, Trash2, Save, Palette, AlertTriangle,
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
    const supabase = await getSupabase();
    await supabase.from('tenants').update({ payment_qr_url: null }).eq('id', tenantId);
    setPaymentQRPreview(null);
    queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
  };

  const handleSavePaymentQR = async () => {
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
                <button
                  type="button"
                  onClick={handleRemovePaymentQR}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors z-10"
                >
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Replace — center overlay */}
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
              </div>
              <p className="text-xs text-slate-400">QR uploaded ✓</p>
            </div>
          ) : (
            <div
              onClick={() => paymentQRInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors bg-slate-50"
              style={{ width: 200, height: 200 }}
            >
              {isUploadingQR ? (
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              ) : (
                <>
                  <QrCode className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-500">Click to upload</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">PNG, JPG supported</p>
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
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">Payment reference (optional)</Label>
              <Input
                className="h-10"
                value={paymentReference}
                onChange={e => setPaymentReference(e.target.value)}
                placeholder="e.g. UEN 12345678A"
              />
            </div>
          </div>

          <Button
            onClick={handleSavePaymentQR}
            disabled={isSavingQR}
            className="h-11 gap-2 w-full"
            style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}
          >
            {isSavingQR ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function TenantSettingsContent() {
  const { tenantId, tenant, subscription } = useTenant();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });

  const { data: roles = [] } = useQuery({
    queryKey: ['settingsRoles', tenantId],
    queryFn: () => db.entities.Role.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const saveRoleMutation = useMutation({
    mutationFn: async (data) => {
      const supabase = await getSupabase();
      if (editingRole) {
        const { error } = await supabase.from('roles').update({ name: data.name, slug: data.name.toLowerCase().replace(/\s+/g, '-'), permissions: data.permissions, description: data.description }).eq('id', editingRole.id).eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert({ ...data, tenant_id: tenantId, slug: data.name.toLowerCase().replace(/\s+/g, '-') });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settingsRoles'] }); closeRoleForm(); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id) => db.entities.Role.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settingsRoles'] }),
  });

  const openRoleForm = (role) => {
    setEditingRole(role || null);
    setRoleForm(role ? { name: role.name, description: role.description || '', permissions: role.permissions || [] } : { name: '', description: '', permissions: [] });
    setShowRoleForm(true);
  };
  const closeRoleForm = () => { setShowRoleForm(false); setEditingRole(null); };

  const togglePermission = (perm) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const applyTemplate = (templateKey) => {
    const template = ROLE_TEMPLATES[templateKey];
    if (template) {
      setRoleForm({
        ...roleForm,
        name: roleForm.name || template.name,
        description: roleForm.description || template.description,
        permissions: template.permissions,
      });
    }
  };

  return (
    <PermissionGate permission="settings.view">
      <PageHeader title="Settings" description="Configure your business and manage roles" />

      <Tabs defaultValue="business">
        <style>{`
          .settings-tabs [data-state=active] {
            background: var(--color-primary-gradient) !important;
            color: white !important;
          }
        `}</style>
        <TabsList className="settings-tabs bg-white border border-slate-100 shadow-sm mb-6 w-full">
          <TabsTrigger value="business" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Building2 className="w-4 h-4" /> <span className="hidden sm:inline">Business</span><span className="sm:hidden text-xs">Biz</span>
          </TabsTrigger>
          <TabsTrigger value="payment_qr" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <QrCode className="w-4 h-4" /> <span className="hidden sm:inline">Payment QR</span><span className="sm:hidden text-xs">Payment</span>
          </TabsTrigger>
          <TabsTrigger value="theme" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Palette className="w-4 h-4" /> Theme
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg gap-1.5 flex-1 sm:flex-none">
            <Users className="w-4 h-4" /> Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <div className="max-w-2xl mx-auto">
            <BusinessProfileTab tenant={tenant} tenantId={tenantId} />
          </div>
        </TabsContent>

        <TabsContent value="payment_qr">
          <div className="max-w-2xl mx-auto">
            <PaymentQRTab tenant={tenant} tenantId={tenantId} />
          </div>
        </TabsContent>

        <TabsContent value="theme">
          <div className="max-w-2xl mx-auto">
            <ThemeSelector variant="full" />
          </div>
        </TabsContent>

        <TabsContent value="users">
          <UserManagement embedded={true} onUpgrade={() => setShowPricingModal(true)} />
        </TabsContent>
      </Tabs>

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

      {/* Role Form Dialog */}
      <Dialog open={showRoleForm} onOpenChange={setShowRoleForm}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRole ? 'Edit Role' : 'New Role'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Permissions</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder="Use template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_TEMPLATES).map(([key, template]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4 max-h-96 overflow-y-auto border border-slate-100 rounded-xl p-4">
                {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                  <div key={groupKey} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-white py-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{group.label}</h5>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            const allSelected = group.permissions.every(p => roleForm.permissions.includes(p));
                            setRoleForm(prev => ({
                              ...prev,
                              permissions: allSelected
                                ? prev.permissions.filter(p => !group.permissions.includes(p))
                                : [...new Set([...prev.permissions, ...group.permissions])]
                            }));
                          }}
                        >
                          {group.permissions.every(p => roleForm.permissions.includes(p)) ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-2">
                      {group.permissions.map(permKey => (
                        <label key={permKey} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded">
                          <Checkbox
                            checked={roleForm.permissions.includes(permKey)}
                            onCheckedChange={() => togglePermission(permKey)}
                          />
                          <span className="text-xs text-slate-600">{ALL_PERMISSIONS[permKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {roleForm.permissions.length} permission{roleForm.permissions.length !== 1 ? 's' : ''} selected
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRoleForm}>Cancel</Button>
            <Button onClick={() => saveRoleMutation.mutate(roleForm)} disabled={!roleForm.name || saveRoleMutation.isPending} style={{ background: 'var(--color-primary-gradient)', color: '#fff' }}>
              {saveRoleMutation.isPending ? 'Saving...' : editingRole ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} tenantId={tenantId} currentTier={subscription?.tier ?? null} />
    </PermissionGate>
  );
}