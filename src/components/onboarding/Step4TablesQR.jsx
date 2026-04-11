import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, ArrowLeft, QrCode, Table2, Plus, Trash2 } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';

function generateDefaultTables(count, prefix) {
  return Array.from({ length: count }, (_, i) => ({
    id: Date.now() + i,
    label: `${prefix} ${i + 1}`,
  }));
}

export default function Step4TablesQR({ formData, updateFormData, nextStep, prevStep }) {
  const [setupTables, setSetupTables] = useState(formData.tables && formData.tables.length > 0);
  const [setupQr, setSetupQr] = useState(!!formData.singleQrLabel);
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
      tables: setupTables ? tables : [],
      singleQrLabel: setupQr ? qrLabel : null,
    });
    nextStep();
  };

  const canContinue = (!setupTables || tables.length > 0) && (!setupQr || qrLabel.trim());

  return (
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg w-full" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      <div className="text-center mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: themeColor }}>
          <QrCode className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Tables & QR Codes</h2>
        <p className="text-xs text-slate-500">Choose what you'd like to set up.</p>
      </div>

      {/* Feature checkboxes */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
          onClick={() => setSetupTables(!setupTables)}>
          <Checkbox checked={setupTables} onChange={(checked) => setSetupTables(checked)} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Set up Tables</p>
            <p className="text-xs text-slate-500">Create physical or virtual tables for your venue</p>
          </div>
          {setupTables && <Table2 className="w-5 h-5 text-slate-400" />}
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
          onClick={() => setSetupQr(!setupQr)}>
          <Checkbox checked={setupQr} onChange={(checked) => setSetupQr(checked)} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Set up QR Code(s)</p>
            <p className="text-xs text-slate-500">Generate scannable QR codes for ordering</p>
          </div>
          {setupQr && <QrCode className="w-5 h-5 text-slate-400" />}
        </div>
      </div>

      {/* Tables setup */}
      {setupTables && (
        <div className="space-y-4 mb-6 pb-6 border-b border-slate-200">
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

          {tables.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{tables.length} table{tables.length > 1 ? 's' : ''} added</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {tables.map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100 group">
                    <span className="text-xs font-medium text-slate-700 truncate">{t.label}</span>
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

      {/* QR Code setup */}
      {setupQr && (
        <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
          <Label className="text-xs font-semibold text-slate-700 mb-2 block">QR Code Label</Label>
          <Input
            value={qrLabel}
            onChange={(e) => setQrLabel(e.target.value)}
            placeholder="e.g. Counter, Takeaway"
            className="h-9 text-sm mb-3"
          />
          <p className="text-xs text-slate-500 mb-3">This label will appear on your generated QR code.</p>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: themeColor }}>
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{qrLabel || 'Counter'}</p>
              <p className="text-xs text-slate-500">1 QR code will be generated</p>
            </div>
          </div>
        </div>
      )}

      {!setupTables && !setupQr && (
        <div className="mb-6 text-center p-4 text-slate-500">
          <p className="text-sm">Check the options above to set up tables and/or QR codes.</p>
        </div>
      )}

      <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
        <Button type="button" onClick={prevStep} variant="outline" className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button
          type="button"
          onClick={() => { updateFormData({ ...formData, tables: [], singleQrLabel: null }); nextStep(); }}
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