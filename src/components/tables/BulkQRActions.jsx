import React, { useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkQRActions({ tables, tenant }) {
  const [isProcessing, setIsProcessing] = useState(false);

  const generateAllQRs = async () => {
    const qrPromises = tables.map(async (table) => {
      const tableUrl = `https://${tenant.slug}.apptelier.sg/order?table=${table.id}`;
      const dataUrl = await QRCode.toDataURL(tableUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      return { table, dataUrl };
    });

    return Promise.all(qrPromises);
  };

  const downloadAllPDF = async () => {
    if (tables.length === 0) return;

    setIsProcessing(true);
    try {
      const qrData = await generateAllQRs();
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const cardsPerPage = 4;
      const cardWidth = 90;
      const cardHeight = 130;
      const marginX = 10;
      const marginY = 10;
      const gapX = 10;
      const gapY = 8;

      qrData.forEach((item, index) => {
        const { table, dataUrl } = item;

        // Add new page if needed
        if (index > 0 && index % cardsPerPage === 0) {
          pdf.addPage();
        }

        // Calculate position (2x2 grid)
        const col = index % 2;
        const row = Math.floor((index % cardsPerPage) / 2);
        const x = marginX + col * (cardWidth + gapX);
        const y = marginY + row * (cardHeight + gapY);

        // Draw card border
        pdf.setDrawColor(200);
        pdf.rect(x, y, cardWidth, cardHeight);

        // Business name
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.text(tenant.name, x + cardWidth / 2, y + 15, { align: 'center' });

        // Table number
        pdf.setFontSize(18);
        pdf.text(`Table ${table.name}`, x + cardWidth / 2, y + 28, { align: 'center' });

        // QR code
        pdf.addImage(dataUrl, 'PNG', x + 15, y + 35, 60, 60);

        // Instruction text
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.text('Scan to Order', x + cardWidth / 2, y + 105, { align: 'center' });

        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(150);
        pdf.text('Powered by Apptelier', x + cardWidth / 2, y + 120, { align: 'center' });
        pdf.setTextColor(0);
      });

      pdf.save(`all-tables-qr-codes.pdf`);
      toast.success(`Generated ${tables.length} QR codes`);
    } catch (error) {
      console.error('Bulk PDF error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const printAllQRs = async () => {
    if (tables.length === 0) return;

    setIsProcessing(true);
    try {
      const qrData = await generateAllQRs();
      
      const printWindow = window.open('', '_blank');
      
      let htmlContent = `
        <html>
          <head>
            <title>All Table QR Codes</title>
            <style>
              body {
                margin: 0;
                padding: 10mm;
                font-family: Arial, sans-serif;
              }
              .grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8mm;
              }
              .card {
                width: 90mm;
                height: 130mm;
                border: 1px solid #ccc;
                padding: 8mm;
                text-align: center;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
              }
              h1 { font-size: 14pt; margin: 5mm 0; }
              h2 { font-size: 20pt; margin: 5mm 0; }
              img { width: 60mm; height: 60mm; margin: 5mm 0; }
              p { font-size: 12pt; margin: 5mm 0; }
              .footer { font-size: 8pt; color: #999; margin-top: 8mm; }
              @media print {
                .card { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="grid">
      `;

      qrData.forEach(({ table, dataUrl }) => {
        htmlContent += `
          <div class="card">
            <h1>${tenant.name}</h1>
            <h2>Table ${table.name}</h2>
            <img src="${dataUrl}" alt="QR Code" />
            <p>Scan to Order</p>
            <div class="footer">Powered by Apptelier</div>
          </div>
        `;
      });

      htmlContent += `
            </div>
          </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch (error) {
      console.error('Bulk print error:', error);
      toast.error('Failed to print QR codes');
    } finally {
      setIsProcessing(false);
    }
  };

  if (tables.length === 0) return null;

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={downloadAllPDF}
        disabled={isProcessing}
        className="gap-2"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download All (PDF)
          </>
        )}
      </Button>
      <Button
        variant="outline"
        onClick={printAllQRs}
        disabled={isProcessing}
        className="gap-2"
      >
        <Printer className="w-4 h-4" />
        Print All
      </Button>
    </div>
  );
}