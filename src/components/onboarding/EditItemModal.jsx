import React, { useState, useRef } from 'react';
import { X, Upload, Plus, Pencil, Trash2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageEditModal from './ImageEditModal';

export default function EditItemModal({ item, categories, themeColor, primaryColor, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [category, setCategory] = useState(item.category);
  const [imagePreviews, setImagePreviews] = useState(item.images || []);
  const [editingImageIdx, setEditingImageIdx] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
  };

  const handleEditSave = (newDataUrl) => {
    if (newDataUrl === null) {
      setImagePreviews(prev => prev.filter((_, i) => i !== editingImageIdx));
    } else {
      setImagePreviews(prev => prev.map((p, i) => i === editingImageIdx ? newDataUrl : p));
    }
    setEditingImageIdx(null);
  };

  const handleSave = () => {
    if (!category || !name.trim() || !price.trim()) return;
    onSave({ ...item, name: name.trim(), price: parseFloat(price), category, images: imagePreviews });
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
                          <Plus className="w-5 h-5 text-slate-400" />
                          <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
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
              disabled={!category || !name.trim() || !price.trim()}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 hover:opacity-90"
              style={{ background: themeColor }}
            >
              Save Changes
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