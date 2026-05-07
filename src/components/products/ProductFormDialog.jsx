import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import db from '@/lib/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProductFormBasic from './ProductFormBasic';
import ProductFormPricing from './ProductFormPricing';
import ProductFormMedia from './ProductFormMedia';
import ProductFormInventory from './ProductFormInventory';
import ProductFormVariants from './ProductFormVariants';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductFormDialog({ open, onOpenChange, product, tenantId }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category_id: '',
    tags: [],
    price: 0,
    cost_price: 0,
    image_url: '',
    stock_quantity: 0,
    low_stock_threshold: 5,
    is_active: true,
    is_featured: false,
    variants: [],
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: () => db.entities.Category.filter({ tenant_id: tenantId }),
    enabled: !!tenantId && open,
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        description: product.description || '',
        category_id: product.category_id || '',
        tags: product.tags || [],
        price: product.price || 0,
        cost_price: product.cost_price || 0,
        image_url: product.image_url || '',
        stock_quantity: product.stock_quantity,
        low_stock_threshold: product.low_stock_threshold || 5,
        is_active: product.is_active !== false,
        is_featured: product.is_featured || false,
        variants: product.variants || [],
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        description: '',
        category_id: '',
        tags: [],
        price: 0,
        cost_price: 0,
        image_url: '',
        stock_quantity: 0,
        low_stock_threshold: 5,
        is_active: true,
        is_featured: false,
        variants: [],
      });
    }
  }, [product, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const productData = {
        ...data,
        tenant_id: tenantId,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      };

      if (product) {
        return db.entities.Product.update(product.id, productData);
      } else {
        return db.entities.Product.create(productData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      toast.success(product ? 'Product updated' : 'Product created');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save product');
    },
  });

  const handleChange = (updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = (isDraft = false) => {
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (formData.price <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }

    saveMutation.mutate({
      ...formData,
      is_active: !isDraft && formData.is_active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full flex flex-col p-0 gap-0 overflow-hidden max-h-[90dvh]">
        {/* Sticky Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>
            {product ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <ProductFormBasic
                formData={formData}
                onChange={handleChange}
                categories={categories}
                onCreateCategory={() => toast.info('Create category coming soon')}
              />
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4">
              <ProductFormPricing formData={formData} onChange={handleChange} />
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              <ProductFormMedia formData={formData} onChange={handleChange} />
            </TabsContent>

            <TabsContent value="inventory" className="space-y-4">
              <ProductFormInventory formData={formData} onChange={handleChange} />
            </TabsContent>

            <TabsContent value="variants" className="space-y-4">
              <ProductFormVariants formData={formData} onChange={handleChange} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sticky Footer */}
        <div className="flex-shrink-0 border-t px-6 py-4 space-y-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => handleChange({ is_active: checked })}
              />
              <Label className="text-sm">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_featured}
                onCheckedChange={(checked) => handleChange({ is_featured: checked })}
              />
              <Label className="text-sm">Featured</Label>
            </div>
          </div>
          <div className="flex justify-between items-center gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={saveMutation.isPending}
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saveMutation.isPending}
                className="bg-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary-600))]"
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />{product ? 'Update' : 'Create'} Product</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}