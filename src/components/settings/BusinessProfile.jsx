import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BusinessProfile({ tenant }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: tenant?.name || '',
    address: tenant?.address || '',
    phone: tenant?.phone || '',
    owner_email: tenant?.owner_email || '',
    settings: tenant?.settings || {},
  });
  const [uploading, setUploading] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Tenant.update(tenant.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Business profile updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, logo_url: file_url });
      await updateMutation.mutateAsync({ logo_url: file_url });
      toast.success('Logo uploaded');
    } catch (error) {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Business Profile
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Logo Upload */}
          <div>
            <Label>Business Logo</Label>
            <div className="flex items-center gap-4 mt-2">
              {(formData.logo_url || tenant?.logo_url) && (
                <img
                  src={formData.logo_url || tenant.logo_url}
                  alt="Logo"
                  className="w-20 h-20 rounded-lg border object-cover"
                />
              )}
              <div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <Button type="button" variant="outline" disabled={uploading} asChild>
                    <span className="gap-2">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload Logo
                    </span>
                  </Button>
                </label>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 2MB</p>
              </div>
            </div>
          </div>

          {/* Business Name */}
          <div>
            <Label htmlFor="name">Business Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
            />
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.owner_email}
                onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
              />
            </div>
          </div>

          {/* Website & Social */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://"
                value={formData.settings?.website || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, website: e.target.value }
                })}
              />
            </div>
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                placeholder="@username"
                value={formData.settings?.instagram || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, instagram: e.target.value }
                })}
              />
            </div>
          </div>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}