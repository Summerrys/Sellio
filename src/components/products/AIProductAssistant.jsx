import React, { useState, useRef, useEffect, useImperativeHandle } from 'react';
import { Sparkles, Upload, Loader2, Check, AlertCircle, X, Wand2, ImagePlus, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ImageEditModal from '../onboarding/ImageEditModal';
import { getSupabase } from '@/lib/supabaseClient';
import { deleteImageFromStorage } from '@/lib/imageStorage';

// Expose cleanup for parent to call
export const cleanupDeletedImages = async (componentRef) => {
  if (componentRef?.current?.deletedImagesRef?.current?.length > 0) {
    const urls = componentRef.current.deletedImagesRef.current;
    componentRef.current.deletedImagesRef.current = [];
    const promises = urls.map(url => deleteImageFromStorage(url));
    await Promise.all(promises);
  }
};

function StockImageSearch({ defaultValue, onResult, onError, themeColor }) {
  const [query, setQuery] = React.useState(defaultValue || '');
  const [searching, setSearching] = React.useState(false);

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const sources = [
        `https://loremflickr.com/400/400/${encodeURIComponent(q)}?lock=${Date.now()}`,
        `https://picsum.photos/seed/${encodeURIComponent(q)}/400/400`,
      ];
      let found = false;
      for (const url of sources) {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok || res.redirected) { onResult(url); found = true; break; }
        } catch {}
      }
      if (!found) onError();
    } catch { onError(); } finally { setSearching(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
        placeholder="Tell me what it is..."
        style={{ flex: 1, fontSize: 13, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none' }}
      />
      <button
        type="button"
        onClick={doSearch}
        disabled={searching || !query.trim()}
        style={{ padding: '8px 12px', borderRadius: 8, background: searching ? '#cbd5e1' : themeColor, border: 'none', cursor: searching ? 'not-allowed' : 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        {searching ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Search style={{ width: 16, height: 16 }} />}
      </button>
    </div>
  );
}

function AIProductAssistantComponent({ onApply, tenantId, businessType, currency, categories, currentImageUrl, onImageChange, onAdditionalImagesChange, additionalImagesOnOpen, onImageDelete, onCategoriesRefresh, currentProductName }, ref) {
   const [step, setStep] = useState(currentImageUrl ? 'image_only' : 'idle');
   const [preview, setPreview] = useState(currentImageUrl || null);
   const [additionalImages, setAdditionalImages] = useState(additionalImagesOnOpen || []);
   const [result, setResult] = useState(null);
   const [errorMsg, setErrorMsg] = useState('');
   const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingImageIndex, setEditingImageIndex] = useState(null); // null = cover, number = additional index
   const [addingImage, setAddingImage] = useState(false);

   const fileInputRef = useRef(null);       // AI analysis upload
   const plainImageInputRef = useRef(null); // "Add photo without AI"
   const replaceImageInputRef = useRef(null); // Replace specific image
   const addImageInputRef = useRef(null); // Add additional images
   const deletedImagesRef = useRef([]); // Track images to delete on save
   const uploadedPaths = useRef([]); // Track uploaded storage paths for cancel cleanup

  // Track previous value to detect real changes from parent (new product opened)
  const prevImageUrlRef = useRef(currentImageUrl);
  useEffect(() => {
    const prev = prevImageUrlRef.current;
    prevImageUrlRef.current = currentImageUrl;
    if (currentImageUrl === prev) return;

    if (currentImageUrl) {
      setStep('image_only');
      setPreview(currentImageUrl);
      setAdditionalImages(additionalImagesOnOpen || []);
      setResult(null);
      setErrorMsg('');
    } else {
      setStep('idle');
      setPreview(null);
      setAdditionalImages([]);
      setResult(null);
    }
  }, [currentImageUrl, additionalImagesOnOpen]);

  const buildPermanentPath = (tenantId, filename) => {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/products/${Date.now()}-${safeName}`;
  };
  // Path: product-images/{tenantId}/products/{filename} ✓

  const uploadToStorage = async (file) => {
    const supabase = await getSupabase();
    const storagePath = buildPermanentPath(tenantId, file.name);
    const { error } = await supabase.storage.from('product-images').upload(storagePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    // Track this path for cancel cleanup
    uploadedPaths.current.push(storagePath);
    const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const uploadBase64ToStorage = async (dataUrl) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match?.[1] || 'image/jpeg';
    const base64Data = match?.[2] || dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const ext = mimeType.split('/')[1] || 'jpg';
    const file = new File([bytes], `edited-${Date.now()}.${ext}`, { type: mimeType });
    return uploadToStorage(file);
  };

  const reset = () => {
    setStep('idle');
    setPreview(null);
    setResult(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setStep('uploading');
    setErrorMsg('');

    try {
      // Read base64 for AI analysis + upload to storage in parallel
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      setPreview(base64); // temp preview while uploading
      setStep('analyzing');

      const [publicUrl, res] = await Promise.all([
        uploadToStorage(file),
        fetch('https://selliosg.base44.app/api/functions/analyzeProductImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        }),
      ]);

      // Replace temp base64 preview with real URL
      setPreview(publicUrl);

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
      if (!data.confidence || data.confidence < 0.3) {
        throw new Error("Couldn't identify a product in this image. Try a clearer photo.");
      }
      setResult({
        name: data.name,
        description: data.description,
        suggested_category: data.category,
        estimated_price: data.price,
        suggested_tags: data.tags || [],
        confidence: data.confidence,
        _imageUrl: publicUrl,
      });
      setStep('done');
    } catch (err) {
      setErrorMsg(err.message || 'AI analysis failed');
      setStep('error');
    }
  };

  const handleApply = async () => {
    if (!result) return;
    const suggested = (result.suggested_category || '').toLowerCase().trim();
    let matchedCategory = null;
    let categoryId = null;

    if (suggested && categories?.length) {
      matchedCategory = categories.find(c => c.name.toLowerCase().trim() === suggested);
      if (!matchedCategory) matchedCategory = categories.find(c => c.name.toLowerCase().includes(suggested) || suggested.includes(c.name.toLowerCase()));
      if (!matchedCategory) {
        const words = suggested.split(/\s+/);
        matchedCategory = categories.find(c => words.some(w => w.length > 3 && c.name.toLowerCase().includes(w)));
      }
    }

    if (matchedCategory?.id) {
      categoryId = matchedCategory.id;
    } else if (suggested) {
      // Create new category
      try {
        const supabase = await (await import('@/lib/supabaseClient')).getSupabase();
        const slug = suggested.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const { data: newCat, error } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            name: result.suggested_category, // Use original case
            slug,
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;
        categoryId = newCat.id;

        // Refresh categories list in parent
        if (onCategoriesRefresh) await onCategoriesRefresh();
      } catch (err) {
        console.error('Failed to create category:', err);
        toast.error('Could not create category');
      }
    }

    // preview is already the Supabase public URL at this point
    const patch = {
      name: result.name,
      description: result.description,
      tags: result.suggested_tags || [],
      price: result.estimated_price || 0,
      image_url: preview || '',
      suggested_category: result.suggested_category || '',
    };
    if (categoryId) patch.category_id = categoryId;
    onApply(patch);
    onImageChange?.(preview || '');
    toast.success('AI suggestions applied!');
    setStep('applied');
    setResult(null);
  };

  const handlePlainImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setStep('uploading');
    try {
      const publicUrl = await uploadToStorage(file);
      onImageChange?.(publicUrl);
      setPreview(publicUrl);
      setStep('image_only');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
      setStep('idle');
    }
  };

  // Called when ImageEditModal saves — null means delete
  const handleEditSave = async (newDataUrl) => {
    const isCover = editingImageIndex === null;
    const oldUrl = isCover ? preview : additionalImages[editingImageIndex];

    if (newDataUrl === null) {
      // Delete — immediately remove from storage and track
      if (oldUrl) {
        const storagePath = oldUrl.split('/product-images/')[1];
        if (storagePath && uploadedPaths.current.includes(storagePath)) {
          try {
            const supabase = await getSupabase();
            await supabase.storage.from('product-images').remove([storagePath]);
            uploadedPaths.current = uploadedPaths.current.filter(p => p !== storagePath);
          } catch (err) {
            console.error('Failed to delete image immediately:', err);
          }
        }
        onImageDelete?.(oldUrl);
      }

      if (isCover) {
        onImageChange?.('');
        reset();
      } else {
        setAdditionalImages(prev => {
          const updated = prev.filter((_, i) => i !== editingImageIndex);
          onAdditionalImagesChange?.(updated);
          return updated;
        });
      }
      setEditModalOpen(false);
    } else if (newDataUrl.startsWith('data:')) {
      // Crop result — upload before storing, delete old image
      try {
        if (oldUrl) deletedImagesRef.current.push(oldUrl);
        const publicUrl = await uploadBase64ToStorage(newDataUrl);
        if (isCover) {
          setPreview(publicUrl);
          onImageChange?.(publicUrl);
          setStep(prev => prev === 'applied' ? 'applied' : 'image_only');
        } else {
          setAdditionalImages(prev => {
            const updated = [...prev];
            updated[editingImageIndex] = publicUrl;
            onAdditionalImagesChange?.(updated);
            return updated;
          });
        }
        setEditModalOpen(false);
      } catch (err) {
        toast.error('Upload failed: ' + err.message);
      }
    } else {
      // Direct URL from replace — delete old image
      if (oldUrl && oldUrl !== newDataUrl) deletedImagesRef.current.push(oldUrl);

      if (isCover) {
        setPreview(newDataUrl);
        onImageChange?.(newDataUrl);
        setStep(prev => prev === 'applied' ? 'applied' : 'image_only');
      } else {
        setAdditionalImages(prev => {
          const updated = [...prev];
          updated[editingImageIndex] = newDataUrl;
          onAdditionalImagesChange?.(updated);
          return updated;
        });
      }
      setEditModalOpen(false);
    }
    setEditingImageIndex(null);
  };

  const handleAddImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAddingImage(true);
    try {
      const publicUrl = await uploadToStorage(file);
      setAdditionalImages(prev => {
        const updated = [...prev, publicUrl];
        onAdditionalImagesChange?.(updated);
        return updated;
      });
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setAddingImage(false);
    }
  };

  const handleReplaceImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || editingImageIndex === null) return;
    e.target.value = '';
    try {
      const publicUrl = await uploadToStorage(file);
      if (editingImageIndex === null) {
        setPreview(publicUrl);
        onImageChange?.(publicUrl);
      } else {
        setAdditionalImages(prev => {
          const updated = [...prev];
          updated[editingImageIndex] = publicUrl;
          onAdditionalImagesChange?.(updated);
          return updated;
        });
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setEditingImageIndex(null);
    }
  };

  // Expose cleanup methods to parent component
  useImperativeHandle(ref, () => ({ 
    deletedImagesRef,
    getTempUploadedPaths: () => uploadedPaths.current,
    clearTempUploadedPaths: () => { uploadedPaths.current = []; }
  }), []);

  const themeColor = 'var(--color-primary-gradient)';
  const hasImage = (step === 'applied' || step === 'image_only') && preview;

  return (
    <>
      <div className={cn(
        'rounded-xl border-2 transition-all',
        step === 'done' ? 'border-green-200 bg-green-50' :
        step === 'error' ? 'border-red-200 bg-red-50' :
        hasImage ? 'border-slate-200 bg-white' :
        step !== 'idle' ? 'border-[rgb(var(--color-primary))]/30 bg-blue-50' :
        'border-dashed border-slate-300 bg-slate-50 hover:border-[rgb(var(--color-primary))]/50 hover:bg-white'
      )}>

        {/* ── IDLE: AI upload prompt ── */}
        {step === 'idle' && (
          <div className="p-4">
            <div className="flex flex-col items-center gap-3 pb-4 border-b border-slate-200">
              <div className="w-12 h-12 rounded-xl bg-[rgb(var(--color-primary))]/10 flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-[rgb(var(--color-primary))]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Auto-fill with AI</p>
                <p className="text-xs text-slate-500 mt-0.5">Upload a photo — AI generates name, price & category</p>
              </div>
              <div className="flex gap-2 w-full">
                <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-white text-sm font-medium rounded-lg cursor-pointer" style={{ background: themeColor }}>
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span>AI Analyse</span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
                <button
                  type="button"
                  onClick={() => plainImageInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                >
                  <ImagePlus className="w-4 h-4 flex-shrink-0" />
                  <span>Upload Photo</span>
                </button>
              </div>
              <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-400 text-center mb-2">Or find a stock image</p>
              <StockImageSearch
                defaultValue={currentProductName || ''}
                onResult={async (imageUrl) => {
                  setStep('uploading');
                  try {
                    const imgRes = await fetch(imageUrl);
                    const blob = await imgRes.blob();
                    const file = new File([blob], `stock-${Date.now()}.jpg`, { type: 'image/jpeg' });
                    const publicUrl = await uploadToStorage(file);
                    onImageChange?.(publicUrl);
                    setPreview(publicUrl);
                    setStep('image_only');
                  } catch {
                    setStep('idle');
                    toast.error('Could not load stock image');
                  }
                }}
                onError={() => {
                  setStep('idle');
                  toast.error('No image found, try different keywords');
                }}
                themeColor={themeColor}
              />
            </div>
            <input ref={plainImageInputRef} type="file" accept="image/*" className="hidden" onChange={handlePlainImageSelect} />
          </div>
        )}

        {/* ── UPLOADING / ANALYZING ── */}
        {(step === 'uploading' || step === 'analyzing') && (
          <div className="flex items-center gap-4 p-4">
            {preview && <img src={preview} alt="preview" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--color-primary))]" />
                <p className="text-sm font-semibold text-slate-800">
                  {step === 'uploading' ? 'Uploading image...' : 'AI is analyzing your product...'}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {step === 'uploading' ? 'Preparing image for analysis' : 'Generating name, description & suggestions'}
              </p>
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: step === 'uploading' ? '40%' : '85%', background: themeColor }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div className="flex items-start gap-3 p-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Analysis failed</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={reset} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── DONE: AI results ── */}
        {step === 'done' && result && (
          <div className="p-4">
            <div className="flex items-start gap-3 mb-3">
              {preview && <img src={preview} alt="preview" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-green-200" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-semibold text-green-800">AI suggestions ready</p>
                </div>
                <p className="text-base font-bold text-slate-900 truncate">{result.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{result.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {result.suggested_category && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">📂 {result.suggested_category}</span>
                  )}
                  {result.estimated_price > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">💰 {currency} {result.estimated_price.toFixed(2)}</span>
                  )}
                  {result.suggested_tags?.slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              </div>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={handleApply} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5" size="sm">
                <Check className="w-4 h-4" /> Apply to Form
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={reset}>Discard</Button>
            </div>
          </div>
        )}

        {/* ── APPLIED / IMAGE_ONLY: Step3-style grid ── */}
        {hasImage && (
          <div className="p-3">
            <div className="grid grid-cols-4 gap-3">
              {/* Main image cell — exactly like Step3 */}
              <div
                className="relative w-full aspect-square rounded-lg overflow-hidden border-2 group cursor-pointer col-span-1"
                style={{ borderColor: 'rgb(var(--color-primary))' }}
                onClick={() => setEditModalOpen(true)}
              >
                <img src={preview} alt="product" className="w-full h-full object-cover" />
                {/* Cover badge */}
                <div
                  className="absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 font-medium"
                  style={{ background: themeColor }}
                >
                  Cover
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Additional images from array */}
              {additionalImages.map((src, idx) => (
                <div
                  key={`additional-${idx}`}
                  className="relative w-full aspect-square rounded-lg overflow-hidden border-2 border-slate-300 group cursor-pointer col-span-1"
                  onClick={() => {
                    setEditingImageIndex(idx);
                    setEditModalOpen(true);
                  }}
                >
                  <img src={src} alt={`additional-${idx}`} className="w-full h-full object-cover" />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Pencil className="w-4 h-4 text-white" />
                  </div>
                </div>
              ))}

              {/* "+" add more slot for additional images */}
              {additionalImages.length < 4 && (
                <label className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors col-span-1 cursor-pointer">
                  {addingImage ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <Plus className="w-5 h-5 text-slate-400" />}
                  <input ref={addImageInputRef} type="file" accept="image/*" onChange={handleAddImage} className="hidden" disabled={addingImage} />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Hidden file input for replacing additional images */}
        <input
          ref={replaceImageInputRef}
          type="file"
          accept="image/*"
          onChange={handleReplaceImageSelect}
          className="hidden"
        />
      </div>

      {/* ImageEditModal — handles cover and additional images */}
      {editModalOpen && (
        <ImageEditModal
          src={editingImageIndex === null ? preview : additionalImages[editingImageIndex]}
          themeColor={themeColor}
          onSave={handleEditSave}
          onClose={() => {
            setEditModalOpen(false);
            setEditingImageIndex(null);
          }}
          onReplace={() => {
            replaceImageInputRef.current?.click();
          }}
        />
      )}
    </>
  );
}

const AIProductAssistant = React.forwardRef(AIProductAssistantComponent);
export default AIProductAssistant;