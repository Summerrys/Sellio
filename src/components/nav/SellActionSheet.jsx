import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Plus, X } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function SellActionSheet({ open, onClose, onNewProduct }) {
  if (!open) return null;

  const actions = [
    {
      icon: ShoppingBag,
      label: 'New Product',
      description: 'Add a product to your catalog',
      onClick: () => {
        onClose();
        onNewProduct();
      },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white rounded-t-2xl shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <span className="text-base font-semibold text-slate-900">Quick Actions</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-4 py-4 space-y-3 pb-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 active:bg-slate-100 transition-colors text-left"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgb(var(--color-primary))' }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'rgb(var(--color-primary))' }}
                  >
                    {action.label}
                  </p>
                  <p className="text-xs text-slate-500">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}