import db from '@/lib/db';

// Thin wrapper around db.entities for compatibility
class DataService {
  constructor(entityName) {
    this.entity = db.entities[entityName];
  }

  async create(data) { return this.entity.create(data); }
  async read(id) { return this.entity.get(id); }
  async list(filters = {}, sort = null, limit = 50) {
    if (Object.keys(filters).length > 0) return this.entity.filter(filters, sort, limit);
    return this.entity.list(sort, limit);
  }
  async update(id, data) { return this.entity.update(id, data); }
  async delete(id) { return this.entity.delete(id); }
}

export const TenantService = new DataService('Tenant');
export const UserService = new DataService('AppUser');
export const TenantUserService = new DataService('TenantUser');
export const SuperAdminService = new DataService('SuperAdmin');