import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProductFormMedia({ formData, onChange }) {
  const handleImageUrlChange = (url) => {
    onChange({ image_url: url });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Product Image URL</Label>
        <Input
          value={formData.image_url || ''}
          onChange={(e) => handleImageUrlChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="mt-1.5"
        />
        <p className="text-xs text-slate-500 mt-1">
          Enter image URL or use upload feature (coming soon)
        </p>
      </div>

      {/* Image Preview */}
      {formData.image_url && (
        <div className="relative w-full aspect-square max-w-xs border border-slate-200 rounded-lg overflow-hidden">
          <img
            src={formData.image_url}
            alt="Preview"
            className="w-full h-full object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={() => handleImageUrlChange('')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Upload placeholder */}
      {!formData.image_url && (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-slate-300 transition-colors">
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 mb-1">Drag & drop or click to upload</p>
          <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
        </div>
      )}
    </div>
  );
}