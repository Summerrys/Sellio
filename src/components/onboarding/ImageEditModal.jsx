import React, { useState, useRef, useEffect } from 'react';
import { X, RotateCw, Crop, Undo2, ImagePlus, Check, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

const TOOLS = { NONE: 'none', CROP: 'crop' };
const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16/9 },
  { label: '4:3', value: 4/3 },
];

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
  const [dragMode, setDragMode] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 300, h: 300 });
  const [zoom, setZoom] = useState(1);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [dragOffset, setDragOffset] = useState(null);
  const [dragDimensions, setDragDimensions] = useState(null);

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
    setCropStart(null); setCropEnd(null); setAspectRatio(null);
  };

  const handleRotateByDegree = (degrees) => pushHistory({ ...current, rotation: (degrees + 360) % 360 });

  const handleUndo = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    setCurrent(newHistory[newHistory.length - 1]);
    setTool(TOOLS.NONE); setCropStart(null); setCropEnd(null); setAspectRatio(null);
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
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const onStart = (e) => {
    if (tool !== TOOLS.CROP) return;
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    const canvas = canvasRef.current;
    if (!cropStart || !cropEnd) { setIsDragging(true); setCropStart(pos); setCropEnd(pos); return; }
    
    const x = Math.min(cropStart.x, cropEnd.x), y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x), h = Math.abs(cropEnd.y - cropStart.y);
    const handle = 8;
    
    if (Math.abs(pos.x - x) < handle && Math.abs(pos.y - y) < handle) setDragMode('corner-tl');
    else if (Math.abs(pos.x - (x + w)) < handle && Math.abs(pos.y - y) < handle) setDragMode('corner-tr');
    else if (Math.abs(pos.x - x) < handle && Math.abs(pos.y - (y + h)) < handle) setDragMode('corner-bl');
    else if (Math.abs(pos.x - (x + w)) < handle && Math.abs(pos.y - (y + h)) < handle) setDragMode('corner-br');
    else if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
     setDragMode('move');
     setDragOffset({ x: pos.x - x, y: pos.y - y });
     setDragDimensions({ w, h });
    }
    else { setIsDragging(true); setCropStart(pos); setCropEnd(pos); return; }
    
    setIsDragging(true);
  };

  const onMove = (e) => {
    if (!isDragging || tool !== TOOLS.CROP) return;
    e.preventDefault();
    let pos = getPos(e, canvasRef.current);
    const canvas = canvasRef.current;
    pos = { x: Math.max(0, Math.min(pos.x, canvas.width)), y: Math.max(0, Math.min(pos.y, canvas.height)) };
    
    if (!dragMode) { 
      setCropEnd(pos); 
      return; 
    }
    
    const x1 = Math.min(cropStart.x, cropEnd.x), y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x), y2 = Math.max(cropStart.y, cropEnd.y);
    const w = x2 - x1, h = y2 - y1;
    
    if (dragMode === 'move' && dragOffset && dragDimensions) {
      const { w: dw, h: dh } = dragDimensions;
      const nx = Math.max(0, Math.min(pos.x - dragOffset.x, canvas.width - dw));
      const ny = Math.max(0, Math.min(pos.y - dragOffset.y, canvas.height - dh));
      setCropStart({ x: nx, y: ny });
      setCropEnd({ x: nx + dw, y: ny + dh });
    } else if (dragMode === 'corner-tl') {
      let newStart = pos;
      let newEnd = { x: cropEnd.x, y: cropEnd.y };
      if (aspectRatio) {
        const newW = newEnd.x - newStart.x, newH = newEnd.y - newStart.y;
        if (Math.abs(newW) > Math.abs(newH)) {
          const targetH = newW / aspectRatio;
          newStart.y = newEnd.y - targetH;
        } else {
          const targetW = newH * aspectRatio;
          newStart.x = newEnd.x - targetW;
        }
      }
      setCropStart(newStart);
    } else if (dragMode === 'corner-tr') {
      let newStart = { x: cropStart.x, y: pos.y };
      let newEnd = { x: pos.x, y: cropEnd.y };
      if (aspectRatio) {
        const newW = newEnd.x - newStart.x, newH = newEnd.y - newStart.y;
        if (Math.abs(newW) > Math.abs(newH)) {
          const targetH = newW / aspectRatio;
          newStart.y = newEnd.y - targetH;
        } else {
          const targetW = newH * aspectRatio;
          newEnd.x = newStart.x + targetW;
        }
      }
      setCropStart(newStart);
      setCropEnd(newEnd);
    } else if (dragMode === 'corner-bl') {
      let newStart = { x: pos.x, y: cropStart.y };
      let newEnd = { x: cropEnd.x, y: pos.y };
      if (aspectRatio) {
        const newW = newEnd.x - newStart.x, newH = newEnd.y - newStart.y;
        if (Math.abs(newW) > Math.abs(newH)) {
          const targetH = newW / aspectRatio;
          newEnd.y = newStart.y + targetH;
        } else {
          const targetW = newH * aspectRatio;
          newStart.x = newEnd.x - targetW;
        }
      }
      setCropStart(newStart);
      setCropEnd(newEnd);
    } else if (dragMode === 'corner-br') {
      let newEnd = pos;
      if (aspectRatio && cropStart) {
        const newW = newEnd.x - cropStart.x, newH = newEnd.y - cropStart.y;
        const targetH = newW / aspectRatio;
        newEnd = { x: newEnd.x, y: cropStart.y + targetH };
      }
      setCropEnd(newEnd);
    }
  };

  const onEnd = () => { setIsDragging(false); setDragMode(null); setDragOffset(null); setDragDimensions(null); };

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
    const imageData = tool === TOOLS.CROP && cropStart && cropEnd ? 
      (() => {
        const x = Math.min(cropStart.x, cropEnd.x);
        const y = Math.min(cropStart.y, cropEnd.y);
        const w = Math.abs(cropEnd.x - cropStart.x);
        const h = Math.abs(cropEnd.y - cropStart.y);
        const dest = document.createElement('canvas');
        dest.width = w; dest.height = h;
        dest.getContext('2d').drawImage(canvasRef.current, x, y, w, h, 0, 0, w, h);
        return dest.toDataURL('image/jpeg', 0.92);
      })()
      : canvasRef.current.toDataURL('image/jpeg', 0.92);
    onSave(imageData);
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
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900 text-base">Edit Image</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        {isCropping && (
          <div className="px-4 py-3 border-b border-slate-100 space-y-3">
            {/* Aspect Ratio Presets */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Aspect Ratio</p>
              <div className="flex gap-1 flex-wrap">
                {ASPECT_RATIOS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => setAspectRatio(preset.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      aspectRatio === preset.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-slate-900 px-4 py-4 overflow-auto">
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
                  className="absolute border-2 border-white rounded cursor-move"
                  style={{
                    left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h,
                    background: 'rgba(255,255,255,0.1)',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    pointerEvents: 'auto',
                  }}
                />
                {[{x: cropRect.x, y: cropRect.y, cursor: 'nwse-resize'}, {x: cropRect.x + cropRect.w, y: cropRect.y, cursor: 'nesw-resize'}, {x: cropRect.x, y: cropRect.y + cropRect.h, cursor: 'nesw-resize'}, {x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h, cursor: 'nwse-resize'}].map((h, i) => (
                  <div key={i} className="absolute w-3 h-3 bg-white border border-slate-800 rounded-full" style={{ left: h.x - 6, top: h.y - 6, cursor: h.cursor, pointerEvents: 'auto' }} />
                ))}
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
                      onClick={() => { setTool(TOOLS.NONE); setCropStart(null); setCropEnd(null); setAspectRatio(null); }}
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
            { label: 'Undo', icon: Undo2, action: handleUndo, disabled: history.length <= 1 },
            { label: 'Rotate', icon: RotateCw, action: () => handleRotateByDegree((current.rotation + 90) % 360) },
            {
              label: 'Crop', icon: Crop,
              action: () => {
                setTool(TOOLS.CROP);
                const canvas = canvasRef.current;
                if (canvas) {
                  const side = Math.round(Math.min(canvas.width, canvas.height) * 0.7);
                  const cx = Math.round(canvas.width / 2);
                  const cy = Math.round(canvas.height / 2);
                  setCropStart({ x: cx - side / 2, y: cy - side / 2 });
                  setCropEnd({ x: cx + side / 2, y: cy + side / 2 });
                }
              },
              active: isCropping,
              disabled: isCropping,
            },
            { label: 'Replace', icon: ImagePlus, action: () => replaceInputRef.current?.click() },
            { label: 'Delete', icon: Trash2, action: () => { onSave(null); onClose(); }, danger: true },
          ].map(({ label, icon: Icon, action, active, disabled, danger }) => (
            <button
              key={label}
              onClick={action}
              disabled={disabled}
              className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${active ? 'bg-blue-50 text-blue-600' : danger ? 'bg-white text-red-500 hover:bg-red-50' : 'bg-white text-slate-600 hover:bg-slate-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
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