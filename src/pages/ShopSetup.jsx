import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabaseClient';
import { shrinkImage, LOGO_MAX_SIDE, LONG_CACHE } from '@/lib/imageShrink';
import { useTenant } from '@/components/tenant/TenantContext';
import ThemeSelector from '@/components/theme/ThemeSelector';
import SellingSettingsForm from '@/components/shop/SellingSettingsForm';
import ShareShop from '@/components/shop/ShareShop';
import ProductFormDialog from '@/components/products/ProductFormDialog';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import { PaymentQRTab } from './TenantSettings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ImagePlus, Plus, Check, ArrowLeft, ArrowRight, Palette, Truck, QrCode, ShoppingBag, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import { isShopTenant } from '@/lib/shopSelling';

// Setup steps for a new free shop (after "Sell from home"), in the same look as a
// business's onboarding: the progress header, a card per step and the gradient
// buttons, on a full screen (Layout hides the menu and bottom bar here). Every step can
// be skipped and changed later in Settings; the Dashboard shows "Finish setting up"
// until the owner finishes here.
// progress: the step's name under its number in the progress header.
const STEPS = [
  { key: 'look', progress: 'Shop Look', icon: Palette, title: 'Your shop’s look', subtitle: 'Add a logo and pick your colours.' },
  { key: 'selling', progress: 'How You Sell', icon: Truck, title: 'How you sell', subtitle: 'Self-collection, delivery, or both.' },
  { key: 'payment', progress: 'Get Paid', icon: QrCode, title: 'Get paid', subtitle: 'Upload your PayNow or DuitNow QR. Buyers see it after they order.' },
  { key: 'listings', progress: 'Listings', icon: ShoppingBag, title: 'Your first listings', subtitle: 'Add what you sell. You can add up to 10 on the free plan.' },
  { key: 'share', progress: 'Share Shop', icon: Share2, title: 'Share your shop', subtitle: 'Send your store page to your buyers.' },
];
const GRADIENT_BUTTON = { background: 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6, #9333ea))', color: '#fff' };

const SYMBOLS = { SGD: '$', MYR: 'RM ' };

function LogoStep({ tenant, tenantId }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [logo, setLogo] = useState(tenant?.logo_url || null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setLogo(tenant?.logo_url || null); }, [tenant?.logo_url]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image.'); return; }
    setUploading(true);
    try {
      const logo = await shrinkImage(file, { maxSide: LOGO_MAX_SIDE });
      if (logo.blob.size > 5 * 1024 * 1024) { toast.error('Please use an image under 5 MB.'); return; }
      const supabase = await getSupabase();
      const path = `${tenantId}/logo/${Date.now()}.${logo.ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, logo.blob, { upsert: true, contentType: logo.type, cacheControl: LONG_CACHE });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      const { error: saveError } = await supabase.from('tenants').update({ logo_url: publicUrl }).eq('id', tenantId);
      if (saveError) throw saveError;
      setLogo(publicUrl);
      queryClient.invalidateQueries({ queryKey: ['currentTenant'] });
      toast.success('Logo saved');
    } catch (err) {
      toast.error(err.message || 'Could not upload the logo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden"
          aria-label="Upload logo"
          data-testid="setup-logo"
        >
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            : logo ? <img src={logo} alt="Shop logo" className="w-full h-full object-contain bg-white" />
            : <ImagePlus className="w-8 h-8 text-slate-400" />}
        </button>
        <p className="text-xs text-slate-500">{logo ? 'Tap to change your logo' : 'Tap to add a logo (optional)'}</p>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={upload} />
      </div>
      <ThemeSelector variant="compact" />
      <p className="text-xs text-slate-400 text-center">Later, Design Store on the Dashboard lets you change your banner, layout and fonts.</p>
    </div>
  );
}

function ListingsStep({ tenantId }) {
  const [open, setOpen] = useState(false);
  const { data: listings = [], refetch, isLoading } = useQuery({
    queryKey: ['shop-setup-listings', tenantId],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('products').select('id, name, price, image_url')
        .eq('tenant_id', tenantId).order('created_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : listings.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No listings yet.</p>
      ) : (
        <div className="space-y-2" data-testid="setup-listings">
          {listings.map(item => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
              {item.image_url ? <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-slate-100" />}
              <span className="flex-1 text-sm font-medium text-slate-800 truncate">{item.name}</span>
              <span className="text-xs text-slate-500">{Number(item.price || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400 text-center">{listings.length} of 10 listings</p>
      <Button variant="outline" className="w-full h-11" onClick={() => setOpen(true)} disabled={listings.length >= 10} data-testid="setup-add-listing">
        <Plus className="w-4 h-4 mr-1.5" /> Add a listing
      </Button>
      <ProductFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) refetch(); }}
        product={null}
        tenantId={tenantId}
      />
    </div>
  );
}

export default function ShopSetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant, tenantId, isOwner, isLoading } = useTenant();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState([]); // step numbers (1-based) moved past
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (isLoading || !tenant) return;
    if (!isShopTenant(tenant) || !isOwner) navigate(createPageUrl('Dashboard'), { replace: true });
  }, [isLoading, tenant, isOwner, navigate]);

  if (!tenant || !isShopTenant(tenant)) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const sym = SYMBOLS[tenant.currency] || '$';
  const next = () => {
    setVisited(v => (v.includes(step + 1) ? v : [...v, step + 1]));
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep(s => Math.max(s - 1, 0));

  const finish = async () => {
    setFinishing(true);
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.rpc('finish_shop_setup', { p_tenant_id: tenantId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['shop-setup-status', tenantId] });
      toast.success('Your shop is ready');
      navigate(createPageUrl('Dashboard'), { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not finish setup.');
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-x-hidden" data-testid="shop-setup">
      {/* Header with the progress, as in a business's onboarding */}
      <div className="bg-white border-b border-slate-100 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem' }}>
          <OnboardingProgress currentStep={step + 1} completedSteps={visited} steps={STEPS.map(s => ({ title: s.progress }))} />
        </div>
      </div>

      <div className="flex-1 py-4 sm:py-6 overflow-x-hidden">
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem' }} className="w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.key}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full min-w-0"
            >
              <Card className="p-4 sm:p-6 border-0 shadow-lg">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-xs font-medium text-slate-400 mb-1">Step {step + 1} of {STEPS.length}</p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2" data-testid="setup-title">{current.title}</h1>
                  <p className="text-slate-600">{current.subtitle}</p>
                </div>

                {current.key === 'look' && <LogoStep tenant={tenant} tenantId={tenantId} />}
                {current.key === 'selling' && (
                  <SellingSettingsForm tenantId={tenantId} currencySymbol={sym} saveLabel="Save and continue" onSaved={next} />
                )}
                {current.key === 'payment' && <PaymentQRTab tenant={tenant} tenantId={tenantId} />}
                {current.key === 'listings' && <ListingsStep tenantId={tenantId} />}
                {current.key === 'share' && <ShareShop slug={tenant.slug} shopName={tenant.name?.trim()} tenantId={tenantId} />}

                <div className="flex gap-2 pt-6">
                  {step > 0 && (
                    <Button variant="outline" className="h-11 px-4 sm:px-6 gap-1" onClick={back}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </Button>
                  )}
                  {current.key === 'share' ? (
                    <Button className="flex-1 h-11 text-white gap-1.5" style={GRADIENT_BUTTON} onClick={finish} disabled={finishing} data-testid="setup-finish">
                      {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Finish</>}
                    </Button>
                  ) : current.key === 'selling' ? (
                    <Button variant="outline" className="flex-1 h-11" onClick={next} data-testid="setup-next">
                      Skip for now
                    </Button>
                  ) : (
                    <Button className="flex-1 h-11 text-white gap-1.5" style={GRADIENT_BUTTON} onClick={next} data-testid="setup-next">
                      Continue <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>

          <div className="text-center pt-4">
            <button type="button" onClick={() => navigate(createPageUrl('Dashboard'))} className="text-sm text-slate-500 underline underline-offset-2">
              I&apos;ll finish this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
