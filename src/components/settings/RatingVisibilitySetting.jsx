import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';

// "Show my rating on my ordering page" (tenants.settings.show_rating_on_store; shown
// unless turned off). A business store's own choice for its ordering page; Explore and
// listings show the rating either way. Saving needs settings.edit (tenants update policy).
export default function RatingVisibilitySetting({ tenantId }) {
  const { tenant, hasPermission } = useTenant();
  const queryClient = useQueryClient();
  const canEdit = !!hasPermission?.('settings.edit');
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState(null);
  const shown = override ?? tenant?.settings?.show_rating_on_store !== false;

  const toggle = async (next) => {
    if (!canEdit || saving || !tenantId) return;
    setOverride(next);
    setSaving(true);
    try {
      const supabase = await getSupabase();
      // Today's settings first, so nothing else saved there is lost.
      const { data: current, error: readError } = await supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle();
      if (readError || !current) throw readError || new Error('Not found');
      const { data, error } = await supabase
        .from('tenants')
        .update({ settings: { ...(current.settings || {}), show_rating_on_store: next } })
        .eq('id', tenantId)
        .select('settings')
        .maybeSingle();
      if (error || !data) throw error || new Error('Not saved');
      await queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
      toast.success(next ? 'Your rating shows on your ordering page' : 'Your rating is hidden on your ordering page');
    } catch (e) {
      console.warn('Rating visibility update failed:', e);
      setOverride(!next);
      toast.error('Could not save this setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0">
          <Star className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Show my rating on my ordering page</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Your stars show under your name once 3 buyers have rated you. Turn this off to hide them on your own ordering page; Sellio Explore still shows them.
          </p>
          {!canEdit && <p className="text-xs text-slate-400 mt-1">Only staff who can edit business settings can change this.</p>}
        </div>
        <Switch
          checked={shown}
          onCheckedChange={toggle}
          disabled={!canEdit || saving}
          aria-label="Show my rating on my ordering page"
        />
      </div>
    </Card>
  );
}
