import React, { useState, useRef } from 'react';
import { Sparkles, Upload, Loader2, Check, AlertCircle, X, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { appParams } from '@/lib/app-params';

export default function AIProductAssistant({ onApply, tenantId, businessType, currency, categories }) {
  const [step, setStep] = useState('idle'); // idle | uploading | analyzing | done | error
  const [preview, setPreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

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
        const fnUrl = `${appParams.appBaseUrl}/api/functions/analyzeProductImage`;
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_data: base64,
            image_mime_type: file.type || 'image/jpeg',
            tenant_id: tenantId || '',
            currency: currency || 'SGD',
            business_type: businessType || '',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);

        const { product, image_url: uploadedImageUrl } = data;

        if (!product || product.confidence < 0.3) {
          throw new Error("Couldn't identify a product in this image. Try a clearer photo.");
        }

        setUploadedUrl(uploadedImageUrl || '');
        setResult({ ...product });
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

    // Match category at apply time — categories are guaranteed loaded by now
    const suggested = (result.suggested_category || '').toLowerCase().trim();
    let matchedCategory = null;
    if (suggested && categories?.length) {
      // 1. Exact match
      matchedCategory = categories.find(c => c.name.toLowerCase().trim() === suggested);
      // 2. One contains the other
      if (!matchedCategory) {
        matchedCategory = categories.find(c =>
          c.name.toLowerCase().includes(suggested) || suggested.includes(c.name.toLowerCase())
        );
      }
      // 3. Any word overlap (e.g. "Cold Beverage" vs "Beverages")
      if (!matchedCategory) {
        const words = suggested.split(/\s+/);
        matchedCategory = categories.find(c =>
          words.some(w => w.length > 3 && c.name.toLowerCase().includes(w))
        );
      }
    }

    console.log('[AIAssistant] suggested_category:', result.suggested_category, '| matched:', matchedCategory?.name, '| available:', categories?.map(c => c.name));

    const patch = {
      name: result.name,
      description: result.description,
      tags: result.suggested_tags || [],
      price: result.estimated_price || 0,
      image_url: uploadedUrl || '',
    };
    if (matchedCategory?.id) {
      patch.category_id = matchedCategory.id;
    }
    onApply(patch);
    toast.success('AI suggestions applied!');
    reset();
  };

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all',
      step === 'done' ? 'border-green-200 bg-green-50' :
      step === 'error' ? 'border-red-200 bg-red-50' :
      step !== 'idle' ? 'border-[rgb(var(--color-primary))]/30 bg-blue-50' :
      'border-dashed border-slate-300 bg-slate-50 hover:border-[rgb(var(--color-primary))]/50 hover:bg-white'
    )}>
      {/* Idle: upload prompt */}
      {step === 'idle' && (
        <label className="flex flex-col items-center justify-center gap-3 p-6 cursor-pointer text-center">
          <div className="w-12 h-12 rounded-xl bg-[rgb(var(--color-primary))]/10 flex items-center justify-center">
            <Wand2 className="w-6 h-6 text-[rgb(var(--color-primary))]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Auto-fill with AI</p>
            <p className="text-xs text-slate-500 mt-0.5">Upload a product photo — AI will generate the name, description, price & category</p>
          </div>
          <div className="flex items-center gap-2 mt-1 px-4 py-2 bg-[rgb(var(--color-primary))] text-white text-sm font-medium rounded-lg">
            <Upload className="w-4 h-4" />
            Choose Image
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
    </div>
  );
}