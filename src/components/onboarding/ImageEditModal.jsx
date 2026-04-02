import React, { useState, useRef, useEffect } from 'react';
import { X, RotateCw, Crop, Undo2, ImagePlus, Check, Save, Trash2 } from 'lucide-react';

const TOOLS = { NONE: 'none', CROP: 'crop' };

export default function ImageEditModal({ src, themeColor, onSave, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const replaceInputRef = useRef(null);

  const [history, setHistory] = useState([{ imageSrc: src, rotation: 0 }]);
  const [current, setCurrent] = useState({ imageSrc: src, rotation: 0 });
  const [tool, setTool] = useState(TOOLS.NONE);
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 300, h: 300 });

  const imgRef = useRef(new Image());

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const container = containerRef.current;
      const maxW = container ? container.offsetWidth - 32 : 320;
      const maxH = 300;
      let w = img.naturalWidth, h = img.naturalHeight;
      const swapped = current.rotation % 180 !== 0;
      const dW = swapped ? h : w, dH = swapped ? w : h;
      const scale = Math.min(maxW / dW, maxH / dH, 1);
      const cw = Math.round(dW * scale), ch = Math.round(dH * scale);
      setCanvasSize({ w: cw, h: ch });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((current.rotation * Math.PI) / 180);
      const drawW = swapped ? ch : cw, drawH = swapped ? cw : ch;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };
    img.src = current.imageSrc;
  }, [current]);

  const pushHistory = (newState) => {
    setHistory(prev => [...prev, newState]);
    setCurrent(newState);
    setTool(TOOLS.NONE);
    setCropStart(null); setCropEnd(null);
  };

  const handleRotate = () => pushHistory({ ...current, rotation: (current.rotation + 90) % 360 });

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    setCurrent(newHistory[newHistory.length - 1]);
    setTool(TOOLS.NONE); setCropStart(null); setCropEnd(null);
  };

  const handleReplace = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => pushHistory({ imageSrc: reader.result, rotation: 0 });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(clientX - rect.left, canvas.width)),
      y: Math.max(0, Math.min(clientY - rect.top, canvas.height)),
    };
  };

  const onStart = (e) => {
    if (tool !== TOOLS.CROP) return;
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    setIsDragging(true); setCropStart(pos); setCropEnd(pos);
  };

  const onMove = (e) => {
    if (!isDragging || tool !== TOOLS.CROP) return;
    e.preventDefault();
    setCropEnd(getPos(e, canvasRef.current));
  };

  const onEnd = () => setIsDragging(false);

  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    if (w < 5 || h < 5) return;
    const dest = document.createElement('canvas');
    dest.width = w; dest.height = h;
    dest.getContext('2d').drawImage(canvasRef.current, x, y, w, h, 0, 0, w, h);
    pushHistory({ imageSrc: dest.toDataURL(), rotation: 0 });
  };

  const handleSave = () => {
    onSave(canvasRef.current.toDataURL('image/jpeg', 0.92));
    onClose();
  };

  const cropRect = cropStart && cropEnd ? {
    x: Math.min(cropStart.x, cropEnd.x), y: Math.min(cropStart.y, cropEnd.y),
    w: Math.abs(cropEnd.x - cropStart.x), h: Math.abs(cropEnd.y - cropStart.y),
  } : null;

  const isCropping = tool === TOOLS.CROP;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        ref={containerRef}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900 text-base">Edit Image</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center bg-slate-900 py-4 px-4" style={{ minHeight: 220 }}>
          <div
            className="relative inline-block select-none"
            style={{ cursor: isCropping ? 'crosshair' : 'default', touchAction: isCropping ? 'none' : 'auto' }}
            onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          >
            <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%', borderRadius: 8 }} />
            {isCropping && cropRect && cropRect.w > 0 && (
              <>
                <div
                  className="absolute border-2 border-white rounded"
                  style={{
                    left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h,
                    background: 'rgba(255,255,255,0.1)',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                  }}
                />
                {cropRect.w > 5 && cropRect.h > 5 && (
                  <div
                    className="absolute flex gap-2 items-center justify-center"
                    style={{
                      left: cropRect.x + cropRect.w / 2,
                      top: cropRect.y + cropRect.h + 12,
                      transform: 'translateX(-50%)',
                      pointerEvents: 'auto',
                    }}
                  >
                    <button
                      onClick={applyCrop}
                      className="bg-green-500 hover:bg-green-600 text-white p-1.5 rounded-full shadow-lg transition-colors"
                      title="Apply crop"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setTool(TOOLS.NONE); setCropStart(null); setCropEnd(null); }}
                      className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg transition-colors"
                      title="Cancel crop"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>



        {/* Tool buttons */}
        <div className="grid grid-cols-5 gap-px bg-slate-100 border-t border-slate-100">
          {[
            { label: 'Rotate', icon: RotateCw, action: handleRotate },
            {
              label: isCropping ? 'Cancel' : 'Crop', icon: Crop,
              action: () => {
                if (isCropping) {
                  setTool(TOOLS.NONE); setCropStart(null); setCropEnd(null);
                } else {
                  setTool(TOOLS.CROP);
                  // Set default centered 1:1 box
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const side = Math.round(Math.min(canvas.width, canvas.height) * 0.7);
                    const cx = Math.round(canvas.width / 2);
                    const cy = Math.round(canvas.height / 2);
                    setCropStart({ x: cx - side / 2, y: cy - side / 2 });
                    setCropEnd({ x: cx + side / 2, y: cy + side / 2 });
                  }
                }
              },
              active: isCropping,
            },
            { label: 'Undo', icon: Undo2, action: handleUndo, disabled: history.length <= 1 },
            { label: 'Replace', icon: ImagePlus, action: () => replaceInputRef.current?.click() },
            { label: 'Delete', icon: Trash2, action: () => { onSave(null); onClose(); }, danger: true },
          ].map(({ label, icon: Icon, action, active, disabled, danger }) => (
            <button
              key={label}
              onClick={action}
              disabled={disabled}
              className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors
                ${active ? 'bg-blue-50 text-blue-600' : danger ? 'bg-white text-red-500 hover:bg-red-50' : 'bg-white text-slate-600 hover:bg-slate-50'}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>



        {/* Footer */}
        <div className="flex gap-3 px-4 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: themeColor }}
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </div>

        <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplace} className="hidden" />
      </div>
    </div>
  );
}