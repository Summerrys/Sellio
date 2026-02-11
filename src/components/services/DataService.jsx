import { base44 } from '@/api/base44Client';

/**
 * Generic Data Service for JSON file-based CRUD operations
 * Each entity has a backend function that handles file I/O
 */
class DataService {
  constructor(entityName, functionPath) {
    this.entityName = entityName;
    this.functionPath = functionPath;
  }

  async create(data) {
    try {
      const response = await base44.functions.invoke(this.functionPath, {
        operation: 'create',
        data
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  async read(id) {
    try {
      const response = await base44.functions.invoke(this.functionPath, {
        operation: 'read',
        id
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  async list(filters = {}, sort = null, limit = null, offset = 0) {
    try {
      const response = await base44.functions.invoke(this.functionPath, {
        operation: 'list',
        filters,
        sort,
        limit,
        offset
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  async update(id, data) {
    try {
      const response = await base44.functions.invoke(this.functionPath, {
        operation: 'update',
        id,
        data
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  async delete(id) {
    try {
      const response = await base44.functions.invoke(this.functionPath, {
        operation: 'delete',
        id
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }
}

// Core Entities
export const TenantService = new DataService('Tenant', 'data/core/tenant');
export const UserService = new DataService('User', 'data/core/user');
export const TenantUserService = new DataService('TenantUser', 'data/core/tenantUser');
export const SuperAdminService = new DataService('SuperAdmin', 'data/core/superAdmin');