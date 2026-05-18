import React, { useState, useRef } from 'react';
import { Sparkles, Upload, Loader2, Check, AlertCircle, X, Wand2, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function AIProductAssistant({ onApply, tenantId, businessType, currency, categories, currentImageUrl, onImageChange }) {
  const [step, setStep] = useState('idle'); // idle | uploading | analyzing | done | error
  const [preview, setPreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);
  const plainImageInputRef = useRef(null);

  const reset = () => {
    setStep('idle');
    setPreview(null);
    setUploadedUrl(null);
    setResult(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('uploading');
    setErrorMsg('');

    // Read as base64 and show preview
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setPreview(base64);
      setStep('analyzing');

      try {
        const res = await fetch('https://selliosg.base44.app/api/functions/analyzeProductImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);

        if (!data.confidence || data.confidence < 0.3) {
          throw new Error("Couldn't identify a product in this image. Try a clearer photo.");
        }

        // Map flat response to the shape handleApply expects
        setResult({
          name: data.name,
          description: data.description,
          suggested_category: data.category,
          estimated_price: data.price,
          suggested_tags: data.tags || [],
          confidence: data.confidence,
        });
        setStep('done');

      } catch (err) {
        setErrorMsg(err.message || 'AI analysis failed');
        setStep('error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    if (!result) return;

    const suggested = (result.suggested_category || '').toLowerCase().trim();
    let matchedCategory = null;
    if (suggested && categories?.length) {
      matchedCategory = categories.find(c => c.name.toLowerCase().trim() === suggested);
      if (!matchedCategory) {
        matchedCategory = categories.find(c =>
          c.name.toLowerCase().includes(suggested) || suggested.includes(c.name.toLowerCase())
        );
      }
      if (!matchedCategory) {
        const words = suggested.split(/\s+/);
        matchedCategory = categories.find(c =>
          words.some(w => w.length > 3 && c.name.toLowerCase().includes(w))
        );
      }
    }

    const appliedImage = preview || '';
    const patch = {
      name: result.name,
      description: result.description,
      tags: result.suggested_tags || [],
      price: result.estimated_price || 0,
      image_url: appliedImage,
    };
    if (matchedCategory?.id) {
      patch.category_id = matchedCategory.id;
    }
    onApply(patch);
    toast.success('AI suggestions applied!');
    // Keep preview visible, move to applied state
    setStep('applied');
    setResult(null);
  };

  const handlePlainImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      onImageChange?.(base64);
      setStep('image_only');
      setPreview(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all',
      step === 'done' ? 'border-green-200 bg-green-50' :
      step === 'error' ? 'border-red-200 bg-red-50' :
      (step === 'applied' || step === 'image_only') ? 'border-slate-200 bg-white' :
      step !== 'idle' ? 'border-[rgb(var(--color-primary))]/30 bg-blue-50' :
      'border-dashed border-slate-300 bg-slate-50 hover:border-[rgb(var(--color-primary))]/50 hover:bg-white'
    )}>
      {/* Idle: upload prompt */}
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
            <div className="flex items-center gap-2 mt-1 px-4 py-2 text-white text-sm font-medium rounded-lg" style={{ background: 'var(--color-primary-gradient)' }}>
              <Upload className="w-4 h-4" />
              Choose Image for AI
            </div>
            <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
          {/* Plain image upload (no AI) */}
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

      {/* Uploading / Analyzing */}
      {(step === 'uploading' || step === 'analyzing') && (
        <div className="flex items-center gap-4 p-4">
          {preview && (
            <img src={preview} alt="preview" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
          )}
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
                className="h-full bg-[rgb(var(--color-primary))] rounded-full transition-all duration-500"
                style={{ width: step === 'uploading' ? '40%' : '85%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="flex items-start gap-3 p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Analysis failed</p>
            <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={reset} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Done: show results */}
      {step === 'done' && result && (
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            {preview && (
              <img src={preview} alt="preview" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-green-200" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-800">AI suggestions ready</p>
              </div>
              <p className="text-base font-bold text-slate-900 truncate">{result.name}</p>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{result.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.suggested_category && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    📂 {result.suggested_category}
                  </span>
                )}
                {result.estimated_price > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    💰 {currency} {result.estimated_price.toFixed(2)}
                  </span>
                )}
                {result.suggested_tags?.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={reset} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleApply}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5"
              size="sm"
            >
              <Check className="w-4 h-4" />
              Apply to Form
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Applied / image_only: show image preview with replace/remove */}
      {(step === 'applied' || step === 'image_only') && preview && (
        <div className="flex items-center gap-3 p-3">
          <img src={preview} alt="product" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700">
              {step === 'applied' ? 'AI image applied' : 'Product photo'}
            </p>
            <p className="text-xs text-slate-400">This will be saved as the product image</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title="Replace"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { onImageChange?.(''); reset(); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>
      )}
    </div>
  );
}