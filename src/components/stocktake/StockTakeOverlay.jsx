import React, { useState } from 'react';
import { X, ClipboardList } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '../tenant/TenantContext';
import OutletDatesTab from './OutletDatesTab';
import DeliveryOrderTab from './DeliveryOrderTab';
import DailyReportTab from './DailyReportTab';

export default function StockTakeOverlay({ open, onClose }) {
  const { tenant } = useTenant();
  const [activeTab, setActiveTab] = useState('outlet');

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 lg:p-8">
        <div
          className="
            relative bg-white flex flex-col
            w-full h-full
            sm:rounded-2xl sm:h-auto sm:max-h-[92vh]
            lg:max-w-[920px] lg:w-full
          "
          style={{ minHeight: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
              >
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Stock Take</h2>
                {tenant?.name && <p className="text-xs text-slate-400">{tenant.name}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 border-b border-slate-100 px-5">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent p-0 h-auto gap-4 border-0 rounded-none">
                {[
                  { value: 'outlet', label: 'Outlet & Dates' },
                  { value: 'delivery', label: 'Delivery Order' },
                  { value: 'daily', label: 'Daily Report' },
                ].map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="
                      bg-transparent border-0 rounded-none px-0 py-3 text-sm font-medium
                      text-slate-500 data-[state=active]:text-slate-900
                      data-[state=active]:border-b-2 data-[state=active]:shadow-none
                      transition-colors
                    "
                    style={{ borderBottomColor: activeTab === tab.value ? 'rgb(var(--color-primary))' : 'transparent' }}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'outlet' && <OutletDatesTab />}
            {activeTab === 'delivery' && <DeliveryOrderTab />}
            {activeTab === 'daily' && <DailyReportTab />}
          </div>
        </div>
      </div>
    </>
  );
}