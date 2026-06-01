import React from 'react';
import { X, Download, Printer } from 'lucide-react';

/**
 * Shared QR preview modal used in onboarding (Step4TablesQR) and Tables page.
 *
 * Props:
 *   table       – { name, capacity, ... }
 *   qrUrl       – data URL or remote URL of the QR image
 *   onClose     – () => void
 *   onDownload  – () => void  (caller provides the download logic)
 *   subtitle    – optional string shown below QR (defaults to "Scan to order")
 *   themeColor  – optional CSS color/gradient string for buttons
 */
export default function QRPreviewModal({
  table,
  qrUrl,
  onClose,
  onDownload,
  subtitle,
  themeColor,
}) {
  if (!table) return null;

  const buttonStyle = themeColor
    ? { background: themeColor, color: '#fff', border: 'none' }
    : undefined;

  const buttonClass = themeColor
    ? 'flex-1 px-3 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 flex items-center gap-2 justify-center transition-opacity'
    : 'flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-2 justify-center transition-colors';

  const handlePrint = () => {
    if (!qrUrl) return;
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
          <p>${subtitle || 'Scan to order'}</p>
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
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        {/* Title */}
        <h3 className="text-base font-semibold text-slate-900 mb-4">{table.name} — QR Code</h3>

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
        <p className="text-sm text-slate-400 mb-5">{subtitle ?? 'Scan to order'}</p>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full">
          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={onDownload}
            disabled={!qrUrl}
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={handlePrint}
            disabled={!qrUrl}
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}