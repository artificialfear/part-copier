/* ---------------------------------------------------------------- reading part names from page images (OCR) */
let ocrWorker = null, ocrLoading = null, ocrRun = 0;
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s); }); }
async function getOcr(){
  if (ocrWorker) return ocrWorker;
  if (!ocrLoading) ocrLoading = (async () => {
    if (!window.Tesseract) await loadScript("lib/ocr/tesseract.min.js");
    const base = new URL("lib/ocr/", location.href).href;
    // two readers side by side on machines that can afford it (about twice as fast on big sets)
    const n = (navigator.hardwareConcurrency || 2) >= 4 && !(navigator.deviceMemory && navigator.deviceMemory < 4) ? 2 : 1;
    const sched = Tesseract.createScheduler();
    const make = async () => {
      const w = await Tesseract.createWorker("eng", 1, { workerPath: base + "worker.min.js", corePath: base, langPath: base + "lang", gzip: true, workerBlobURL: false });
      await w.setParameters({ tessedit_pageseg_mode: "11" });
      sched.addWorker(w);
    };
    await make();
    if (n > 1) make().catch(() => {});      // the second reader joins when it's ready
    ocrWorker = { recognize: c => sched.addJob("recognize", c), workers: n }; return ocrWorker;
  })().catch(err => { ocrLoading = null; throw err; });
  return ocrLoading;
}
async function ocrHeader(pageNum){
  const c = await renderHeader(pageNum);
  return readHeader(c);
}
async function renderHeader(pageNum){
  const page = await state.pdf.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 }), scale = Math.min(3, 1800 / vp1.width), vp = page.getViewport({ scale });
  const c = newCanvas(vp.width, vp.height * 0.22), x = ctx2d(c);
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  // a tiny picture of the header: two identical copies of a part look the same here
  try {
    const f = newCanvas(160, 36), fx = ctx2d(f); fx.drawImage(c, 0, 0, 160, 36);
    const d = fx.getImageData(0, 0, 160, 36).data, g = new Uint8Array(160 * 36);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] + d[i+1] + d[i+2]) / 3;
    (state.fp = state.fp || {})[pageNum] = g;
  } catch (e) {}
  page.cleanup();
  return c;
}
async function readHeader(c){
  const { data } = await (await getOcr()).recognize(c);
  c.width = c.height = 1;
  let lines = (data.lines || []).filter(l => l.text && l.text.trim()).sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0)).map(l => l.text);
  if (!lines.length) lines = (data.text || "").split("\n");
  return lines.map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
// the left margin of a page: a full score lists every instrument there
async function ocrLeft(pageNum){
  const page = await state.pdf.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 }), scale = Math.min(3, 1800 / vp1.width), vp = page.getViewport({ scale });
  const c = newCanvas(vp.width * 0.2, vp.height), x = ctx2d(c);
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  const { data } = await (await getOcr()).recognize(c);
  return (data.text || "").split("\n").map(s => s.trim()).filter(Boolean);
}
async function findScore(){
  // a part much longer than the rest whose first page lists 5+ instruments down the side is the score
  const segs = segments().filter(s => INSTR_IDS.includes(s.fam));
  if (segs.length < 4) return false;
  const lens = segs.map(s => s.end - s.start + 1).sort((a, b) => a - b), med = lens[Math.floor(lens.length / 2)];
  let changed = false;
  for (const s of segs){
    const n = s.end - s.start + 1;
    if (n < 3 || n < med * 2.5) continue;
    const fams = new Set(classifyAll((await ocrLeft(s.start)).join("\n"))); fams.delete("Percussion");
    if (fams.size >= 5){ Object.assign(state.pageInfo[s.start - 1], { fam: "Score", label: "Score", also: [] }); changed = true; }
  }
  return changed;
}
const titleKey = l => norm(fixOcr(l)).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function flaggedStarts(){ return [...state.starts.entries()].filter(([, s]) => s.unknown || s.guessed || s.inferred || s.fam === "Other").map(([p]) => p); }
async function readPageImages(){
  const junkPages = state.pageInfo.filter(pi => pi.junk).length;
  // a text layer that never names an instrument (part names drawn as artwork, e.g. a Keynote/Pages export) is no help either
  const nameless = state.numPages > 1 && state.pageInfo.every(pi => !pi.fam || pi.fam === "Other");
  const all = (state.scanned || nameless || junkPages >= Math.max(2, state.numPages * 0.1)) && !state.knownParts;
  const pages = all ? Array.from({ length: state.numPages }, (_, i) => i + 1) : flaggedStarts().filter(p => !(state.pageInfo[p-1] || {}).ocr);
  if (!pages.length) return;
  const run = ++ocrRun, box = $("ocrStatus");
  box.hidden = false; box.className = "notice info";
  try {
    box.textContent = "Loading the text reader (first time only)…";
    await getOcr();
    const found = {};
    const t0 = Date.now(), reads = new Array(pages.length), inflight = [];
    let done = 0, reused = 0;
    const tick = () => {
      const left = pages.length - done, secs = done > 2 ? Math.round((Date.now() - t0) / done * left / 1000) : null;
      box.textContent = `Reading part names from the page images… ${done} of ${pages.length}` + (secs ? ` — about ${secs < 60 ? secs + " s" : Math.ceil(secs / 60) + " min"} left` : "");
    };
    for (let k = 0; k < pages.length; k++){
      if (run !== ocrRun) return;
      const c = await renderHeader(pages[k]);
      if (k && pages[k] === pages[k-1] + 1 && sameCopy(pages[k-1], pages[k])){ reads[k] = reads[k-1]; reused++; c.width = c.height = 1; }
      else reads[k] = readHeader(c);
      reads[k].then(() => { done++; tick(); }, () => {});
      inflight.push(reads[k]);
      if (inflight.length >= 3) await inflight.shift();
    }
    for (let k = 0; k < pages.length; k++){
      if (run !== ocrRun) return;
      const lines = await reads[k];
      const res = labelFromLines(lines), pi = state.pageInfo[pages[k] - 1];
      pi.ocr = true;
      if (all){ pi.titleLines = lines.slice(0, 2).map(titleKey); pi.fam = res ? res.fam : undefined; pi.label = res ? res.label : undefined; pi.also = res ? res.also : []; }
      if (res && res.fam !== "Score") found[pages[k]] = res;
    }
    let applied = 0;
    if (all && !state.userTouched){
      state.ocrDone = true; detectStarts();
      box.textContent = "Checking for a full score…";
      try { if (await findScore()) detectStarts(); } catch (e) {}
      if (run !== ocrRun) return;
      buildPageMap();
      applied = [...state.starts.values()].filter(s => INSTR_IDS.includes(s.fam) && !s.guessed && !s.copyOf).length;
    } else {
      for (const [p, s] of state.starts){
        const r = found[p];
        if (!r || !(s.unknown || s.guessed || s.inferred || s.fam === "Other")) continue;
        s.label = r.label; s.fam = r.fam; s.guessed = s.unknown = s.inferred = false; s.fromImage = true; applied++;
      }
      inferNames();
      state.ocrDone = true;
    }
    refresh();
    box.className = "notice ok";
    box.textContent = all ? `${state.scanned ? "" : nameless ? "This PDF's built-in text doesn't name the parts, so I " : "This PDF's built-in text was unreadable, so I "}${state.scanned ? "Read" : "read"} the page images — found ${applied} part${applied === 1 ? "" : "s"} by name.` :
      applied ? `Re-read ${applied} unclear part name${applied === 1 ? "" : "s"} from the page images.` : "Re-checked the unclear part names on the page images — no better reading found.";
    setTimeout(() => { if (run === ocrRun) box.hidden = true; }, 8000);
  } catch (err) {
    if (run !== ocrRun) return;
    box.className = "notice warn";
    box.textContent = "Couldn't read the page images (" + (err && err.message || err) + "). Mark parts by hand in the page map.";
  }
}

