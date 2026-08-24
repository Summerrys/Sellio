import React from 'react';
import { Coins, ShieldCheck, Sparkles } from 'lucide-react';
import CoinRack from '@/components/coins/CoinRack';

export default function CoinShop() {
  return (
    <div className="space-y-6 pb-10">
      <header className="overflow-hidden rounded-3xl border border-fuchsia-100 bg-[linear-gradient(135deg,#fff9f2_0%,#fff4fb_52%,#f5f0ff_100%)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-100 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#a72f84]">
              <Sparkles className="h-3.5 w-3.5" />
              Merchant rewards
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Build your Sellio Coin balance.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Choose a coin pack for future storefront decorations, seasonal upgrades and Sellio World experiences.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/72 p-3 shadow-sm backdrop-blur">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#fb923c,#e0449a,#8b5cf6)] text-white shadow-md">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Coin purchases</p>
              <p className="text-sm font-bold text-slate-800">Checkout-ready layout</p>
            </div>
          </div>
        </div>
      </header>

      <CoinRack />

      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500 shadow-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        <p>
          No payment is taken yet. Each pack is already configured as an independent action, ready to connect to Stripe checkout and a merchant coin wallet in the next phase.
        </p>
      </div>
    </div>
  );
}
