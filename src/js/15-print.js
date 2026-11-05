/* ---------------------------------------------------------------- strip hidden scan text before printing */
// Phone and tablet scanners (e.g. iPhone "Scan Documents") add an invisible, searchable text layer that
// embeds a separate font for nearly every word — often hundreds per set. Many copiers run out of font
// memory part-way through such a job and stop printing. That layer is never visible on paper, so it is
// removed from the print file. Text that is actually drawn (e.g. engraved music) is never touched.
// Drops only text drawn invisibly (render mode 3 — the "searchable" layer scanners add). Visible text is kept.
// st carries the text render mode and the q/Q stack across the parts of a page's content.
function dropTextBlocks(d, st){
  st = st || { mode: 0, stack: [] };
  const n = d.length, out = []; let i = 0, keep = 0, inText = false, btAt = 0, blockVisible = false, shows = 0, lastNum = null, dropped = 0, kept = 0;
  const delim = c => c <= 32 || c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  while (i < n){
    const c = d[i];
    if (c === 40){ let depth = 1; i++; while (i < n && depth){ if (d[i] === 92){ i += 2; continue; } if (d[i] === 40) depth++; else if (d[i] === 41) depth--; i++; } lastNum = null; continue; }
    if (c === 60 && d[i+1] !== 60){ while (i < n && d[i] !== 62) i++; i++; lastNum = null; continue; }
    if (c === 37){ while (i < n && d[i] !== 10 && d[i] !== 13) i++; continue; }
    if (!delim(c)){
      let j = i; while (j < n && !delim(d[j])) j++;
      const L = j - i, a = d[i], b = d[i+1];
      if (L === 2 && a === 66 && b === 84 && !inText){ inText = true; btAt = i; blockVisible = false; shows = 0; }
      else if (L === 2 && a === 69 && b === 84 && inText){
        inText = false;
        // drop a block only if it draws text and all of it is invisible; blocks that only set fonts stay
        if (blockVisible) kept++;
        else if (shows || st.dropAll){ out.push(d.subarray(keep, btAt)); keep = j; dropped++; }
      }
      else if (L === 2 && a === 84 && b === 114){ if (lastNum !== null) st.mode = lastNum; }
      else if (inText && ((L === 2 && a === 84 && (b === 106 || b === 74)) || (L === 1 && (a === 39 || a === 34)))){ shows++; if (st.mode !== 3) blockVisible = true; }
      else if (L === 1 && a === 113) st.stack.push(st.mode);
      else if (L === 1 && a === 81){ if (st.stack.length) st.mode = st.stack.pop(); }
      let num = true; for (let k = i; k < j; k++){ const ch = d[k]; if (!((ch >= 48 && ch <= 57) || ch === 46 || ch === 45 || ch === 43)){ num = false; break; } }
      lastNum = num ? parseFloat(String.fromCharCode.apply(null, d.subarray(i, j))) : null;
      i = j; continue;
    }
    i++;
  }
  out.push(d.subarray(keep));
  if (inText && !blockVisible) kept++;     // unterminated block: leave it alone
  const res = new Uint8Array(out.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of out){ res.set(x, o); o += x.length; }
  return { bytes: res, dropped, kept };
}
// keep only the fonts the remaining text still uses
function pruneFonts(res, chunks, PDFName, PDFDict){
  const fonts = res && res.lookup(PDFName.of("Font"));
  if (!(fonts instanceof PDFDict)) return;
  let s = ""; for (const b of chunks) for (let i = 0; i < b.length; i += 65536) s += String.fromCharCode.apply(null, b.subarray(i, i + 65536));
  const used = new Set([...s.matchAll(/\/([^\s\/\[\]()<>{}%]+)\s+[-\d.]+\s+Tf\b/g)].map(m => m[1]));
  for (const [k] of fonts.entries()) if (!used.has(k.asString().slice(1))) fonts.delete(k);
}
function stripHiddenText(doc){
  const { PDFName, PDFRawStream, PDFArray, PDFDict, decodePDFRawStream } = PDFLib, ctx = doc.context;
  const done = new Set(); let fixed = 0;
  const write = (stream, bytes) => {
    const z = ctx.flateStream(bytes);
    stream.contents = z.contents;
    stream.dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode")); stream.dict.delete(PDFName.of("DecodeParms"));
  };
  const decode = st => { try { return decodePDFRawStream(st).decode(); } catch (e) { return null; } };
  const forms = res => {
    const xo = res && res.lookup(PDFName.of("XObject"));
    if (!(xo instanceof PDFDict)) return;
    for (const [, ref] of xo.entries()){
      const st = ctx.lookup(ref);
      if (!(st instanceof PDFRawStream) || done.has(st)) continue; done.add(st);
      if (String(st.dict.get(PDFName.of("Subtype"))) !== "/Form") continue;
      const fres = st.dict.lookup(PDFName.of("Resources"));
      forms(fres);
      const b = decode(st); if (!b) continue;
      let r = dropTextBlocks(b);
      if (!r.dropped) continue;
      if (!r.kept) r = dropTextBlocks(b, { mode: 0, stack: [], dropAll: true });   // no visible text left: drop font-only blocks too
      write(st, r.bytes); fixed++;
      if (!r.kept && fres instanceof PDFDict) fres.delete(PDFName.of("Font"));
      else if (fres instanceof PDFDict) pruneFonts(fres, [r.bytes], PDFName, PDFDict);
    }
  };
  for (const page of doc.getPages()){
    const res = page.node.Resources();
    forms(res);
    const c = page.node.get(PDFName.of("Contents")), parts = [];
    const one = ctx.lookup(c);
    if (one instanceof PDFArray) one.asArray().forEach(r => parts.push(ctx.lookup(r))); else if (one) parts.push(one);
    if (!parts.length || parts.some(s => !(s instanceof PDFRawStream) || done.has(s))) continue;
    const decoded = parts.map(decode);
    if (decoded.some(b => !b)) continue;
    const st = { mode: 0, stack: [] };
    let results = decoded.map(b => dropTextBlocks(b, st));
    if (!results.some(r => r.dropped)) continue;
    if (!results.some(r => r.kept)){ const s2 = { mode: 0, stack: [], dropAll: true }; results = decoded.map(b => dropTextBlocks(b, s2)); }
    parts.forEach((s, k) => { done.add(s); if (results[k].dropped) write(s, results[k].bytes); });
    fixed++;
    if (res && !results.some(r => r.kept)) res.delete(PDFName.of("Font"));
    else if (res && !(res.lookup(PDFName.of("XObject")) instanceof PDFDict)) pruneFonts(res, results.map(r => r.bytes), PDFName, PDFDict);   // forms may borrow page fonts
  }
  return fixed;
}

/* ---------------------------------------------------------------- where the name box can go */
const inkCache = new Map();
async function inkMap(pageNum){
  const key = state.bytes && state.bytes.byteLength + ":" + pageNum;
  if (inkCache.has(key)) return inkCache.get(key);
  const page = await state.pdf.getPage(pageNum), vp = page.getViewport({ scale: 1 });   // 1 px = 1 pt
  const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const d = ctx.getImageData(0, 0, c.width, c.height).data, ink = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; j < ink.length; i += 4, j++) ink[j] = (d[i] * 0.3 + d[i+1] * 0.59 + d[i+2] * 0.11) < 150 ? 1 : 0;
  const m = { w: c.width, h: c.height, ink };
  if (inkCache.size > 400) inkCache.clear();
  inkCache.set(key, m); c.width = c.height = 1;
  return m;
}
async function stampSpot(pageNum, bw, bh){
  let m; try { m = await inkMap(pageNum); } catch (e) { return null; }
  const pad = 3, inked = (x0, yTop) => {   // x0 / yTop in pixels from the top-left
    let n = 0;
    for (let y = Math.max(0, Math.floor(yTop - pad)); y < Math.min(m.h, Math.ceil(yTop + bh + pad)); y++)
      for (let x = Math.max(0, Math.floor(x0 - pad)); x < Math.min(m.w, Math.ceil(x0 + bw + pad)); x++) if (m.ink[y * m.w + x] && ++n > 3) return true;
    return false;
  };
  const rows = [24, 12, 36].map(t => ({ top: t, y: m.h - t - bh })).concat([24, 12].map(b => ({ top: m.h - b - bh, y: b })));
  for (const r of rows)
    for (let right = m.w - 24; right - bw >= 24; right -= 6)
      if (!inked(right - bw, r.top)) return { right, y: r.y };
  return null;   // nowhere blank: keep the usual top-right corner
}

/* ---------------------------------------------------------------- build the print PDF */
$("buildBtn").addEventListener("click", async () => {
  const btn = $("buildBtn"), status = $("buildStatus");
  btn.disabled = true; status.textContent = "Building…";
  try {
    const { PDFDocument, PDFName, PDFPage, StandardFonts, rgb, degrees } = PDFLib;
    let src;
    try { src = await PDFDocument.load(state.bytes); }
    catch (err) {
      if (/encrypt/i.test(err.message)) { status.textContent = "This PDF is locked by the publisher, so its pages can't be copied into a new file. Print it from the publisher's own viewer instead."; return; }
      throw err;
    }
    let hiddenFixed = 0;
    try { hiddenFixed = stripHiddenText(src); } catch (err) { console.warn("Couldn't remove the hidden scan text:", err); }
    const out = await PDFDocument.create();
    let index = 0;
    const insertRef = (ref, node) => { const parent = out.catalog.insertLeafNode(ref, index++); node.setParent(parent); };
    const rows = printRows();
    let font = null;
    const safe = s => {
      try { font.encodeText(s); return s; }
      catch (e) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, ""); }
    };
    const SIZE = 12, PADX = 6, PADY = 4;
    const boxW = name => font.widthOfTextAtSize(safe(name), SIZE) + 2*PADX, BOXH = SIZE + 2*PADY;
    const stamp = (page, name, spot) => {
      const { width, height } = page.getSize(), size = SIZE, padX = PADX, padY = PADY, margin = 24;
      const text = safe(name), tw = font.widthOfTextAtSize(text, size);
      const bw = tw + 2*padX, bh = size + 2*padY;
      let bx = width - margin - bw, by = height - margin - bh;
      if (spot){ bx = spot.right - bw; by = spot.y; }
      page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: rgb(1,1,1), borderColor: rgb(0,0,0), borderWidth: 0.8 });
      page.drawText(text, { x: bx + padX, y: by + padY + 2, size, font, color: rgb(0,0,0) });
    };
    const srcPages = src.getPages();
    for (const r of rows){
      if (r.copies <= 0) continue;
      if (r.names.length){
        if (!font) font = await out.embedFont(StandardFonts.HelveticaBold);
        const pagesIn = srcPages.slice(r.start - 1, r.end);
        const emb = await out.embedPages(pagesIn);
        // the name goes top-right, unless that would cover something (a QR code, a page number, the part name):
        // then the nearest blank spot along the top, or along the bottom
        const widest = Math.max(...r.print.filter(Boolean).map(boxW), 0);
        const spots = [];
        for (let k = 0; k < pagesIn.length; k++) spots.push(widest ? await stampSpot(r.start + k, widest, BOXH) : null);
        for (const who of r.print){
          let lastSize = null;
          pagesIn.forEach((sp, i) => {
            const e = emb[i], w = e.width, h = e.height, ang = ((sp.getRotation().angle % 360) + 360) % 360;
            const page = PDFPage.create(out);
            if (ang === 90){ page.setSize(h, w); page.drawPage(e, { x: 0, y: w, rotate: degrees(-90) }); }
            else if (ang === 180){ page.setSize(w, h); page.drawPage(e, { x: w, y: h, rotate: degrees(180) }); }
            else if (ang === 270){ page.setSize(h, w); page.drawPage(e, { x: h, y: 0, rotate: degrees(90) }); }
            else { page.setSize(w, h); page.drawPage(e, { x: 0, y: 0 }); }
            if (who) stamp(page, who, spots[i]);
            lastSize = page.getSize();
            insertRef(page.ref, page.node);
          });
          if (S().duplex && r.pages % 2){ const blank = PDFPage.create(out); blank.setSize(lastSize.width, lastSize.height); insertRef(blank.ref, blank.node); }
        }
        continue;
      }
      const idxs = []; for (let p = r.start; p <= r.end; p++) idxs.push(p - 1);
      const copied = await out.copyPages(src, idxs);
      for (let c = 0; c < r.copies; c++){
        for (const pg of copied){
          if (c === 0) insertRef(pg.ref, pg.node);
          else {
            const leaf = pg.node.clone(out.context);
            leaf.delete(PDFName.of("Annots"));
            insertRef(out.context.register(leaf), leaf);
          }
        }
        if (S().duplex && r.pages % 2){
          const last = copied[copied.length - 1], { width, height } = last.getSize();
          const blank = PDFPage.create(out); blank.setSize(width, height);
          insertRef(blank.ref, blank.node);
        }
      }
    }
    const bytes = await out.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    let name = $("outName").value.trim() || "print.pdf"; if (!/\.pdf$/i.test(name)) name += ".pdf";
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    status.textContent = `Done — ${index} pages. Send the file to the copier as one job, single copy.` + (hiddenFixed ? " (Removed the scanner’s hidden text layer, which can make copiers stop part-way.)" : "");
    try {
      const copies = rows.reduce((t, r) => t + (r.copies || 0), 0);
      const who = state.reprintMode ? [...new Set(rows.flatMap(r => r.names || []))].slice(0, 6).join(", ") : "";
      logPrint({ piece: ($("pieceName").value || "").trim() || state.fileName.replace(/\.pdf$/i, ""), ensemble: saved.current, copies, pages: index, reprint: !!state.reprintMode, who });
    } catch (e) { console.warn("print history:", e); }
  } catch (err) {
    status.textContent = "Something went wrong building the PDF: " + (err && err.message || err);
  } finally { btn.disabled = false; }
});

