import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, ArrowLeft, Package, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Step5QuickStart({ formData, updateFormData, nextStep, prevStep }) {
  const [addProduct, setAddProduct] = useState(false);
  const [products, setProducts] = useState(formData.products || []);
  const { register, handleSubmit, reset } = useForm();

  const handleAddProduct = (data) => {
    const newProduct = {
      name: data.productName,
      price: parseFloat(data.productPrice),
      category: data.productCategory || 'General',
    };
    setProducts([...products, newProduct]);
    reset();
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-primary-light))] flex items-center justify-center mx-auto mb-4">
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
                className="flex-1 h-11 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
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
                <Label className="text-sm">Product Name</Label>
                <Input
                  {...register('productName', { required: true })}
                  placeholder="e.g., Cappuccino"
                  className="mt-1.5 h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register('productPrice', { required: true })}
                    placeholder="5.50"
                    className="mt-1.5 h-10"
                  />
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
              className="flex-1 h-11 bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))] gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}