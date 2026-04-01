import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, ArrowLeft, Package, Plus, X, Upload } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { generateThemeVariables } from '../theme/themeUtils';
import { DEFAULT_COLORS } from '@/lib/themeConstants';

export default function Step5QuickStart({ formData, updateFormData, nextStep, prevStep }) {
  // Apply theme from Step 1
  useEffect(() => {
    if (formData.customPrimary && formData.customSecondary) {
      const variables = generateThemeVariables(formData.customPrimary, formData.customSecondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    } else {
      // Apply default theme
      const variables = generateThemeVariables(DEFAULT_COLORS.primary, DEFAULT_COLORS.secondary);
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }, [formData.customPrimary, formData.customSecondary]);

  const [addProduct, setAddProduct] = useState(false);
  const [products, setProducts] = useState(formData.products || []);
  const [productImage, setProductImage] = useState(null);
  const [productPreview, setProductPreview] = useState(null);
  const fileInputRef = React.useRef(null);
  const { register, handleSubmit, reset, formState: { errors }, watch } = useForm();

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload JPG, PNG, or WEBP files only');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be under 5MB');
      return;
    }

    setProductImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setProductPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAddProduct = async (data) => {
    if (!data.productName || !data.productPrice) {
      return;
    }

    let imageUrl = null;
    if (productImage) {
      try {
        const supabase = await getSupabase();
        const timestamp = Date.now();
        const fileName = `${timestamp}-${productImage.name}`;
        const { data: uploadData, error } = await supabase.storage
          .from('product-images')
          .upload(fileName, productImage);
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);
        imageUrl = publicUrl;
      } catch (error) {
        console.error('Image upload failed:', error);
      }
    }

    const newProduct = {
      name: data.productName,
      price: parseFloat(data.productPrice),
      category: data.productCategory || 'General',
      image_url: imageUrl,
    };
    setProducts([...products, newProduct]);
    reset();
    setProductImage(null);
    setProductPreview(null);
  };

  const handleRemoveProduct = (index) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    updateFormData({ products });
    nextStep();
  };

  const handleSkip = () => {
    updateFormData({ products: [] });
    nextStep();
  };

  return (
    <Card className="p-8 sm:p-10 bg-white/80 backdrop-blur border-0 shadow-xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4" style={formData.theme ? { backgroundImage: 'none', background: `linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-primary-light)))` } : {}}>
          <Package className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Quick Start</h2>
        <p className="text-slate-500">Add your first product (or skip for now)</p>
      </div>

      {!addProduct && products.length === 0 ? (
        <div className="space-y-4">
          <div className="text-center py-8">
            <p className="text-slate-600 mb-6">Would you like to add a product now?</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setAddProduct(true)}
                style={{ backgroundColor: `rgb(var(--color-primary, 147 51 234))` }}
              className="flex-1 h-11 hover:opacity-90 gap-2"
              >
                <Plus className="w-4 h-4" /> Add First Product
              </Button>
              <Button
                onClick={handleSkip}
                variant="outline"
                className="flex-1 h-11"
              >
                I'll do this later
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {products.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Your Products</h3>
              {products.map((product, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200"
                >
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-500">
                      {formData.currency} {product.price.toFixed(2)} • {product.category}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    onClick={() => handleRemoveProduct(idx)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {addProduct && (
            <form onSubmit={handleSubmit(handleAddProduct)} className="space-y-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">Add Another Product</h3>
              <div>
                <Label className="text-sm">Product Name *</Label>
                <Input
                  {...register('productName', { required: 'Product name is required' })}
                  placeholder="e.g., Cappuccino"
                  className="mt-1.5 h-10"
                />
                {errors.productName && (
                  <p className="text-xs text-red-500 mt-1">{errors.productName.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('productPrice', { 
                      required: 'Price is required',
                      min: { value: 0, message: 'Price cannot be negative' }
                    })}
                    placeholder="5.50"
                    className="mt-1.5 h-10"
                  />
                  {errors.productPrice && (
                    <p className="text-xs text-red-500 mt-1">{errors.productPrice.message}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm">Category</Label>
                  <Input
                    {...register('productCategory')}
                    placeholder="Drinks"
                    className="mt-1.5 h-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Product Image (Optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {productPreview ? (
                  <div className="mt-1.5 border border-slate-200 rounded-lg p-2 flex items-center gap-3">
                    <img src={productPreview} alt="Product" className="w-12 h-12 object-cover rounded" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1.5 border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-slate-300 transition-colors cursor-pointer"
                  >
                    <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">Click to upload</p>
                  </div>
                )}
              </div>
              {products.length === 0 && productPreview && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">Preview with {formData.theme} theme</p>
                  <div className="mt-2 bg-white rounded-lg p-3 border border-slate-200">
                    <img src={productPreview} alt="Preview" className="w-full h-24 object-cover rounded mb-2" />
                    <p className="font-medium text-sm text-slate-900">{watch('productName') || 'Product Name'}</p>
                    <p className="text-sm text-[rgb(var(--color-primary))]">
                      {formData.currency} {watch('productPrice') || '0.00'}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Product
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddProduct(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {!addProduct && products.length > 0 && (
            <Button
              onClick={() => setAddProduct(true)}
              variant="outline"
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" /> Add Another Product
            </Button>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-200">
            <Button
              onClick={prevStep}
              variant="outline"
              className="flex-1 h-11 gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={handleContinue}
              style={formData.theme ? { backgroundColor: 'rgb(var(--color-primary))' } : { background: 'linear-gradient(to right, #9333ea, #ec4899)' }}
              className="flex-1 h-11 hover:opacity-90 gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}