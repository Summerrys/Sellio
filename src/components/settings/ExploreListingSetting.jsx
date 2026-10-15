import React, { useEffect, useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenant } from '@/components/tenant/TenantContext';

// "Show my shop on Sellio Explore" (tenants.is_public; listed by default).
// Read and saved directly with Supabase: the column isn't in the Base44 entity
// layer. Saving needs the settings.edit permission (tenants update policy).
export default function ExploreListingSetting({ tenantId }) {
  const { hasPermission } = useTenant();
  const canEdit = !!hasPermission?.('settings.edit');
  const [listed, setListed] = useState(undefined); // undefined = loading, null = could not load
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase.from('tenants').select('is_public').eq('id', tenantId).maybeSingle();
        if (!cancelled) setListed(error || !data ? null : !!data.is_public);
      } catch {
        if (!cancelled) setListed(null);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const toggle = async (next) => {
    if (!canEdit || saving || typeof listed !== 'boolean') return;
    const previous = listed;
    setListed(next);
    setSaving(true);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('tenants')
        .update({ is_public: next })
        .eq('id', tenantId)
        .select('is_public')
        .maybeSingle();
      if (error || !data) throw error || new Error('Not saved');
      setListed(!!data.is_public);
      toast.success(next ? 'Your shop is listed on Sellio Explore' : 'Your shop is hidden from Sellio Explore');
    } catch (e) {
      console.warn('Explore listing update failed:', e);
      setListed(previous);
      toast.error('Could not update your Explore listing. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center flex-shrink-0">
          <Compass className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Show my shop on Sellio Explore</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            People browsing{' '}
            <a href="/explore" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 underline underline-offset-2">Sellio Explore</a>
            {' '}can find your items and open your storefront. Turn this off to hide your shop there; your storefront link keeps working.
          </p>
          {listed === null && <p className="text-xs text-red-500 mt-1">Couldn't load this setting. Refresh to try again.</p>}
          {!canEdit && <p className="text-xs text-slate-400 mt-1">Only staff who can edit business settings can change this.</p>}
        </div>
        {listed === undefined ? (
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin flex-shrink-0" />
        ) : (
          <Switch
            checked={!!listed}
            onCheckedChange={toggle}
            disabled={!canEdit || saving || listed === null}
            aria-label="Show my shop on Sellio Explore"
          />
        )}
      </div>
    </Card>
  );
}
