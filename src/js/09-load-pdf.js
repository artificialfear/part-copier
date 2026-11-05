/* ---------------------------------------------------------------- UI: loading a PDF */
const drop = $("drop");
["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { openFiles([...e.dataTransfer.files]); });
$("file").addEventListener("change", e => { openFiles([...e.target.files]); e.target.value = ""; });

/* ---------------------------------------------------------------- several part files -> one set */
function labelFromFileName(name){
  return name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/^\s*\d+\s*[-–.)]?\s+(?=\D)/, "")
             .replace(/([a-z\u266d])(\d)/gi, "$1 $2").replace(/\s+/g, " ").trim();
}
async function openFiles(files){
  files = files.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (!files.length){ $("loadStatus").textContent = "Those aren't PDFs."; return; }
  if (files.length === 1){ state.merge = null; $("mergeBox").hidden = true; return openFile(files[0]); }
  $("loadStatus").textContent = `Reading ${files.length} files…`;
  const items = [], problems = [];
  for (const f of files){
    try {
      const bytes = await f.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(bytes);
      const label = labelFromFileName(f.name);
      const fam = classify(label) || normInst(label) || null;
      items.push({ name: f.name, bytes, pages: doc.getPageCount(), label, fam, lead: (f.name.match(/^\s*(\d+)/) || [])[1] });
    } catch (err) {
      problems.push(/encrypt/i.test(err.message) ? `${f.name} is locked by the publisher` : `${f.name} couldn't be read`);
    }
  }
  if (!items.length){ $("loadStatus").textContent = problems.join("; "); return; }
  // strip a prefix most files share, such as "Ravenwood Overture - "
  const pre = sharedLead(items.map(i => i.label));
  if (pre) for (const it of items) if (it.label.startsWith(pre) && it.label.length > pre.length + 1){
    it.label = it.label.slice(pre.length).replace(/^[\s\-–]+/, ""); it.fam = classify(it.label) || normInst(it.label) || it.fam;
  }
  state.merge = { items, problems, numbered: items.every(i => i.lead !== undefined), userOrdered: false };
  $("mergeBox").open = true;
  sortMerge();
  await rebuildMerge();
  // files whose names didn't say the instrument: use the part name found on their first page, then re-sort once
  let learned = false;
  state.merge.segs.forEach((s, i) => {
    const it = state.merge.items[i], st = state.starts.get(s.start);
    if (!it.fam && st && st.fam && st.fam !== "Other"){ it.fam = st.fam; it.label = st.label; learned = true; }
  });
  if (learned && !state.merge.numbered){ sortMerge(); await rebuildMerge(); }
}
function sortMerge(){
  const m = state.merge, rank = i => i.fam === "Score" ? -1 : i.fam ? INSTR_IDS.indexOf(i.fam) : 999;
  m.items.sort((a, b) => m.numbered ? (+a.lead - +b.lead) :
    (rank(a) - rank(b) || ((partNums(a.label)[0] || 0) - (partNums(b.label)[0] || 0)) || a.label.localeCompare(b.label, undefined, { numeric: true })));
}
async function rebuildMerge(){
  const m = state.merge, out = await PDFLib.PDFDocument.create(), segs = [];
  for (const it of m.items){
    const src = await PDFLib.PDFDocument.load(it.bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    segs.push({ start: out.getPageCount() + 1, label: it.label, fam: it.fam });
    pages.forEach(pg => out.addPage(pg));
  }
  const bytes = await out.save();
  m.bytes = bytes; m.segs = segs;
  renderMerge();
  await openFile(new File([bytes], mergedName() + ".pdf", { type: "application/pdf" }), { segs });
  if (m.problems.length) $("loadStatus").textContent += ` · skipped: ${m.problems.join("; ")}`;
}
function sharedLead(labels){
  const tally = {};
  for (const l of labels){ const m = l.match(/^(.{3,}?)\s+[-–]\s+/); if (m) tally[m[0]] = (tally[m[0]] || 0) + 1; }
  let best = "", n = 0; for (const [k, v] of Object.entries(tally)) if (v > n){ best = k; n = v; }
  return n >= 2 && n >= labels.length * 0.6 ? best : "";
}
function mergedName(){
  const lead = sharedLead(state.merge.items.map(i => labelFromFileName(i.name)));
  return lead ? lead.replace(/[\s\-–]+$/, "") : "Full set";
}
function renderMerge(){
  const m = state.merge;
  $("mergeBox").hidden = !m; if (!m) return;
  $("mergeSummary").textContent = `Merged ${m.items.length} files`;
  $("mergeList").innerHTML = m.items.map((it, i) => `<li>
    <span class="mi-num">${i + 1}</span>
    <span class="mi-name" title="${esc(it.name)}">${esc(it.name)}</span>
    <span class="mi-meta ${it.fam ? "" : "unk"}">${it.fam ? esc(LABEL[it.fam] || it.fam) : "instrument?"} · ${it.pages} pg</span>
    <button type="button" data-mv="-1" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
    <button type="button" data-mv="1" data-i="${i}" ${i === m.items.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
    <button type="button" data-rm="${i}" aria-label="Remove">×</button></li>`).join("");
}
$("mergeList").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b || !state.merge) return;
  const items = state.merge.items;
  if (b.dataset.mv){ const i = +b.dataset.i, j = i + +b.dataset.mv; [items[i], items[j]] = [items[j], items[i]]; }
  if (b.dataset.rm){ items.splice(+b.dataset.rm, 1); if (!items.length){ state.merge = null; $("mergeBox").hidden = true; return; } }
  await rebuildMerge();
});
$("mergeDownload").addEventListener("click", () => {
  if (!state.merge) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([state.merge.bytes], { type: "application/pdf" }));
  a.download = mergedName() + " - full set.pdf"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
});

function setProgress(frac){ const p = $("progress"); p.hidden = frac == null; if (frac != null) p.firstElementChild.style.width = Math.round(frac*100) + "%"; }

async function openFile(file, opts = {}){
  if (!opts.cleaned){ state.original = null; state.originalPdf = null; state.cleanInfo = null; }
  if (!opts.cleaned && !opts.segs && state.merge && !opts.keepMerge){ state.merge = null; $("mergeBox").hidden = true; }
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf"){ $("loadStatus").textContent = "That isn't a PDF."; return; }
  $("loadStatus").textContent = `Reading ${file.name}…`;
  $("s3").hidden = $("s4").hidden = true;
  try {
    const bytes = await file.arrayBuffer();
    state.bytes = bytes; state.fileName = file.name;
    if (state.pdf) { try { state.pdf.destroy(); } catch (e) {} }
    state.pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    state.numPages = state.pdf.numPages; state.pageInfo = []; state.thumbs = new Map();
    if (!opts.keepReprint) state.reprint = new Map();
    state.piece = null;
    if (!opts.segs && !opts.cleaned){
      try {
        const meta = await state.pdf.getMetadata(), raw = meta && meta.info && meta.info.Custom && meta.info.Custom.PartCopierMap;
        const map = raw ? JSON.parse(raw) : null;
        if (map && map.v === 1 && map.numPages === state.numPages && Array.isArray(map.segs) && map.segs.length){
          opts = Object.assign({}, opts, { segs: map.segs });
          state.piece = { name: map.name || file.name.replace(/\.pdf$/i, "") };
        }
      } catch (e) {}
    }
    let withText = 0;
    for (let i = 1; i <= state.numPages; i++){
      setProgress(i / state.numPages);
      const page = await state.pdf.getPage(i);
      const [x0, y0, x1, y1] = page.view, h = y1 - y0;
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim());
      if (items.length) withText++;
      const top = items.filter(it => it.transform[5] > y0 + h*0.78).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str, w: it.width || 0, fs: Math.abs(it.transform[0]) || 10 }));
      top.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of top){ const L = lines.find(l => Math.abs(l.y - it.y) < 3); if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] }); }
      const text = lines.map(l => {
        const its = l.items.sort((a, b) => a.x - b.x); let s = "";
        its.forEach((it, k) => { if (k){ const prev = its[k-1], gap = it.x - (prev.x + prev.w); s += (prev.w && gap < Math.max(0.8, prev.fs * 0.12)) ? "" : " "; } s += it.s; });
        return s.replace(/\s+/g, " ").trim();
      });
      const titleLines = text.slice(0, 2).map(l => norm(fixOcr(l)).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim());
      const letters = text.join(" ").replace(/[\s\d\p{P}\p{S}]/gu, ""), latin = letters.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
      const junk = letters.length >= 4 && latin.length / letters.length < 0.7;
      // a full score names many instruments down its left margin
      const left = items.filter(it => it.transform[4] < x0 + (x1 - x0) * 0.2).map(it => it.str).join("\n");
      const leftFams = new Set(classifyAll(left)); leftFams.delete("Percussion");
      const info = Object.assign({ hasText: items.length > 0, titleLines, junk }, labelFromLines(text) || {});
      if (!junk && leftFams.size >= 5){ info.fam = "Score"; info.label = "Score"; info.also = []; }
      // identical text = another copy of the same page (ePrint sets include several copies of each part)
      if (!junk && items.length >= 15) info.sig = items.length + ":" + items.map(it => it.str).join("|").slice(0, 4000);
      state.pageInfo.push(info);
    }
    setProgress(null);
    state.scanned = withText === 0;
    detectStarts();
    if (opts.segs && opts.segs.length){
      state.starts = new Map();
      for (const s of opts.segs){
        const pi = state.pageInfo[s.start - 1] || {};
        const fam = s.fam || pi.fam || "Other";
        state.starts.set(s.start, { label: s.fam ? s.label : (pi.label || s.label), fam, famManual: !!s.fam, also: s.also || [], override: s.override ?? null });
      }
    }
    state.knownParts = !!(opts.segs && opts.segs.length);
    state.ocrDone = false; state.userTouched = false; state.driveSrc = null; ocrRun++; $("ocrStatus").hidden = true;
    $("outName").value = file.name.replace(/\.pdf$/i, "") + " - " + saved.current + " - PRINT.pdf";
    $("loadStatus").textContent = state.piece ? `“${state.piece.name}” — ${state.numPages} pages, parts as you saved them.`
                                              : `${file.name} — ${state.numPages} page${state.numPages === 1 ? "" : "s"}`;
    $("pieceName").value = state.piece ? state.piece.name : pieceNameFrom(opts.merged || file.name);
    $("pieceStatus").textContent = "";
    $("s3").hidden = $("s4").hidden = false;
    buildPageMap();
    $("mapBox").open = state.scanned;
    $("cleanBox").hidden = false;
    if (!opts.cleaned){ $("cleanBox").open = state.scanned; $("clPreviewBox").hidden = true; $("cleanStatus").textContent = ""; $("cleanActions").hidden = true; }
    $("clPreviewPage").max = state.numPages;
    refresh();
    readPageImages();
    if (bnCfg() && bnLink()) bnPull(false, true);     // fresh roster if Google sign-in is still active
    if (!opts.cleaned && !opts.keepReprint){
      // done with steps 1–2; a saved piece needs no checking, so go straight to printing
      setFold("s1", true, false);
      setFold("s2", !(state.scanned && !state.piece) && !state.merge, false);
      setFold("s3", !!state.piece, false); setFold("s4", false, false);
    }
    $(state.piece ? "s4" : "s3").scrollIntoView({ block: "start" });
  } catch (err) {
    setProgress(null);
    $("loadStatus").textContent = /password/i.test(err && err.message) ? "This PDF is password-protected and can't be opened here." : "Couldn't read that PDF: " + (err && err.message || err);
  }
}

function detectStarts(){
  state.starts = new Map();
  const info = state.pageInfo, n = info.length;
  // A title repeated at the top of each part's first page (but not continuation pages) marks where parts begin.
  // Scanned titles are read with small OCR differences ("a cartoon christmas" / "a cartoon chrlstmas"), so near-matches count together.
  const firsts = info.map(pi => (pi.titleLines && pi.titleLines[0]) || "");
  const near = (a, b) => a === b || (a.length >= 8 && b.length >= 8 && Math.abs(a.length - b.length) <= 3 && lev(a, b) <= Math.max(2, Math.round(a.length * 0.15)));
  let title = null, cnt = 0;
  for (const k of new Set(firsts)){
    if (k.length < 3) continue;
    const v = firsts.filter(f => f && near(k, f)).length;
    if (v > cnt){ title = k; cnt = v; }
  }
  const isTitle = pi => !!title && (pi.titleLines || []).some(t => t && near(title, t));
  const titleOK = !!title && cnt >= 3 && cnt / n >= 0.3 && !classify(title);
  const useTitle = titleOK && cnt / n < 0.95;
  // title on (almost) every page: one-page parts, or a title repeated on continuation pages —
  // a new name starts a part, and so does an unreadable page (rather than being merged into the last part)
  const titleEvery = titleOK && !useTitle;
  let cur = null;
  info.forEach((pi, i) => {
    const page = i + 1, hasTitle = useTitle && isTitle(pi);
    const sameLabel = pi.fam && cur && cur.label.toLowerCase() === pi.label.toLowerCase();
    // a continuation page's running header ends in its page number: "Tuba - 2", "1st Trumpet - 3"
    let contHead = useTitle && !hasTitle && /\D\s*[-–]?\s*([2-9]|1\d)$/.test(((pi.titleLines || [])[0] || "").trim());
    // with titles marking part starts, the page right after an unreadable title page is that part's page 2
    if (useTitle && !hasTitle && cur && cur.unknown && cur.lastPage === page - 1) contHead = true;
    let start;
    if (!cur) start = true;
    else if (useTitle && contHead){
      // never a new part; if the part's own name was unreadable, its later pages name it
      if (cur.unknown && pi.fam){ Object.assign(cur, { label: pi.label, fam: pi.fam, also: pi.also || [], unknown: false, fromCont: true }); }
      start = false;
    }
    else if (useTitle) start = hasTitle || (pi.fam && pi.fam !== cur.fam && pi.fam !== "Score");
    else if (titleEvery) start = !pi.fam || !sameLabel;
    else start = !!pi.fam && !sameLabel;
    // a page identical to this part's first page is another copy of the part, not its next page
    if (!start && cur && cur.firstPage && pi.fam && sameCopy(cur.firstPage, page)) start = true;
    if (!start){ if (cur) cur.lastPage = page; return; }
    if (pi.fam) cur = { label: pi.label, fam: pi.fam, also: pi.also || [], override: null };
    else if (!cur && !useTitle && !titleEvery) cur = { label: state.scanned ? "Part 1" : "Front matter", fam: "Other", override: null };
    else cur = { label: `Unknown part (p. ${page})`, fam: "Other", override: null, unknown: true };
    cur.lastPage = page; cur.firstPage = page;
    state.starts.set(page, cur);
  });
  state.starts.forEach(s => { delete s.lastPage; delete s.fromCont; delete s.firstPage; });
  inferNames();
}
// Fill in what the text couldn't tell us: missing part numbers, and unreadable parts from score order.
const GUESS_ORDER = ["Flute","Oboe","Bassoon","Clarinet","Bass Clarinet","Alto Sax","Tenor Sax","Bari Sax","Trumpet","Horn","Trombone","Euphonium BC","Euphonium TC","Tuba","String Bass","Piano","Percussion"];
// two pages that are copies of each other (same text, or the same-looking header when read from the image)
function sameCopy(pA, pB){
  const a = state.pageInfo[pA - 1] || {}, b = state.pageInfo[pB - 1] || {};
  if (a.sig && b.sig) return a.sig === b.sig;
  const fa = (state.fp || {})[pA], fb = (state.fp || {})[pB];
  if (!fa || !fb) return false;
  let n = 0; for (let i = 0; i < fa.length; i++) if (Math.abs(fa[i] - fb[i]) > 40 && ++n > 4) return false;
  return true;
}
function inferNames(){
  const segs = [...state.starts.entries()].sort((a, b) => a[0] - b[0]);
  // copies: ePrint/download sets often repeat each part several times — same name, same page = the same part
  const segLen = i => (i + 1 < segs.length ? segs[i + 1][0] : state.numPages + 1) - segs[i][0];
  for (let i = 1; i < segs.length; i++){
    const a = segs[i - 1][1], b = segs[i][1];
    if (b.fam === a.fam && INSTR_IDS.includes(b.fam) && a.label.toLowerCase() === b.label.toLowerCase() && segLen(i) === segLen(i - 1) && sameCopy(segs[i - 1][0], segs[i][0])){
      b.label = a.label; b.copyOf = a.copyOf || segs[i - 1][0]; b.inferred = false;
    }
  }
  // 0) two parts in a row with the same name (a misread number): the second is the next number
  for (let i = 1; i < segs.length; i++){
    const a = segs[i - 1][1], b = segs[i][1];
    if (b.copyOf) continue;
    if (!INSTR_IDS.includes(b.fam) || b.fam !== a.fam || a.label.toLowerCase() !== b.label.toLowerCase()) continue;
    const n = partNums(a.label);
    b.label = n.length === 1 && n[0] < 4 ? b.label.replace(/\b[1-4]\b(?!.*\b[1-4]\b)/, String(n[0] + 1)) : (CANON[b.fam] || b.fam) + " 2";
    if (!n.length) a.label = (CANON[a.fam] || a.fam) + " 1";
    b.inferred = true;
  }
  // 1) "Clarinet" next to "Clarinet 2" and "Clarinet 3" is almost certainly Clarinet 1
  const byFam = {};
  segs.forEach(([pg, s]) => { if (INSTR_IDS.includes(s.fam)) (byFam[s.fam] = byFam[s.fam] || []).push(s); });
  for (const [fam, list] of Object.entries(byFam)){
    const nums = new Set(); list.forEach(s => partNums(s.label).forEach(x => nums.add(x)));
    const plain = list.filter(s => !partNums(s.label).length && s.label === CANON[fam]);
    if (nums.size && plain.length === 1){
      let m = 1; while (nums.has(m)) m++;
      if (m <= 4){ plain[0].label = CANON[fam] + " " + m; plain[0].inferred = true; }
    }
  }
  // 2) runs of unreadable parts between two known parts, filled from standard score order
  const present = new Set(segs.filter(([, s]) => !s.unknown).map(([, s]) => s.fam));
  for (let i = 0; i < segs.length; i++){
    if (!segs[i][1].unknown) continue;
    let j = i; while (j + 1 < segs.length && segs[j + 1][1].unknown) j++;
    const run = segs.slice(i, j + 1).map(x => x[1]);
    const A = i > 0 ? segs[i - 1][1] : null, B = j + 1 < segs.length ? segs[j + 1][1] : null;
    const iA = A ? GUESS_ORDER.indexOf(A.fam) : -1, iB = B ? GUESS_ORDER.indexOf(B.fam) : GUESS_ORDER.length;
    if (A && B && A.fam === B.fam && run.length === 1 && INSTR_IDS.includes(A.fam)){
      const n = partNums(A.label);
      run[0].fam = A.fam; run[0].label = (CANON[A.fam] || A.fam) + (n.length === 1 && n[0] < 4 ? " " + (n[0] + 1) : "");
      run[0].guessed = true; run[0].unknown = false; i = j; continue;
    }
    if ((A && iA < 0) || (B && iB < 0) || iB <= iA){ i = j; continue; }
    const fams = GUESS_ORDER.slice(iA + 1, iB).filter(f => !present.has(f));
    let picks = null;
    if (fams.length === run.length) picks = fams.map(f => ({ fam: f, label: CANON[f] }));
    else if (A && fams.length === run.length - 1 && partNums(A.label).length === 1){
      const nxt = partNums(A.label)[0] + 1;
      if (nxt <= 4) picks = [{ fam: A.fam, label: CANON[A.fam] + " " + nxt }].concat(fams.map(f => ({ fam: f, label: CANON[f] })));
    }
    if (picks) run.forEach((s, k) => { s.fam = picks[k].fam; s.label = picks[k].label; s.guessed = true; s.unknown = false; });
    i = j;
  }
}

