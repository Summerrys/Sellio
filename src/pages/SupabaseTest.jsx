import React, { useState } from 'react';
import { db } from '@/lib/db';
import { getSupabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, Database, Play } from 'lucide-react';

const entities = [
  'AppUser', 'Tenant', 'Role', 'TenantUser', 'Category', 'TableEntity',
  'Product', 'Order', 'SuperAdmin', 'Subscription', 'Permission',
  'ProductVariant', 'InventoryItem', 'OrderItem', 'Payment', 'ThemeConfig',
  'BusinessHours', 'TableCall', 'TableSession', 'Notification', 'NotificationPreference'
];

export default function SupabaseTest() {
  const [results, setResults] = useState({});
  const [testing, setTesting] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('app_users').select('count').limit(1);
      if (error) throw error;
      setConnectionStatus('connected');
    } catch (err) {
      setConnectionStatus('error');
      console.error('Connection error:', err);
    }
  };

  const testEntity = async (entityName) => {
    setTesting(entityName);
    setResults(prev => ({ ...prev, [entityName]: { status: 'testing' } }));

    try {
      const entity = db.entities[entityName];
      
      // Test 1: List (should not error even if empty)
      const listResult = await entity.list('-created_date', 5);
      
      // Test 2: Create a test record
      const testData = getTestData(entityName);
      const created = await entity.create(testData);
      
      // Test 3: Get by ID
      const fetched = await entity.get(created.id);
      
      // Test 4: Update
      const updated = await entity.update(created.id, { updated_date: new Date().toISOString() });
      
      // Test 5: Delete (cleanup)
      await entity.delete(created.id);

      setResults(prev => ({
        ...prev,
        [entityName]: {
          status: 'success',
          message: `✓ List (${listResult.length} records), Create, Get, Update, Delete — All passed!`
        }
      }));
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [entityName]: {
          status: 'error',
          message: err.message
        }
      }));
    }
    setTesting(null);
  };

  const testAllEntities = async () => {
    for (const entity of entities) {
      await testEntity(entity);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Database className="w-6 h-6" />
        Supabase Connection Test
      </h1>

      {/* Connection Test */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Database Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button onClick={testConnection} disabled={connectionStatus === 'testing'}>
              {connectionStatus === 'testing' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
              ) : (
                'Test Connection'
              )}
            </Button>
            {connectionStatus === 'connected' && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Connected to Supabase
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="text-red-600 flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Connection failed — check console
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Entity Tests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Entity CRUD Tests</CardTitle>
          <Button onClick={testAllEntities} disabled={testing}>
            <Play className="w-4 h-4 mr-2" /> Test All Entities
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {entities.map(entity => (
              <div
                key={entity}
                className="flex items-center justify-between p-3 rounded-lg border bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium w-40">{entity}</span>
                  {results[entity]?.status === 'testing' && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  )}
                  {results[entity]?.status === 'success' && (
                    <span className="text-green-600 text-sm flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {results[entity].message}
                    </span>
                  )}
                  {results[entity]?.status === 'error' && (
                    <span className="text-red-600 text-sm flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      {results[entity].message}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testEntity(entity)}
                  disabled={testing === entity}
                >
                  Test
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p><strong>1.</strong> Copy the SQL from <code>SUPABASE_SCHEMA.sql</code> and run it in your Supabase SQL Editor.</p>
          <p><strong>2.</strong> In Supabase Dashboard → Settings → API, copy your Project URL and anon key.</p>
          <p><strong>3.</strong> For Hostinger deployment, add these to your <code>.env</code> file:</p>
          <pre className="bg-slate-100 p-3 rounded-lg mt-2">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
          <p><strong>4.</strong> If you get permission errors, run this in SQL Editor:</p>
          <pre className="bg-slate-100 p-3 rounded-lg mt-2">
{`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// Test data generators for each entity
function getTestData(entityName) {
  const timestamp = Date.now();
  const testDataMap = {
    AppUser: { email: `test_${timestamp}@test.com`, full_name: 'Test User', role: 'user' },
    Tenant: { name: `Test Tenant ${timestamp}`, slug: `test-${timestamp}`, owner_email: 'test@test.com' },
    Role: { tenant_id: 'test', name: `Test Role ${timestamp}`, permissions: [] },
    TenantUser: { tenant_id: 'test', user_email: `test_${timestamp}@test.com` },
    Category: { tenant_id: 'test', name: `Test Category ${timestamp}` },
    TableEntity: { tenant_id: 'test', name: `T${timestamp}` },
    Product: { tenant_id: 'test', name: `Test Product ${timestamp}`, price: 9.99 },
    Order: { tenant_id: 'test', order_number: `ORD-${timestamp}`, items: [], total_amount: 0 },
    SuperAdmin: { email: `admin_${timestamp}@test.com`, name: 'Test Admin' },
    Subscription: { tenant_id: 'test', tier: 'free' },
    Permission: { resource: 'test', action: 'read', key: `test.read.${timestamp}`, description: 'Test permission' },
    ProductVariant: { tenant_id: 'test', product_id: 'test', name: `Variant ${timestamp}` },
    InventoryItem: { tenant_id: 'test', product_id: 'test' },
    OrderItem: { tenant_id: 'test', order_id: 'test', product_id: 'test', quantity: 1, unit_price: 10, total_price: 10 },
    Payment: { tenant_id: 'test', order_id: 'test', method: 'cash', amount: 10 },
    ThemeConfig: { tenant_id: `test_${timestamp}` },
    BusinessHours: { tenant_id: 'test', day_of_week: 'monday' },
    TableCall: { tenant_id: 'test', table_id: 'test', table_name: 'T1' },
    TableSession: { tenant_id: 'test', table_id: 'test', table_name: 'T1' },
    Notification: { type: 'system', title: 'Test', message: 'Test notification' },
    NotificationPreference: { user_email: `test_${timestamp}@test.com`, preferences: {} }
  };
  return testDataMap[entityName] || {};
}