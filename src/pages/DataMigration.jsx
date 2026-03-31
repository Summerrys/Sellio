import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, Database, AlertTriangle } from 'lucide-react';

// Map Base44 entity names to Supabase table names
const ENTITY_TABLE_MAP = {
  AppUser: 'app_users',
  Tenant: 'tenants',
  Role: 'roles',
  TenantUser: 'tenant_users',
  Category: 'categories',
  Product: 'products',
  ProductVariant: 'product_variants',
  TableEntity: 'tables',
  Order: 'orders',
  OrderItem: 'order_items',
  Payment: 'payments',
  InventoryItem: 'inventory_items',
  TableCall: 'table_calls',
  TableSession: 'table_sessions',
  Notification: 'notifications',
  NotificationPreference: 'notification_preferences',
  ThemeConfig: 'theme_configs',
  BusinessHours: 'business_hours',
  Subscription: 'subscriptions',
  SuperAdmin: 'super_admins',
  Permission: 'permissions',
};

const initialStatus = Object.fromEntries(
  Object.keys(ENTITY_TABLE_MAP).map(e => [e, { state: 'idle', count: 0, error: null }])
);

export default function DataMigration() {
  const [statuses, setStatuses] = useState(initialStatus);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);

  const setStatus = (entity, update) =>
    setStatuses(prev => ({ ...prev, [entity]: { ...prev[entity], ...update } }));

  const migrateEntity = async (entityName, tableName, supabase) => {
    setStatus(entityName, { state: 'loading', error: null });
    try {
      // Fetch from Base44
      const records = await base44.entities[entityName].list('-created_date', 1000);
      if (!records || records.length === 0) {
        setStatus(entityName, { state: 'done', count: 0 });
        return { success: true, count: 0 };
      }

      // Strip all Base44-internal fields not present in Supabase schema
      const BASE44_INTERNAL_FIELDS = ['__v', '_id', 'is_sample'];
      const cleaned = records.map(r => {
        const result = { ...r };
        BASE44_INTERNAL_FIELDS.forEach(f => delete result[f]);
        return result;
      });

      // Upsert to Supabase (by id to avoid duplicates on re-run)
      const { error } = await supabase
        .from(tableName)
        .upsert(cleaned, { onConflict: 'id' });

      if (error) throw error;

      setStatus(entityName, { state: 'done', count: cleaned.length });
      return { success: true, count: cleaned.length };
    } catch (err) {
      setStatus(entityName, { state: 'error', error: err.message });
      return { success: false, count: 0, error: err.message };
    }
  };

  const runMigration = async () => {
    setRunning(true);
    setSummary(null);
    setStatuses(initialStatus);

    const supabase = await getSupabase();
    let totalMigrated = 0;
    let totalFailed = 0;

    for (const [entityName, tableName] of Object.entries(ENTITY_TABLE_MAP)) {
      const result = await migrateEntity(entityName, tableName, supabase);
      if (result.success) totalMigrated += result.count;
      else totalFailed++;
    }

    setSummary({ totalMigrated, totalFailed });
    setRunning(false);
  };

  const getIcon = (state) => {
    if (state === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    if (state === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (state === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <div className="w-4 h-4 rounded-full bg-slate-200" />;
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="w-6 h-6" />
          Data Migration
        </h1>
        <p className="text-slate-500 mt-1">Migrate all Base44 entity data into Supabase.</p>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Before you run
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-1">
          <p>• Make sure the Supabase schema (SUPABASE_SCHEMA.sql) has been applied.</p>
          <p>• This is safe to re-run — it uses upsert so existing records won't be duplicated.</p>
          <p>• Migration runs entities sequentially. Large datasets may take a few minutes.</p>
        </CardContent>
      </Card>

      <Button
        onClick={runMigration}
        disabled={running}
        className="w-full mb-6"
        size="lg"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migrating...</>
        ) : 'Start Migration'}
      </Button>

      {summary && (
        <Card className={`mb-6 border-2 ${summary.totalFailed === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <CardContent className="pt-4 text-sm font-medium">
            ✅ {summary.totalMigrated} records migrated &nbsp;|&nbsp;
            {summary.totalFailed > 0 ? `❌ ${summary.totalFailed} entities failed` : '🎉 All entities succeeded'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {Object.entries(ENTITY_TABLE_MAP).map(([entityName, tableName]) => {
          const { state, count, error } = statuses[entityName];
          return (
            <div key={entityName} className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-slate-100">
              <div className="flex items-center gap-3">
                {getIcon(state)}
                <div>
                  <span className="text-sm font-medium text-slate-800">{entityName}</span>
                  <span className="text-xs text-slate-400 ml-2">→ {tableName}</span>
                </div>
              </div>
              <div className="text-xs text-right">
                {state === 'done' && <span className="text-green-600">{count} records</span>}
                {state === 'error' && <span className="text-red-500 max-w-[200px] truncate">{error}</span>}
                {state === 'idle' && <span className="text-slate-300">pending</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}