import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, X } from 'lucide-react';
import { useRef } from 'react';

export default function QRCodeModal({ isOpen, onClose, table, qrDataUrl, themeColor }) {
  const qrRef = useRef(null);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${table.name} QR Code</title>
...
          <p>${table.name}</p>
          <p>${table.capacity} pax</p>
          <img src="${qrDataUrl}" alt="QR Code" />
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${table.name.replace(/\s+/g, '_')}_QR.png`;
    link.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{table.name} - QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />}
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-600">{table.capacity} pax</p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              onClick={handleDownload}
              className="flex-1 px-3 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 justify-center"
              style={{ background: themeColor }}
            >
              <Download className="w-4 h-4" /> Download
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 px-3 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2 justify-center"
              style={{ background: themeColor }}
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}