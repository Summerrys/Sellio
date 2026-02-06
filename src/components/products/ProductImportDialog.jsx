import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Download, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const CSV_TEMPLATE_HEADERS = [
  'name', 'sku', 'description', 'category', 'price', 'costPrice', 
  'currentStock', 'lowStockThreshold', 'isActive', 'imageUrl'
];

export default function ProductImportDialog({ open, onOpenChange, tenantId, categories }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('upload'); // upload, preview, importing, complete
  const [csvData, setCsvData] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState(null);

  const downloadTemplate = () => {
    const csv = CSV_TEMPLATE_HEADERS.join(',') + '\n' +
      'Example Product,SKU001,A sample product,Pizza,12.99,8.00,100,10,true,https://example.com/image.jpg\n';
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      data.push(row);
    }
    return data;
  };

  const validateRow = (row, index) => {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!row.name) errors.push('Name is required');
    if (!row.price || isNaN(parseFloat(row.price))) errors.push('Valid price is required');

    // Warnings
    if (!row.imageUrl) warnings.push('No image URL');
    if (row.category && !categories.find(c => c.name.toLowerCase() === row.category.toLowerCase())) {
      warnings.push('Category not found');
    }

    let status = 'valid';
    if (errors.length > 0) status = 'error';
    else if (warnings.length > 0) status = 'warning';

    return { row, index, status, errors, warnings };
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = parseCSV(text);
        setCsvData(parsed);
        
        const validated = parsed.map((row, idx) => validateRow(row, idx));
        setValidationResults(validated);
        setStep('preview');
      } catch (error) {
        toast.error('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const validRows = validationResults.filter(v => v.status !== 'error');
      const imported = [];
      const skipped = [];
      const errors = [];

      for (let i = 0; i < validRows.length; i++) {
        const { row } = validRows[i];
        
        try {
          // Find category ID
          let categoryId = null;
          if (row.category) {
            const cat = categories.find(c => c.name.toLowerCase() === row.category.toLowerCase());
            categoryId = cat?.id;
          }

          await base44.entities.Product.create({
            tenant_id: tenantId,
            name: row.name,
            sku: row.sku || null,
            description: row.description || null,
            category_id: categoryId,
            price: parseFloat(row.price),
            cost_price: row.costPrice ? parseFloat(row.costPrice) : null,
            stock_quantity: row.currentStock ? parseInt(row.currentStock) : 0,
            low_stock_threshold: row.lowStockThreshold ? parseInt(row.lowStockThreshold) : 5,
            is_active: row.isActive !== 'false',
            image_url: row.imageUrl || null,
          });
          
          imported.push(row.name);
        } catch (error) {
          errors.push({ name: row.name, error: error.message });
        }

        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      }

      return { imported, skipped, errors };
    },
    onSuccess: (result) => {
      setImportSummary(result);
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Imported ${result.imported.length} products`);
    },
    onError: () => {
      toast.error('Import failed');
      setStep('preview');
    },
  });

  const handleImport = () => {
    setStep('importing');
    importMutation.mutate();
  };

  const validCount = validationResults.filter(v => v.status === 'valid' || v.status === 'warning').length;
  const errorCount = validationResults.filter(v => v.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Download the CSV template, fill in your product data, then upload it here.
              </AlertDescription>
            </Alert>

            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download CSV Template
            </Button>

            <div className="border-2 border-dashed rounded-lg p-12 text-center hover:bg-slate-50 cursor-pointer transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">Upload CSV File</p>
                <p className="text-sm text-slate-500">Click to browse or drag and drop</p>
              </label>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm">{validCount} Valid</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm">{errorCount} Errors</span>
                </div>
              </div>
              <Button onClick={() => setStep('upload')} variant="outline" size="sm">
                Upload Different File
              </Button>
            </div>

            <div className="flex-1 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-semibold">Status</th>
                    <th className="text-left p-2 font-semibold">Name</th>
                    <th className="text-left p-2 font-semibold">SKU</th>
                    <th className="text-left p-2 font-semibold">Price</th>
                    <th className="text-left p-2 font-semibold">Category</th>
                    <th className="text-left p-2 font-semibold">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {validationResults.map((result, idx) => (
                    <tr
                      key={idx}
                      className={
                        result.status === 'error' ? 'bg-red-50' :
                        result.status === 'warning' ? 'bg-yellow-50' :
                        'bg-green-50'
                      }
                    >
                      <td className="p-2">
                        {result.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                        {result.status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                        {result.status === 'valid' && <CheckCircle className="w-4 h-4 text-green-600" />}
                      </td>
                      <td className="p-2">{result.row.name}</td>
                      <td className="p-2">{result.row.sku}</td>
                      <td className="p-2">${result.row.price}</td>
                      <td className="p-2">{result.row.category}</td>
                      <td className="p-2">
                        {result.errors.length > 0 && (
                          <span className="text-red-600 text-xs">{result.errors.join(', ')}</span>
                        )}
                        {result.warnings.length > 0 && (
                          <span className="text-yellow-600 text-xs">{result.warnings.join(', ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep('upload')} variant="outline">
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={validCount === 0} className="flex-1">
                Import {validCount} Products
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-4 py-8">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
            <p className="text-center font-medium">Importing products...</p>
            <Progress value={importProgress} className="w-full" />
            <p className="text-center text-sm text-slate-500">{importProgress}% complete</p>
          </div>
        )}

        {step === 'complete' && importSummary && (
          <div className="space-y-4 py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
            <h3 className="text-xl font-bold">Import Complete!</h3>
            <div className="space-y-2">
              <p className="text-green-600 font-medium">✓ {importSummary.imported.length} products imported</p>
              {importSummary.errors.length > 0 && (
                <p className="text-red-600">✗ {importSummary.errors.length} failed</p>
              )}
            </div>
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}