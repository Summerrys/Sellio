import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { invokeFunction } from '@/lib/functions';
import { useTenant } from '../components/tenant/TenantContext';
import RequirePermission from '../components/auth/RequirePermission';
import PageHeader from '../components/ui-custom/PageHeader';
import EmptyState from '../components/ui-custom/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TableFormDialog from '../components/tables/TableFormDialog';
import TableCard from '../components/tables/TableCard';
import QRCodeGenerator from '../components/tables/QRCodeGenerator';
import BulkQRActions from '../components/tables/BulkQRActions';
import { QrCode, Plus, Search, LayoutGrid, List, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  available: { label: 'Available', color: 'bg-green-100 text-green-700 border-green-300' },
  occupied: { label: 'Occupied', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  reserved: { label: 'Reserved', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  maintenance: { label: 'Maintenance', color: 'bg-red-100 text-red-700 border-red-300' },
};

export default function Tables() {
  const { tenantId, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableToDelete, setTableToDelete] = useState(null);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables', tenantId],
    queryFn: async () => {
      const res = await invokeFunction('getTables', { tenant_id: tenantId });
      return res.data?.tables || [];
    },
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (tableId) => invokeFunction('manageTable', { action: 'delete', tenant_id: tenantId, table_id: tableId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', tenantId] });
      toast.success('Table deleted');
      setTableToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete table');
    },
  });

  // Get unique zones
  const zones = [...new Set(tables.map(t => t.zone))].filter(Boolean);

  // Filter tables
  const filteredTables = tables.filter(table => {
    const matchesSearch = !searchQuery || 
      table.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
    const matchesZone = zoneFilter === 'all' || table.zone === zoneFilter;

    return matchesSearch && matchesStatus && matchesZone;
  });

  const handleEdit = (table) => {
    setSelectedTable(table);
    setShowFormDialog(true);
  };

  const handleAdd = () => {
    setSelectedTable(null);
    setShowFormDialog(true);
  };

  const handleShowQR = (table) => {
    setSelectedTable(table);
    setShowQRDialog(true);
  };

  const handleDelete = (table) => {
    setTableToDelete(table);
  };

  return (
    <RequirePermission permission="tables.view">
      <div className="space-y-6">
        <PageHeader
          title="Tables & QR Codes"
          description="Manage your dining tables and QR code ordering"
          actions={
            <div className="flex gap-2">
              <BulkQRActions tables={filteredTables} tenant={tenant} />
              <Button
                onClick={handleAdd}
                className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
              >
                <Plus className="w-4 h-4" /> Add Table
              </Button>
            </div>
          }
        />

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 border-0 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Total Tables</p>
            <p className="text-2xl font-bold text-slate-900">{tables.length}</p>
          </Card>
          <Card className="p-4 border-0 shadow-sm bg-green-50 border-green-100">
            <p className="text-sm text-green-700 mb-1">Available</p>
            <p className="text-2xl font-bold text-green-700">
              {tables.filter(t => t.status === 'available').length}
            </p>
          </Card>
          <Card className="p-4 border-0 shadow-sm bg-amber-50 border-amber-100">
            <p className="text-sm text-amber-700 mb-1">Occupied</p>
            <p className="text-2xl font-bold text-amber-700">
              {tables.filter(t => t.status === 'occupied').length}
            </p>
          </Card>
          <Card className="p-4 border-0 shadow-sm bg-slate-50 border-slate-100">
            <p className="text-sm text-slate-700 mb-1">Reserved</p>
            <p className="text-2xl font-bold text-slate-700">
              {tables.filter(t => t.status === 'reserved').length}
            </p>
          </Card>
        </div>

        {/* Filters and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Zone Filter */}
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {zones.map(zone => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Toggle */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn("h-8 px-3", viewMode === 'grid' && "bg-white shadow-sm")}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('list')}
              className={cn("h-8 px-3", viewMode === 'list' && "bg-white shadow-sm")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tables Display */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading tables...</div>
        ) : filteredTables.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title={searchQuery || statusFilter !== 'all' || zoneFilter !== 'all' 
              ? "No tables found" 
              : "No tables yet"}
            description={searchQuery || statusFilter !== 'all' || zoneFilter !== 'all'
              ? "Try adjusting your filters"
              : "Add your first table to start accepting QR code orders"}
            actionLabel="Add Table"
            onAction={handleAdd}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onEdit={() => handleEdit(table)}
                onQR={() => handleShowQR(table)}
                onDelete={() => handleDelete(table)}
              />
            ))}
          </div>
        ) : (
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Table
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Zone
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Capacity
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      QR Code
                    </th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTables.map((table) => {
                    const status = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;
                    return (
                      <tr key={table.id} className="hover:bg-slate-25 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900">{table.name}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {table.zone}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {table.capacity} seats
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={status.color}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          {table.qr_code_url ? (
                            <img
                              src={table.qr_code_url}
                              alt="QR"
                              className="w-12 h-12 rounded border border-slate-200"
                            />
                          ) : (
                            <span className="text-sm text-slate-400">Not generated</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleShowQR(table)}
                            >
                              <QrCode className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(table)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(table)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Dialogs */}
        <TableFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          table={selectedTable}
          tenantId={tenantId}
        />

        <QRCodeGenerator
          open={showQRDialog}
          onOpenChange={setShowQRDialog}
          table={selectedTable}
          tenant={tenant}
        />

        <AlertDialog open={!!tableToDelete} onOpenChange={() => setTableToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Table</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{tableToDelete?.name}</strong>? This will invalidate its QR code.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(tableToDelete.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RequirePermission>
  );
}