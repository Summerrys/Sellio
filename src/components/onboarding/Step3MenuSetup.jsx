import React, { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Utensils, Layers, Sparkles, Upload, Menu, X, Pencil, Trash2 } from 'lucide-react';
import ImageEditModal from './ImageEditModal';
import { getSupabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateThemeVariables } from '../theme/themeUtils';
import { getThemeCSSColors, DEFAULT_COLORS } from '@/lib/themeConstants';



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
  const fileInputRef = useRef(null);

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

  const addItem = async () => {
    if (!selectedCategory || !itemName.trim() || !itemPrice.trim()) return;
    setUploading(true);
    let imageUrls = [];
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
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg max-h-screen overflow-y-auto overflow-x-hidden">
      <div className="text-center mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: themeColor }}>
          <Menu className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{hints.sectionTitle}</h2>
        <p className="text-xs text-slate-500">{hints.sectionSubtitle}</p>
      </div>

      <div className="space-y-3 mb-4">

        {/* Images Section */}
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" style={{ color: primaryColor }} />
            Product Images
          </h3>
          <div>
            <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Images (optional)</Label>
            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {imagePreviews.map((src, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group cursor-pointer" onClick={() => setEditingImageIdx(idx)}>
                    <img src={src} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Pencil className="w-4 h-4 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label className="border-2 border-dashed border-slate-300 rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors w-full min-w-0">
              <Upload className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-xs text-slate-500">Click to add images</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
            </label>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                  placeholder={hints.categoryPlaceholder}
                  className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-300"
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                <SelectTrigger className="w-full h-10 text-sm">
                  <SelectValue placeholder={categories.length === 0 ? 'Add a category above first' : 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <button
              onClick={addItem}
              disabled={!selectedCategory || !itemName.trim() || !itemPrice.trim() || uploading}
              className="w-full py-2.5 text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:opacity-90"
              style={{ background: themeColor }}
            >
              {uploading ? 'Uploading...' : '+ Add Item'}
            </button>
          </div>
        </div>

      </div>

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