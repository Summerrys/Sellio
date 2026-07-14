import { useState, useEffect, useMemo } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { X, Plus, Minus, Trash2, Search, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

// products.variants is already stored pre-grouped as [{name, type, options}] by
// the sync that runs whenever a merchant edits variants in the Products page —
// this just defends against older/malformed rows that might not be in that shape.
function normaliseEditVariants(rawVariants) {
  if (!rawVariants?.length) return [];
  if (rawVariants[0]?.options) return rawVariants;
  return [{ name: 'Options', type: 'other', options: rawVariants.map(v => ({ label: v.name || v.label || '', price_modifier: v.price_modifier || 0 })) }];
}

// Edits an existing order's line items and customer notes. Reuses the same item shape
// the Storefront checkout writes into orders.items (key, product_id, name, price,
// image_url, quantity, variant) so nothing downstream needs to special-case
// merchant-edited orders vs customer-placed ones.
export default function EditOrderModal({ order, tenantId, currency, onClose, onSaved }) {
  const [items, setItems] = useState(() => (order.items || []).map(i => ({ ...i })));
  const [notes, setNotes] = useState(order.notes || '');
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState('');
  // FIX: the product picker used to call addProduct(p) directly on tap, with no
  // variant argument at all — meaning any item added here always went in at base
  // price with variant: null, even for products that have variants configured.
  // Staff editing an in-progress order had no way to actually pick a variant, no
  // matter what stage (New/Confirmed/Preparing/Ready) the order was in. This adds
  // the same variant-selection step the customer storefront uses, reusing the
  // same single-select-vs-multi-select-by-type logic.
  const [pickingVariantsFor, setPickingVariantsFor] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});

  useEffect(() => {
    if (!showPicker || products.length > 0) return;
    (async () => {
      setLoadingProducts(true);
      try {
        const supabase = await getSupabase();
        const { data } = await supabase
          .from('products')
          .select('id, name, price, image_url, is_active, variants')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('name');
        setProducts(data || []);
      } catch (e) {
        toast.error('Could not load menu items');
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, [showPicker, tenantId, products.length]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0),
    [items]
  );

  const updateQty = (idx, delta) => {
    setItems(prev => {
      const next = [...prev];
      const newQty = (next[idx].quantity || 0) + delta;
      if (newQty <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const addProduct = (product, variantLabel = null, variantPriceModifier = 0) => {
    const key = `${product.id}-${variantLabel || 'default'}`;
    setItems(prev => {
      const existingIdx = prev.findIndex(i => i.key === key);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: (next[existingIdx].quantity || 0) + 1 };
        return next;
      }
      return [...prev, {
        key, product_id: product.id, name: product.name,
        price: (product.price || 0) + (variantPriceModifier || 0),
        image_url: product.image_url, quantity: 1, variant: variantLabel,
      }];
    });
    setShowPicker(false);
    setSearch('');
  };

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error('An order needs at least one item — cancel it instead if it should be removed entirely.');
      return;
    }
    setSaving(true);
    try {
      const supabase = await getSupabase();

      // Preserve whatever tax rate was actually applied at order time, rather than
      // re-deriving from the tenant's *current* tax setting (which may have changed
      // since this order was placed).
      const oldSubtotal = parseFloat(order.subtotal) || 0;
      const oldTax = parseFloat(order.tax_amount) || 0;
      const taxRate = oldSubtotal > 0 ? oldTax / oldSubtotal : 0;
      const newTax = Math.round(subtotal * taxRate * 100) / 100;
      const discount = parseFloat(order.discount_amount) || 0;
      const newTotal = Math.max(subtotal + newTax - discount, 0);

      const { error: orderError } = await supabase.from('orders').update({
        items, notes: notes.trim() || null,
        subtotal, tax_amount: newTax, total_amount: newTotal,
        updated_date: new Date().toISOString(),
      }).eq('id', order.id);
      if (orderError) throw orderError;

      // Keep the normalized order_items table (used by daily stock-take reports) in
      // sync — simplest correct approach is to replace its rows for this order wholesale
      // rather than trying to diff add/remove/quantity-change individually.
      await supabase.from('order_items').delete().eq('order_id', order.id);
      const { error: itemsError } = await supabase.from('order_items').insert(items.map(item => ({
        tenant_id: tenantId, order_id: order.id, product_id: item.product_id,
        product_name: item.name, variant_name: item.variant || null,
        quantity: item.quantity, unit_price: item.price, total_price: item.price * item.quantity,
      })));
      if (itemsError) console.warn('order_items sync warning:', itemsError.message);

      toast.success('Order updated');
      onSaved({ ...order, items, notes: notes.trim() || null, subtotal, tax_amount: newTax, total_amount: newTotal });
    } catch (err) {
      toast.error(err.message || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#f8fafc', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', background: 'white', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Edit Order #{order.order_number || order.id?.slice(-6)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Change items or the customer's notes</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {!showPicker ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {items.length === 0 && (
                  <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No items yet — add something below.</p>
                )}
                {items.map((item, idx) => (
                  <div key={item.key || idx} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                        {item.name}{item.variant ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> ({item.variant})</span> : ''}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{currency} {(item.price || 0).toFixed(2)} each</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => updateQty(idx, -1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Minus className="w-3 h-3 text-slate-500" />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQty(idx, 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus className="w-3 h-3 text-slate-500" />
                      </button>
                    </div>
                    <button onClick={() => removeItem(idx)} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowPicker(true)}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1.5px dashed #cbd5e1', background: 'white', color: 'rgb(var(--color-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Customer Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. No onions, extra spicy..."
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 2px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                <span>Subtotal</span>
                <span>{currency} {subtotal.toFixed(2)}</span>
              </div>
            </>
          ) : pickingVariantsFor ? (
            <>
              <button
                onClick={() => setPickingVariantsFor(null)}
                style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}
              >
                ← Back to menu
              </button>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{pickingVariantsFor.name}</p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>{currency} {(pickingVariantsFor.price || 0).toFixed(2)}</p>
              {normaliseEditVariants(pickingVariantsFor.variants).map((group, gi) => {
                const isMultiSelect = group.type === 'addon';
                const selectedForGroup = selectedVariants[gi];
                const selectedList = isMultiSelect ? (Array.isArray(selectedForGroup) ? selectedForGroup : []) : null;
                return (
                  <div key={gi} style={{ marginBottom: 16 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: '#0f172a' }}>{group.name || (isMultiSelect ? 'Add-ons' : 'Options')}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(group.options || []).map((opt, oi) => {
                        const isSelected = isMultiSelect
                          ? selectedList.some(v => v.label === opt.label)
                          : selectedForGroup?.label === opt.label;
                        const handleClick = () => {
                          if (isMultiSelect) {
                            setSelectedVariants(prev => {
                              const current = Array.isArray(prev[gi]) ? prev[gi] : [];
                              const exists = current.some(v => v.label === opt.label);
                              const next = exists ? current.filter(v => v.label !== opt.label) : [...current, opt];
                              return { ...prev, [gi]: next };
                            });
                          } else {
                            setSelectedVariants(prev => ({ ...prev, [gi]: opt }));
                          }
                        };
                        return (
                          <button
                            key={oi}
                            onClick={handleClick}
                            style={{ padding: '8px 14px', borderRadius: 999, fontSize: 13, border: isSelected ? '2px solid rgb(var(--color-primary))' : '1.5px solid #e2e8f0', background: isSelected ? 'rgba(var(--color-primary),0.08)' : 'white', cursor: 'pointer', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'rgb(var(--color-primary))' : '#374151' }}
                          >
                            {opt.label}{opt.price_modifier > 0 ? ` +${currency} ${parseFloat(opt.price_modifier).toFixed(2)}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => {
                  const allSelected = Object.values(selectedVariants).flatMap(v => Array.isArray(v) ? v : (v ? [v] : []));
                  const label = allSelected.length > 0 ? allSelected.map(v => v.label).join(', ') : null;
                  const priceModifier = allSelected.reduce((sum, v) => sum + (v.price_modifier || 0), 0);
                  addProduct(pickingVariantsFor, label, priceModifier);
                  setPickingVariantsFor(null);
                  setSelectedVariants({});
                }}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--color-primary-gradient)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}
              >
                Add to Order
              </button>
            </>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search className="w-4 h-4" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search menu..."
                  style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
              </div>
              {loadingProducts ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (p.variants?.length) {
                          setPickingVariantsFor(p);
                          setSelectedVariants({});
                        } else {
                          addProduct(p);
                        }
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{currency} {(p.price || 0).toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No matching items</p>
                  )}
                </div>
              )}
              <button
                onClick={() => { setShowPicker(false); setSearch(''); }}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}
              >
                Back to order
              </button>
            </>
          )}
        </div>

        {!showPicker && (
          <div style={{ padding: '12px 16px', background: 'white', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--color-primary-gradient)', color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
