import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Utensils, Layers, Sparkles, Upload, BookOpen, UtensilsCrossed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateThemeVariables } from '../theme/themeUtils';
import { getThemeCSSColors, DEFAULT_COLORS } from '@/lib/themeConstants';

export default function Step3MenuSetup({ formData, updateFormData, nextStep, prevStep }) {
  const [categories, setCategories] = useState(formData.menuCategories || []);
  const [categoryInput, setCategoryInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [imageFile, setImageFile] = useState(null);

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

  const addItem = () => {
    if (selectedCategory && itemName.trim() && itemPrice.trim()) {
      setItemName('');
      setItemPrice('');
      setImageFile(null);
    }
  };

  const handleSubmit = () => {
    updateFormData({ ...formData, menuCategories: categories });
    nextStep();
  };

  const { primary: primaryColor, secondary: secondaryColor, accent: accentColor } = getThemeCSSColors(formData);

  return (
    <Card className="p-4 sm:p-8 bg-white border-0 shadow-lg max-h-screen overflow-y-auto">
      <div className="text-center mb-6 sm:mb-8">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: primaryColor }}>
          <div className="flex items-center gap-1">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Build your menu</h2>
        <p className="text-sm sm:text-base text-slate-600">Create categories and add your items</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Categories Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
            <Layers className="w-5 h-5" style={{ color: primaryColor }} />
            Categories
          </h3>
          <div className="flex gap-2 flex-col sm:flex-row">
            <input
              type="text"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Appetizers, Mains..."
              className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-300"
            />
            <button
              onClick={addCategory}
              disabled={!categoryInput.trim()}
              className="w-full sm:w-auto px-4 py-2.5 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Add
            </button>
          </div>
          {categories.length > 0 && (
            <div className="mt-4 space-y-2">
              {categories.map((cat) => (
                <div key={cat} className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center justify-between">
                  <span>{cat}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Item Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
            <Sparkles className="w-5 h-5" style={{ color: secondaryColor }} />
            Add Item
          </h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full h-10 text-sm">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Item Name</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="eg., Caesar Salad"
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

            <div>
              <Label className="text-xs sm:text-sm font-medium text-slate-700 block mb-2">Image (optional)</Label>
              <label className="border-2 border-dashed border-slate-300 rounded-lg p-6 sm:p-8 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                <Upload className="w-6 h-6 text-slate-400 mb-2" />
                <span className="text-xs sm:text-sm text-slate-500">Click to upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={addItem}
              disabled={!selectedCategory || !itemName.trim() || !itemPrice.trim()}
              className="w-full py-2.5 text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              + Add Item
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
        <Button
          type="button"
          onClick={prevStep}
          variant="outline"
          className="h-10 sm:h-11 px-4 sm:px-6 gap-1 sm:gap-2 text-sm"
        >
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> Back
        </Button>
        <Button
          type="button"
          onClick={() => nextStep()}
          variant="outline"
          className="h-10 sm:h-11 px-4 sm:px-6 text-sm"
        >
          Skip for now
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          className="flex-1 h-10 sm:h-11 text-white gap-2 text-sm font-semibold"
          style={{ backgroundColor: primaryColor }}
        >
          Continue <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}