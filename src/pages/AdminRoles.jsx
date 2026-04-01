import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co/functions/v1';

export default function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({
    role_name: '',
    description: '',
    permissions: [],
  });

  const permissionsList = [
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.delete',
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'staff.view',
    'staff.create',
    'staff.edit',
    'staff.delete',
    'inventory.view',
    'inventory.manage',
    'reports.view',
    'settings.view',
    'settings.edit',
  ];

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const functionUrl = `${BACKEND_URL}/manageRoles`;
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });

      const data = await response.json();
      if (data.success) {
        setRoles(data.data);
      } else {
        toast.error(data.error || 'Failed to fetch roles');
      }
    } catch (error) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!formData.role_name.trim()) {
        toast.error('Role name is required');
        return;
      }

      const functionUrl = `${BACKEND_URL}/manageRoles`;
      const action = editingRole ? 'update' : 'create';
      const body = {
        action,
        ...formData,
        ...(editingRole && { id: editingRole.id }),
      };

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(editingRole ? 'Role updated!' : 'Role created!');
        setShowForm(false);
        setEditingRole(null);
        setFormData({ role_name: '', description: '', permissions: [] });
        fetchRoles();
      } else {
        toast.error(data.error || 'Failed to save role');
      }
    } catch (error) {
      toast.error(error.message || 'An error occurred');
    }
  };

  const handleEdit = (role) => {
    setEditingRole(role);
    setFormData({
      role_name: role.role_name,
      description: role.description || '',
      permissions: role.permissions || [],
    });
    setShowForm(true);
  };

  const handleDelete = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      const functionUrl = `${BACKEND_URL}/manageRoles`;
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: roleId }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Role deleted!');
        fetchRoles();
      } else {
        toast.error(data.error || 'Failed to delete role');
      }
    } catch (error) {
      toast.error(error.message || 'An error occurred');
    }
  };

  const togglePermission = (permission) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Role Management</h1>
          <p className="text-slate-500 mt-1">Create and manage staff roles with permissions</p>
        </div>
        <button
          onClick={() => {
            setEditingRole(null);
            setFormData({ role_name: '', description: '', permissions: [] });
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Role
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {editingRole ? 'Edit Role' : 'Create New Role'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role Name *</label>
              <input
                type="text"
                placeholder="e.g., Manager, Cashier"
                value={formData.role_name}
                onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                placeholder="What is this role responsible for?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Permissions</label>
              <div className="grid grid-cols-2 gap-3">
                {permissionsList.map((permission) => (
                  <label key={permission} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission)}
                      onChange={() => togglePermission(permission)}
                      className="w-4 h-4 border border-slate-300 rounded"
                    />
                    <span className="text-sm text-slate-700">{permission}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
              >
                {editingRole ? 'Update Role' : 'Create Role'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roles List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
          <p className="text-slate-500">No roles created yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">{role.role_name}</h3>
                  {role.description && (
                    <p className="text-sm text-slate-500 mt-1">{role.description}</p>
                  )}
                  {role.permissions && role.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {role.permissions.slice(0, 3).map((perm) => (
                        <span key={perm} className="inline-block text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                          {perm}
                        </span>
                      ))}
                      {role.permissions.length > 3 && (
                        <span className="inline-block text-xs text-slate-500">
                          +{role.permissions.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(role)}
                    className="p-2 text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(role.id)}
                    className="p-2 text-slate-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}