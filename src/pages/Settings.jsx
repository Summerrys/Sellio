import React from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BusinessProfile from '../components/settings/BusinessProfile';
import ThemeSelector from '../components/theme/ThemeSelector';
import OperatingHours from '../components/settings/OperatingHours';
import TaxCurrency from '../components/settings/TaxCurrency';
import OrderingSettings from '../components/settings/OrderingSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import NotificationPreferences from '../components/settings/NotificationPreferences';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon, Building2, Palette, Clock, DollarSign, ShoppingBag, Bell, Receipt, Shield, CreditCard } from 'lucide-react';

export default function Settings() {
  const { tenant, tenantId, hasPermission } = useTenant();
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <RequirePermission permission="settings.view">
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Manage your business settings and preferences"
        />

        <Tabs defaultValue="business" className="space-y-6">
          <TabsList className="flex-wrap h-auto">
            {hasPermission('settings.business') && (
              <TabsTrigger value="business" className="gap-2">
                <Building2 className="w-4 h-4" />
                Business
              </TabsTrigger>
            )}
            {hasPermission('settings.theme') && (
              <TabsTrigger value="theme" className="gap-2">
                <Palette className="w-4 h-4" />
                Theme
              </TabsTrigger>
            )}
            {hasPermission('settings.hours') && (
              <TabsTrigger value="hours" className="gap-2">
                <Clock className="w-4 h-4" />
                Hours
              </TabsTrigger>
            )}
            {hasPermission('settings.tax') && (
              <TabsTrigger value="tax" className="gap-2">
                <DollarSign className="w-4 h-4" />
                Tax & Currency
              </TabsTrigger>
            )}
            {hasPermission('settings.ordering') && (
              <TabsTrigger value="ordering" className="gap-2">
                <ShoppingBag className="w-4 h-4" />
                Ordering
              </TabsTrigger>
            )}
            {hasPermission('settings.notifications') && (
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </TabsTrigger>
            )}
            <TabsTrigger value="receipt" className="gap-2">
              <Receipt className="w-4 h-4" />
              Receipt
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Business Profile */}
          <TabsContent value="business">
            <BusinessProfile tenant={tenant} />
          </TabsContent>

          {/* Theme */}
          <TabsContent value="theme">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Appearance & Theme
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ThemeSelector tenantId={tenantId} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Operating Hours */}
          <TabsContent value="hours">
            <OperatingHours tenantId={tenantId} />
          </TabsContent>

          {/* Tax & Currency */}
          <TabsContent value="tax">
            <TaxCurrency tenant={tenant} />
          </TabsContent>

          {/* Ordering */}
          <TabsContent value="ordering">
            <OrderingSettings tenant={tenant} />
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications">
            <div className="space-y-6">
              <NotificationSettings tenant={tenant} />
              {user && <NotificationPreferences userEmail={user.email} tenantId={tenantId} />}
            </div>
          </TabsContent>

          {/* Receipt */}
          <TabsContent value="receipt">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Receipt Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500">Receipt customization coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Account & Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500">Security settings coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  );
}