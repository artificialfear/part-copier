/* ---------------------------------------------------------------- pieces from Google Drive (Music Library) */
// A Music Library sheet (Number | Title | … | PDF Folder) lists pieces whose split part PDFs sit in a Drive folder.
// "Load a piece" reads that folder with the teacher's own read-only access and opens the parts like a multi-file drop.
// The Raven Band Hub links here with ?folder=<id>&title=<title>&lib=<library sheet id>.
let mlPieces = null, mlBusy = false, mlOpen = false, mlQuery = "", mlPending = null, mlFound = null;
const folderIdFrom = s => { const m = String(s || "").match(/\/folders\/([a-zA-Z0-9_-]{10,})/) || String(s || "").trim().match(/^([a-zA-Z0-9_-]{10,})$/); return m ? m[1] : null; };
// narration and scripts aren't music to copy; the score is loaded (it only prints if you ask for it)
const ML_SKIP = /\b(narrator|narration|script)\b/i;
const ML_SCORE = /\b(score|conductor)\b/i;
function mlMsg(t, err){ const el = $("mlMsg"); if (el){ el.className = "roster-msg" + (err ? " err" : ""); el.textContent = t; } }
// Google features (Sheet roster, Music Library, sync) show only once someone wants them: a Google connection is set up,
// "Use Google features" is ticked in Print rules, or a Hub link brought a piece to load. Everyone else sees counts + PDF.
function googleOn(){ return !!(bnCfg() || saved.googleOn || mlPending); }
function mlRender(){
  const box = $("mlBox"); if (!box) return;
  if (!googleOn()){ box.innerHTML = ""; return; }
  const cfg = bnCfg();
  let h = "";
  if (mlPending) h += `<div class="ml-banner"><span>Load <b>${esc(mlPending.title || "this piece")}</b> from Google Drive?${mlPending.reprint && mlPending.reprint.length ? ` Reprint for ${mlPending.reprint.length} student${mlPending.reprint.length === 1 ? "" : "s"} who lost a part.` : ""}</span>
      <button type="button" class="primary" id="mlPendingGo" ${mlBusy ? "disabled" : ""}>Load the parts</button></div>`;
  h += `<details class="settings" id="mlDetails" ${mlOpen ? "open" : ""}><summary>📚 Load a piece from your Music Library</summary>`;
  if (!cfg){
    h += `<p class="hint">This loads a piece's part PDFs straight from your Google Drive. First connect Google in step 1 (“Pull the roster from a Google Sheet”), then come back here.</p>
      ${mlPending ? `<p class="hint">Then use the same link from the Hub again.</p>` : ""}`;
  } else if (!saved.mlibId){
    h += `<p class="hint">Part Copier looks in your Google Drive for your Music Library spreadsheet (a tab named “Music Library” with Title and PDF Folder columns).</p>
      <button type="button" id="mlFind" ${mlBusy ? "disabled" : ""}>${mlBusy ? "Looking…" : "Find my Music Library"}</button>
      ${mlFound ? (mlFound.length ? `<ul class="ml-list">${mlFound.map(f => `<li><button type="button" data-lib="${esc(f.id)}"><b>${esc(f.name)}</b><span class="g">edited ${esc(String(f.modifiedTime || "").slice(0, 10))}</span></button></li>`).join("")}</ul>`
          : `<p class="hint">No spreadsheet with a “Music Library” tab turned up. Paste its link instead:</p>`) : ""}
      <details style="margin-top:8px" ${mlFound && !mlFound.length ? "open" : ""}><summary class="hint">Or paste the link</summary>
        <label class="fld">Music Library link <input type="text" id="mlSheet" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
        <button type="button" id="mlSave">Save</button></details>`;
  } else if (!mlPieces){
    h += `<p class="hint">Pieces with a PDF Folder link in your Music Library. The score comes along but only prints if you ask for it.</p>
      <button type="button" id="mlFetch" ${mlBusy ? "disabled" : ""}>${mlBusy ? "Loading…" : "Show my pieces"}</button>
      <button type="button" class="link" id="mlForget" style="margin-left:10px">Use a different library</button>`;
  } else {
    const q = mlQuery.trim().toLowerCase();
    const list = mlPieces.filter(p => !q || (p.num + " " + p.title + " " + p.composer).toLowerCase().includes(q));
    h += `<input type="search" id="mlQ" placeholder="Search ${mlPieces.length} pieces…" value="${esc(mlQuery)}" style="width:100%;max-width:720px;margin-top:6px">
      <ul class="ml-list">${list.slice(0, 80).map(p => `<li><button type="button" data-ml="${esc(p.folderId)}" data-title="${esc(p.title)}">${p.num ? "#" + esc(p.num) + " " : ""}<b>${esc(p.title)}</b>${p.grade ? `<span class="g">Grade ${esc(p.grade)}</span>` : ""}${p.composer ? `<span class="g">${esc(p.composer)}</span>` : ""}</button></li>`).join("") || `<li class="hint">Nothing matches.</li>`}</ul>
      <button type="button" class="link" id="mlForget" style="margin-top:8px">Use a different library</button>`;
  }
  h += `<div class="roster-msg" id="mlMsg"></div></details>`;
  box.innerHTML = h;
}
async function gFetch(url, interactive, opts){
  const token = await bnAuth(interactive); if (!token) return null;
  opts = opts || {};
  const res = await fetch(url, { method: opts.method || "GET", body: opts.body, headers: Object.assign({ Authorization: "Bearer " + token }, opts.headers || {}) });
  if (res.status === 401 && interactive){ bnToken = null; try { sessionStorage.removeItem("partCopier.bnToken"); } catch (e) {} return gFetch(url, true, opts); }
  if (!res.ok){
    const j = await res.clone().json().catch(() => ({})), msg = (j.error && j.error.message) || res.statusText;
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)){
      const api = /drive/i.test(url) ? "Google Drive API" : "Google Sheets API";
      throw new Error(`the ${api} isn't turned on in your Google Cloud project yet. Enable it (Google Cloud → APIs & Services → Library → ${api} → Enable), wait a minute, then try again`);
    }
    if (res.status === 403 && /insufficient|scope/i.test(msg)){
      const cfg = bnCfg(); if (cfg){ cfg.driveOk = false; persist(); }
      bnToken = null; try { sessionStorage.removeItem("partCopier.bnToken"); } catch (e) {}
      throw new Error("Google didn't give Part Copier permission to read your Drive files. Try again and tick the Google Drive box on the sign-in screen");
    }
    throw new Error(res.status === 404 ? "not found (check the link, and that this Google account can open it)" : res.status === 403 ? "this Google account can't open it (" + msg + ")" : msg);
  }
  const cfg = bnCfg(); if (cfg && /googleapis\.com\/drive/.test(url) && !cfg.driveOk){ cfg.driveOk = true; persist(); }
  return res;
}
// spreadsheets in the teacher's Drive whose name mentions "library" and that have a "Music Library" tab
async function mlFind(){
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'Library'");
  const res = await gFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=25&supportsAllDrives=true&includeItemsFromAllDrives=true`, true);
  const files = (await res.json()).files || [], ok = [];
  for (const f of files.slice(0, 12)){
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}?fields=sheets.properties.title`, { headers: { Authorization: "Bearer " + bnToken.token } });
    if (!r.ok) continue;
    const tabs = ((await r.json()).sheets || []).map(x => x.properties.title);
    if (tabs.some(t => /^music library$/i.test(String(t).trim()))) ok.push(f);
  }
  return ok;
}
async function mlFetchPieces(){
  const range = encodeURIComponent("'Music Library'!A1:Z2000");
  const res = await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${saved.mlibId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, true);
  const values = (await res.json()).values || [];
  const head = (values[0] || []).map(h => String(h).trim().toLowerCase());
  const col = n => head.indexOf(n);
  const ti = col("title"), fi = col("pdf folder");
  if (ti < 0 || fi < 0) throw new Error("the Music Library tab needs Title and PDF Folder columns");
  const ni = col("number"), gi = col("grade"), ci = col("composer");
  mlPieces = values.slice(1).map(r => ({ title: String(r[ti] || "").trim(), folderId: folderIdFrom(r[fi]), num: ni < 0 ? "" : String(r[ni] || "").trim(),
      grade: gi < 0 ? "" : String(r[gi] || "").trim(), composer: ci < 0 ? "" : String(r[ci] || "").trim() }))
    .filter(p => p.title && p.folderId).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
async function mlLoad(folderId, title, reprint){
  if (mlBusy) return;
  mlBusy = true; mlRender();
  const st = $("loadStatus");
  try {
    st.textContent = `Looking in Google Drive for ${title || "the piece"}…`;
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/pdf'`);
    const res = await gFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`, true);
    if (!res) return;
    const all = (await res.json()).files || [];
    const parts = all.filter(f => !/^\._/.test(f.name) && !ML_SKIP.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!parts.some(f => !ML_SCORE.test(f.name))){ st.textContent = parts.length ? "That folder only has a score — no part PDFs to load." : "There are no PDFs in that folder yet."; return; }
    const files = [], metas = [];
    for (let i = 0; i < parts.length; i++){
      st.textContent = `Downloading ${i + 1} of ${parts.length} from Google Drive…`;
      const r = await gFetch(`https://www.googleapis.com/drive/v3/files/${parts[i].id}?alt=media&supportsAllDrives=true`, true);
      files.push(new File([await r.arrayBuffer()], parts[i].name, { type: "application/pdf" })); metas.push(parts[i]);
    }
    mlPending = null; mlOpen = false;
    // one unsplit full-set file (a scan not yet split into parts): read it as a full set, with any separate score in front
    const sets = files.filter(f => !ML_SCORE.test(f.name)), scores = files.filter(f => ML_SCORE.test(f.name));
    const setMeta = sets.length === 1 ? metas[files.indexOf(sets[0])] : null;
    if (sets.length === 1 && scores.length){
      st.textContent = "Putting the score and the full set together…";
      const doc = await PDFLib.PDFDocument.create();
      let scorePages = 0;
      for (const f of scores.concat(sets)){ const src = await PDFLib.PDFDocument.load(await f.arrayBuffer()); if (f !== sets[0]) scorePages += src.getPageCount(); (await doc.copyPages(src, src.getPageIndices())).forEach(pg => doc.addPage(pg)); }
      await openFiles([new File([await doc.save()], sets[0].name, { type: "application/pdf" })]);
      pmSource(setMeta, scorePages);
      return;
    }
    await openFiles(files);
    pmSource(files.length === 1 ? setMeta : null, 0);
    if (reprint && reprint.length) applyReprint(reprint);
  } catch (err) {
    st.textContent = "Couldn't load it from Google Drive: " + (err && err.message || err) + ".";
  } finally { mlBusy = false; mlRender(); }
}
$("mlBox").addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "mlPendingGo") return mlLoad(mlPending.folderId, mlPending.title, mlPending.reprint);
  if (t.dataset.ml) return mlLoad(t.dataset.ml, t.dataset.title);
  if (t.id === "mlSave"){
    const id = sheetIdFrom($("mlSheet").value); if (!id) return mlMsg("That doesn't look like a Google Sheets link.", true);
    saved.mlibId = id; persist(); mlPieces = null; mlOpen = true; mlRender(); return;
  }
  if (t.id === "mlFind"){
    mlBusy = true; mlOpen = true; mlRender();
    try { mlFound = await mlFind(); } catch (err) { mlBusy = false; mlRender(); return mlMsg("Couldn't search your Drive: " + (err && err.message || err) + ".", true); }
    mlBusy = false;
    if (mlFound.length === 1){ saved.mlibId = mlFound[0].id; persist(); mlFound = null; mlRender(); $("mlFetch").click(); return; }
    mlRender(); return;
  }
  if (t.dataset.lib){ saved.mlibId = t.dataset.lib; persist(); mlFound = null; mlRender(); $("mlFetch").click(); return; }
  if (t.id === "mlForget"){ mlFound = null; saved.mlibId = null; mlPieces = null; persist(); mlOpen = true; mlRender(); return; }
  if (t.id === "mlFetch"){
    mlBusy = true; mlOpen = true; mlRender();
    try { await mlFetchPieces(); } catch (err) { mlBusy = false; mlRender(); return mlMsg("Couldn't read the Music Library: " + (err && err.message || err) + ".", true); }
    mlBusy = false; mlRender(); return;
  }
});
$("mlBox").addEventListener("input", e => { if (e.target.id === "mlQ"){ mlQuery = e.target.value; const pos = e.target.selectionStart; mlRender(); const q = $("mlQ"); q.focus(); q.setSelectionRange(pos, pos); } });
$("mlBox").addEventListener("toggle", e => { if (e.target.id === "mlDetails") mlOpen = e.target.open; }, true);
function mlFromLink(){
  const p = new URLSearchParams(location.search), folderId = folderIdFrom(p.get("folder"));
  const lib = sheetIdFrom(p.get("lib") || "");
  if (lib && lib !== saved.mlibId){ saved.mlibId = lib; persist(); }
  if (!folderId) return;
  // Hub lost-part requests: r=Last, First|Instrument|Part (one per student)
  const reprint = p.getAll("r").slice(0, 30).map(x => { const [name, inst, part] = String(x).split("|"); return { name: (name || "").trim(), inst: (inst || "").trim(), part: (part || "").trim() }; }).filter(x => x.name);
  mlPending = { folderId, title: (p.get("title") || "").slice(0, 120), reprint };
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  openStep("s2");
  if (bnCfg() && bnToken && bnToken.exp > Date.now() + 60000) mlLoad(mlPending.folderId, mlPending.title, mlPending.reprint);   // already signed in: no click needed
}

/* ---------------------------------------------------------------- page lists for the Raven Band Hub */
// When a piece's full set is ONE PDF in Drive (a scan of every part), the Hub can't tell which pages are which part.
// Part Copier can, so after it reads such a piece (and again after any fix in "Check the parts") it saves the part
// list to one small file in the teacher's Drive, "Part Copier – part pages.json", made by Part Copier itself
// (drive.file permission: it can't see or change anything else). The Hub reads it to print just a student's pages.
//   { v: 1, files: { "<Drive file ID>": { name, total, saved, parts: [{ label, start, end }] } } }   (pages of that file)
const PM_NAME = "Part Copier – part pages.json";
let pmTimer = null, pmFileId = null, pmLast = {};
// mlLoad: the Drive file this PDF came from (or null), and how many score pages were put in front of it
function pmSource(meta, offset){ state.driveSrc = meta ? { id: meta.id, name: meta.name, offset: offset || 0 } : null; pmSoon(); }
const pmHasScope = () => !!(bnToken && bnToken.exp > Date.now() + 60000 && String(bnToken.scope || "").includes(DRIVEFILE_SCOPE));
function pmSoon(){ if (!state.driveSrc) return; clearTimeout(pmTimer); pmTimer = setTimeout(() => pmSave().catch(() => {}), 3000); }
// The part list as it stands now (instrument parts only, page numbers of the Drive file itself)
function pmParts(){
  const src = state.driveSrc; if (!src) return null;
  if (state.scanned && !state.ocrDone) return null;   // still reading the scan: wait for the real names
  const off = src.offset || 0;
  return segments().filter(r => INSTR_IDS.includes(r.fam) && String(r.label || "").trim())
    .map(r => ({ label: String(r.label).trim(), start: r.start - off, end: r.end - off })).filter(r => r.start >= 1 && r.end >= r.start);
}
async function pmSave(){
  const src = state.driveSrc, parts = pmParts();
  if (!src || !parts || !parts.length || !pmHasScope()) return false;
  const key = JSON.stringify(parts);
  if (pmLast[src.id] === key) return false;
  if (!pmFileId){
    const q = encodeURIComponent(`name='${PM_NAME}' and trashed=false`);
    const res = await gFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`, false);
    if (!res) return false;
    pmFileId = (((await res.json()).files || [])[0] || {}).id || null;
  }
  let data = { v: 1, files: {} };
  if (pmFileId){
    const res = await gFetch(`https://www.googleapis.com/drive/v3/files/${pmFileId}?alt=media`, false);
    if (res) { try { const j = await res.json(); if (j && j.files) data = j; } catch (e) {} }
  }
  data.v = 1; data.files[src.id] = { name: src.name, total: state.numPages - (src.offset || 0), saved: new Date().toISOString(), parts };
  const body = JSON.stringify(data);
  if (pmFileId){
    await gFetch(`https://www.googleapis.com/upload/drive/v3/files/${pmFileId}?uploadType=media`, false, { method: "PATCH", body, headers: { "Content-Type": "application/json" } });
  } else {
    const b = "pm" + Date.now();
    const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: PM_NAME, mimeType: "application/json", description: "Which pages are which part in your full-set PDFs. Made by Part Copier for the Raven Band Hub; safe to leave alone." })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const res = await gFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, false, { method: "POST", body: multi, headers: { "Content-Type": "multipart/related; boundary=" + b } });
    if (res) pmFileId = (await res.json()).id;
  }
  pmLast[src.id] = key;
  return true;
}

