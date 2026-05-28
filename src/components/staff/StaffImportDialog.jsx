import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  }).filter(r => r.email || r.name);
}

export default function StaffImportDialog({ open, onOpenChange, onImport }) {
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirm = async () => {
    setImporting(true);
    try {
      await onImport(rows);
      toast.success(`${rows.length} staff imported successfully`);
      setRows([]);
      onOpenChange(false);
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setRows([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Staff from CSV</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <p className="text-sm text-slate-500 text-center">
              Upload a CSV with columns: <strong>name, email, role, status</strong>
            </p>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Choose CSV file
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{rows.length} row(s) ready to import:</p>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {['name', 'email', 'role', 'status'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{row.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.email || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{row.role || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{row.status || 'active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {rows.length > 0 && (
            <Button onClick={handleConfirm} disabled={importing}
              style={{ background: 'var(--color-primary-gradient)' }} className="text-white">
              {importing ? 'Importing...' : `Import ${rows.length} staff`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}