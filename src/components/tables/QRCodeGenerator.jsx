import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function QRCodeGenerator({ open, onOpenChange, table, tenant }) {
  const queryClient = useQueryClient();
  const canvasRef = useRef(null);
  const [qrUrl, setQrUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateQR = async () => {
    if (!table || !tenant || !canvasRef.current) return;
    
    setIsGenerating(true);
    try {
      const tableUrl = `https://${tenant.slug}.apptelier.sg/order?table=${table.id}`;
      
      await QRCode.toCanvas(canvasRef.current, tableUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      const dataUrl = canvasRef.current.toDataURL('image/png');
      setQrUrl(dataUrl);

      if (!table.qr_code_url) {
        await base44.entities.TableEntity.update(table.id, {
          qr_code_url: dataUrl,
        });
        queryClient.invalidateQueries({ queryKey: ['tables', tenant.id] });
      }
    } catch (error) {
      console.error('QR generation error:', error);
      toast.error('Failed to generate QR code');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (open && table && tenant) {
      // Small delay to ensure canvas is ready
      const timer = setTimeout(() => {
        if (canvasRef.current) {
          generateQR();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, table?.id, tenant?.slug]);

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!table || !tenant) return;
      
      setIsGenerating(true);
      try {
        const tableUrl = `https://${tenant.slug}.apptelier.sg/order?table=${table.id}`;
        
        await QRCode.toCanvas(canvasRef.current, tableUrl, {
          width: 400,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });

        const dataUrl = canvasRef.current.toDataURL('image/png');
        setQrUrl(dataUrl);

        await base44.entities.TableEntity.update(table.id, {
          qr_code_url: dataUrl,
        });
        queryClient.invalidateQueries({ queryKey: ['tables', tenant.id] });
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: () => {
      toast.success('QR code regenerated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to regenerate QR code');
    },
  });

  const downloadPNG = () => {
    if (!qrUrl) return;
    const link = document.createElement('a');
    link.download = `table-${table.name}-qr.png`;
    link.href = qrUrl;
    link.click();
    toast.success('QR code downloaded');
  };

  const downloadPDF = () => {
    if (!canvasRef.current || !table || !tenant) return;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a6', // 105 x 148 mm (tent card size)
    });

    // Add business name
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text(tenant.name, 52.5, 20, { align: 'center' });

    // Add table number
    pdf.setFontSize(24);
    pdf.text(`Table ${table.name}`, 52.5, 35, { align: 'center' });

    // Add QR code image
    const qrImage = canvasRef.current.toDataURL('image/png');
    pdf.addImage(qrImage, 'PNG', 22.5, 45, 60, 60);

    // Add instruction text
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'normal');
    pdf.text('Scan to Order', 52.5, 115, { align: 'center' });

    // Add footer
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text('Powered by Apptelier', 52.5, 140, { align: 'center' });

    pdf.save(`table-${table.name}-qr.pdf`);
    toast.success('PDF downloaded');
  };

  const printQR = () => {
    if (!canvasRef.current || !table || !tenant) return;

    const printWindow = window.open('', '_blank');
    const qrImage = canvasRef.current.toDataURL('image/png');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Table ${table.name} QR Code</title>
          <style>
            body {
              margin: 0;
              padding: 20mm;
              font-family: Arial, sans-serif;
              text-align: center;
            }
            .card {
              width: 105mm;
              height: 148mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              border: 1px solid #ccc;
              padding: 10mm;
            }
            h1 { font-size: 24pt; margin: 10mm 0; }
            h2 { font-size: 32pt; margin: 10mm 0; }
            img { width: 60mm; height: 60mm; }
            p { font-size: 18pt; margin: 10mm 0; }
            .footer { font-size: 10pt; color: #999; margin-top: 15mm; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${tenant.name}</h1>
            <h2>Table ${table.name}</h2>
            <img src="${qrImage}" alt="QR Code" />
            <p>Scan to Order</p>
            <div class="footer">Powered by Apptelier</div>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (!table || !tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code - Table {table.name}</DialogTitle>
        </DialogHeader>

        <div className="py-6 space-y-4">
          {/* QR Code Display */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6 flex items-center justify-center">
            {isGenerating ? (
              <div className="w-[400px] h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : (
              <canvas ref={canvasRef} className="max-w-full h-auto" />
            )}
          </div>

          {/* Info */}
          <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
            <p className="text-slate-700">
              <strong>Table:</strong> {table.name} ({table.zone})
            </p>
            <p className="text-slate-700">
              <strong>URL:</strong> {tenant.slug}.apptelier.sg/order?table={table.id}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={downloadPNG}
              disabled={isGenerating || !qrUrl}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              PNG
            </Button>
            <Button
              variant="outline"
              onClick={downloadPDF}
              disabled={isGenerating || !qrUrl}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              PDF (A6)
            </Button>
            <Button
              variant="outline"
              onClick={printQR}
              disabled={isGenerating || !qrUrl}
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() => regenerateMutation.mutate()}
              disabled={isGenerating || regenerateMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}