import { useCallback, useEffect, useRef, useState } from 'react';

// A photo that can be pinched to zoom, dragged around once zoomed, and double-tapped to zoom
// in and out again (double-click and ctrl + scroll on a computer). Sellio's apps turn off
// zooming the page itself (index.html), so photos zoom here instead.
//
// At normal size, one finger is left alone: a swipe still goes to the next photo, whether the
// viewer swipes with its own touch handlers or scrolls. Once zoomed, every touch on the photo
// is the photo's, so a drag moves the photo instead of changing it.
//
// onTap: a single tap at normal size (after the moment a double tap would take); a viewer
// that closes on a tap passes its close here. onZoomChange(zoomed): a viewer that scrolls
// between photos stops scrolling while one is zoomed.

export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const DOUBLE_TAP_MS = 300;

// The view is translate(x, y) then scale(s), from the box's top-left corner. `box` is the
// box's size; `pic` is where the picture sits in the box at normal size. The picture never
// leaves a gap at an edge it could cover, and is centred along a side where it's smaller
// than the box.
export function clampView({ s, x, y }, box, pic, maxScale = MAX_SCALE) {
  const scale = Math.min(maxScale, Math.max(1, s));
  const along = (pos, size, start, extent) => {
    const scaled = extent * scale;
    if (scaled <= size) return (size - scaled) / 2 - start * scale;
    return Math.min(-start * scale, Math.max(size - (start + extent) * scale, pos));
  };
  return {
    s: scale,
    x: along(x, box.width, pic.left, pic.width),
    y: along(y, box.height, pic.top, pic.height),
  };
}

// Pinching: the point of the photo first under the fingers' midpoint stays under it.
export function pinchView(start, from, to, distanceFrom, distanceTo) {
  const s = start.s * (distanceTo / Math.max(1, distanceFrom));
  return {
    s,
    x: to.x - (s * (from.x - start.x)) / start.s,
    y: to.y - (s * (from.y - start.y)) / start.s,
  };
}

// Zooming to `s` around a point (a double tap, a scroll): that point stays where it is.
export function zoomAround(view, point, s) {
  return {
    s,
    x: point.x - (s * (point.x - view.x)) / view.s,
    y: point.y - (s * (point.y - view.y)) / view.s,
  };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function ZoomableImage({
  src,
  alt = '',
  className = '',
  style,
  imgClassName = '',
  imgStyle,
  onTap,
  onZoomChange,
  maxScale = MAX_SCALE,
}) {
  const boxRef = useRef(null);
  const layerRef = useRef(null);
  const imgRef = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const zoomedRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const onTapRef = useRef(onTap);
  const onZoomChangeRef = useRef(onZoomChange);
  onTapRef.current = onTap;
  onZoomChangeRef.current = onZoomChange;
  const tapTimer = useRef(null);
  const lastTap = useRef(null);
  const skipClickUntil = useRef(0); // the click a browser sends right after a drag isn't a tap
  const drag = useRef(null);

  const local = useCallback((point) => {
    const rect = boxRef.current.getBoundingClientRect();
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }, []);

  const show = useCallback((next, animate = false) => {
    const box = boxRef.current;
    const layer = layerRef.current;
    const img = imgRef.current;
    if (!box || !layer) return;
    const size = { width: box.clientWidth, height: box.clientHeight };
    const pic = img
      ? { left: img.offsetLeft, top: img.offsetTop, width: img.offsetWidth, height: img.offsetHeight }
      : { left: 0, top: 0, width: size.width, height: size.height };
    const v = clampView(next, size, pic, maxScale);
    const atRest = v.s <= 1.001;
    view.current = atRest ? { s: 1, x: 0, y: 0 } : v;
    layer.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
    layer.style.transform = atRest ? '' : `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
    if (!atRest !== zoomedRef.current) {
      zoomedRef.current = !atRest;
      setZoomed(!atRest);
      onZoomChangeRef.current?.(!atRest);
    }
  }, [maxScale]);

  const reset = useCallback((animate = false) => show({ s: 1, x: 0, y: 0 }, animate), [show]);

  // A new photo, or the screen turned: back to normal size.
  useEffect(() => { reset(); }, [src, reset]);
  useEffect(() => {
    const onResize = () => reset();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [reset]);
  useEffect(() => () => clearTimeout(tapTimer.current), []);

  // Touch. Listeners of its own because a pinch and a zoomed drag must stop the page from
  // scrolling (React's touch listeners can't), and must keep the viewer's own swipe out.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let gesture = null;
    const startPan = (touch) => ({ kind: 'pan', from: local(touch), start: { ...view.current }, moved: false });
    const onStart = (event) => {
      const { touches } = event;
      skipClickUntil.current = 0;
      if (touches.length >= 2) {
        const a = local(touches[0]);
        const b = local(touches[1]);
        gesture = { kind: 'pinch', from: middle(a, b), distance: distance(a, b), start: { ...view.current }, moved: true };
      } else if (touches.length === 1 && zoomedRef.current) {
        gesture = startPan(touches[0]);
      } else {
        gesture = null;
        return;
      }
      event.stopPropagation();
    };
    const onMove = (event) => {
      if (!gesture) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const { touches } = event;
      if (gesture.kind === 'pinch' && touches.length >= 2) {
        const a = local(touches[0]);
        const b = local(touches[1]);
        show(pinchView(gesture.start, gesture.from, middle(a, b), gesture.distance, distance(a, b)));
      } else if (gesture.kind === 'pan' && touches.length === 1) {
        const at = local(touches[0]);
        const dx = at.x - gesture.from.x;
        const dy = at.y - gesture.from.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
        show({ s: gesture.start.s, x: gesture.start.x + dx, y: gesture.start.y + dy });
      }
    };
    const onEnd = (event) => {
      if (!gesture) return;
      event.stopPropagation();
      if (gesture.moved) skipClickUntil.current = Date.now() + 350;
      if (event.touches.length === 1 && zoomedRef.current) {
        gesture = startPan(event.touches[0]); // one finger left after a pinch: it drags on
        gesture.moved = true;
        return;
      }
      if (event.touches.length === 0) {
        if (view.current.s < 1.05) reset(true);
        gesture = null;
      }
    };
    box.addEventListener('touchstart', onStart, { passive: true });
    box.addEventListener('touchmove', onMove, { passive: false });
    box.addEventListener('touchend', onEnd);
    box.addEventListener('touchcancel', onEnd);
    // ctrl + scroll (and a laptop's two-finger pinch, which arrives as one).
    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const v = view.current;
      show(zoomAround(v, local(event), Math.min(maxScale, Math.max(1, v.s * Math.exp(-event.deltaY * 0.01)))));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      box.removeEventListener('touchstart', onStart);
      box.removeEventListener('touchmove', onMove);
      box.removeEventListener('touchend', onEnd);
      box.removeEventListener('touchcancel', onEnd);
      box.removeEventListener('wheel', onWheel);
    };
  }, [local, show, reset, maxScale]);

  // Taps and clicks: a double tap zooms in on that point, or back out; a single tap at normal
  // size goes to onTap once a double tap is no longer possible.
  const onClick = (event) => {
    event.stopPropagation();
    if (Date.now() < skipClickUntil.current) { skipClickUntil.current = 0; return; }
    const at = local(event);
    const now = Date.now();
    const last = lastTap.current;
    clearTimeout(tapTimer.current);
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last, at) < 40) {
      lastTap.current = null;
      if (zoomedRef.current) reset(true);
      else show(zoomAround(view.current, at, Math.min(DOUBLE_TAP_SCALE, maxScale)), true);
      return;
    }
    lastTap.current = { ...at, time: now };
    if (onTapRef.current && !zoomedRef.current) {
      tapTimer.current = setTimeout(() => { lastTap.current = null; onTapRef.current?.(); }, DOUBLE_TAP_MS);
    }
  };

  // A mouse drags a zoomed photo around.
  const onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !zoomedRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { from: local(event), start: { ...view.current }, moved: false };
  };
  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d) return;
    const at = local(event);
    const dx = at.x - d.from.x;
    const dy = at.y - d.from.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    show({ s: d.start.s, x: d.start.x + dx, y: d.start.y + dy });
  };
  const onPointerUp = () => {
    if (drag.current?.moved) skipClickUntil.current = Date.now() + 350;
    drag.current = null;
  };

  return (
    <div
      ref={boxRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: zoomed ? 'none' : 'pan-x pan-y',
        cursor: zoomed ? 'grab' : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
      data-zoomed={zoomed ? '' : undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={layerRef}
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '0 0', willChange: 'transform' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => { if (zoomedRef.current) show(view.current); }}
          className={imgClassName}
          style={imgStyle}
        />
      </div>
    </div>
  );
}
