import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { reportFileName } from '@/lib/reportData';
import { buildReportWorkbook } from '@/lib/reportWorkbook';
import { XLSX_MIME } from '@/lib/xlsxWriter';
import { deliverFile } from '@/lib/deliverFile';

// Excel (.xlsx) and PDF exports of the report on screen. getReport() builds the
// report (lib/reportData.js) from the data already loaded for the selected
// period, so the files show the same numbers as the screen.
export default function ExportButton({ getReport, disabled = false, accent, logoUrl }) {
  const [busy, setBusy] = useState(null);

  const finish = async (blob, filename, label) => {
    const result = await deliverFile(blob, filename);
    if (result === 'downloaded') toast.success(`${label} downloaded`, { description: filename });
    if (result === 'needs-tap') {
      // Making the file took long enough that the phone wants a fresh tap to share it.
      toast.success(`${label} is ready`, {
        description: filename,
        duration: 15000,
        action: { label: 'Save / share', onClick: () => { deliverFile(blob, filename, { retry: true }); } },
      });
    }
  };

  const run = async (kind) => {
    if (busy || disabled) return;
    setBusy(kind);
    const label = kind === 'pdf' ? 'PDF report' : 'Excel report';
    const loadingId = kind === 'pdf' ? toast.loading('Preparing the PDF report…') : null;
    try {
      const report = getReport();
      let blob;
      if (kind === 'xlsx') {
        const bytes = await buildReportWorkbook(report);
        blob = new Blob([bytes], { type: XLSX_MIME });
      } else {
        const { buildReportPdf } = await import('@/lib/reportPdf');
        blob = await buildReportPdf(report, { accent, logoUrl });
      }
      if (loadingId) toast.dismiss(loadingId);
      await finish(blob, reportFileName(report, kind), label);
    } catch (e) {
      console.error('Report export failed:', e);
      if (loadingId) toast.dismiss(loadingId);
      toast.error(`Couldn't create the ${label}. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled || !!busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run('xlsx')} className="gap-2" data-testid="export-xlsx">
          <FileSpreadsheet className="w-4 h-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('pdf')} className="gap-2" data-testid="export-pdf">
          <FileText className="w-4 h-4" />
          PDF report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
