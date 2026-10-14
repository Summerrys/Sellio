// Walkable-ground grid and A* paths for Mochi. One cell per metre over the
// island: 1 = walkable. Polygons are filled with a scanline, so building the
// grid costs about one pass over each shape's bounding box.

export function createNavGrid(bounds, cell = 1) {
  const x0 = Math.floor(bounds.minX) - 2, y0 = Math.floor(bounds.minY) - 2;
  const w = Math.ceil((bounds.maxX - x0) / cell) + 4, h = Math.ceil((bounds.maxY - y0) / cell) + 4;
  const g = new Uint8Array(w * h);

  function fill(pts, value) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const r0 = Math.max(0, Math.floor((minY - y0) / cell)), r1 = Math.min(h - 1, Math.ceil((maxY - y0) / cell));
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const yc = y0 + (r + 0.5) * cell;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
        for (let c = c0; c <= c1; c++) g[r * w + c] = value;
      }
    }
  }

  const toCell = (x, y) => [Math.floor((x - x0) / cell), Math.floor((y - y0) / cell)];
  const toWorld = (c, r) => [x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell];
  const ok = (c, r) => c >= 0 && r >= 0 && c < w && r < h && g[r * w + c] === 1;
  const walkable = (x, y) => { const [c, r] = toCell(x, y); return ok(c, r); };

  // Nearest walkable cell to a point (spiral search), or null.
  function nearestWalkable(x, y, maxR = 25) {
    const [c, r] = toCell(x, y);
    if (ok(c, r)) return [c, r];
    for (let d = 1; d <= maxR; d++) {
      let best = null, bd = Infinity;
      for (let i = -d; i <= d; i++) for (const [cc, rr] of [[c + i, r - d], [c + i, r + d], [c - d, r + i], [c + d, r + i]]) {
        if (ok(cc, rr)) { const dd = (cc - c) ** 2 + (rr - r) ** 2; if (dd < bd) { bd = dd; best = [cc, rr]; } }
      }
      if (best) return best;
    }
    return null;
  }

  // Straight walk between two points without touching a blocked cell.
  function lineOfSight(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / (cell * 0.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!walkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  // A* over the grid (8 neighbours, octile distance), then string-pulled.
  function findPath(ax, ay, bx, by, maxNodes = 120000) {
    const start = nearestWalkable(ax, ay), goal = nearestWalkable(bx, by);
    if (!start || !goal) return null;
    const goalWorld = toWorld(goal[0], goal[1]);
    if (lineOfSight(ax, ay, goalWorld[0], goalWorld[1])) return [goalWorld];
    const N = w * h, sI = start[1] * w + start[0], gI = goal[1] * w + goal[0];
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hFn = (i) => { const dx = Math.abs(i % w - goal[0]), dy = Math.abs(((i / w) | 0) - goal[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gScore[sI] = 0; push(sI, hFn(sI));
    let visited = 0;
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      if (i === gI) break;
      closed[i] = 1;
      if (++visited > maxNodes) return null;
      const c = i % w, r = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const cc = c + dx, rr = r + dy;
        if (!ok(cc, rr)) continue;
        if (dx && dy && (!ok(c + dx, r) || !ok(c, r + dy))) continue; // no corner cutting
        const j = rr * w + cc, ng = gScore[i] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gScore[j]) { gScore[j] = ng; came[j] = i; push(j, ng + hFn(j)); }
      }
    }
    if (came[gI] === -1 && sI !== gI) return null;
    const cells = [];
    for (let i = gI; i !== -1 && i !== sI; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => toWorld(i % w, (i / w) | 0));
    // String-pull: keep only the corners needed to stay on walkable ground.
    const out = [];
    let ax0 = ax, ay0 = ay, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) if (lineOfSight(ax0, ay0, pts[j][0], pts[j][1])) { far = j; break; }
      out.push(pts[far]); [ax0, ay0] = pts[far]; k = far + 1;
    }
    return out;
  }

  return { fill, walkable, nearestWalkable: (x, y) => { const c = nearestWalkable(x, y); return c ? toWorld(c[0], c[1]) : null; }, lineOfSight, findPath, size: { w, h } };
}
