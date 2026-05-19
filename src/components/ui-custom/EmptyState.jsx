import React from 'react';
import { Button } from '@/components/ui/button';
import RequirePermission from '../components/auth/RequirePermission';

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      )}
      {actionLabel && onAction && (
        <RequirePermission permission="products.create" silent>
                <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm">
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button
                  onClick={handleAdd}
                  size="sm"
                  className="text-white gap-1.5"
                  style={{ background: 'var(--color-primary-gradient)' }}
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Product</span>
                  <span className="sm:hidden">Add</span>
                </Button>
          </RequirePermission>
      )}
    </div>
  );
}