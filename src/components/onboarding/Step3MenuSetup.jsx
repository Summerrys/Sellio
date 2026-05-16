import React, { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Utensils, Layers, Sparkles, Upload, Menu, X, Pencil, Trash2, Plus, Wand2, Loader2, AlertCircle, Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ImageEditModal from './ImageEditModal';
import EditItemModal from './EditItemModal';
import { getSupabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateThemeVariables } from '../theme/themeUtils';
import { getThemeCSSColors, DEFAULT_COLORS } from '@/lib/themeConstants';
import { toast } from 'sonner';



const INDUSTRY_HINTS = {
  'food': {
    categoryPlaceholder: 'Appetizers, Mains, Desserts...',
    itemPlaceholder: 'eg., Caesar Salad',
    sectionTitle: 'Build your menu',
    sectionSubtitle: 'Create categories and add your menu items',
  },
  'retail': {
    categoryPlaceholder: 'Clothing, Electronics, Accessories...',
    itemPlaceholder: 'eg., Blue Denim Jacket',
    sectionTitle: 'Set up your catalogue',
    sectionSubtitle: 'Create categories and add your products',
  },
  'service': {
    categoryPlaceholder: 'Haircuts, Treatments, Packages...',
    itemPlaceholder: 'eg., 60-min Facial Treatment',
    sectionTitle: 'Set up your services',
    sectionSubtitle: 'Create categories and add your services',
  },
};

const DEFAULT_HINTS = INDUSTRY_HINTS['food'];

export default function Step3MenuSetup({ formData, updateFormData, nextStep, prevStep }) {
  const [categories, setCategories] = useState(formData.menuCategories || []);
  const [categoryInput, setCategoryInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editingImageIdx, setEditingImageIdx] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const fileInputRef = useRef(null);
  const aiFileInputRef = useRef(null);
  const [aiStep, setAiStep] = useState('idle'); // idle | analyzing | done | error
  const [aiPreview, setAiPreview] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiImageUrl, setAiImageUrl] = useState(null);
  const [aiError, setAiError] = useState('');

  const handleAiFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiStep('analyzing');
    setAiError('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setAiPreview(base64);
      try {
        const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6a3R1dGVlZGJ0bmF4ZmR5bHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxNzI2NTgsImV4cCI6MjA2MTc0ODY1OH0.pVFa8FHBMPNNjmrjRPXBJFSLoJ2pKJqxeM3LfmBrXLI';
        const res = await fetch(`${SUPABASE_URL}/functions/v1/analyzeProductImage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            image_data: base64,
            image_mime_type: file.type || 'image/jpeg',
            currency: formData.currency || 'SGD',
            business_type: formData.businessType || '',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
        const { product, image_url } = data;
        if (!product || product.confidence < 0.3) throw new Error("Couldn't identify a product. Try a clearer photo.");
        setAiResult(product);
        setAiImageUrl(image_url);
        setAiStep('done');
      } catch (err) {
        setAiError(err.message || 'AI analysis failed');
        setAiStep('error');
      }
      if (aiFileInputRef.current) aiFileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const applyAiResult = () => {
    if (!aiResult) return;
    setItemName(aiResult.name || '');
    setItemPrice(aiResult.estimated_price ? String(aiResult.estimated_price) : '');
    if (aiImageUrl) setImagePreviews([aiImageUrl]);
    // Try to match category
    if (aiResult.suggested_category && categories.length > 0) {
      const suggested = aiResult.suggested_category.toLowerCase();
      const match = categories.find(c => c.toLowerCase().includes(suggested) || suggested.includes(c.toLowerCase()));
      if (match) setSelectedCategory(match);
    }
    setAiStep('idle');
    setAiPreview(null);
    setAiResult(null);
    setAiImageUrl(null);
    toast.success('AI suggestions applied!');
  };

  const resetAi = () => {
    setAiStep('idle');
    setAiPreview(null);
    setAiResult(null);
    setAiImageUrl(null);
    setAiError('');
    if (aiFileInputRef.current) aiFileInputRef.current.value = '';
  };

  const handleEditSave = (newDataUrl) => {
    if (newDataUrl === null) {
      // Delete the image
      setImagePreviews(prev => prev.filter((_, i) => i !== editingImageIdx));
      setImageFiles(prev => prev.filter((_, i) => i !== editingImageIdx));
      setEditingImageIdx(null);
      return;
    }
    fetch(newDataUrl).then(r => r.blob()).then(blob => {
      const file = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setImagePreviews(prev => prev.map((p, i) => i === editingImageIdx ? newDataUrl : p));
      setImageFiles(prev => prev.map((f, i) => i === editingImageIdx ? file : f));
    });
  };

  // Apply theme from Step 1
  useEffect(() => {
    if (formData.customPrimary && formData.customSecondary) {
      const variables = generateThemeVariables(formData.customPrimary, formData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    } else {
      const variables = generateThemeVariables(DEFAULT_COLORS.primary, DEFAULT_COLORS.secondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const addCategory = () => {
    if (categoryInput.trim() && !categories.includes(categoryInput)) {
      const newCategories = [...categories, categoryInput];
      setCategories(newCategories);
      setCategoryInput('');
      if (!selectedCategory) setSelectedCategory(categoryInput);
    }
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImageFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const startEditItem = (item) => {
    setEditingItem(item);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditingItemId(null);
    setItemName('');
    setItemPrice('');
    setImageFiles([]);
    setImagePreviews([]);
  };

  const handleEditItemSave = (updatedItem) => {
    const updated = (formData.products || []).map(p =>
      p.id === updatedItem.id ? updatedItem : p
    );
    updateFormData({ ...formData, products: updated });
    setEditingItem(null);
    toast.success(`"${updatedItem.name}" updated!`);
  };

  const addItem = async () => {
    if (!selectedCategory || !itemName.trim() || !itemPrice.trim()) return;
    setUploading(true);
    // Preserve all existing previews (http URLs already uploaded, data URLs for new ones)
    let imageUrls = imagePreviews.filter(p => p.startsWith('http') || p.startsWith('data:'));
    try {
      if (imageFiles.length > 0) {
        const supabase = await getSupabase();
        for (const file of imageFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const { error } = await supabase.storage.from('menu-images').upload(fileName, file);
          if (!error) {
            const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(fileName);
            imageUrls.push(publicUrl);
          }
        }
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    }

    if (editingItemId !== null) {
      const updated = (formData.products || []).map(p =>
        p.id === editingItemId
          ? { ...p, category: selectedCategory, name: itemName, price: parseFloat(itemPrice), images: imageUrls }
          : p
      );
      updateFormData({ ...formData, products: updated });
      setEditingItemId(null);
      toast.success(`"${itemName}" updated successfully!`);
    } else {
      const newItem = {
        id: Date.now(),
        category: selectedCategory,
        name: itemName,
        price: parseFloat(itemPrice),
        images: imageUrls,
      };
      updateFormData({ ...formData, products: [...(formData.products || []), newItem] });
    }
    setItemName('');
    setItemPrice('');
    setImageFiles([]);
    setImagePreviews([]);
    setUploading(false);
  };

  const handleSubmit = () => {
    updateFormData({ ...formData, menuCategories: categories });
    nextStep();
  };

  const { primary: primaryColor, secondary: secondaryColor, accent: accentColor } = getThemeCSSColors(formData);
  const chosenColor = formData?.theme ? (formData?.themeColors?.dark || formData?.customPrimary) : null;
  const themeColor = chosenColor || 'linear-gradient(to right, #3b82f6, #9333ea)';
  const hints = INDUSTRY_HINTS[formData.businessType] || DEFAULT_HINTS;

  return (
    <Card className="p-3 sm:p-5 bg-white border-0 shadow-lg w-full" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      <div className="text-center mb-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: themeColor }}>
          <Menu className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{hints.sectionTitle}</h2>
        <p className="text-xs text-slate-500">{hints.sectionSubtitle}</p>
      </div>

      <div className="space-y-3 mb-4 w-full min-w-0">

        {/* Images Section */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 overflow-visible">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" style={{ color: primaryColor }} />
            Product Images
          </h3>
          <div>
            <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Images (optional)</Label>
            {imagePreviews.length === 0 ? (
              <label className="border-2 border-dashed border-slate-300 rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors w-full min-w-0">
                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">Click to add images</span>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
              </label>
            ) : (
              <DragDropContext onDragEnd={(result) => {
                if (!result.destination || result.source.index === result.destination.index) return;
                const from = result.source.index;
                const to = result.destination.index;
                const newPreviews = [...imagePreviews];
                const newFiles = [...imageFiles];
                // Swap only the two items
                [newPreviews[from], newPreviews[to]] = [newPreviews[to], newPreviews[from]];
                [newFiles[from], newFiles[to]] = [newFiles[to], newFiles[from]];
                setImagePreviews(newPreviews);
                setImageFiles(newFiles);
              }}>
                <Droppable droppableId="images" direction="horizontal">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-4 gap-3 w-full auto-rows-max transition-all duration-200">
                      {imagePreviews.map((src, idx) => (
                        <Draggable key={src + idx} draggableId={`img-${idx}`} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`relative w-full aspect-square rounded-lg overflow-hidden border-2 group cursor-grab transition-all duration-150 ${snapshot.isDragging ? 'shadow-lg opacity-70 scale-95' : 'opacity-100'} border-slate-200 col-span-1`}
                              style={idx === 0 ? { ...provided.draggableProps.style, borderColor: primaryColor } : provided.draggableProps.style}
                              onClick={() => setEditingImageIdx(idx)}
                            >
                              <img src={src} alt="preview" className="w-full h-full object-cover" />
                              {idx === 0 && (
                                <div className="absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 font-medium" style={{ background: themeColor }}>Cover</div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Pencil className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      <label className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                        <Plus className="w-5 h-5 text-slate-400" />
                        <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                      </label>
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        </div>

        {/* Item Details Section (includes Categories) */}
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: secondaryColor }} />
            Item Details
          </h3>
          <div className="space-y-4">
            {/* Create categories */}
            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Create Categories</Label>
              <div className="flex gap-2 w-full min-w-0 overflow-hidden">
                <input
                  type="text"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                  placeholder={hints.categoryPlaceholder}
                  className="flex-1 min-w-0 w-0 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-300"
                />
                <button
                  onClick={addCategory}
                  disabled={!categoryInput.trim()}
                  className="px-4 py-2.5 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 text-sm"
                  style={{ background: themeColor }}
                >
                  Add
                </button>
              </div>
              {categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 w-full min-w-0">
                  {categories.map((cat) => (
                    <div key={cat} className="px-3 py-1.5 bg-slate-50 rounded-full text-sm text-slate-700 flex items-center gap-2 border border-slate-200">
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = categories.filter(c => c !== cat);
                          setCategories(updated);
                          if (selectedCategory === cat) setSelectedCategory('');
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Select category */}
            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full h-10 text-sm min-w-0">
                  <SelectValue placeholder={categories.length === 0 ? 'Add a category above first' : 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* AI Auto-fill */}
            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Auto-fill with AI</Label>
              <div className={`rounded-xl border-2 transition-all ${aiStep === 'done' ? 'border-green-200 bg-green-50' : aiStep === 'error' ? 'border-red-200 bg-red-50' : aiStep === 'analyzing' ? 'border-blue-200 bg-blue-50' : 'border-dashed border-slate-300 bg-slate-50 hover:border-slate-400'}`}>
                {aiStep === 'idle' && (
                  <label className="flex items-center gap-3 p-3 cursor-pointer">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: themeColor }}>
                      <Wand2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">Upload photo to auto-fill</p>
                      <p className="text-xs text-slate-500">AI will generate name, price & category</p>
                    </div>
                    <span className="text-xs font-medium px-3 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: themeColor }}>Choose</span>
                    <input ref={aiFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAiFileSelect} />
                  </label>
                )}
                {aiStep === 'analyzing' && (
                  <div className="flex items-center gap-3 p-3">
                    {aiPreview && <img src={aiPreview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <p className="text-sm font-semibold text-slate-800">Analyzing image...</p>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full w-3/4 transition-all" style={{ background: themeColor }} />
                      </div>
                    </div>
                  </div>
                )}
                {aiStep === 'error' && (
                  <div className="flex items-center gap-3 p-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 flex-1">{aiError}</p>
                    <button onClick={resetAi} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                )}
                {aiStep === 'done' && aiResult && (
                  <div className="p-3">
                    <div className="flex items-center gap-3 mb-3">
                      {aiPreview && <img src={aiPreview} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-green-200" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-green-600" />
                          <p className="text-xs font-semibold text-green-700">AI suggestions ready</p>
                        </div>
                        <p className="text-sm font-bold text-slate-900 truncate">{aiResult.name}</p>
                        <p className="text-xs text-slate-500 truncate">{aiResult.suggested_category} · {formData.currency || '$'}{aiResult.estimated_price?.toFixed(2)}</p>
                      </div>
                      <button onClick={resetAi} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={applyAiResult} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5">
                        <Check className="w-4 h-4" /> Apply
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={resetAi}>Discard</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Item Name</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={hints.itemPlaceholder}
                className="h-10 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">$ Price</Label>
              <Input
                type="number"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="h-10 text-sm"
              />
            </div>
            <div className="flex gap-2">
              {editingItemId !== null && (
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={addItem}
                disabled={!selectedCategory || !itemName.trim() || !itemPrice.trim() || uploading}
                className="flex-1 py-2.5 text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:opacity-90"
                style={{ background: themeColor }}
              >
                {uploading ? 'Uploading...' : editingItemId !== null ? '✓ Save Changes' : '+ Add Item'}
              </button>
            </div>
          </div>
        </div>

        {/* Added Items List */}
        {(formData.products || []).length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Added Items ({formData.products.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(formData.products || []).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.images?.[0] && (
                      <img src={item.images[0]} alt={item.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-slate-700">${item.price.toFixed(2)}</span>
                    <button
                      onClick={() => startEditItem(item)}
                      className="text-slate-300 hover:text-blue-500 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const updated = (formData.products || []).filter((_, i) => i !== idx);
                        updateFormData({ ...formData, products: updated });
                      }}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          categories={categories}
          themeColor={themeColor}
          primaryColor={primaryColor}
          onSave={handleEditItemSave}
          onClose={() => setEditingItem(null)}
        />
      )}

      {editingImageIdx !== null && (
        <ImageEditModal
          src={imagePreviews[editingImageIdx]}
          themeColor={themeColor}
          onSave={handleEditSave}
          onClose={() => setEditingImageIdx(null)}
        />
      )}

      <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
        <Button
          type="button"
          onClick={prevStep}
          variant="outline"
          className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm"
        >
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back</span>
        </Button>
        <Button
          type="button"
          onClick={() => nextStep()}
          variant="outline"
          className="h-10 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm text-slate-500"
        >
          Skip
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          className="flex-1 h-10 sm:h-11 text-white gap-1 sm:gap-2 text-sm"
          style={{ background: themeColor }}
        >
          <span className="hidden sm:inline">Next</span> <span className="sm:hidden">Next</span> <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>
    </Card>
  );
}