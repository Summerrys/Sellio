import React from 'react';
import { X, MessageCircle } from 'lucide-react';

export default function SupplierPickerModal({ open, onClose, suppliers, onSelect }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Select Supplier</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {suppliers.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  {s.phone && <p className="text-xs text-slate-500">{s.phone}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}