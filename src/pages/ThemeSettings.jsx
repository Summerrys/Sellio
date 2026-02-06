import React from 'react';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import ThemeSelector from '../components/theme/ThemeSelector';
import { Palette } from 'lucide-react';

export default function ThemeSettings() {
  const { tenant } = useTenant();

  return (
    <RequirePermission permission="settings.manage">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Theme Settings"
          description={`Customize the look and feel for ${tenant?.name || 'your business'}`}
        />

        <div className="space-y-6">
          <ThemeSelector variant="full" />

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <Palette className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">Live Preview</p>
              <p className="text-sm text-blue-700 mt-1">
                Your theme changes are instantly visible across all pages, including the customer menu.
                Click "Apply Theme" to save your selection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}