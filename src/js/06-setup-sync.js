/* ---------------------------------------------------------------- move setup between computers */
$("ensMove").addEventListener("click", () => { openStep("s1"); const box = $("syncBox"); box.open = true; box.scrollIntoView({ behavior: "smooth", block: "center" }); });
const isEmptyEnsemble = n => !(saved.rosters || {})[n] && INSTR_IDS.every(id => !(saved.ensembles[n] || {})[id]);
// the setup file and the Google sync carry the same thing
function setupData(withRosters){
  let theme = null; try { theme = localStorage.getItem("partCopier.theme"); } catch (e) {}
  const keep = Object.keys(saved.ensembles).filter(n => !isEmptyEnsemble(n));
  const ensembles = Object.fromEntries((keep.length ? keep : Object.keys(saved.ensembles)).map(n => [n, saved.ensembles[n]]));
  return { app: "part-copier", version: 1, exported: new Date().toISOString(),
    settings: saved.settings, ensembles, current: saved.current,
    rosters: withRosters ? (saved.rosters || {}) : {}, theme, bn: saved.bn || null, bnLinks: saved.bnLinks || {},
    mlibId: saved.mlibId || null, printLog: saved.printLog || [] };
}
// use a setup (file or Google sync): same-named ensembles are replaced, print rules taken, history merged → { names, rosters }
function applySetup(data){
  if (!data || data.app !== "part-copier" || typeof data.ensembles !== "object") throw new Error("this isn't a Part Copier setup file");
  const names = Object.keys(data.ensembles);
  for (const n of names) saved.ensembles[n] = Object.assign(blankCounts(), data.ensembles[n]);
  saved.rosters = saved.rosters || {};
  let r = 0;
  for (const [n, ros] of Object.entries(data.rosters || {})) if (ros && Array.isArray(ros.students)){ saved.rosters[n] = ros; r++; }
  if (data.settings){
    saved.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
    saved.settings.fallbacks = Object.assign({}, DEFAULT_SETTINGS.fallbacks, data.settings.fallbacks || {});
    const fileClean = data.settings.clean || {};
    saved.settings.clean = Object.assign({}, DEFAULT_SETTINGS.clean, fileClean);
    if (fileClean.v !== 2){ saved.settings.clean.edges = false; saved.settings.clean.v = 2; }
  }
  if (saved.ensembles["My Band"] && !names.includes("My Band") && isEmptyEnsemble("My Band")) delete saved.ensembles["My Band"];
  saved.current = data.current && saved.ensembles[data.current] ? data.current : names[0] || saved.current;
  if (data.theme === "light" || data.theme === "dark"){
    try { localStorage.setItem("partCopier.theme", data.theme); } catch (err) {}
    document.documentElement.setAttribute("data-theme", data.theme); paintThemeToggle();
  }
  if (data.bn && data.bn.sheetId){
    const mine = saved.bn || {};
    saved.bn = Object.assign({}, data.bn, { consented: mine.consented, driveOk: mine.driveOk, appdataOk: mine.appdataOk });   // consent is per browser
    saved.bnLinks = Object.assign({}, saved.bnLinks || {}, data.bnLinks || {});
  }
  if (data.mlibId) saved.mlibId = data.mlibId;
  if (Array.isArray(data.printLog)) saved.printLog = mergeLog(saved.printLog || [], data.printLog);
  return { names, rosters: r };
}
$("syncSave").addEventListener("click", () => {
  const withRosters = $("syncRosters").checked;
  let theme = null; try { theme = localStorage.getItem("partCopier.theme"); } catch (e) {}
  const data = setupData(withRosters), ensembles = data.ensembles;
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  a.download = `Part Copier setup ${stamp}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  const n = Object.keys(ensembles).length, r = withRosters ? Object.keys(saved.rosters || {}).length : 0;
  $("syncStatus").textContent = `Saved ${n} ensemble${n === 1 ? "" : "s"}${r ? ` and ${r} roster${r === 1 ? "" : "s"}` : ""}. Now load that file on your other computer.`;
});
$("syncLoad").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || data.app !== "part-copier" || typeof data.ensembles !== "object") throw new Error("this isn't a Part Copier setup file");
    const names = Object.keys(data.ensembles);
    const clash = names.filter(n => saved.ensembles[n] && !isEmptyEnsemble(n));
    if (clash.length && !confirm(`Replace ${clash.length} ensemble${clash.length === 1 ? "" : "s"} already here (${clash.join(", ")}) with the versions in this file?`)) return;
    const r = applySetup(data).rosters;
    persist(); renderEnsemble(); renderSettings(); renderCleanSettings(); renderRoster(); mlRender(); renderLog(); refresh();
    $("syncStatus").textContent = `Loaded ${names.length} ensemble${names.length === 1 ? "" : "s"}${r ? ` and ${r} roster${r === 1 ? "" : "s"}` : ""} from ${f.name}.`;
  } catch (err) {
    $("syncStatus").textContent = "Couldn't load that file: " + (err && err.message || err) + ".";
  }
});

/* ---------------------------------------------------------------- Google sync (Drive app-data folder) */
// The whole setup (same as the setup file, rosters included) lives in Part Copier's own hidden Drive folder
// ("appDataFolder"): only Part Copier can see it, and it can't see anything else. Last change wins; if both this
// browser and another one changed since the last sync, Part Copier asks which to keep.
const SYNC_NAME = "part-copier-setup.json";
const syncOn = () => !!(bnCfg() && saved.syncAuto !== false);
let syncTimer = null, syncBusy = false, syncConflict = null, syncFileId = null;
function syncMsg(t, err){ const el = $("syncAutoMsg"); if (el){ el.className = "status" + (err ? " err" : ""); el.textContent = t; } }
function syncHasScope(){ return !!(bnToken && String(bnToken.scope || "").includes(APPDATA_SCOPE)); }
function syncSoon(){
  if (!syncOn() || !syncHasScope() || syncConflict) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), 3000);
}
async function syncFind(interactive){
  const q = encodeURIComponent(`name='${SYNC_NAME}' and trashed=false`);
  const res = await gFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=5`, interactive);
  if (!res) return null;
  const f = ((await res.json()).files || [])[0] || null;
  syncFileId = f ? f.id : null;
  return f;
}
async function syncPush(interactive){
  const body = JSON.stringify(setupData(true));
  if (syncFileId){
    await gFetch(`https://www.googleapis.com/upload/drive/v3/files/${syncFileId}?uploadType=media`, interactive, { method: "PATCH", body, headers: { "Content-Type": "application/json" } });
  } else {
    const b = "pc" + Date.now();
    const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: SYNC_NAME, parents: ["appDataFolder"] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const res = await gFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, interactive, { method: "POST", body: multi, headers: { "Content-Type": "multipart/related; boundary=" + b } });
    if (res) syncFileId = (await res.json()).id;
  }
  syncQuiet = true; saved.syncAt = new Date().toISOString(); saved.localAt = saved.syncAt; persist(); syncQuiet = false;
}
function syncUse(data){
  syncQuiet = true;
  try { applySetup(data); saved.syncAt = new Date().toISOString(); saved.localAt = saved.syncAt; persist(); }
  finally { syncQuiet = false; }
  renderEnsemble(); renderSettings(); renderCleanSettings(); renderRoster(); mlRender(); renderLog(); refresh();
}
// interactive = the teacher clicked (a Google prompt is allowed)
async function syncNow(interactive){
  if (syncBusy || !syncOn()) return;
  if (!syncHasScope()){
    if (!interactive){ renderSyncAuto(); return; }
    const cfg = bnCfg(); cfg.appdataOk = false; bnToken = null; try { sessionStorage.removeItem("partCopier.bnToken"); } catch (e) {}
  }
  syncBusy = true; renderSyncAuto();
  try {
    const f = await syncFind(interactive);
    if (!f && !bnToken){ return; }
    const cfg = bnCfg(); if (cfg && !cfg.appdataOk){ cfg.appdataOk = true; syncQuiet = true; persist(); syncQuiet = false; }
    const last = saved.syncAt ? Date.parse(saved.syncAt) : 0;
    const remoteNew = f && Date.parse(f.modifiedTime) > last + 1000;
    const localNew = !saved.syncAt || (saved.localAt && Date.parse(saved.localAt) > last);   // same clock: no allowance needed
    if (remoteNew){
      const res = await gFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, interactive);
      const data = await res.json();
      if (localNew && saved.syncAt){ syncConflict = data; renderSyncAuto(); return; }
      syncUse(data); syncMsg("Updated from your Google account (changed on another computer).");
    } else if (localNew || !f){
      await syncPush(interactive); syncMsg("Saved to your Google account.");
    } else syncMsg("Up to date with your Google account.");
  } catch (err) {
    syncMsg("Couldn't sync: " + (err && err.message || err) + ".", true);
  } finally { syncBusy = false; renderSyncAuto(); }
}
function renderSyncAuto(){
  const box = $("syncAuto"); if (!box) return;
  const cfg = bnCfg(), g = googleOn();
  $("syncHint").textContent = g ? "Your setup is saved in this browser. With Google connected, “Keep in sync” carries it to any computer where you sign in. Without Google, save a setup file here and load it on the other computer."
    : "Your setup is saved in this browser. To use it on another computer, save a setup file here, then load it there.";
  box.hidden = !g; if (!g){ box.innerHTML = ""; return; }
  if (!cfg){ box.innerHTML = `<div class="rule-text"><b>Keep in sync through Google</b><span>Connect Google in “Pull the roster from a Google Sheet” first. Then this setup follows you to any computer where you sign in.</span></div>`; return; }
  let h = `<div class="rule-text"><b>Keep in sync through Google</b><span>${syncOn() ? (saved.syncAt ? "Last synced " + timeAgo(saved.syncAt) + "." : "Not synced yet.") + " Stored in Part Copier's own private folder in your Google Drive; it can't see your other files." : "Off: this setup stays in this browser only."}</span></div>
    <div class="rule-ctl"><label class="chk"><input type="checkbox" id="syncAutoOn" ${syncOn() ? "checked" : ""}> On</label>
    ${syncOn() ? `<button type="button" id="syncAutoNow" ${syncBusy ? "disabled" : ""}>${syncBusy ? "Syncing…" : syncHasScope() ? "Sync now" : "Turn on (one Google prompt)"}</button>` : ""}</div>`;
  if (syncConflict) h += `<div class="sync-conflict" style="flex-basis:100%"><p class="hint">This computer and another one both changed the setup since the last sync. Which one do you want?</p>
    <button type="button" id="syncTakeRemote">Use the other computer's (${esc(timeAgo(syncConflict.exported) || "newer")})</button>
    <button type="button" id="syncKeepLocal">Keep this computer's</button></div>`;
  box.innerHTML = h;
}
$("syncAuto").addEventListener("click", async e => {
  const id = e.target.id;
  if (id === "syncAutoNow") syncNow(true);
  if (id === "syncTakeRemote"){ const d = syncConflict; syncConflict = null; syncUse(d); syncMsg("Using the other computer's setup."); renderSyncAuto(); }
  if (id === "syncKeepLocal"){ syncConflict = null; syncBusy = true; renderSyncAuto(); try { await syncPush(true); syncMsg("Kept this computer's setup and saved it to Google."); } catch (err) { syncMsg("Couldn't sync: " + (err && err.message || err) + ".", true); } finally { syncBusy = false; renderSyncAuto(); } }
});
$("syncAuto").addEventListener("change", e => {
  if (e.target.id === "syncAutoOn"){ saved.syncAuto = e.target.checked; syncQuiet = true; persist(); syncQuiet = false; renderSyncAuto(); if (e.target.checked) syncNow(true); }
});

/* ---------------------------------------------------------------- print history */
// One line per downloaded print PDF: when, piece, ensemble, copies, whole set or reprint. Kept with the setup (and synced).
const LOG_MAX = 300;
function mergeLog(a, b){
  const seen = new Set(), out = [];
  for (const x of a.concat(b)) { const k = x && x.at + "|" + x.piece + "|" + x.ensemble; if (x && !seen.has(k)){ seen.add(k); out.push(x); } }
  return out.sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-LOG_MAX);
}
function logPrint(entry){
  saved.printLog = mergeLog(saved.printLog || [], [Object.assign({ at: new Date().toISOString() }, entry)]);
  persist(); renderLog();
}
function renderLog(){
  const box = $("logBox"); if (!box) return;
  const log = (saved.printLog || []).slice().sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const piece = (($("pieceName") || {}).value || "").trim();
  const mine = piece ? log.filter(x => x.piece === piece) : [];
  const fmt = x => { const d = new Date(x.at); return `<li><span class="g">${isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span> <b>${esc(x.piece || "Untitled")}</b> · ${esc(x.ensemble || "")} · ${x.copies} cop${x.copies === 1 ? "y" : "ies"}${x.reprint ? ` · reprint${x.who ? " for " + esc(x.who) : ""}` : ""}</li>`; };
  box.hidden = !log.length;
  box.innerHTML = `<summary>Print history${mine.length ? ` <span class="g">· ${esc(piece)} printed ${mine.length} time${mine.length === 1 ? "" : "s"}, last ${esc(new Date(mine[0].at).toLocaleDateString())}</span>` : ""}</summary>
    <ul class="log-list">${log.slice(0, 40).map(fmt).join("")}</ul>
    ${log.length > 40 ? `<p class="hint">Showing the latest 40 of ${log.length}.</p>` : ""}
    <button type="button" class="link" id="logClear">Clear history</button>`;
}
$("logBox").addEventListener("click", e => {
  if (e.target.id === "logClear" && confirm("Clear the whole print history?")){ saved.printLog = []; persist(); renderLog(); }
});

/* ---------------------------------------------------------------- UI: settings */
function renderSettings(){
  const st = S();
  $("setOdd").value = st.oddTo; $("setPerc").checked = st.percAll; $("setSpares").value = st.spares;
  $("setScore").checked = st.includeScore; $("setScoreCopies").value = st.scoreCopies; $("setScoreCopies").disabled = !st.includeScore;
  $("setDuplex").checked = st.duplex;
  $("setGoogle").checked = googleOn(); $("setGoogle").disabled = !!bnCfg();
  $("googleHint").innerHTML = bnCfg() ? "Connected. To turn Google features off, click Disconnect next to the Google Sheet in step 1 first."
    : 'Pull rosters from a Google Sheet, load pieces from a music library in Google Drive, and keep your setup in sync between computers. Needs a one-time Google sign-in setup (<a href="https://github.com/artificialfear/part-copier#setting-up-google-sign-in-once-about-15-minutes" target="_blank" rel="noopener">how to set it up</a>). Not needed to print.';
}
$("setGoogle").addEventListener("change", e => {
  e.stopPropagation(); saved.googleOn = e.target.checked;
  if (saved.googleOn){ saved.bnOpen = true; rosterOpen = false; }
  persist(); renderSettings(); renderRoster(); mlRender(); renderSyncAuto();
  if (saved.googleOn){ openStep("s1"); const el = document.querySelector(".sheet-link"); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
});
$("settingsBox").addEventListener("input", () => {
  const st = S();
  st.oddTo = $("setOdd").value; st.percAll = $("setPerc").checked;
  st.spares = Math.max(0, parseInt($("setSpares").value, 10) || 0);
  st.includeScore = $("setScore").checked; st.scoreCopies = Math.max(1, parseInt($("setScoreCopies").value, 10) || 1);
  st.duplex = $("setDuplex").checked; $("setScoreCopies").disabled = !st.includeScore;
  persist(); refresh();
});

