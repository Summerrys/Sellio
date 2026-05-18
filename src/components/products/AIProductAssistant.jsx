import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Upload, Loader2, Check, AlertCircle, X, Wand2, ImagePlus, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ImageEditModal from '../onboarding/ImageEditModal';
import { getSupabase } from '@/lib/supabaseClient';

export default function AIProductAssistant({ onApply, tenantId, businessType, currency, categories, currentImageUrl, onImageChange }) {
  const [step, setStep] = useState(currentImageUrl ? 'image_only' : 'idle');
  const [preview, setPreview] = useState(currentImageUrl || null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);

  const fileInputRef = useRef(null);       // AI analysis upload
  const plainImageInputRef = useRef(null); // "Add photo without AI"

  // Track previous value to detect real changes from parent (new product opened)
  const prevImageUrlRef = useRef(currentImageUrl);
  useEffect(() => {
    const prev = prevImageUrlRef.current;
    prevImageUrlRef.current = currentImageUrl;
    if (currentImageUrl === prev) return;

    if (currentImageUrl) {
      setStep('image_only');
      setPreview(currentImageUrl);
      setResult(null);
      setErrorMsg('');
    } else {
      setStep('idle');
      setPreview(null);
      setResult(null);
    }
  }, [currentImageUrl]);

  const uploadToStorage = async (file) => {
    const supabase = await getSupabase();
    const storagePath = `temp/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('product-images').upload(storagePath, file, { upsert: true });
    if (error) throw new Error(error.message);
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

  const handleApply = () => {
    if (!result) return;
    const suggested = (result.suggested_category || '').toLowerCase().trim();
    let matchedCategory = null;
    if (suggested && categories?.length) {
      matchedCategory = categories.find(c => c.name.toLowerCase().trim() === suggested);
      if (!matchedCategory) matchedCategory = categories.find(c => c.name.toLowerCase().includes(suggested) || suggested.includes(c.name.toLowerCase()));
      if (!matchedCategory) {
        const words = suggested.split(/\s+/);
        matchedCategory = categories.find(c => words.some(w => w.length > 3 && c.name.toLowerCase().includes(w)));
      }
    }
    // preview is already the Supabase public URL at this point
    const patch = {
      name: result.name,
      description: result.description,
      tags: result.suggested_tags || [],
      price: result.estimated_price || 0,
      image_url: preview || '',
    };
    if (matchedCategory?.id) patch.category_id = matchedCategory.id;
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
    if (newDataUrl === null) {
      onImageChange?.('');
      reset();
    } else if (newDataUrl.startsWith('data:')) {
      // Crop result — upload before storing
      setStep('uploading');
      try {
        const publicUrl = await uploadBase64ToStorage(newDataUrl);
        setPreview(publicUrl);
        onImageChange?.(publicUrl);
        setStep(prev => prev === 'applied' ? 'applied' : 'image_only');
      } catch (err) {
        toast.error('Upload failed: ' + err.message);
      }
    } else {
      setPreview(newDataUrl);
      onImageChange?.(newDataUrl);
      setStep(prev => prev === 'applied' ? 'applied' : 'image_only');
    }
    setEditModalOpen(false);
  };

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
            <label className="flex flex-col items-center justify-center gap-3 pb-4 cursor-pointer text-center border-b border-slate-200">
              <div className="w-12 h-12 rounded-xl bg-[rgb(var(--color-primary))]/10 flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-[rgb(var(--color-primary))]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Auto-fill with AI</p>
                <p className="text-xs text-slate-500 mt-0.5">Upload a product photo — AI will generate the name, description, price & category</p>
              </div>
              <div className="flex items-center gap-2 mt-1 px-4 py-2 text-white text-sm font-medium rounded-lg" style={{ background: themeColor }}>
                <Upload className="w-4 h-4" />
                Choose Image for AI
              </div>
              <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </label>
            <button
              type="button"
              onClick={() => plainImageInputRef.current?.click()}
              className="w-full mt-3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 py-2"
            >
              <ImagePlus className="w-4 h-4" />
              Add photo without AI
            </button>
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

              {/* "+" add more slot — multiple images coming soon */}
              <button
                type="button"
                onClick={() => toast('Multiple images coming soon')}
                className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors col-span-1"
              >
                <Plus className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ImageEditModal — same as Step3 */}
      {editModalOpen && preview && (
        <ImageEditModal
          src={preview}
          themeColor={themeColor}
          onSave={handleEditSave}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </>
  );
}