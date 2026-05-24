import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import db from '@/lib/db';
import { base44 } from '@/api/base44Client';
import { getSupabase } from '@/lib/supabaseClient';
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
import { QrCode, Plus, Search, LayoutGrid, List, Trash2, Download, Pencil } from 'lucide-react';
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
  const [qrDataUrls, setQrDataUrls] = useState({});

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('zone', { ascending: true, nullsFirst: true })
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Generate QR data URLs for all tables on load
  useEffect(() => {
    if (!tables.length) return;
    console.log('Tables loaded:', tables.map(t => ({ name: t.name, qr: t.qr_code_url })));
    const generate = async () => {
      const map = {};
      for (const table of tables) {
        if (table.qr_code_url) {
          try {
            map[table.id] = await QRCode.toDataURL(table.qr_code_url, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
          } catch (e) {
            console.warn('QR gen failed for', table.name, e);
          }
        }
      }
      setQrDataUrls(map);
    };
    generate();
  }, [tables]);

  const deleteMutation = useMutation({
    mutationFn: (tableId) => base44.functions.invoke('manageTable', { action: 'delete', tenant_id: tenantId, table_id: tableId }),
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

  const handleDownloadQR = (tableId, tableName) => {
    const dataUrl = qrDataUrls[tableId];
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR-${tableName}.png`;
    a.click();
  };

  const statusColors = {
    available: { color: '#16a34a', bg: '#dcfce7' },
    occupied: { color: '#92400e', bg: '#fef3c7' },
    reserved: { color: '#1d4ed8', bg: '#dbeafe' },
    maintenance: { color: '#dc2626', bg: '#fee2e2' },
  };

  return (
    <RequirePermission permission="tables.view">
      <div style={{ padding: '0 0 100px' }}>
        {/* Header */}
        <PageHeader
          title="Tables & QR Codes"
          description="Manage your dining tables and QR code ordering"
          actions={
            <Button
              onClick={handleAdd}
              className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
            >
              <Plus className="w-4 h-4" /> Add Table
            </Button>
          }
        />

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', marginTop: '16px' }}>
          {[
            { label: 'Total', value: tables.length, color: '#0f172a', bg: '#f1f5f9' },
            { label: 'Available', value: tables.filter(t => t.status === 'available').length, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Occupied', value: tables.filter(t => t.status === 'occupied').length, color: '#92400e', bg: '#fef3c7' },
            { label: 'Reserved', value: tables.filter(t => t.status === 'reserved').length, color: '#1d4ed8', bg: '#dbeafe' },
          ].map(stat => (
            <div key={stat.label} style={{ background: stat.bg, borderRadius: '10px', padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 2px', color: stat.color }}>{stat.value}</p>
              <p style={{ fontSize: '10px', color: stat.color, margin: 0, opacity: 0.8 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94a3b8' }} />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tables..."
            className="pl-9"
          />
        </div>

        {/* Filters + view toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
          <select
            value={zoneFilter}
            onChange={e => setZoneFilter(e.target.value)}
            style={{ flex: 1, fontSize: '13px', height: '36px', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0 8px', background: 'white' }}
          >
            <option value="">All Zones</option>
            {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ flex: 1, fontSize: '13px', height: '36px', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0 8px', background: 'white' }}
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '8px', padding: '3px', flexShrink: 0 }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: viewMode === 'grid' ? 'white' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <LayoutGrid style={{ width: '16px', height: '16px', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8' }} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: viewMode === 'list' ? 'white' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <List style={{ width: '16px', height: '16px', color: viewMode === 'list' ? '#6366f1' : '#94a3b8' }} />
            </button>
          </div>
        </div>

        {/* Tables display */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>Loading tables...</div>
        ) : filteredTables.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <QrCode style={{ width: '48px', height: '48px', color: '#cbd5e1', margin: '0 auto 12px' }} />
            <p style={{ color: '#94a3b8', margin: 0 }}>{searchQuery || zoneFilter || statusFilter ? 'No tables found' : 'No tables yet'}</p>
          </div>
        ) : (() => {
          const grouped = filteredTables.reduce((groups, table) => {
            const zone = table.zone || 'General';
            if (!groups[zone]) groups[zone] = [];
            groups[zone].push(table);
            return groups;
          }, {});
          const hasMultipleZones = Object.keys(grouped).length > 1;

          return Object.entries(grouped).map(([zone, zoneTables]) => (
            <div key={zone} style={{ marginBottom: '20px' }}>
              {hasMultipleZones && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{zone}</p>
                  <div style={{ flex: 1, height: '0.5px', background: '#e2e8f0' }} />
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{zoneTables.length} tables</p>
                </div>
              )}

              {viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {zoneTables.map(table => {
                    const sc = statusColors[table.status] || statusColors.available;
                    return (
                      <div key={table.id} style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #e2e8f0', overflow: 'hidden' }}>
                        <div
                          style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', minHeight: '100px', cursor: 'pointer' }}
                          onClick={() => handleDownloadQR(table.id, table.name)}
                        >
                          {qrDataUrls[table.id]
                            ? <img src={qrDataUrls[table.id]} style={{ width: '80px', height: '80px' }} alt={`QR ${table.name}`} />
                            : <QrCode style={{ width: '40px', height: '40px', color: '#cbd5e1' }} />
                          }
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <p style={{ fontWeight: '700', fontSize: '14px', margin: 0, color: '#0f172a' }}>{table.name}</p>
                            <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '999px', background: sc.bg, color: sc.color, flexShrink: 0 }}>
                              {table.status}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>{table.capacity} seats</p>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleDownloadQR(table.id, table.name)}
                              style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: 'none', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <Download style={{ width: '13px', height: '13px' }} /> QR
                            </button>
                            <button
                              onClick={() => handleEdit(table)}
                              style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '0.5px solid #e2e8f0', background: 'none', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <Pencil style={{ width: '13px', height: '13px' }} /> Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {zoneTables.map(table => {
                    const sc = statusColors[table.status] || statusColors.available;
                    return (
                      <div key={table.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'white', borderRadius: '12px', border: '0.5px solid #e2e8f0', padding: '12px' }}>
                        <div
                          style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                          onClick={() => handleDownloadQR(table.id, table.name)}
                        >
                          {qrDataUrls[table.id]
                            ? <img src={qrDataUrls[table.id]} style={{ width: '44px', height: '44px' }} alt={`QR ${table.name}`} />
                            : <QrCode style={{ width: '24px', height: '24px', color: '#cbd5e1' }} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <p style={{ fontWeight: '600', fontSize: '14px', margin: 0, color: '#0f172a' }}>{table.name}</p>
                            {table.zone && <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '999px' }}>{table.zone}</span>}
                          </div>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{table.capacity} seats</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                          <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '999px', background: sc.bg, color: sc.color }}>
                            {table.status}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleDownloadQR(table.id, table.name)}
                              style={{ width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e2e8f0', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Download style={{ width: '14px', height: '14px', color: '#64748b' }} />
                            </button>
                            <button
                              onClick={() => handleEdit(table)}
                              style={{ width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e2e8f0', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Pencil style={{ width: '14px', height: '14px', color: '#64748b' }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ));
        })()}

        {/* Dialogs */}
        <TableFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          table={selectedTable}
          tenantId={tenantId}
          tenant={tenant}
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