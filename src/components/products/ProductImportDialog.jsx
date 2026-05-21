import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const toSlug = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const normalizeLegacyVariants = (variants) => {
  if (!variants?.length) return [];
  if (variants[0]?.options) return variants; // already grouped
  return [{
    name: 'Options',
    type: 'other',
    options: variants.map(v => ({ label: v.name || v.label || '', price_modifier: v.price_modifier || 0 })),
  }];
};

const parseVariantsFromSimpleFormat = (str) => {
  if (!str || str.trim() === '') return [];
  try {
    if (str.trim().startsWith('[')) {
      const parsed = JSON.parse(str);
      return normalizeLegacyVariants(parsed);
    }
  } catch (e) {}
  return str.split(' | ').map(group => {
    const colonIndex = group.indexOf(':');
    if (colonIndex === -1) return null;
    const groupName = group.substring(0, colonIndex).trim();
    const optionsStr = group.substring(colonIndex + 1).trim();
    if (!groupName || !optionsStr) return null;
    const options = optionsStr.split('|').map(opt => {
      const trimmed = opt.trim();
      const priceMatch = trimmed.match(/^(.+)\+(\d+\.?\d*)$/);
      if (priceMatch) return { label: priceMatch[1].trim(), price_modifier: parseFloat(priceMatch[2]) };
      return { label: trimmed, price_modifier: 0 };
    }).filter(o => o.label);
    const type =
      /size/i.test(groupName) ? 'size' :
      /colou?r/i.test(groupName) ? 'color' :
      /add.?on|topping|extra/i.test(groupName) ? 'addon' : 'other';
    return { name: groupName, type, options };
  }).filter(Boolean);
};

const parseBool = (val) => {
  if (val == null || val === '') return true;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1';
};

// Header normalisation map: CSV column label → internal key
const HEADER_MAP = {
  'name': 'name',
  'sku': 'sku',
  'description': 'description',
  'category': 'category',
  'price': 'price',
  'cost price': 'cost_price',
  'costprice': 'cost_price',
  'compare at price': 'compare_at_price',
  'compareatprice': 'compare_at_price',
  'stock': 'stock_quantity',
  'stock quantity': 'stock_quantity',
  'currentstock': 'stock_quantity',
  'low stock threshold': 'low_stock_threshold',
  'lowstockthreshold': 'low_stock_threshold',
  'track inventory': 'track_inventory',
  'trackinventory': 'track_inventory',
  'active': 'is_active',
  'isactive': 'is_active',
  'featured': 'is_featured',
  'isfeatured': 'is_featured',
  'tags': 'tags',
  'variants': 'variants',
  'image url': 'image_url',
  'imageurl': 'image_url',
  'additional images': 'additional_images',
  'additionalimages': 'additional_images',
};

const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const keys = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] || h.toLowerCase());

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
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
    keys.forEach((key, idx) => { row[key] = values[idx] ?? ''; });
    return row;
  });
};

export default function ProductImportDialog({ open, onOpenChange, tenantId, categories: initialCategories }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('upload');
  const [validationResults, setValidationResults] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  const validateRow = (row, index) => {
    const errors = [];
    const warnings = [];
    if (!row.name?.trim()) errors.push('Name is required');
    if (!row.price || isNaN(parseFloat(row.price))) errors.push('Valid price is required');
    if (!row.image_url) warnings.push('No image URL');
    return { row, index, status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid', errors, warnings };
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseCSV(event.target.result);
        setValidationResults(parsed.map((row, idx) => validateRow(row, idx)));
        setStep('preview');
      } catch {
        toast.error('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStep('importing');
    setImporting(true);
    const supabase = await getSupabase();
    const validRows = validationResults.filter(v => v.status !== 'error');
    const imported = [];
    const skipped = [];

    // Build a live category name→id map (includes existing ones)
    const categoryCache = {};
    (initialCategories || []).forEach(c => { categoryCache[c.name.toLowerCase()] = c.id; });

    for (let i = 0; i < validRows.length; i++) {
      const { row } = validRows[i];
      try {
        // ── Resolve category ──────────────────────────────────────────────────
        let categoryId = null;
        const catName = row.category?.trim();
        if (catName) {
          const key = catName.toLowerCase();
          if (categoryCache[key]) {
            categoryId = categoryCache[key];
          } else {
            // Create new category
            const { data: newCat } = await supabase
              .from('categories')
              .insert({ tenant_id: tenantId, name: catName, slug: toSlug(catName), is_active: true })
              .select('id')
              .single();
            if (newCat?.id) {
              categoryCache[key] = newCat.id;
              categoryId = newCat.id;
            }
          }
        }

        // ── Tags ──────────────────────────────────────────────────────────────
        let tags = null;
        if (row.tags?.trim()) {
          tags = row.tags.split(',').map(t => t.trim()).filter(Boolean);
        }

        // ── Stock fields ──────────────────────────────────────────────────────
        const stockQty = row.stock_quantity !== '' ? parseInt(row.stock_quantity) || 0 : 0;
        const lowStockThreshold = row.low_stock_threshold !== '' ? parseInt(row.low_stock_threshold) || 5 : 5;

        // ── Insert product ────────────────────────────────────────────────────
        const payload = {
          tenant_id: tenantId,
          name: row.name.trim(),
          description: row.description?.trim() || null,
          category_id: categoryId,
          price: parseFloat(row.price),
          cost_price: row.cost_price?.trim() ? parseFloat(row.cost_price) : null,
          compare_at_price: row.compare_at_price?.trim() ? parseFloat(row.compare_at_price) : null,
          stock_quantity: stockQty,
          low_stock_threshold: lowStockThreshold,
          is_active: parseBool(row.is_active),
          is_featured: parseBool(row.is_featured ?? 'false'),
          tags,
          variants: parseVariantsFromSimpleFormat(row.variants || ''),
          image_url: row.image_url?.trim() || null,
          images: row.additional_images
            ? row.additional_images.split(';').filter(img => img?.trim())
            : [],
        };
        // Only include sku if provided — let trigger auto-generate if blank
        if (row.sku?.trim()) payload.sku = row.sku.trim();

        const { data: inserted, error: prodError } = await supabase
          .from('products')
          .insert(payload)
          .select('id, stock_quantity, low_stock_threshold')
          .single();
        if (prodError) throw new Error(prodError.message);

        // ── Create inventory_items record ─────────────────────────────────────
        await supabase.from('inventory_items').insert({
          tenant_id: tenantId,
          product_id: inserted.id,
          current_stock: inserted.stock_quantity || 0,
          low_stock_threshold: inserted.low_stock_threshold || 5,
          unit: 'pcs',
        });

        imported.push(row.name);
      } catch (err) {
        skipped.push({ name: row.name, error: err.message });
      }

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setImportSummary({ imported, skipped });
    setStep('complete');
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
    toast.success(`${imported.length} products imported`);
  };

  const reset = () => {
    setStep('upload');
    setValidationResults([]);
    setImportProgress(0);
    setImportSummary(null);
  };

  const validCount = validationResults.filter(v => v.status !== 'error').length;
  const errorCount = validationResults.filter(v => v.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Download the CSV template from the toolbar (↓ Download button), fill in your product data, then upload it here.
                Required columns: <strong>Name</strong>, <strong>Price</strong>.
              </AlertDescription>
            </Alert>
            <div className="border-2 border-dashed rounded-lg p-12 text-center hover:bg-slate-50 cursor-pointer transition-colors">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
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
                  <span className="text-sm">{validCount} will import</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm">{errorCount} will be skipped</span>
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
                    <tr key={idx} className={result.status === 'error' ? 'bg-red-50' : result.status === 'warning' ? 'bg-yellow-50' : 'bg-green-50'}>
                      <td className="p-2">
                        {result.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                        {result.status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                        {result.status === 'valid' && <CheckCircle className="w-4 h-4 text-green-600" />}
                      </td>
                      <td className="p-2">{result.row.name}</td>
                      <td className="p-2 text-slate-400 text-xs">{result.row.sku || '(auto)'}</td>
                      <td className="p-2">{result.row.price}</td>
                      <td className="p-2">{result.row.category}</td>
                      <td className="p-2">
                        {result.errors.length > 0 && <span className="text-red-600 text-xs">{result.errors.join(', ')}</span>}
                        {result.warnings.length > 0 && <span className="text-yellow-600 text-xs">{result.warnings.join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep('upload')} variant="outline">Cancel</Button>
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
              <p className="text-green-600 font-medium">✓ {importSummary.imported.length} products imported successfully</p>
              {importSummary.skipped.length > 0 && (
                <p className="text-amber-600">⚠ {importSummary.skipped.length} skipped due to errors</p>
              )}
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }} className="mt-4">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}