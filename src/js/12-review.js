/* ---------------------------------------------------------------- replace one part with a better PDF */
let replaceTarget = null;
$("partRows").addEventListener("click", e => {
  const b = e.target.closest("[data-replace]"); if (!b) return;
  replaceTarget = +b.dataset.replace; $("replaceFile").click();
});
$("replaceFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !replaceTarget) return;
  try { await replacePart(replaceTarget, f); } catch (err) { $("loadStatus").textContent = "Couldn't replace that part: " + (err && err.message || err); }
  finally { setProgress(null); }
});
async function replacePart(start, file){
  const { PDFDocument } = PDFLib;
  const keys = [...state.starts.keys()].sort((a, b) => a - b), k = keys.indexOf(start);
  const end = k + 1 < keys.length ? keys[k + 1] - 1 : state.numPages, target = state.starts.get(start);
  $("loadStatus").textContent = `Reading ${file.name}…`;
  const newBytes = await file.arrayBuffer();
  let newDoc;
  try { newDoc = await PDFDocument.load(newBytes); }
  catch (err) { throw new Error(/encrypt/i.test(err.message) ? "that PDF is locked by the publisher" : "that file isn't a readable PDF"); }
  // a scan gets the same cleanup as the rest of the set
  const js = await pdfjsLib.getDocument({ data: new Uint8Array(newBytes.slice(0)) }).promise;
  let hasText = false;
  for (let i = 1; i <= js.numPages && !hasText; i++){ const tc = await (await js.getPage(i)).getTextContent(); hasText = tc.items.some(it => it.str && it.str.trim()); }
  let part = newDoc, cleaned = false, dropped = 0;
  if (!hasText){
    const opt = cleanOpts(), out = await PDFDocument.create();
    for (let i = 1; i <= js.numPages; i++){
      $("loadStatus").textContent = `Cleaning up ${file.name} — page ${i} of ${js.numPages}…`; setProgress(i / js.numPages);
      const pg = await js.getPage(i), r = await cleanPage(pg, opt);
      if (r.blank && opt.blanks){ dropped++; continue; }
      const b = opt.mode === "bw" ? await canvasBytes(r.canvas, "image/png") : await canvasBytes(r.canvas, "image/jpeg", 0.85);
      const img = opt.mode === "bw" ? await out.embedPng(b) : await out.embedJpg(b);
      out.addPage([r.ptsW, r.ptsH]).drawImage(img, { x: 0, y: 0, width: r.ptsW, height: r.ptsH });
    }
    if (!out.getPageCount()) throw new Error("every page of that file looked blank");
    part = out; cleaned = true;
  }
  setProgress(null);
  try { js.destroy(); } catch (err) {}
  // rebuild the set: pages before, the new part, pages after
  const cur = await PDFDocument.load(state.bytes), built = await PDFDocument.create();
  const add = async (doc, idxs) => { if (!idxs.length) return; (await built.copyPages(doc, idxs)).forEach(pg => built.addPage(pg)); };
  await add(cur, Array.from({ length: start - 1 }, (_, i) => i));
  await add(part, part.getPageIndices());
  await add(cur, Array.from({ length: state.numPages - end }, (_, i) => end + i));
  const oldCount = end - start + 1, newCount = part.getPageCount(), delta = newCount - oldCount;
  const segs = keys.map(s => {
    const st = state.starts.get(s);
    return { start: s > start ? s + delta : s, label: st.label, fam: st.fam === "Other" ? null : st.fam, also: st.also || [], override: s === start ? null : st.override };
  });
  const bytes = await built.save(), keepName = $("pieceName").value, keepReprint = state.reprint;
  const fileName = state.fileName;
  state.merge = null; $("mergeBox").hidden = true;
  await openFile(new File([bytes], fileName, { type: "application/pdf" }), { segs, keepReprint: true });
  state.reprint = keepReprint; $("pieceName").value = keepName; $("cleanActions").hidden = true;
  $("loadStatus").textContent = `Replaced ${target.label} (${oldCount} page${oldCount === 1 ? "" : "s"}) with ${file.name} (${newCount} page${newCount === 1 ? "" : "s"}${cleaned ? ", cleaned up with your scan settings" : ""}${dropped ? `, ${dropped} blank page${dropped === 1 ? "" : "s"} dropped` : ""}). If this piece is in your library, save it again to keep the change.`;
  refresh();
  const tr = $("partRows").querySelector(`tr[data-start="${start}"]`); if (tr){ tr.scrollIntoView({ block: "center" }); tr.classList.add("jump"); }
}

/* ---------------------------------------------------------------- whole set or only reprints */
state.reprintMode = false; state.reprint = new Map();
function reprintSel(start){ if (!state.reprint.has(start)) state.reprint.set(start, { on: false, names: new Set(), blank: null }); return state.reprint.get(start); }
function reprintCount(r){
  const sel = state.reprint.get(r.start); if (!sel || !sel.on) return 0;
  return r.names.filter(n => sel.names.has(n)).length + (sel.blank == null ? (r.names.length ? 0 : 1) : sel.blank);
}
function printRows(){
  const { rows } = plan();
  if (!state.reprintMode) return rows;
  for (const r of rows){
    const sel = state.reprint.get(r.start);
    if (!sel || !sel.on || r.dup){ r.print = []; r.names = []; r.copies = 0; continue; }
    const named = r.names.filter(n => sel.names.has(n));
    const blank = sel.blank == null ? (r.names.length ? 0 : 1) : sel.blank;
    r.names = named; r.print = named.concat(Array(Math.max(0, blank)).fill(null)); r.copies = r.print.length;
  }
  return rows;
}
document.querySelectorAll('#printMode input[name="pmode"]').forEach(el => el.addEventListener("change", () => {
  state.reprintMode = document.querySelector('#printMode input[name="pmode"]:checked').value === "some";
  $("reviewHint").textContent = state.reprintMode
    ? "Tick the parts to reprint. With a roster, tick the student(s) who need a new copy — their name is printed on it. The download contains only these."
    : "The top of the first page of every part that will print, with its copies and students. Anything highlighted needs a look — click a part to jump to it in the list.";
  $("outName").dataset.auto = ""; $("buildStatus").textContent = ""; refresh();
}));

/* ---------------------------------------------------------------- review before printing */
let reviewObs = null;
async function topShot(pageNum){
  if (state.thumbs.has(pageNum)) return state.thumbs.get(pageNum);
  const job = (async () => {
    const page = await state.pdf.getPage(pageNum);
    const vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1000 / vp1.width });
    const full = newCanvas(vp.width, vp.height), fx = ctx2d(full);
    fx.fillStyle = "#fff"; fx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: fx, viewport: vp }).promise;
    // the part name is almost always in the top-left corner: show that area large enough to read
    const w = Math.round(full.width * 0.52), h = Math.round(w * 0.42), top = newCanvas(560, Math.round(560 * h / w));
    const tx = ctx2d(top); tx.imageSmoothingQuality = "high"; tx.drawImage(full, 0, 0, w, h, 0, 0, top.width, top.height);
    return top.toDataURL("image/jpeg", 0.85);
  })();
  state.thumbs.set(pageNum, job);
  return job;
}
function renderReview(rows){
  const box = $("review");
  if (reviewObs) reviewObs.disconnect();
  reviewObs = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return; reviewObs.unobserve(en.target);
    topShot(+en.target.dataset.page).then(src => { const img = en.target.querySelector("img"); if (img) img.src = src; }).catch(() => {});
  }), { rootMargin: "400px" });
  const printing = state.reprintMode ? rows.filter(r => (INSTR_IDS.includes(r.fam) || (r.fam === "Score" && !r.front)) && !r.dup) : rows.filter(r => r.copies > 0);
  const real = rows.filter(r => INSTR_IDS.includes(r.fam) && !r.dup), med = real.length ? real.map(r => r.pages).sort((a, b) => a - b)[Math.floor(real.length / 2)] : 0;
  box.innerHTML = printing.map(r => {
    const flag = r.guessed ? "Name guessed — check it" : r.inferred ? "Part number assumed — check it" : r.flag ? "Not matched to an instrument" :
                 (r.pages >= 3 && r.pages >= med * 2.5) ? `${r.pages} pages — longer than the others` : "";
    const who = r.names.length ? r.names.join(", ") : "";
    let rp = "", cls = flag ? "warn" : "";
    if (state.reprintMode){
      const sel = reprintSel(r.start), blank = sel.blank == null ? (r.names.length ? 0 : 1) : sel.blank;
      cls = sel.on ? "sel" : "off";
      rp = `<div class="rp">
        <label class="chk"><input type="checkbox" data-rp-on="${r.start}" ${sel.on ? "checked" : ""}> <b>Reprint</b></label>
        ${r.names.length ? `<div class="chips">${r.names.map(n => `<label class="chip"><input type="checkbox" data-rp-name="${r.start}" value="${esc(n)}" ${sel.names.has(n) ? "checked" : ""}>${esc(n)}</label>`).join("")}</div>` : ""}
        <label class="n">${r.names.length ? "Extra copies without a name" : "Copies"} <input type="number" min="0" max="50" data-rp-blank="${r.start}" value="${blank}"></label>
      </div>`;
    }
    return `<div class="rv ${cls}" data-page="${r.start}" title="Show in the parts list">
      <div class="shot"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button type="button" class="zoom" data-zoom="${r.start}" title="See the whole page">Page</button></div>
      <div class="meta"><b>${esc(r.label)}</b>
        <div class="ln"><span>${r.start === r.end ? "p. " + r.start : `pp. ${r.start}–${r.end}`} · ${r.pages} page${r.pages === 1 ? "" : "s"}</span><span class="cp">× ${state.reprintMode ? reprintCount(r) : r.copies}</span></div>
        ${who && !state.reprintMode ? `<div class="who">${esc(who)}</div>` : ""}${flag ? `<div class="flag">${esc(flag)}</div>` : ""}</div>${rp}</div>`;
  }).join("");
  box.querySelectorAll(".rv").forEach(el => {
    const cached = state.thumbs.get(+el.dataset.page);
    if (cached) cached.then(src => { el.querySelector("img").src = src; }); else reviewObs.observe(el);
  });
  const skipped = rows.filter(r => r.copies === 0 && INSTR_IDS.includes(r.fam) && !r.dup).map(r => r.label);
  if (state.reprintMode){ $("reviewSkip").textContent = ""; return; }
  $("reviewSkip").textContent = skipped.length ? `Not printing (no players): ${skipped.join(", ")}`.replace(/\.?$/, ".") : "";
}
async function showPage(num, caption){
  const page = await state.pdf.getPage(num), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1100 / vp1.width });
  const c = newCanvas(vp.width, vp.height), x = ctx2d(c); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  const lb = document.createElement("div"); lb.className = "lightbox"; lb.title = "Click to close";
  lb.innerHTML = `<div><img alt="Page ${num}" src="${c.toDataURL("image/jpeg", 0.85)}"><div class="cap">${esc(caption)} — click anywhere to close</div></div>`;
  lb.addEventListener("click", () => lb.remove()); document.addEventListener("keydown", function k(ev){ if (ev.key === "Escape"){ lb.remove(); document.removeEventListener("keydown", k); } });
  document.body.appendChild(lb);
}
$("review").addEventListener("change", e => {
  const t = e.target, start = +(t.dataset.rpOn || t.dataset.rpName || t.dataset.rpBlank); if (!start) return;
  const sel = reprintSel(start);
  if (t.dataset.rpOn) sel.on = t.checked;
  if (t.dataset.rpName){ if (t.checked){ sel.names.add(t.value); sel.on = true; } else sel.names.delete(t.value); }
  if (t.dataset.rpBlank){ sel.blank = Math.max(0, parseInt(t.value, 10) || 0); if (sel.blank > 0) sel.on = true; }
  refresh();
});
$("review").addEventListener("click", e => {
  if (e.target.closest(".rp")) return;
  const z = e.target.closest("[data-zoom]");
  if (z){ e.stopPropagation(); const card = z.closest(".rv"); showPage(+z.dataset.zoom, `Page ${z.dataset.zoom} · ${card.querySelector("b").textContent}`); return; }
  const card = e.target.closest(".rv"); if (!card) return;
  const tr = $("partRows").querySelector(`tr[data-start="${card.dataset.page}"]`); if (!tr) return;
  openStep("s3"); tr.scrollIntoView({ behavior: "smooth", block: "center" }); tr.classList.remove("jump"); void tr.offsetWidth; tr.classList.add("jump");
});

/* ---------------------------------------------------------------- piece library & piece files */
function pieceNameFrom(name){
  let s = String(name || "").replace(/\.pdf$/i, "").replace(/\s*\((cleaned|part copier)\)\s*/ig, " ").replace(/[_]+/g, " ");
  for (let k = 0; k < 3; k++) s = s.replace(/[\s\-–]*\b(full set|parts?|set|full score|score|print|cleaned|scan(ned)?)\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s ? s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase()) : "Untitled piece";
}
function currentMap(){
  const segs = [...state.starts.entries()].sort((a, b) => a[0] - b[0])
    .map(([start, s]) => ({ start, label: s.label, fam: s.fam === "Other" ? null : s.fam, also: s.also || [] }));
  return { v: 1, name: ($("pieceName").value || "").trim() || pieceNameFrom(state.fileName), numPages: state.numPages, segs, saved: new Date().toISOString() };
}
async function pieceBytes(){
  const { PDFDocument, PDFName, PDFHexString } = PDFLib;
  const src = state.cleanInfo ? state.cleanInfo.bytes : state.bytes;
  const doc = await PDFDocument.load(src, { updateMetadata: false });
  const map = currentMap();
  doc.getInfoDict().set(PDFName.of("PartCopierMap"), PDFHexString.fromText(JSON.stringify(map)));
  doc.setTitle(map.name);
  return { bytes: await doc.save(), map };
}
function libDb(){
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("this browser can't store files"));
    const r = indexedDB.open("partCopierLibrary", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pieces", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error("storage unavailable"));
  });
}
async function libTx(mode, fn){
  const db = await libDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("pieces", mode), store = tx.objectStore("pieces"); let out;
    const req = fn(store); if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => { db.close(); res(out); }; tx.onerror = tx.onabort = () => { db.close(); rej(tx.error || new Error("storage failed")); };
  });
}
async function renderLibrary(){
  let list = [];
  try { list = await libTx("readonly", s => s.getAll()) || []; } catch (e) { $("libBox").hidden = true; return; }
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  $("libBox").hidden = !list.length;
  $("libList").innerHTML = list.map(p => `<li>
    <div class="ln"><b>${esc(p.name)}</b><span>${p.parts} parts · ${p.pages} pages · saved ${esc(new Date(p.savedAt).toLocaleDateString())}</span></div>
    <button type="button" class="primary" data-lib-open="${esc(p.id)}">Open</button>
    <button type="button" data-lib-dl="${esc(p.id)}" title="Download as a piece file">Download</button>
    <button type="button" data-lib-del="${esc(p.id)}" aria-label="Remove from library">×</button></li>`).join("");
}
function downloadBytes(bytes, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$("libList").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.libOpen){
      const p = await libTx("readonly", s => s.get(b.dataset.libOpen)); if (!p) return;
      state.merge = null; $("mergeBox").hidden = true;
      await openFile(new File([p.bytes], p.name + ".pdf", { type: "application/pdf" }));
    } else if (b.dataset.libDl){
      const p = await libTx("readonly", s => s.get(b.dataset.libDl)); if (p) downloadBytes(p.bytes, p.name + " (Part Copier).pdf");
    } else if (b.dataset.libDel){
      if (!confirm("Remove this piece from your library?")) return;
      await libTx("readwrite", s => s.delete(b.dataset.libDel)); renderLibrary();
    }
  } catch (err) { $("loadStatus").textContent = "Library problem: " + (err && err.message || err); }
});
$("pieceSave").addEventListener("click", async () => {
  const st = $("pieceStatus"), btn = $("pieceSave"); btn.disabled = true; st.textContent = "Saving…";
  try {
    const { bytes, map } = await pieceBytes(), id = map.name.toLowerCase();
    const exists = await libTx("readonly", s => s.get(id));
    if (exists && !confirm(`Replace “${exists.name}” in your library?`)){ st.textContent = ""; return; }
    await libTx("readwrite", s => s.put({ id, name: map.name, bytes, parts: map.segs.filter(x => x.fam).length, pages: map.numPages, savedAt: map.saved }));
    st.textContent = `Saved “${map.name}” to your library in this browser. Next time, open it from “Your saved pieces” under step 2.`;
    renderLibrary();
  } catch (err) {
    st.textContent = "Couldn't save to the library (" + (err && err.message || err) + "). Use Download piece file instead.";
  } finally { btn.disabled = false; }
});
$("pieceExport").addEventListener("click", async () => {
  const st = $("pieceStatus"); st.textContent = "Preparing…";
  try {
    const { bytes, map } = await pieceBytes();
    downloadBytes(bytes, map.name + " (Part Copier).pdf");
    st.textContent = "Downloaded. Open this PDF in Part Copier on any computer — or give it to another director — and the parts load ready to print. It's still a normal PDF for viewing and printing.";
  } catch (err) { st.textContent = "Couldn't make the piece file: " + (err && err.message || err); }
});

