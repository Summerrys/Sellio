import { getSupabase } from './supabaseClient';

// Entity to table name mapping
const tableMap = {
  AppUser: 'app_users',
  Tenant: 'tenants',
  Role: 'roles',
  TenantUser: 'tenant_users',
  Category: 'categories',
  TableEntity: 'tables',
  Product: 'products',
  Order: 'orders',
  SuperAdmin: 'super_admins',
  Subscription: 'subscriptions',
  Permission: 'permissions',
  ProductVariant: 'product_variants',
  InventoryItem: 'inventory_items',
  OrderItem: 'order_items',
  Payment: 'payments',
  ThemeConfig: 'theme_configs',
  BusinessHours: 'business_hours',
  TableCall: 'table_calls',
  TableSession: 'table_sessions',
  Notification: 'notifications',
  NotificationPreference: 'notification_preferences',
};

// Parse sort string like "-created_date" to { column, ascending }
function parseSort(sortStr) {
  if (!sortStr) return null;
  const desc = sortStr.startsWith('-');
  const column = desc ? sortStr.slice(1) : sortStr;
  return { column, ascending: !desc };
}

// Create entity handler for a specific table
function createEntityHandler(tableName) {
  return {
    // List all records with optional sort and limit
    async list(sort, limit = 50) {
      const supabase = await getSupabase();
      let query = supabase.from(tableName).select('*');
      const sortConfig = parseSort(sort);
      if (sortConfig) {
        query = query.order(sortConfig.column, { ascending: sortConfig.ascending });
      }
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    // Filter records with query object
    async filter(filters = {}, sort, limit = 50) {
      const supabase = await getSupabase();
      let query = supabase.from(tableName).select('*');
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      const sortConfig = parseSort(sort);
      if (sortConfig) {
        query = query.order(sortConfig.column, { ascending: sortConfig.ascending });
      }
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    // Get single record by ID
    async get(id) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    // Create a new record
    async create(record) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from(tableName)
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    // Bulk create records
    async bulkCreate(records) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from(tableName)
        .insert(records)
        .select();
      if (error) throw error;
      return data;
    },

    // Update a record
    async update(id, updates) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    // Delete a record
    async delete(id) {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },

    // Subscribe to real-time changes
    async subscribe(callback) {
      const supabase = await getSupabase();
      const channel = supabase
        .channel(`${tableName}_changes`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: tableName },
          (payload) => {
            const typeMap = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };
            callback({
              type: typeMap[payload.eventType] || payload.eventType,
              id: payload.new?.id || payload.old?.id,
              data: payload.new,
              old_data: payload.old
            });
          }
        )
        .subscribe();
      return () => supabase.removeChannel(channel);
    },

    schema() { return {}; }
  };
}

// Create db object with all entities
export const db = {
  entities: Object.fromEntries(
    Object.entries(tableMap).map(([entity, table]) => [entity, createEntityHandler(table)])
  ),
  
  // Direct supabase access for custom queries
  getSupabase,
  
  // Auth helpers (for custom auth system)
  auth: {
    async me() {
      // Read from cookie (set by AppUserContext) — works across all domains
      const match = document.cookie.match(/(?:^|;\s*)app_session=([^;]+)/);
      if (match) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          if (parsed?.id) return parsed;
        } catch {}
      }
      // Fallback: legacy localStorage key
      const legacy = localStorage.getItem('app_user');
      return legacy ? JSON.parse(legacy) : null;
    },
    
    async login(phone, password) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('phone', phone.trim())
        .single();
      if (error || !data) throw new Error('Invalid credentials');
      if (!data.is_active) throw new Error('Account is inactive');
      return data;
    },
    
    logout(redirectUrl) {
      localStorage.removeItem('app_user');
      window.location.href = redirectUrl || '/Auth';
    },
    
    async isAuthenticated() {
      return !!localStorage.getItem('app_user');
    },
    
    async updateMe(updates) {
      const user = await this.me();
      if (!user) throw new Error('Not authenticated');
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('app_users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      localStorage.setItem('app_user', JSON.stringify(data));
      return data;
    }
  }
};

// Export individual entity handlers for convenience
export const {
  AppUser,
  Tenant,
  Role,
  TenantUser,
  Category,
  TableEntity,
  Product,
  Order,
  SuperAdmin,
  Subscription,
  Permission,
  ProductVariant,
  InventoryItem,
  OrderItem,
  Payment,
  ThemeConfig,
  BusinessHours,
  TableCall,
  TableSession,
  Notification,
  NotificationPreference
} = db.entities;

export default db;