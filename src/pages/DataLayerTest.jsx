import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PageHeader from '@/components/ui-custom/PageHeader';
import { TenantService, UserService, TenantUserService, SuperAdminService } from '@/components/services/DataService';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const ENTITY_CONFIGS = {
  tenant: {
    name: 'Tenant',
    service: TenantService,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'text', required: true },
      { name: 'owner_email', label: 'Owner Email', type: 'email', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'suspended', 'trial', 'cancelled'] },
      { name: 'plan', label: 'Plan', type: 'select', options: ['free', 'starter', 'professional', 'enterprise'] },
    ],
    displayFields: ['id', 'name', 'slug', 'owner_email', 'status', 'plan', 'created_at']
  },
  user: {
    name: 'User',
    service: UserService,
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'full_name', label: 'Full Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'select', options: ['admin', 'user'] },
    ],
    displayFields: ['id', 'email', 'full_name', 'role', 'created_at']
  },
  tenantUser: {
    name: 'TenantUser',
    service: TenantUserService,
    fields: [
      { name: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
      { name: 'user_email', label: 'User Email', type: 'email', required: true },
      { name: 'role_id', label: 'Role ID', type: 'text' },
      { name: 'role_name', label: 'Role Name', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'invited', 'suspended'] },
      { name: 'is_owner', label: 'Is Owner', type: 'checkbox' },
    ],
    displayFields: ['id', 'tenant_id', 'user_email', 'role_name', 'status', 'is_owner']
  },
  superAdmin: {
    name: 'SuperAdmin',
    service: SuperAdminService,
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'select', options: ['admin', 'support', 'developer'] },
      { name: 'is_active', label: 'Is Active', type: 'checkbox' },
    ],
    displayFields: ['id', 'email', 'name', 'role', 'is_active', 'created_at']
  }
};

export default function DataLayerTest() {
  const [selectedEntity, setSelectedEntity] = useState('tenant');
  const [formData, setFormData] = useState({});
  const [editingRecord, setEditingRecord] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIGS[selectedEntity];

  // Fetch records
  const { data: records, isLoading, refetch } = useQuery({
    queryKey: [selectedEntity, 'list'],
    queryFn: () => config.service.list(),
    initialData: []
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data) => config.service.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries([selectedEntity, 'list']);
      setFormData({});
      setCreateDialogOpen(false);
      toast.success(`${config.name} created successfully`);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => config.service.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries([selectedEntity, 'list']);
      setEditingRecord(null);
      setEditDialogOpen(false);
      toast.success(`${config.name} updated successfully`);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => config.service.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries([selectedEntity, 'list']);
      toast.success(`${config.name} deleted successfully`);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    updateMutation.mutate({ id: editingRecord.id, data: formData });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this record?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setFormData(record);
    setEditDialogOpen(true);
  };

  const handleFieldChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const renderFormField = (field) => {
    const value = formData[field.name] || '';

    if (field.type === 'select') {
      return (
        <div key={field.name}>
          <Label>{field.label} {field.required && '*'}</Label>
          <Select value={value} onValueChange={(val) => handleFieldChange(field.name, val)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <div key={field.name} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={field.name}
            checked={!!value}
            onChange={(e) => handleFieldChange(field.name, e.target.checked)}
            className="w-4 h-4"
          />
          <Label htmlFor={field.name}>{field.label}</Label>
        </div>
      );
    }

    return (
      <div key={field.name}>
        <Label>{field.label} {field.required && '*'}</Label>
        <Input
          type={field.type}
          value={value}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          placeholder={field.label}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Layer Test Console"
        description="Test CRUD operations for all entities"
      />

      {/* Entity Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Entity</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-center">
          <Select value={selectedEntity} onValueChange={(val) => {
            setSelectedEntity(val);
            setFormData({});
            setEditingRecord(null);
          }}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ENTITY_CONFIGS).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({})}>
                <Plus className="w-4 h-4 mr-2" />
                Create New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create {config.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {config.fields.map(renderFormField)}
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{config.name} Records ({records.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-slate-500">Loading...</p>
          ) : records.length === 0 ? (
            <p className="text-center py-8 text-slate-500">No records found. Create one to get started.</p>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.displayFields.map(field => (
                      <TableHead key={field}>{field}</TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(record => (
                    <TableRow key={record.id}>
                      {config.displayFields.map(field => (
                        <TableCell key={field} className="max-w-xs truncate">
                          {typeof record[field] === 'boolean' 
                            ? (record[field] ? 'Yes' : 'No')
                            : record[field] || '-'}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(record)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {config.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>ID (read-only)</Label>
              <Input value={editingRecord?.id || ''} disabled />
            </div>
            {config.fields.map(renderFormField)}
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}