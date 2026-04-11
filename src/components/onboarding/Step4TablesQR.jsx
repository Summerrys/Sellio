import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, ArrowLeft, QrCode, Table2, Plus, Trash2, Download, Edit2, Printer } from 'lucide-react';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS, getThemeCSSColors } from '@/lib/themeConstants';
import QR from 'qrcode';
import QRCodeModal from './QRCodeModal';

function generateDefaultTables(count, prefix, pax = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: Date.now() + i,
    label: `${prefix} ${i + 1}`,
    pax: parseInt(pax) || 2,
  }));
}

export default function Step4TablesQR({ formData, updateFormData, nextStep, prevStep }) {
  const [setupTables, setSetupTables] = useState(formData.tables && formData.tables.length > 0);
  const [setupQr, setSetupQr] = useState(!!formData.singleQrLabel || false);
  const [tables, setTables] = useState(formData.tables || []);
  const [tableCount, setTableCount] = useState('');
  const [tablePrefix, setTablePrefix] = useState('Table');
  const [tablePax, setTablePax] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newPax, setNewPax] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPax, setEditPax] = useState('2');
  const [qrCodes, setQrCodes] = useState({});
  const [selectedQR, setSelectedQR] = useState(null);
  const [qrModalOpen, setQRModalOpen] = useState(false);
  const [singleQrLabel, setSingleQrLabel] = useState(formData.singleQrLabel || 'Online Menu');
  const [singleQrGenerated, setSingleQrGenerated] = useState(!!formData.singleQrCode);

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

  useEffect(() => {
    const generateQRCodes = async () => {
      const newQRCodes = {};
      for (const table of tables) {
        if (!qrCodes[table.id] && setupQr) {
          try {
            const qrData = await QR.toDataURL(`${window.location.origin}/CustomerMenu?table=${encodeURIComponent(table.label)}`, {
              width: 300,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            });
            newQRCodes[table.id] = qrData;
          } catch (err) {
            console.error('QR generation failed:', err);
          }
        }
      }
      if (Object.keys(newQRCodes).length > 0) {
        setQrCodes(prev => ({ ...prev, ...newQRCodes }));
      }
    };

    if (setupQr && tables.length > 0) {
      generateQRCodes();
    }
  }, [tables, setupQr, qrCodes]);

  // Generate single online menu QR
  useEffect(() => {
    const generateSingleQR = async () => {
      if (setupQr && !setupTables && singleQrLabel) {
        try {
          const qrData = await QR.toDataURL(`${window.location.origin}/CustomerMenu`, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setQrCodes(prev => ({ ...prev, 'single': qrData }));
          setSingleQrGenerated(true);
        } catch (err) {
          console.error('Single QR generation failed:', err);
        }
      }
    };

    generateSingleQR();
  }, [setupQr, setupTables, singleQrLabel]);

  const chosenColor = formData?.theme ? (formData?.themeColors?.dark || formData?.customPrimary) : null;
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';
  const { primary: primaryColor } = getThemeCSSColors(formData);

  const bulkAdd = () => {
    const n = parseInt(tableCount);
    if (!n || n < 1) return;
    const generated = generateDefaultTables(n, tablePrefix.trim() || 'Table', tablePax);
    setTables(prev => [...prev, ...generated]);
    setTableCount('');
    setTablePax('');
  };

  const addSingle = () => {
    if (!newLabel.trim()) return;
    setTables(prev => [...prev, { id: Date.now(), label: newLabel.trim(), pax: parseInt(newPax) || 2 }]);
    setNewLabel('');
    setNewPax('');
  };

  const startEdit = (table) => {
    setEditingId(table.id);
    setEditLabel(table.label);
    setEditPax(String(table.pax));
  };

  const saveEdit = () => {
    if (!editLabel.trim()) return;
    setTables(prev => prev.map(t => t.id === editingId ? { ...t, label: editLabel.trim(), pax: parseInt(editPax) || 2 } : t));
    setQrCodes(prev => {
      const newCodes = { ...prev };
      delete newCodes[editingId];
      return newCodes;
    });
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const removeTable = (id) => {
    setTables(prev => prev.filter(t => t.id !== id));
    setQrCodes(prev => {
      const newCodes = { ...prev };
      delete newCodes[id];
      return newCodes;
    });
  };

  const handleBulkDownload = async () => {
    if (typeof window !== 'undefined' && 'JSZip' in window === false) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => performBulkDownload();
      document.head.appendChild(script);
    } else {
      performBulkDownload();
    }
  };

  const performBulkDownload = () => {
    tables.forEach((table, idx) => {
      if (qrCodes[table.id]) {
        const link = document.createElement('a');
        link.href = qrCodes[table.id];
        link.download = `${idx + 1}_${table.label.replace(/\s+/g, '_')}_QR.png`;
        link.click();
      }
    });
  };

  const handleDownloadSingleQR = () => {
    const qrCode = qrCodes['single'];
    if (qrCode) {
      const link = document.createElement('a');
      link.href = qrCode;
      link.download = `${singleQrLabel.replace(/\s+/g, '_')}_QR.png`;
      link.click();
    }
  };

  const handlePrintSingleQR = () => {
    const qrCode = qrCodes['single'];
    if (qrCode) {
      const printWindow = window.open();
      printWindow.document.write(`
        <html>
          <head><title>${singleQrLabel}</title></head>
          <body style="text-align:center;font-family:Arial">
            <h2>${singleQrLabel}</h2>
            <img src="${qrCode}" style="max-width:400px;margin:20px auto;" />
            <p>Scan to access menu</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleSubmit = () => {
    const formUpdate = {
      ...formData,
      tables: setupTables ? tables : [],
    };
    if (setupQr && !setupTables) {
      formUpdate.singleQrLabel = singleQrLabel;
      formUpdate.singleQrCode = qrCodes['single'];
    }
    updateFormData(formUpdate);
    nextStep();
  };

  const canContinue = (setupTables && tables.length > 0) || (setupQr && !setupTables) || (!setupTables && !setupQr);

  return (
    <Card className="p-3 sm:p-5 bg-white border-0 shadow-lg w-full" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      <div className="text-center mb-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeColor }}>
          <QrCode className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-0.5">Tables & QR Codes</h2>
        <p className="text-xs text-slate-500">Choose what you'd like to set up.</p>
      </div>

      {/* Feature checkboxes */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
          onClick={() => setSetupTables(!setupTables)}>
          <Checkbox checked={setupTables} onChange={(checked) => setSetupTables(checked)} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Set up Tables</p>
            <p className="text-xs text-slate-500">Create physical or virtual tables for your venue</p>
          </div>
          {setupTables && <Table2 className="w-5 h-5 text-green-500" />}
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
          onClick={() => setSetupQr(!setupQr)}>
          <Checkbox checked={setupQr} onChange={(checked) => setSetupQr(checked)} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Set up QR Code(s)</p>
            <p className="text-xs text-slate-500">Generate scannable QR codes for ordering</p>
          </div>
          {setupQr && <QrCode className="w-5 h-5 text-orange-500" />}
        </div>
      </div>

      {/* Tables setup */}
      {setupTables && (
        <div className="space-y-3 mb-4 pb-4 border-b border-slate-200">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <Label className="text-xs font-semibold text-slate-700 mb-2 block">Quick Generate Tables</Label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={tablePrefix}
                  onChange={(e) => setTablePrefix(e.target.value)}
                  placeholder="Prefix"
                  className="h-9 text-sm flex-1"
                />
                <Input
                  type="number"
                  value={tableCount}
                  onChange={(e) => setTableCount(e.target.value)}
                  placeholder="Qty"
                  className="h-9 text-sm w-16"
                  min="1"
                  max="100"
                />
                <Input
                  type="number"
                  value={tablePax}
                  onChange={(e) => setTablePax(e.target.value)}
                  placeholder="Pax"
                  className="h-9 text-sm w-16"
                  min="1"
                  max="20"
                />
              </div>
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

          <div className="bg-white rounded-lg p-2.5 border border-slate-200">
            <Label className="text-xs font-semibold text-slate-700 mb-2 block">Add Individual Table / Zone</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSingle()}
                placeholder="e.g. VIP Room, Bar Seat 1"
                className="h-9 text-sm flex-1 min-w-[150px]"
              />
              <Input
                type="number"
                value={newPax}
                onChange={(e) => setNewPax(e.target.value)}
                placeholder="e.g. 4"
                className="h-9 text-sm w-20"
                min="1"
                max="20"
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
           <div className="bg-white rounded-lg border border-slate-200 p-2.5">
             <p className="text-xs font-semibold text-slate-700 mb-2">{tables.length} table{tables.length > 1 ? 's' : ''} added</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {tables.map((t) => (
                  <div key={t.id}>
                    {editingId === t.id ? (
                      <div className="flex flex-col gap-1 bg-white rounded-lg px-2.5 py-1.5 border-2 border-slate-400 shadow-md">
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="text-xs px-1.5 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
                          autoFocus
                        />
                        <input
                          type="number"
                          value={editPax}
                          onChange={(e) => setEditPax(e.target.value)}
                          min="1"
                          max="20"
                          className="text-xs px-1.5 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={saveEdit}
                            className="flex-1 text-xs px-2 py-0.5 rounded text-white hover:opacity-90"
                            style={{ background: themeColor }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 text-xs px-2 py-0.5 rounded bg-slate-300 text-slate-700 hover:bg-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="flex flex-col gap-2 bg-white rounded-lg p-2.5 border-2 border-slate-200 shadow-sm group transition-all cursor-pointer" 
                        onClick={() => startEdit(t)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow = `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 0 0 3px ${primaryColor}20`;
                        }} 
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 truncate">{t.label}</p>
                            <p className="text-xs text-slate-500">{t.pax || 2} pax</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                                onClick={() => startEdit(t)}
                                className="transition-all p-1 hover:opacity-80 hover:scale-125"
                                style={{ color: primaryColor }}
                                title="Edit table"
                             >
                                <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => removeTable(t.id)}
                                className="transition-all p-1 hover:opacity-80 hover:scale-125"
                                style={{ color: '#ef4444' }}
                             >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {setupQr && qrCodes[t.id] && (
                          <div className="flex justify-center">
                            <button
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedQR(t);
                               setQRModalOpen(true);
                             }}
                             className="transition-all p-1 hover:opacity-80 hover:scale-125"
                             style={{ color: '#f97316' }}
                             title="View QR code"
                            >
                             <QrCode className="w-5 h-5" />
                            </button>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                ))}
              </div>
              {tables.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {setupQr && Object.keys(qrCodes).length > 0 && (
                    <button
                      onClick={handleBulkDownload}
                      className="text-xs px-3 py-1 rounded text-white hover:opacity-90 transition-colors flex items-center gap-1"
                      style={{ background: themeColor }}
                    >
                      <Download className="w-3 h-3" /> Download All
                    </button>
                  )}
                  <button
                    onClick={() => setTables([])}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors flex-1 text-right"
                  >
                    Clear all
                  </button>
                </div>
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





      {/* Single QR Code setup */}
      {setupQr && !setupTables && (
       <div className="space-y-3 mb-4 pb-4 border-b border-slate-200">
         <div className="bg-white rounded-lg p-3 border border-slate-200">
           <Label className="text-xs font-semibold text-slate-700 mb-2 block">Online Menu QR Code</Label>
            <p className="text-xs text-slate-500 mb-3">Generate a single QR code for your online ordering menu</p>
            
            <div className="flex gap-2 mb-4">
              <Input
                value={singleQrLabel}
                onChange={(e) => setSingleQrLabel(e.target.value)}
                placeholder="e.g. Online Menu"
                className="h-9 text-sm flex-1"
              />
            </div>

            {singleQrGenerated && qrCodes['single'] && (
              <div className="flex flex-col items-center gap-3 bg-slate-50 rounded-lg p-4">
                <img src={qrCodes['single']} alt="QR Code" className="w-32 h-32" />
                <p className="text-xs text-slate-500">{singleQrLabel}</p>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleDownloadSingleQR}
                    className="flex-1 px-3 h-8 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-1 justify-center"
                    style={{ background: themeColor }}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={handlePrintSingleQR}
                    className="flex-1 px-3 h-8 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-1 justify-center"
                    style={{ background: themeColor }}
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {selectedQR && (
        <QRCodeModal
          isOpen={qrModalOpen}
          onClose={() => setQRModalOpen(false)}
          table={selectedQR}
          qrDataUrl={qrCodes[selectedQR.id]}
          themeColor={themeColor}
        />
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