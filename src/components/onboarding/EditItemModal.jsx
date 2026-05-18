import React, { useState, useRef } from 'react';
import { X, Upload, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageEditModal from './ImageEditModal';
import { getSupabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

export default function EditItemModal({ item, categories, themeColor, primaryColor, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [category, setCategory] = useState(item.category);
  // Combine cover + additional into one flat list for the grid; cover is always index 0
  const [imagePreviews, setImagePreviews] = useState(() => {
    const all = [];
    if (item.image_url) all.push(item.image_url);
    if (item.images?.length) {
      item.images.forEach(u => { if (u && u !== item.image_url) all.push(u); });
    }
    return all;
  });
  const [editingImageIdx, setEditingImageIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const uploadToStorage = async (file) => {
    const supabase = await getSupabase();
    const storagePath = `temp/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('product-images').upload(storagePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const uploadBase64ToStorage = async (dataUrl) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match?.[1] || 'image/jpeg';
    const base64Data = match?.[2] || dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const ext = mimeType.split('/')[1] || 'jpg';
    const file = new File([bytes], `edited-${Date.now()}.${ext}`, { type: mimeType });
    return uploadToStorage(file);
  };

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadToStorage(file);
        setImagePreviews(prev => [...prev, url]);
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleEditSave = async (newDataUrl) => {
    if (newDataUrl === null) {
      setImagePreviews(prev => prev.filter((_, i) => i !== editingImageIdx));
    } else if (newDataUrl.startsWith('data:')) {
      // Crop result — upload before storing
      setUploading(true);
      try {
        const url = await uploadBase64ToStorage(newDataUrl);
        setImagePreviews(prev => prev.map((p, i) => i === editingImageIdx ? url : p));
      } catch (err) {
        toast.error('Upload failed: ' + err.message);
      } finally {
        setUploading(false);
      }
    } else {
      setImagePreviews(prev => prev.map((p, i) => i === editingImageIdx ? newDataUrl : p));
    }
    setEditingImageIdx(null);
  };

  const handleSave = () => {
    if (!category || !name.trim() || !price.trim()) return;
    const coverUrl = imagePreviews[0] || null;
    const additionalUrls = imagePreviews.slice(1);
    onSave({ ...item, name: name.trim(), price: parseFloat(price), category, image_url: coverUrl, images: additionalUrls });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Edit Item</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Images */}
            <div>
              <Label className="text-sm font-medium text-slate-700 block mb-2">Images</Label>
              {imagePreviews.length === 0 ? (
                <label className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-500">Click to add images</span>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                </label>
              ) : (
                <DragDropContext onDragEnd={(result) => {
                  if (!result.destination) return;
                  const from = result.source.index;
                  const to = result.destination.index;
                  const updated = [...imagePreviews];
                  const [moved] = updated.splice(from, 1);
                  updated.splice(to, 0, moved);
                  setImagePreviews(updated);
                }}>
                  <Droppable droppableId="edit-images" direction="horizontal">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-4 gap-3">
                        {imagePreviews.map((src, idx) => (
                          <Draggable key={`edit-img-${idx}`} draggableId={`edit-img-${idx}`} index={idx}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`relative w-full aspect-square rounded-lg overflow-hidden border-2 group cursor-grab ${snapshot.isDragging ? 'shadow-lg scale-105' : ''}`}
                                style={{ borderColor: idx === 0 ? primaryColor : '#e2e8f0', ...provided.draggableProps.style }}
                                onClick={() => setEditingImageIdx(idx)}
                              >
                                <img src={src} alt="preview" className="w-full h-full object-cover" />
                                {idx === 0 && (
                                  <div className="absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 font-medium" style={{ background: themeColor }}>Cover</div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Pencil className="w-4 h-4 text-white" />
                                </div>
                                <button
                                  className="absolute top-0.5 right-0.5 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => { e.stopPropagation(); setImagePreviews(prev => prev.filter((_, i) => i !== idx)); }}
                                >
                                  <X className="w-2.5 h-2.5 text-white" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        <label className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
                           {uploading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <Plus className="w-5 h-5 text-slate-400" />}
                           <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" disabled={uploading} />
                         </label>
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>

            {/* Category */}
            <div>
              <Label className="text-sm font-medium text-slate-700 block mb-2">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full h-10 text-sm">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div>
              <Label className="text-sm font-medium text-slate-700 block mb-2">Item Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" />
            </div>

            {/* Price */}
            <div>
              <Label className="text-sm font-medium text-slate-700 block mb-2">$ Price</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" step="0.01" min="0" className="h-10 text-sm" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!category || !name.trim() || !price.trim() || uploading}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: themeColor }}
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : 'Save Changes'}
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
    </>
  );
}