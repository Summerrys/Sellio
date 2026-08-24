import React from 'react';
import { ArrowRight, Coins, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const SELLIO_COIN_PACKS = [
  { id: 'coins-100', amount: 100, label: '100 Coins', image: '/assets/coin-shop/sellio-coins-100.webp' },
  { id: 'coins-300', amount: 300, label: '300 Coins', image: '/assets/coin-shop/sellio-coins-300.webp' },
  { id: 'coins-500', amount: 500, label: '500 Coins', image: '/assets/coin-shop/sellio-coins-500.webp' },
  { id: 'coins-1000', amount: 1000, label: '1,000 Coins', image: '/assets/coin-shop/sellio-coins-1000.webp' },
  { id: 'coins-5000', amount: 5000, label: '5,000 Coins', image: '/assets/coin-shop/sellio-coins-5000.webp' },
  { id: 'coins-10000', amount: 10000, label: '10,000 Coins', image: '/assets/coin-shop/sellio-coins-10000.webp' },
];

function CoinPackSlot({ pack, onPurchase, purchaseEnabled }) {
  const handlePurchase = () => {
    if (purchaseEnabled && onPurchase) {
      onPurchase(pack);
      return;
    }

    toast.info('Coin checkout will be available soon.');
  };

  return (
    <article
      className="group relative min-w-0 flex flex-col items-center justify-end overflow-visible"
      aria-label={pack.label}
    >
      <div className="absolute inset-x-0 top-[2%] bottom-[24%] flex items-center justify-center">
        <img
          src={pack.image}
          alt={pack.label}
          className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.04]"
          loading="lazy"
          draggable="false"
        />
      </div>

      <button
        type="button"
        onClick={handlePurchase}
        className={cn(
          'relative z-10 mb-[4%] inline-flex max-w-[88%] items-center justify-center gap-1 rounded-full border border-white/70',
          'bg-white/88 px-[clamp(0.45rem,1.1vw,0.9rem)] py-[clamp(0.25rem,0.55vw,0.45rem)]',
          'text-[clamp(0.56rem,1vw,0.78rem)] font-bold leading-none text-[#5d2a69] shadow-[0_5px_18px_rgba(72,31,77,0.13)]',
          'backdrop-blur-sm transition-all hover:bg-white hover:shadow-[0_7px_22px_rgba(224,68,154,0.2)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0449a] focus-visible:ring-offset-2'
        )}
        aria-label={purchaseEnabled ? `Purchase ${pack.label}` : `${pack.label}; checkout coming soon`}
      >
        <Coins className="h-[clamp(0.65rem,1.1vw,0.9rem)] w-[clamp(0.65rem,1.1vw,0.9rem)] shrink-0 text-[#d83c95]" />
        <span className="truncate">{pack.label}</span>
        <ArrowRight className="h-[clamp(0.6rem,1vw,0.85rem)] w-[clamp(0.6rem,1vw,0.85rem)] shrink-0" />
      </button>
    </article>
  );
}

/**
 * Button-ready rack. Supply onPurchase(pack) and purchaseEnabled=true when
 * checkout is connected; until then every action gives a non-destructive
 * "coming soon" message.
 */
export default function CoinRack({
  packs = SELLIO_COIN_PACKS,
  onPurchase,
  purchaseEnabled = false,
  className,
}) {
  return (
    <section className={cn('relative mx-auto w-full max-w-[1180px]', className)} aria-label="Sellio Coin packs">
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[clamp(1rem,2vw,1.75rem)] bg-[#f8eee6] shadow-[0_24px_70px_rgba(86,49,91,0.16)] ring-1 ring-[#c9a46a]/25">
        <img
          src="/assets/coin-shop/sellio-coin-rack.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          draggable="false"
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(110,64,119,0.03))]" />

        <div className="absolute bottom-[14.5%] left-[15.6%] right-[15.6%] top-[13.5%] grid grid-cols-3 grid-rows-2 gap-x-[2.5%] gap-y-[2.2%]">
          {packs.map((pack) => (
            <CoinPackSlot
              key={pack.id}
              pack={pack}
              onPurchase={onPurchase}
              purchaseEnabled={purchaseEnabled}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute left-1/2 top-[4.7%] -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/72 px-3 py-1 text-[clamp(0.52rem,0.9vw,0.72rem)] font-extrabold uppercase tracking-[0.18em] text-[#6b3b70] shadow-sm backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-[#e0449a]" />
            Sellio Coin Store
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Select a pack to preview the future purchase flow.
      </p>
    </section>
  );
}
