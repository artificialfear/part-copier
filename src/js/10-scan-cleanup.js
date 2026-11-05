/* ---------------------------------------------------------------- scan cleanup */
function newCanvas(w, h){ const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function ctx2d(c){ return c.getContext("2d", { willReadFrequently: true }); }
function toGray(img){
  const d = img.data, g = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i]*299 + d[i+1]*587 + d[i+2]*114) / 1000;
  return g;
}
function otsu(g){
  const hist = new Array(256).fill(0); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 160; const total = g.length;
  for (let i = 0; i < 256; i++){
    wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best){ best = v; t = i; }
  }
  return t;
}
// Ink/paper threshold that can never fall inside the paper's own grey noise (blank or nearly blank pages)
function inkThreshold(g, darkness){
  const hist = new Uint32Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let acc = 0, med = 255; for (let v = 0; v < 256; v++){ acc += hist[v]; if (acc >= g.length / 2){ med = v; break; } }
  return Math.max(30, Math.min(235, Math.min(otsu(g), med - 40) + darkness));
}
function estimateSkew(src){
  const W = 900, sc = W / src.width, H = Math.round(src.height * sc);
  const c = newCanvas(W, H), x = ctx2d(c);
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.drawImage(src, 0, 0, W, H);
  const g = toGray(x.getImageData(0, 0, W, H)), t = inkThreshold(g, 0);
  const xs = [], ys = [], mx = W * 0.06, my = H * 0.06;
  for (let y = my | 0; y < H - my; y++) for (let xx = mx | 0; xx < W - mx; xx++) if (g[y*W + xx] < t){ xs.push(xx); ys.push(y); }
  if (xs.length < 500) return 0;
  const score = deg => {
    const k = Math.tan(deg * Math.PI / 180), bins = new Float64Array(H * 2 + 50);
    for (let i = 0; i < xs.length; i++){ const b = Math.round(ys[i] - xs[i] * k) + H; if (b >= 0 && b < bins.length) bins[b]++; }
    let s = 0; for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i]; return s;
  };
  let best = 0, bestS = -1;
  for (let a = -4; a <= 4.0001; a += 0.2){ const s = score(a); if (s > bestS){ bestS = s; best = a; } }
  const c0 = best; for (let a = c0 - 0.2; a <= c0 + 0.2001; a += 0.04){ const s = score(a); if (s > bestS){ bestS = s; best = a; } }
  return Math.abs(best) < 0.08 ? 0 : best;
}
function rotateCanvas(src, deg){
  const r = Math.abs(deg) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const c = newCanvas(src.width * cs + src.height * sn, src.width * sn + src.height * cs), x = ctx2d(c);
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
// Whiten SOLID dark areas touching the scan border (scanner shadows, wedges from crooked feeds), thin lines hugging
// a border (lid/feeder edge) and tiny specks at the very edge (staples, punch holes). Music that runs to the edge
// is sparse — staff lines with lots of white between them — and is left alone.
function removeEdges(dark, W, H, opt){
  let removed = 0;
  const zone = Math.round(Math.min(W, H) * 0.08), minThick = Math.max(4, Math.round(Math.min(W, H) / 2550 * 7));
  const speckMax = Math.round((opt.dpi / 300) * (opt.dpi / 300) * 60), edgeBand = Math.round(Math.min(W, H) * 0.01);
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  const inZone = i => { const y = (i / W) | 0, xx = i - y * W; return xx < zone || y < zone || xx >= W - zone || y >= H - zone; };
  const flood = s => {
    let head = 0, tail = 0, minx = W, maxx = 0, miny = H, maxy = 0, interior = 0;
    q[tail++] = s; seen[s] = 1;
    const r = Math.max(2, Math.round(opt.dpi / 75));          // ~1/75": thicker than any staff line or stem
    while (head < tail){
      const i = q[head++], y = (i / W) | 0, xx = i - y * W;
      if (xx < minx) minx = xx; if (xx > maxx) maxx = xx; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (xx >= r && xx < W - r && y >= r && y < H - r && dark[i - r] && dark[i + r] && dark[i - r*W] && dark[i + r*W]) interior++;
      const nb = [xx > 0 ? i - 1 : -1, xx < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const n of nb) if (n >= 0 && !seen[n] && dark[n] && inZone(n)){ seen[n] = 1; q[tail++] = n; }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1, long = Math.max(bw, bh), density = interior / tail;
    const nearL = minx < edgeBand, nearR = maxx >= W - edgeBand, nearT = miny < edgeBand, nearB = maxy >= H - edgeBand;
    const solid = tail > 50 && tail / long >= minThick && density >= 0.6;     // mostly solid black: shadow / wedge
    const speck = tail <= speckMax && (nearL || nearR || nearT || nearB) && bw < edgeBand * 2 && bh < edgeBand * 2;
    const edgeLine = (bw <= edgeBand && (nearL || nearR) && bh > H * 0.12) || (bh <= edgeBand && (nearT || nearB) && bw > W * 0.12)
      // slanted or broken paper-edge shadow: a thin sliver running along the border
      || ((nearL || nearR) && bh > H * 0.03 && bh > bw * 4 && tail / long < minThick)
      || ((nearT || nearB) && bw > W * 0.03 && bw > bh * 4 && tail / long < minThick);
    if (solid || speck || edgeLine){ for (let k = 0; k < tail; k++) dark[q[k]] = 0; removed += tail; }
  };
  for (let xx = 0; xx < W; xx++){ for (const y of [0, H - 1]){ const i = y * W + xx; if (dark[i] && !seen[i]) flood(i); } }
  for (let y = 0; y < H; y++){ for (const xx of [0, W - 1]){ const i = y * W + xx; if (dark[i] && !seen[i]) flood(i); } }
  return removed;
}
async function cleanPage(pdfPage, opt){
  const vp0 = pdfPage.getViewport({ scale: 1 });
  let scale = opt.dpi / 72;
  const maxSide = 5200; if (Math.max(vp0.width, vp0.height) * scale > maxSide) scale = maxSide / Math.max(vp0.width, vp0.height);
  const vp = pdfPage.getViewport({ scale });
  let c = newCanvas(vp.width, vp.height); let x = ctx2d(c);
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await pdfPage.render({ canvasContext: x, viewport: vp }).promise;
  // 1) remove scanner shadows / wedges / edge lines while they are still aligned with the scan frame
  let removed = 0, t0 = 160, blankDet = false;
  const touched = { top: 0, bottom: 0, left: 0, right: 0 };
  {
    const W0 = c.width, H0 = c.height, img0 = x.getImageData(0, 0, W0, H0), g0 = toGray(img0);
    t0 = inkThreshold(g0, opt.darkness);
    const mask = new Uint8Array(W0 * H0); for (let i = 0; i < g0.length; i++) mask[i] = g0[i] < t0 ? 1 : 0;
    // detection copy: scanner artifacts removed, used for the blank-page and cut-off checks either way
    const det = mask.slice();
    const artifacts = removeEdges(det, W0, H0, opt);
    let detInk = 0; for (let j = 0; j < det.length; j++) detInk += det[j];
    blankDet = detInk / (W0 * H0) < 0.0012;
    if (opt.edges && artifacts){
      removed = artifacts;
      const d0 = img0.data;
      for (let j = 0; j < mask.length; j++) if (mask[j] && !det[j]){ const i = j * 4; d0[i] = d0[i+1] = d0[i+2] = 255; }
      x.putImageData(img0, 0, 0);
    }
    // does real ink still reach an edge of the scan? then the scan itself probably cut the music off
    const band = Math.max(2, Math.round(Math.min(W0, H0) * 0.006));
    const edgeInk = side => {
      let n = 0, len;
      if (side === "top" || side === "bottom"){ len = W0; const y0 = side === "top" ? 0 : H0 - band; for (let y = y0; y < y0 + band; y++) for (let xx = 0; xx < W0; xx++) n += det[y*W0 + xx]; }
      else { len = H0; const x0 = side === "left" ? 0 : W0 - band; for (let y = 0; y < H0; y++) for (let xx = x0; xx < x0 + band; xx++) n += det[y*W0 + xx]; }
      return n / (band * len);
    };
    for (const side of ["top", "bottom", "left", "right"]) touched[side] = edgeInk(side);
  }
  // 2) straighten (the canvas grows so corners aren't cut off)
  let angle = 0;
  if (opt.deskew){ angle = estimateSkew(c); if (angle) { c = rotateCanvas(c, -angle); x = ctx2d(c); } }
  // 3) final black & white / grayscale mask on the straightened page
  const W = c.width, H = c.height, img = x.getImageData(0, 0, W, H), g = toGray(img);
  const t = t0;
  const dark = new Uint8Array(W * H); for (let i = 0; i < g.length; i++) dark[i] = g[i] < t ? 1 : 0;
  // content box (ignore specks) + blank test
  const rows = new Uint32Array(H), cols = new Uint32Array(W); let inked = 0;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (dark[y*W + xx]){ rows[y]++; cols[xx]++; inked++; }
  const rowMin = Math.max(3, W * 0.003), colMin = Math.max(3, H * 0.003);
  let top = 0, bot = H - 1, left = 0, right = W - 1;
  while (top < H && rows[top] < rowMin) top++;
  while (bot > top && rows[bot] < rowMin) bot--;
  while (left < W && cols[left] < colMin) left++;
  while (right > left && cols[right] < colMin) right--;
  const blank = blankDet || inked / (W * H) < 0.0012 || top >= bot || left >= right;
  // write cleaned pixels
  const d = img.data;
  for (let i = 0, j = 0; j < g.length; i += 4, j++){
    let v;
    if (opt.mode === "bw") v = dark[j] ? 0 : 255;
    else v = !dark[j] && g[j] >= t ? 255 : Math.max(0, Math.round(g[j] * g[j] / Math.max(t, 1)));
    if (opt.mode !== "bw" && !dark[j] && g[j] < t) v = 255;
    d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255;
  }
  x.putImageData(img, 0, 0);
  let out = c, ptsW = vp0.width, ptsH = vp0.height;
  if (opt.fit === "letter" && !blank){
    const pad = Math.round(opt.dpi * 0.08), landscape = (right - left) > (bot - top) * 1.15;
    const cx = Math.max(0, left - pad), cy = Math.max(0, top - pad), cw = Math.min(W, right + pad) - cx, ch = Math.min(H, bot + pad) - cy;
    ptsW = landscape ? 792 : 612; ptsH = landscape ? 612 : 792;
    const OW = Math.round(ptsW / 72 * opt.dpi), OH = Math.round(ptsH / 72 * opt.dpi), m = Math.round(opt.dpi * 0.3);
    const s = Math.min((OW - 2*m) / cw, (OH - 2*m) / ch, 1.15);
    out = newCanvas(OW, OH); const ox = ctx2d(out);
    ox.fillStyle = "#fff"; ox.fillRect(0, 0, OW, OH); ox.imageSmoothingQuality = "high";
    ox.drawImage(c, cx, cy, cw, ch, Math.round((OW - cw*s) / 2), m, Math.round(cw*s), Math.round(ch*s));
    if (opt.mode === "bw"){
      const im = ox.getImageData(0, 0, OW, OH), dd = im.data;
      for (let i = 0; i < dd.length; i += 4){ const v = dd[i] < 150 ? 0 : 255; dd[i] = dd[i+1] = dd[i+2] = v; }
      ox.putImageData(im, 0, 0);
    }
  }
  const cutSides = Object.entries(touched).filter(([, v]) => v > 0.004).map(([k]) => k);
  return { canvas: out, blank, angle, ptsW, ptsH, removed, touched, cutSides: blank ? [] : cutSides };
}
const canvasBytes = (c, type, q) => new Promise(res => c.toBlob(b => b.arrayBuffer().then(res), type, q));
function cleanOpts(){ const o = Object.assign({}, S().clean); o.dpi = +o.dpi; o.darkness = +o.darkness; return o; }
function renderCleanSettings(){
  const o = S().clean;
  $("clDeskew").checked = o.deskew; $("clMode").value = o.mode; $("clDark").value = o.darkness; $("clDarkVal").textContent = (o.darkness > 0 ? "+" : "") + o.darkness;
  $("clEdges").checked = o.edges; $("clBlanks").checked = o.blanks; $("clFit").value = o.fit; $("clDpi").value = String(o.dpi);
}
$("cleanBox").addEventListener("input", e => {
  if (!e.target.id || !e.target.id.startsWith("cl") || e.target.id === "clPreviewPage") return;
  const o = S().clean;
  o.deskew = $("clDeskew").checked; o.mode = $("clMode").value; o.darkness = +$("clDark").value;
  o.edges = $("clEdges").checked; o.blanks = $("clBlanks").checked; o.fit = $("clFit").value; o.dpi = +$("clDpi").value;
  $("clDarkVal").textContent = (o.darkness > 0 ? "+" : "") + o.darkness;
  persist();
});
async function sourcePdf(){
  if (!state.original) return state.pdf;
  if (!state.originalPdf) state.originalPdf = await pdfjsLib.getDocument({ data: new Uint8Array(state.original.bytes.slice(0)) }).promise;
  return state.originalPdf;
}
$("clPreview").addEventListener("click", async () => {
  const doc = await sourcePdf(), n = Math.min(doc.numPages, Math.max(1, parseInt($("clPreviewPage").value, 10) || 1));
  $("cleanStatus").textContent = `Previewing page ${n}…`;
  try {
    const page = await doc.getPage(n), vp = page.getViewport({ scale: 400 / page.getViewport({ scale: 1 }).width });
    const b = $("clBefore"); b.width = vp.width; b.height = vp.height;
    const bx = b.getContext("2d"); bx.fillStyle = "#fff"; bx.fillRect(0, 0, b.width, b.height);
    await page.render({ canvasContext: bx, viewport: vp }).promise;
    const r = await cleanPage(page, cleanOpts()), a = $("clAfter");
    a.width = 400; a.height = Math.round(400 * r.canvas.height / r.canvas.width);
    const ax = a.getContext("2d"); ax.imageSmoothingQuality = "high"; ax.drawImage(r.canvas, 0, 0, a.width, a.height);
    $("clPreviewBox").hidden = false;
    $("cleanStatus").textContent = r.blank ? `Page ${n} looks blank — it would be removed.` : `Page ${n}${r.angle ? ` straightened by ${Math.abs(r.angle).toFixed(1)}°` : " didn't need straightening"}.` +
      (r.cutSides.length ? ` The music runs to the ${r.cutSides.join(" and ")} edge of the scan — part of it may have been cut off when it was scanned.` : "");
  } catch (err) { $("cleanStatus").textContent = "Preview failed: " + (err && err.message || err); }
});
$("clRun").addEventListener("click", async () => {
  const btn = $("clRun"); btn.disabled = true;
  try {
    if (!state.original) state.original = { bytes: state.bytes, name: state.fileName, segs: (state.knownParts || !state.scanned) ? [...state.starts.entries()].map(([start, s]) => ({ start, label: s.label, fam: s.famManual || s.fam !== "Other" ? s.fam : null })) : null };
    const doc = await sourcePdf(), opt = cleanOpts(), out = await PDFLib.PDFDocument.create();
    const removed = []; let straightened = 0; const cut = [];
    for (let i = 1; i <= doc.numPages; i++){
      $("cleanStatus").textContent = `Cleaning page ${i} of ${doc.numPages}…`; setProgress(i / doc.numPages);
      const page = await doc.getPage(i), r = await cleanPage(page, opt);
      if (r.blank && opt.blanks){ removed.push(i); page.cleanup(); continue; }
      if (r.angle) straightened++;
      if (r.cutSides.length) cut.push({ page: i, sides: r.cutSides });
      const bytes = opt.mode === "bw" ? await canvasBytes(r.canvas, "image/png") : await canvasBytes(r.canvas, "image/jpeg", 0.85);
      const img = opt.mode === "bw" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const pg = out.addPage([r.ptsW, r.ptsH]); pg.drawImage(img, { x: 0, y: 0, width: r.ptsW, height: r.ptsH });
      r.canvas.width = r.canvas.height = 1; page.cleanup();
    }
    setProgress(null);
    if (!out.getPageCount()){ $("cleanStatus").textContent = "Every page looked blank — try raising Darkness."; return; }
    const bytes = await out.save();
    const name = state.original.name.replace(/\.pdf$/i, "") + " (cleaned).pdf";
    state.cleanInfo = { bytes, name, removed, straightened, total: doc.numPages };
    let segs = null;
    if (state.original.segs){
      const keptBefore = n => { let k = 0; for (let i = 1; i < n; i++) if (!removed.includes(i)) k++; return k; };
      const orig = state.original.segs;
      segs = orig.map((s, i) => {
        const end = i + 1 < orig.length ? orig[i+1].start - 1 : doc.numPages;
        let keep = 0; for (let pgn = s.start; pgn <= end; pgn++) if (!removed.includes(pgn)) keep++;
        return keep ? Object.assign({}, s, { start: keptBefore(s.start) + 1 }) : null;
      }).filter(Boolean);
    }
    await openFile(new File([bytes], state.original.name, { type: "application/pdf" }), { cleaned: true, segs });
    $("cleanStatus").textContent = `Cleaned ${doc.numPages - removed.length} page${doc.numPages - removed.length === 1 ? "" : "s"}` +
      (straightened ? ` · straightened ${straightened}` : "") +
      (removed.length ? ` · removed ${removed.length} blank (original p. ${removed.join(", ")})` : "") +
      ". The parts below now use the cleaned pages." +
      (cut.length ? `\n\nHeads-up: the music runs off the edge of the original scan on ${cut.length} page${cut.length === 1 ? "" : "s"} (${cut.map(c => `p. ${c.page} ${c.sides.join("/")}`).join(", ")}), so a sliver was cut off when it was scanned — usually 9×12 parts scanned at letter size. Cleanup can't bring that back. If anything important is missing, rescan those parts with the copier's original size set to Auto/Mixed or 11×17.` : "");
    $("cleanActions").hidden = false;
  } catch (err) {
    setProgress(null); $("cleanStatus").textContent = "Cleanup failed: " + (err && err.message || err);
  } finally { btn.disabled = false; }
});
$("clDownload").addEventListener("click", () => {
  if (!state.cleanInfo) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([state.cleanInfo.bytes], { type: "application/pdf" }));
  a.download = state.cleanInfo.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
});
$("clUndo").addEventListener("click", async () => {
  if (!state.original) return;
  const o = state.original; state.original = null; state.originalPdf = null; state.cleanInfo = null;
  await openFile(new File([o.bytes], o.name, { type: "application/pdf" }), { segs: o.segs, keepMerge: true });
  $("cleanBox").open = true; $("cleanStatus").textContent = "Back to the original scan.";
});

