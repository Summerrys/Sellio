import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, QrCode, Edit, Trash2, MoreVertical, Download } from 'lucide-react';

const STATUS_CONFIG = {
  available: { label: 'Available', color: 'bg-green-100 text-green-700 border-green-300' },
  occupied: { label: 'Occupied', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  reserved: { label: 'Reserved', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  maintenance: { label: 'Maintenance', color: 'bg-red-100 text-red-700 border-red-300' },
};

export default function TableCard({ table, qrDataUrl, onEdit, onQR, onDelete }) {
  const status = STATUS_CONFIG[table.status] || STATUS_CONFIG.available;

  return (
    <Card className="p-5 hover:shadow-md transition-all border-0 shadow-sm relative">
      {/* Status Badge - Top Right */}
      <div className="absolute top-4 right-4">
        <Badge className={status.color}>{status.label}</Badge>
      </div>

      {/* Table Info */}
      <div className="mb-4">
        <h3 className="text-2xl font-bold text-slate-900 mb-1">
          {table.name}
        </h3>
        <p className="text-sm text-slate-500">{table.zone}</p>
      </div>

      {/* Capacity */}
      <div className="flex items-center gap-2 text-slate-600 mb-4">
        <Users className="w-4 h-4" />
        <span className="text-sm">{table.capacity} seats</span>
      </div>

      {/* QR Code Preview */}
      <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-center min-h-[88px]">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for ${table.name}`}
            className="w-20 h-20"
          />
        ) : (
          <QrCode className="w-10 h-10 text-slate-200" />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onQR}
          className="flex-1 gap-2"
        >
          <QrCode className="w-4 h-4" />
          QR Code
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onQR}>
              <Download className="w-4 h-4 mr-2" />
              Download QR
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}