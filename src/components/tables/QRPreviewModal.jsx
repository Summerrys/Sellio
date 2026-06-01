import React from 'react';
import { X, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function QRPreviewModal({ table, qrUrl, onClose, onDownload }) {
  if (!table) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${table.name} QR Code</title>
          <style>
            body { margin: 0; padding: 20mm; font-family: Arial, sans-serif; text-align: center; }
            img { width: 80mm; height: 80mm; }
            h2 { font-size: 24pt; margin: 8mm 0; }
            p { font-size: 14pt; color: #64748b; margin: 6mm 0 0; }
          </style>
        </head>
        <body>
          <h2>${table.name}</h2>
          <img src="${qrUrl}" alt="QR Code" />
          <p>Scan to order</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[340px] bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        {/* Title */}
        <h3 className="text-base font-semibold text-slate-900 mb-4">{table.name}</h3>

        {/* QR Image */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR code for ${table.name}`}
              style={{ width: 280, height: 280, borderRadius: 8, display: 'block' }}
            />
          ) : (
            <div style={{ width: 280, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 8 }}>
              <span className="text-slate-300 text-sm">QR not available</span>
            </div>
          )}
        </div>

        {/* Subtitle */}
        <p className="text-xs text-slate-400 mb-5">Scan to order</p>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={onDownload}
            disabled={!qrUrl}
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handlePrint}
            disabled={!qrUrl}
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}