// ============================================================
//  TRAZOS: convierte el mapa de bordes en líneas dibujables
// ============================================================

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

// Recorre píxeles de borde conectados y los convierte en polilíneas.
export function trazar(bordes, w, h, minLargo = 10) {
  const vis = new Uint8Array(w * h);
  const res = [];

  const esBorde = (x, y) => x >= 0 && y >= 0 && x < w && y < h && bordes[y * w + x] === 1;

  const grado = (x, y) => {
    let c = 0;
    for (let k = 0; k < 8; k++) if (esBorde(x + DX[k], y + DY[k])) c++;
    return c;
  };

  // Avanza desde (x,y) prefiriendo seguir en la misma dirección.
  const avanzar = (x, y, ldx = 0, ldy = 0) => {
    const pts = [];
    let px = x, py = y;
    for (;;) {
      let mejor = -1, puntaje = -Infinity;
      for (let k = 0; k < 8; k++) {
        const nx = px + DX[k], ny = py + DY[k];
        if (!esBorde(nx, ny) || vis[ny * w + nx]) continue;
        const s = DX[k] * ldx + DY[k] * ldy - (k % 2 ? 0.1 : 0);
        if (s > puntaje) { puntaje = s; mejor = k; }
      }
      if (mejor < 0) break;
      px += DX[mejor]; py += DY[mejor];
      vis[py * w + px] = 1;
      pts.push([px, py]);
      ldx = DX[mejor]; ldy = DY[mejor];
    }
    return pts;
  };

  const seguir = (x, y) => {
    vis[y * w + x] = 1;
    const adelante = avanzar(x, y);
    const atras = avanzar(x, y);
    return [...atras.reverse(), [x, y], ...adelante];
  };

  // Primero desde los extremos (curvas abiertas), luego lo que quede (curvas cerradas)
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (bordes[i] !== 1 || vis[i]) continue;
        if (pasada === 0 && grado(x, y) !== 1) continue;
        const pts = seguir(x, y);
        if (pts.length >= minLargo) res.push(pts);
      }
    }
  }
  return res;
}

// Simplificación Ramer-Douglas-Peucker (iterativa).
export function rdp(pts, eps = 1) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps) {
      keep[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Suavizado Chaikin (una pasada), conserva extremos.
export function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Ordena trazos por vecino más cercano para que la "mano" no brinque.
export function ordenar(trazos, inicioX = 0, inicioY = 0) {
  const resto = trazos.slice();
  const out = [];
  let cx = inicioX, cy = inicioY;
  while (resto.length) {
    let mejor = 0, dist = Infinity, invertir = false;
    for (let i = 0; i < resto.length; i++) {
      const t = resto[i];
      const a = t[0], b = t[t.length - 1];
      const da = (a[0] - cx) ** 2 + (a[1] - cy) ** 2;
      const db = (b[0] - cx) ** 2 + (b[1] - cy) ** 2;
      if (da < dist) { dist = da; mejor = i; invertir = false; }
      if (db < dist) { dist = db; mejor = i; invertir = true; }
    }
    let t = resto.splice(mejor, 1)[0];
    if (invertir) { const g = t.ancho; t = t.slice().reverse(); t.ancho = g; }
    out.push(t);
    const fin = t[t.length - 1];
    cx = fin[0]; cy = fin[1];
  }
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;

// Polilínea -> atributo "d" de SVG
export function aD(pts) {
  if (pts.length === 1) return `M${r1(pts[0][0])} ${r1(pts[0][1])}L${r1(pts[0][0] + 0.1)} ${r1(pts[0][1])}`;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i][0])} ${r1(pts[i][1])}`;
  return d;
}
