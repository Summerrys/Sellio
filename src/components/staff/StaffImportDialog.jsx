import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  }).filter(r => r.email || r.name);
}

function validateRows(rows, roles) {
  return rows.map((row) => {
    const hasEmail = !!row.email?.trim();
    // Role matching: case-insensitive against roles list, fallback to 'staff'
    let matchedRole = 'staff';
    if (row.role?.trim() && roles?.length) {
      const found = roles.find(r => r.name.toLowerCase() === row.role.trim().toLowerCase());
      if (found) matchedRole = found.name;
    } else if (row.role?.trim()) {
      matchedRole = row.role.trim();
    }
    // Status normalization
    const validStatuses = ['active', 'invited', 'suspended'];
    const status = validStatuses.includes(row.status?.toLowerCase()) ? row.status.toLowerCase() : 'active';

    return {
      row: { ...row, role: matchedRole, status },
      hasEmail,
      isValid: hasEmail,
    };
  });
}

export default function StaffImportDialog({ open, onOpenChange, onImport, roles = [] }) {
  const [step, setStep] = useState('upload');
  const [results, setResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length === 0) { toast.error('No valid rows found in CSV'); return; }
        setResults(validateRows(parsed, roles));
        setStep('preview');
      } catch {
        toast.error('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e) => { processFile(e.target.files?.[0]); e.target.value = ''; };
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files?.[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleConfirm = async () => {
    setImporting(true);
    try {
      const validRows = results.filter(r => r.isValid).map(r => r.row);
      await onImport(validRows);
      toast.success(`${validRows.length} staff imported successfully`);
      handleClose();
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => { setStep('upload'); setResults([]); onOpenChange(false); };

  const validCount = results.filter(r => r.isValid).length;
  const errorCount = results.filter(r => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Staff from CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Download the CSV template from the toolbar (↓ Download button), fill in your staff data, then upload it here.
                Required columns: <strong>Email</strong>.
              </AlertDescription>
            </Alert>
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-lg font-medium mb-2 text-slate-700">Upload CSV File</p>
              <p className="text-sm text-slate-500">Click to browse or drag and drop</p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-slate-700">{validCount} staff member{validCount !== 1 ? 's' : ''} ready to import</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">{errorCount} missing email</span>
                  </div>
                )}
              </div>
              <Button onClick={() => setStep('upload')} variant="outline" size="sm">
                Upload Different File
              </Button>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Email</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Role</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((result, idx) => (
                    <tr key={idx} className={result.isValid ? '' : 'bg-red-50'}>
                      <td className="px-3 py-2 text-slate-700">{result.row.name || '—'}</td>
                      <td className={`px-3 py-2 font-medium ${result.isValid ? 'text-slate-700' : 'text-red-600'}`}>
                        {result.row.email || <span className="italic text-red-500">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{result.row.role}</td>
                      <td className="px-3 py-2 text-slate-500">{result.row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleClose} variant="outline">Cancel</Button>
              <Button
                onClick={handleConfirm}
                disabled={validCount === 0 || importing || errorCount > 0}
                className="flex-1 text-white"
                style={{ background: 'var(--color-primary-gradient)' }}
              >
                {importing ? 'Importing...' : `Import ${validCount} Staff`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}