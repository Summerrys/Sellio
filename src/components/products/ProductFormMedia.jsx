import React, { useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

export default function ProductFormMedia({ formData, onChange, tenantId }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!tenantId) {
      toast.error('Cannot upload: tenant ID is missing');
      return;
    }

    setUploading(true);
    try {
      const supabase = await getSupabase();
      const ext = file.name.split('.').pop();
      const fileName = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      onChange({ image_url: publicUrl });
    } catch (err) {
      toast.error('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Product Image URL</Label>
        <Input
          value={formData.image_url || ''}
          onChange={(e) => onChange({ image_url: e.target.value })}
          placeholder="https://example.com/image.jpg"
          className="mt-1.5"
        />
        <p className="text-xs text-slate-500 mt-1">
          Paste a URL or upload an image below
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
            onClick={() => onChange({ image_url: '' })}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Upload zone */}
      {!formData.image_url && (
        <label className="block border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-slate-300 transition-colors cursor-pointer">
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-600">Uploading...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 mb-1">Click to upload image</p>
              <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={handleFileSelect}
          />
        </label>
      )}

      {/* Replace image button when one exists */}
      {formData.image_url && !uploading && (
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-700 transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Replace image
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}
    </div>
  );
}