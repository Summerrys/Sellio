import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, RotateCw, Crop, Undo2, Upload, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TOOLS = { NONE: 'none', CROP: 'crop' };

export default function ImageEditModal({ src, themeColor, onSave, onClose }) {
  const canvasRef = useRef(null);
  const replaceInputRef = useRef(null);

  // History stack: each entry is { imageSrc, rotation }
  const [history, setHistory] = useState([{ imageSrc: src, rotation: 0 }]);
  const [current, setCurrent] = useState({ imageSrc: src, rotation: 0 });
  const [tool, setTool] = useState(TOOLS.NONE);

  // Crop drag state
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const imgRef = useRef(new Image());
  const [canvasSize, setCanvasSize] = useState({ w: 400, h: 400 });

  // Load image and draw on canvas
  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const maxW = 380;
      const maxH = 360;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      // Swap for 90/270 rotation
      const swapped = current.rotation % 180 !== 0;
      const displayW = swapped ? h : w;
      const displayH = swapped ? w : h;
      const scale = Math.min(maxW / displayW, maxH / displayH, 1);
      const cw = Math.round(displayW * scale);
      const ch = Math.round(displayH * scale);
      setCanvasSize({ w: cw, h: ch });
      drawImage(img, cw, ch, current.rotation);
    };
    img.src = current.imageSrc;
  }, [current]);

  const drawImage = (img, cw, ch, rotation) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const swapped = rotation % 180 !== 0;
    const drawW = swapped ? ch : cw;
    const drawH = swapped ? cw : ch;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  };

  const pushHistory = (newState) => {
    setHistory(prev => [...prev, newState]);
    setCurrent(newState);
    setTool(TOOLS.NONE);
    setCropStart(null);
    setCropEnd(null);
  };

  const handleRotate = () => {
    const newRotation = (current.rotation + 90) % 360;
    pushHistory({ ...current, rotation: newRotation });
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    setCurrent(newHistory[newHistory.length - 1]);
    setTool(TOOLS.NONE);
    setCropStart(null);
    setCropEnd(null);
  };

  const handleReplace = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => pushHistory({ imageSrc: reader.result, rotation: 0 });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Crop via canvas coordinates
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, canvas.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, canvas.height)),
    };
  };

  const onMouseDown = (e) => {
    if (tool !== TOOLS.CROP) return;
    setIsDragging(true);
    setCropStart(getCanvasPos(e));
    setCropEnd(getCanvasPos(e));
  };

  const onMouseMove = (e) => {
    if (!isDragging || tool !== TOOLS.CROP) return;
    setCropEnd(getCanvasPos(e));
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    if (w < 5 || h < 5) return;

    const src = canvasRef.current;
    const dest = document.createElement('canvas');
    dest.width = w;
    dest.height = h;
    const ctx = dest.getContext('2d');
    ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
    pushHistory({ imageSrc: dest.toDataURL(), rotation: 0 });
  };

  const handleSave = () => {
    // Re-render to canvas with final state and export
    const canvas = canvasRef.current;
    onSave(canvas.toDataURL('image/jpeg', 0.92));
    onClose();
  };

  // Crop selection overlay coords
  const cropRect = cropStart && cropEnd ? {
    x: Math.min(cropStart.x, cropEnd.x),
    y: Math.min(cropStart.y, cropEnd.y),
    w: Math.abs(cropEnd.x - cropStart.x),
    h: Math.abs(cropEnd.y - cropStart.y),
  } : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Edit Image</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Canvas area */}
        <div className="flex items-center justify-center bg-slate-50 py-4 px-4" style={{ minHeight: 200 }}>
          <div className="relative inline-block select-none"
            style={{ cursor: tool === TOOLS.CROP ? 'crosshair' : 'default' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
            {/* Crop overlay */}
            {tool === TOOLS.CROP && cropRect && cropRect.w > 0 && (
              <div
                className="absolute border-2 border-white"
                style={{
                  left: cropRect.x, top: cropRect.y,
                  width: cropRect.w, height: cropRect.h,
                  background: 'rgba(255,255,255,0.15)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 flex-wrap">
          <button
            onClick={handleRotate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <RotateCw className="w-4 h-4" /> Rotate
          </button>

          <button
            onClick={() => { setTool(t => t === TOOLS.CROP ? TOOLS.NONE : TOOLS.CROP); setCropStart(null); setCropEnd(null); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${tool === TOOLS.CROP ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
          >
            <Crop className="w-4 h-4" /> {tool === TOOLS.CROP ? 'Cancel Crop' : 'Crop'}
          </button>

          {tool === TOOLS.CROP && cropRect && cropRect.w > 5 && (
            <button
              onClick={applyCrop}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-green-400 bg-green-50 text-green-700 hover:bg-green-100"
            >
              <Check className="w-4 h-4" /> Apply Crop
            </button>
          )}

          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-4 h-4" /> Undo
          </button>

          <button
            onClick={() => replaceInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <Upload className="w-4 h-4" /> Replace
          </button>
          <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplace} className="hidden" />
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={handleSave}
            className="flex-1 text-white"
            style={{ background: themeColor }}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}