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
import { QrCode, Plus, Search, LayoutGrid, List, Trash2, Download, Pencil, CheckCircle2, Users, Clock, Wrench, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  available: { label: 'Available', color: 'bg-green-100 text-green-700 border-green-300' },
  occupied: { label: 'Occupied', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  reserved: { label: 'Reserved', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  maintenance: { label: 'Maintenance', color: 'bg-red-100 text-red-700 border-red-300' },
};

// ── QR helpers ──────────────────────────────────────────────────────────────
const generateQRDataUrl = async (url) => {
  try {
    return await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  } catch (e) {
    console.error('QR generation failed:', e);
    return null;
  }
};

const saveQRToStorage = async (supabase, tableId, tableName, orderingUrl, tenantId) => {
  try {
    const dataUrl = await generateQRDataUrl(orderingUrl);
    if (!dataUrl) return null;

    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const path = `${tenantId}/qr-codes/${tableId}.png`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, blob, { contentType: 'image/png', upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);

    await supabase.from('tables').update({ qr_image_url: urlData.publicUrl }).eq('id', tableId);

    console.log(`✓ QR saved for ${tableName}:`, urlData.publicUrl);
    return urlData.publicUrl;
  } catch (e) {
    console.warn(`QR save warning for ${tableName}:`, e.message);
    return null;
  }
};
// ────────────────────────────────────────────────────────────────────────────

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
  const [qrCodes, setQrCodes] = useState({}); // tableId → data URL or static URL
  const [localTables, setLocalTables] = useState([]); // local copy to patch qr_image_url
  const [editingZone, setEditingZone] = useState(null);
  const [editingZoneName, setEditingZoneName] = useState('');

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

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['table_sessions_active', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from('table_sessions')
        .select('table_id, total_amount, started_at, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const formatDuration = (startedAt) => {
    if (!startedAt) return '';
    const mins = Math.floor((Date.now() - new Date(startedAt)) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const currency = tenant?.currency || 'SGD';

  // Sync localTables when query data changes
  useEffect(() => {
    setLocalTables(tables);
  }, [tables]);

  // Hybrid QR load: use saved static URL if available, otherwise generate + save
  useEffect(() => {
    if (!localTables.length || !tenantId) return;
    const loadQRCodes = async () => {
      const supabase = await getSupabase();
      const map = {};
      for (const table of localTables) {
        if (!table.qr_code_url) continue;
        if (table.qr_image_url) {
          map[table.id] = table.qr_image_url;
        } else {
          const dataUrl = await generateQRDataUrl(table.qr_code_url);
          if (dataUrl) {
            map[table.id] = dataUrl;
            saveQRToStorage(supabase, table.id, table.name, table.qr_code_url, tenantId)
              .then(savedUrl => {
                if (savedUrl) {
                  setQrCodes(prev => ({ ...prev, [table.id]: savedUrl }));
                  setLocalTables(prev => prev.map(t =>
                    t.id === table.id ? { ...t, qr_image_url: savedUrl } : t
                  ));
                }
              });
          }
        }
      }
      setQrCodes(map);
    };
    loadQRCodes();
  }, [localTables.map(t => t.id).join(','), tenantId]); // only re-run when table IDs change

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

  // Get unique zones from data
  const zones = [...new Set(tables.map(t => t.zone || 'Unassigned'))].sort();

  // Filter tables
  const filteredTables = tables.filter(table => {
    const matchesSearch = !searchQuery || 
      table.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
    const matchesZone = zoneFilter === 'all' || (t => (t.zone || 'Unassigned') === zoneFilter)(table);
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

  const handleDownloadQR = async (table) => {
    const imageUrl = table.qr_image_url || qrCodes[table.id];
    if (!imageUrl) {
      toast.error('QR code not ready yet. Please wait a moment.');
      return;
    }
    if (imageUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `QR-${table.name}.png`;
      a.click();
    } else {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `QR-${table.name}.png`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(imageUrl, '_blank');
      }
    }
  };

  const handleRegenerateQR = async (table) => {
    const supabase = await getSupabase();
    const saved = await saveQRToStorage(supabase, table.id, table.name, table.qr_code_url, tenantId);
    if (saved) {
      setQrCodes(prev => ({ ...prev, [table.id]: saved }));
      setLocalTables(prev => prev.map(t => t.id === table.id ? { ...t, qr_image_url: saved } : t));
      toast.success(`QR regenerated for ${table.name}`);
    } else {
      toast.error('Failed to regenerate QR');
    }
  };

  const STATUS_OPTIONS = [
    { key: 'available',   label: 'Available', Icon: CheckCircle2, activeBg: '#16A34A', inactiveBg: '#F0FDF4', inactiveColor: '#86EFAC' },
    { key: 'occupied',    label: 'Occupied',  Icon: Users,        activeBg: '#DC2626', inactiveBg: '#FEF2F2', inactiveColor: '#FCA5A5' },
    { key: 'reserved',    label: 'Reserved',  Icon: Clock,        activeBg: '#D97706', inactiveBg: '#FFFBEB', inactiveColor: '#FCD34D' },
    { key: 'maintenance', label: 'Maint.',    Icon: Wrench,       activeBg: '#475569', inactiveBg: '#F8FAFC', inactiveColor: '#CBD5E1' },
  ];

  const QR_STATUS_BADGE = {
    available:   { label: '✓ Scan to order', bg: '#F0FDF4', color: '#16A34A', Icon: CheckCircle2 },
    occupied:    { label: 'In use',           bg: '#FEF2F2', color: '#DC2626', Icon: Users },
    reserved:    { label: 'Reserved',         bg: '#FFFBEB', color: '#D97706', Icon: Clock },
    maintenance: { label: 'Unavailable',      bg: '#F8FAFC', color: '#475569', Icon: Wrench },
  };

  const handleZoneRename = async (oldZone, newZone) => {
    if (!newZone.trim() || newZone === oldZone) {
      setEditingZone(null);
      return;
    }
    const supabase = await getSupabase();
    const query = supabase
      .from('tables')
      .update({ zone: newZone.trim(), updated_date: new Date().toISOString() })
      .eq('tenant_id', tenantId);
    if (oldZone === 'Unassigned') {
      await query.is('zone', null);
    } else {
      await query.eq('zone', oldZone);
    }
    setEditingZone(null);
    queryClient.invalidateQueries({ queryKey: ['tables', tenantId] });
  };

  const handleStatusChange = async (table, newStatus) => {
    const supabase = await getSupabase();
    await supabase
      .from('tables')
      .update({ status: newStatus, updated_date: new Date().toISOString() })
      .eq('id', table.id)
      .eq('tenant_id', tenantId);

    if (newStatus === 'available') {
      await supabase
        .from('table_sessions')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        })
        .eq('table_id', table.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
    }

    queryClient.invalidateQueries({ queryKey: ['tables', tenantId] });
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
              size="sm"
              className="text-white gap-1.5"
              style={{ background: 'var(--color-primary-gradient)' }}
            >
              <Plus className="w-4 h-4" /> Add Table
            </Button>
          }
        />

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', marginTop: '16px' }}>
          {[
            { label: 'Total', value: tables.length, color: 'rgb(var(--color-primary))', bg: '#f1f5f9' },
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
            <option value="all">All Zones</option>
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
          const filteredZones = [...new Set(filteredTables.map(t => t.zone || 'Unassigned'))].sort();

          return filteredZones.map(zone => {
            const zoneTables = filteredTables.filter(t => (t.zone || 'Unassigned') === zone);
            return (
            <div key={zone} style={{ marginBottom: '20px' }}>
              <div className="flex items-center gap-2 mb-3">
                {editingZone === zone ? (
                  <>
                    <input
                      autoFocus
                      value={editingZoneName}
                      onChange={e => setEditingZoneName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleZoneRename(zone, editingZoneName);
                        if (e.key === 'Escape') setEditingZone(null);
                      }}
                      className="text-sm font-semibold border-b-2 outline-none bg-transparent"
                      style={{ borderColor: 'rgb(var(--color-primary))', color: 'rgb(var(--color-primary))' }}
                    />
                    <button
                      onMouseDown={e => { e.preventDefault(); handleZoneRename(zone, editingZoneName); }}
                      className="p-0.5 rounded hover:bg-green-100 transition-colors text-green-600"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onMouseDown={e => { e.preventDefault(); setEditingZone(null); }}
                      className="p-0.5 rounded hover:bg-red-100 transition-colors text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--color-primary))' }}>{zone}</h3>
                    <button
                      onClick={() => { setEditingZone(zone); setEditingZoneName(zone === 'Unassigned' ? '' : zone); }}
                      className="p-0.5 rounded hover:bg-slate-100 transition-colors"
                      style={{ color: 'rgb(var(--color-primary))' }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{tables.filter(t => (t.zone || 'Unassigned') === zone).length} tables</span>
              </div>

              {viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {zoneTables.map(table => {
                    const localTable = localTables.find(t => t.id === table.id) || table;
                    return (
                      <div key={table.id} style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #e2e8f0', overflow: 'hidden' }}>
                        <div
                          className="relative"
                          style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', cursor: 'pointer' }}
                          onClick={() => handleDownloadQR(localTable)}
                        >
                          {qrCodes[table.id] ? (
                            <div className="relative w-20 h-20">
                              <img src={qrCodes[table.id]} className="w-full h-full object-contain" alt={`QR ${table.name}`}
                                style={{ opacity: table.status === 'available' ? 1 : 0.45 }} />
                              <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                                {(() => {
                                  const badge = QR_STATUS_BADGE[table.status] || QR_STATUS_BADGE.available;
                                  const BadgeIcon = badge.Icon;
                                  return (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"
                                      style={{ background: badge.bg, color: badge.color, fontSize: '8px' }}>
                                      <BadgeIcon style={{ width: '8px', height: '8px' }} />
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          ) : (
                            <QrCode style={{ width: '40px', height: '40px', color: '#cbd5e1' }} />
                          )}
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <p style={{ fontWeight: '700', fontSize: '14px', margin: 0, color: '#0f172a' }}>{table.name}</p>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{table.capacity} seats</p>
                          </div>
                          {table.status === 'occupied' && (() => {
                            const activeSession = activeSessions.find(s => s.table_id === table.id);
                            return activeSession ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                <span>⏱ {formatDuration(activeSession.started_at)}</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{currency} {(activeSession.total_amount || 0).toFixed(2)}</span>
                              </div>
                            ) : null;
                          })()}
                          <div className="grid grid-cols-4 gap-1 mt-2" onClick={e => e.stopPropagation()}>
                            {STATUS_OPTIONS.map(({ key, label, Icon, activeBg, inactiveBg, inactiveColor }) => (
                              <button key={key}
                                onClick={() => handleStatusChange(table, key)}
                                className="flex flex-col items-center py-1.5 px-1 rounded-lg transition-all active:scale-95"
                                style={table.status === key
                                  ? { background: activeBg, color: '#fff' }
                                  : { background: inactiveBg, color: inactiveColor }
                                }
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-medium mt-0.5 leading-none">{label}</span>
                              </button>
                            ))}
                          </div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            <button
                              onClick={() => handleDownloadQR(localTable)}
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
                    const localTable = localTables.find(t => t.id === table.id) || table;
                    return (
                      <div key={table.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'white', borderRadius: '12px', border: '0.5px solid #e2e8f0', padding: '12px' }}>
                        <div
                          className="relative"
                          style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#f8fafc', flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}
                          onClick={() => handleDownloadQR(localTable)}
                        >
                          {qrCodes[table.id] ? (
                            <>
                              <img src={qrCodes[table.id]} style={{ width: '56px', height: '56px', objectFit: 'contain', opacity: table.status === 'available' ? 1 : 0.45 }} alt={`QR ${table.name}`} />
                              <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                                {(() => {
                                  const badge = QR_STATUS_BADGE[table.status] || QR_STATUS_BADGE.available;
                                  const BadgeIcon = badge.Icon;
                                  return (
                                    <span className="rounded-full flex items-center gap-0.5 shadow-sm"
                                      style={{ background: badge.bg, color: badge.color, fontSize: '7px', fontWeight: '600', padding: '1px 4px' }}>
                                      <BadgeIcon style={{ width: '7px', height: '7px' }} />
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            </>
                          ) : (
                            <div style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <QrCode style={{ width: '24px', height: '24px', color: '#cbd5e1' }} />
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <p style={{ fontWeight: '600', fontSize: '14px', margin: 0, color: '#0f172a' }}>{table.name}</p>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{table.capacity} seats</p>
                            {table.status === 'occupied' && (() => {
                              const activeSession = activeSessions.find(s => s.table_id === table.id);
                              return activeSession ? (
                                <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: '600' }}>
                                  ⏱ {formatDuration(activeSession.started_at)} · {currency} {(activeSession.total_amount || 0).toFixed(2)}
                                </span>
                              ) : null;
                            })()}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => handleDownloadQR(localTable)}
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
                          <div className="grid grid-cols-4 gap-1" onClick={e => e.stopPropagation()}>
                            {STATUS_OPTIONS.map(({ key, label, Icon, activeBg, inactiveBg, inactiveColor }) => (
                              <button key={key}
                                onClick={() => handleStatusChange(table, key)}
                                className="flex flex-col items-center py-1.5 px-1 rounded-lg transition-all active:scale-95"
                                style={table.status === key
                                  ? { background: activeBg, color: '#fff' }
                                  : { background: inactiveBg, color: inactiveColor }
                                }
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-medium mt-0.5 leading-none">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          });
        })()}

        {/* Dialogs */}
        <TableFormDialog
          open={showFormDialog}
          onOpenChange={setShowFormDialog}
          table={selectedTable}
          tenantId={tenantId}
          tenant={tenant}
          allTables={tables}
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