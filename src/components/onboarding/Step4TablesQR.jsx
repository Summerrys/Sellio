import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, ArrowLeft, QrCode, Table2, ScanLine, Package, Plus, Trash2, Check } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';

const SETUP_MODES = [
  {
    id: 'tables_qr',
    icon: QrCode,
    label: 'Tables with QR Codes',
    desc: 'Customers scan QR at their table to order',
  },
  {
    id: 'tables_only',
    icon: Table2,
    label: 'Tables, No QR Codes',
    desc: 'Physical menus or staff takes orders at table',
  },
  {
    id: 'qr_only',
    icon: ScanLine,
    label: 'QR Code Only (No Tables)',
    desc: 'Counter / takeaway — one QR for all orders',
  },
  {
    id: 'none',
    icon: Package,
    label: 'No Tables or QR Codes',
    desc: 'Skip this step, set up later',
  },
];

function generateDefaultTables(count, prefix) {
  return Array.from({ length: count }, (_, i) => ({
    id: Date.now() + i,
    label: `${prefix} ${i + 1}`,
  }));
}

export default function Step4TablesQR({ formData, updateFormData, nextStep, prevStep }) {
  const [mode, setMode] = useState(formData.tableSetupMode || null);
  const [tables, setTables] = useState(formData.tables || []);
  const [tableCount, setTableCount] = useState('');
  const [tablePrefix, setTablePrefix] = useState('Table');
  const [newLabel, setNewLabel] = useState('');
  const [qrLabel, setQrLabel] = useState(formData.singleQrLabel || 'Counter');

  useEffect(() => {
    if (formData.customPrimary && formData.customSecondary) {
      const variables = generateThemeVariables(formData.customPrimary, formData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));
    } else {
      const variables = generateThemeVariables(DEFAULT_COLORS.primary, DEFAULT_COLORS.secondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const chosenColor = formData?.theme ? (formData?.themeColors?.dark || formData?.customPrimary) : null;
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';
  const { primary: primaryColor } = getThemeCSSColors(formData);

  const handleModeSelect = (m) => {
    setMode(m);
    if (m === 'none' || m === 'qr_only') setTables([]);
  };

  const bulkAdd = () => {
    const n = parseInt(tableCount);
    if (!n || n < 1) return;
    const generated = generateDefaultTables(n, tablePrefix.trim() || 'Table');
    setTables(prev => [...prev, ...generated]);
    setTableCount('');
  };

  const addSingle = () => {
    if (!newLabel.trim()) return;
    setTables(prev => [...prev, { id: Date.now(), label: newLabel.trim() }]);
    setNewLabel('');
  };

  const removeTable = (id) => setTables(prev => prev.filter(t => t.id !== id));

  const handleSubmit = () => {
    updateFormData({
      ...formData,
      tableSetupMode: mode,
      tables: mode === 'tables_qr' || mode === 'tables_only' ? tables : [],
      singleQrLabel: mode === 'qr_only' ? qrLabel : null,
    });
    nextStep();
  };

  const canContinue = mode === 'none' || mode === 'qr_only' || (mode && tables.length > 0);

  return (
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg w-full" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      <div className="text-center mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: themeColor }}>
          <QrCode className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Tables & QR Codes</h2>
        <p className="text-xs text-slate-500">Choose how customers will interact with your ordering system.</p>
      </div>

      {/* Mode Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {SETUP_MODES.map(({ id, icon: Icon, label, desc }) => {
          const selected = mode === id;
          return (
            <button
              key={id}
              onClick={() => handleModeSelect(id)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
              style={selected ? { borderColor: primaryColor, background: `${primaryColor}10` } : {}}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: selected ? themeColor : '#f1f5f9' }}>
                <Icon className="w-4 h-4" style={{ color: selected ? '#fff' : '#64748b' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
              {selected && (
                <div className="ml-auto flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: themeColor }}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Tables setup */}
      {(mode === 'tables_qr' || mode === 'tables_only') && (
        <div className="space-y-4 mb-5">
          {/* Bulk generate */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <Label className="text-xs font-semibold text-slate-700 mb-2 block">Quick Generate Tables</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={tablePrefix}
                onChange={(e) => setTablePrefix(e.target.value)}
                placeholder="Prefix (e.g. Table, Seat)"
                className="h-9 text-sm flex-1 min-w-[100px]"
              />
              <Input
                type="number"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                placeholder="How many?"
                className="h-9 text-sm w-28"
                min="1"
                max="100"
              />
              <button
                onClick={bulkAdd}
                disabled={!tableCount || parseInt(tableCount) < 1}
                className="px-4 h-9 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                style={{ background: themeColor }}
              >
                Generate
              </button>
            </div>
          </div>

          {/* Add single */}
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <Label className="text-xs font-semibold text-slate-700 mb-2 block">Add Individual Table / Zone</Label>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSingle()}
                placeholder="e.g. VIP Room, Bar Seat 1"
                className="h-9 text-sm flex-1"
              />
              <button
                onClick={addSingle}
                disabled={!newLabel.trim()}
                className="px-4 h-9 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                style={{ background: themeColor }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table list */}
          {tables.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{tables.length} table{tables.length > 1 ? 's' : ''} added</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {tables.map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100 group">
                    <div className="flex items-center gap-1.5">
                      {mode === 'tables_qr' && <QrCode className="w-3 h-3 text-slate-400" />}
                      {mode === 'tables_only' && <Table2 className="w-3 h-3 text-slate-400" />}
                      <span className="text-xs font-medium text-slate-700 truncate">{t.label}</span>
                    </div>
                    <button
                      onClick={() => removeTable(t.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors ml-1 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {tables.length > 0 && (
                <button
                  onClick={() => setTables([])}
                  className="mt-2 text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {tables.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ Please add at least one table to continue.
            </p>
          )}
        </div>
      )}

      {/* QR Only setup */}
      {mode === 'qr_only' && (
        <div className="mb-5 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <Label className="text-xs font-semibold text-slate-700 mb-2 block">QR Code Label</Label>
          <Input
            value={qrLabel}
            onChange={(e) => setQrLabel(e.target.value)}
            placeholder="e.g. Counter, Takeaway"
            className="h-9 text-sm"
          />
          <p className="text-xs text-slate-500 mt-1.5">This label will appear on your generated QR code.</p>
          <div className="mt-3 flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: themeColor }}>
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{qrLabel || 'Counter'}</p>
              <p className="text-xs text-slate-500">1 QR code will be generated for all orders</p>
            </div>
          </div>
        </div>
      )}

      {/* None selected hint */}
      {mode === 'none' && (
        <div className="mb-5 bg-slate-50 rounded-xl p-3 border border-slate-200 text-center">
          <p className="text-sm text-slate-600">No tables or QR codes will be set up now.</p>
          <p className="text-xs text-slate-400 mt-1">You can configure this anytime from the Tables & QR section.</p>
        </div>
      )}

      <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
        <Button type="button" onClick={prevStep} variant="outline" className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button
          type="button"
          onClick={() => { updateFormData({ ...formData, tableSetupMode: null, tables: [], singleQrLabel: null }); nextStep(); }}
          variant="outline"
          className="h-10 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm text-slate-500"
        >
          Skip
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canContinue}
          className="flex-1 h-10 sm:h-11 text-white gap-1 sm:gap-2 text-sm disabled:opacity-50"
          style={{ background: themeColor }}
        >
          Next <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>
    </Card>
  );
}