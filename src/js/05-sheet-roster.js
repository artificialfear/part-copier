/* ---------------------------------------------------------------- live roster from a Google Sheet (Band Ninja) */
// Reads one tab with the signed-in teacher's own Google access (read-only). Nothing is published or shared;
// the sheet stays private. Each ensemble is linked to one table on the tab (a "Name | Instrument | Chair" block
// with a title above it, e.g. "7th Grade (3rd + 4th Block)").
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";   // Part Copier's own hidden folder: synced setup (can't see other files)
const DRIVEFILE_SCOPE = "https://www.googleapis.com/auth/drive.file";   // only files Part Copier itself makes: its page-list file for the Raven Band Hub
const BN_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly " + DRIVE_SCOPE + " " + APPDATA_SCOPE + " " + DRIVEFILE_SCOPE;   // Drive: load a piece's part PDFs (read-only)
const bnCfg = () => saved.bn || null;
const bnLink = () => ((saved.bnLinks || {})[saved.current]) || "";
let bnToken = null, bnTables = null, bnBusy = false;
try { const t = JSON.parse(sessionStorage.getItem("partCopier.bnToken") || "null"); if (t && t.exp > Date.now() + 60000 && String(t.scope || "").includes(DRIVE_SCOPE)) bnToken = t; } catch (e) {}
const sheetIdFrom = s => { const m = String(s || "").match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(s || "").trim().match(/^([a-zA-Z0-9_-]{20,})$/); return m ? m[1] : null; };
function sheetPanel(){
  const cfg = bnCfg(), link = bnLink(), ros = roster();
  if (!googleOn()) return "";
  if (!cfg) return `<details class="settings sheet-link" ${saved.bnOpen ? "open" : ""}><summary>Pull the roster from a Google Sheet instead of pasting</summary>
    <p class="hint">Connect your roster spreadsheet (e.g. Band Ninja's Part Copier Roster tab). You sign in with Google; the sheet stays private and is only read, never changed.</p>
    <label class="fld">Google sign-in client ID <input type="text" id="bnClient" placeholder="1234…apps.googleusercontent.com" value="${esc(saved.bnClientDraft || "")}"></label>
    <label class="fld">Spreadsheet link <input type="text" id="bnSheet" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
    <label class="fld">Tab name <input type="text" id="bnTab" value="Part Copier Roster"></label>
    <div class="row"><button type="button" class="primary" id="bnConnect">Connect</button></div>
    <div class="roster-msg" id="bnMsg"></div></details>`;
  const opts = (bnTables || (link ? [link] : [])).map(t => `<option ${t === link ? "selected" : ""}>${esc(t)}</option>`).join("");
  const pulled = ros && ros.source === "sheet" ? `Pulled from the sheet ${timeAgo(ros.imported)}` : link ? "Not pulled yet for this ensemble" : "";
  return `<div class="sheet-link on">
    <div class="row" style="align-items:center">
      <b>Google Sheet:</b>
      <select id="bnTable" aria-label="Table for this ensemble"><option value="">${bnTables ? "— pick the table for " + esc(saved.current) + " —" : link ? "" : "— click Load tables —"}</option>${opts}</select>
      ${bnTables ? "" : `<button type="button" id="bnLoad">Load tables</button>`}
      <button type="button" class="primary" id="bnPull" ${link ? "" : "disabled"}>Pull roster now</button>
      <button type="button" class="link" id="bnDisconnect">Disconnect</button>
    </div>
    <div class="roster-msg" id="bnMsg">${esc(pulled)}</div>
  </div>`;
}
function timeAgo(iso){
  const ms = Date.now() - new Date(iso); if (isNaN(ms)) return "";
  const m = Math.round(ms / 60000);
  return m < 2 ? "just now" : m < 90 ? `${m} minutes ago` : m < 36 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
}
function bnMsg(t, err){ const el = $("bnMsg"); if (el){ el.className = "roster-msg" + (err ? " err" : ""); el.textContent = t; } }
async function bnAuth(interactive){
  if (bnToken && bnToken.exp > Date.now() + 60000) return bnToken.token;
  if (!interactive) return null;
  const cfg = bnCfg(); if (!cfg) throw new Error("not connected");
  if (!(window.google && google.accounts && google.accounts.oauth2)) await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: BN_SCOPE,
      callback: r => {
        if (r.error){ reject(new Error(r.error_description || r.error)); return; }
        bnToken = { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000, scope: r.scope || "" };
        if (String(bnToken.scope).includes(DRIVEFILE_SCOPE) && !cfg.drivefileOk){ cfg.drivefileOk = true; persist(); }
        try { sessionStorage.setItem("partCopier.bnToken", JSON.stringify(bnToken)); } catch (e) {}
        resolve(bnToken.token);
        setTimeout(() => { renderSyncAuto(); if (syncOn() && syncHasScope()) syncNow(false); }, 0);   // just signed in: sync the setup
      },
      error_callback: e => reject(new Error(e && e.type === "popup_closed" ? "the Google sign-in window was closed" : (e && (e.message || e.type)) || "sign-in failed")) });
    client.requestAccessToken({ prompt: cfg.consented && cfg.driveOk && cfg.appdataOk && cfg.drivefileOk ? "" : "consent" });
  });
}
async function bnFetch(interactive){
  const cfg = bnCfg(), token = await bnAuth(interactive);
  if (!token) return null;
  const range = encodeURIComponent(`'${cfg.tab.replace(/'/g, "''")}'!A1:Z400`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 401){ bnToken = null; try { sessionStorage.removeItem("partCopier.bnToken"); } catch (e) {} if (interactive) return bnFetch(true); return null; }
  if (!res.ok){
    const j = await res.json().catch(() => ({})), msg = (j.error && j.error.message) || res.statusText;
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) throw new Error("the Google Sheets API isn't turned on in your Google Cloud project yet. Enable it (Google Cloud → APIs & Services → Library → Google Sheets API → Enable), wait a minute, then try again");
    throw new Error(res.status === 403 ? "this Google account can't open that sheet (" + msg + ")" : res.status === 404 ? "sheet not found — check the link" : /Unable to parse range/i.test(msg) ? `there's no tab named "${cfg.tab}"` : msg);
  }
  if (!cfg.consented){ cfg.consented = true; persist(); }
  return (await res.json()).values || [];
}
// every "Name | Instrument | Chair" block on the tab, keyed by the title above it
function bnParse(values){
  const out = {};
  for (let r = 0; r < values.length; r++){
    const row = values[r] || [];
    for (let c = 0; c < row.length; c++){
      if (String(row[c]).trim().toLowerCase() !== "name" || !/^instrument$/i.test(String(row[c+1] || "").trim())) continue;
      const above = ((values[r-1] || [])[c] || "").toString().trim();
      let title = above || `Table at column ${String.fromCharCode(65 + c)}`, k = 2;
      while (out[title]) title = `${above || "Table"} (${k++})`;
      const lines = ["Name\tInstrument\tChair"];
      for (let i = r + 1; i < values.length; i++){
        const v = values[i] || [], name = String(v[c] || "").trim();
        if (!name){ if (!String(v[c+1] || "").trim()) break; else continue; }
        lines.push([name, v[c+1] || "", v[c+2] || ""].map(x => String(x).replace(/[\t\n]/g, " ")).join("\t"));
      }
      out[title] = lines.join("\n");
    }
  }
  return out;
}
async function bnPull(interactive, quiet){
  if (bnBusy) return false;
  const link = bnLink(); if (!bnCfg() || !link) return false;
  bnBusy = true;
  try {
    if (!quiet) bnMsg("Reading the sheet…");
    const values = await bnFetch(interactive); if (!values) return false;
    const tables = bnParse(values); bnTables = Object.keys(tables);
    if (!tables[link]) throw new Error(`the table "${link}" isn't on the tab anymore — pick it again`);
    const res = importRoster(tables[link]);
    if (res.error) throw new Error(res.error);
    const prev = roster();
    if (prev && prev.names === false) res.roster.names = false;
    res.roster.source = "sheet";
    saved.rosters = saved.rosters || {}; saved.rosters[saved.current] = res.roster;
    syncCountsFromRoster(); persist(); renderEnsemble(); refresh();
    bnMsg(`Pulled ${res.roster.students.length} students from the sheet just now.`);
    return true;
  } catch (err) { bnMsg("Couldn't read the sheet: " + (err && err.message || err) + ".", true); return false; }
  finally { bnBusy = false; }
}
$("rosterBox").addEventListener("click", async e => {
  const id = e.target.id;
  if (id === "bnConnect"){
    const clientId = $("bnClient").value.trim(), sheetId = sheetIdFrom($("bnSheet").value), tab = $("bnTab").value.trim() || "Part Copier Roster";
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) return bnMsg("The client ID should end in .apps.googleusercontent.com.", true);
    if (!sheetId) return bnMsg("Paste the spreadsheet's link from your browser's address bar.", true);
    saved.bn = { clientId, sheetId, tab }; persist();
    try {
      const values = await bnFetch(true); bnTables = Object.keys(bnParse(values));
      if (!bnTables.length) throw new Error(`no Name / Instrument / Chair table found on "${tab}"`);
      renderRoster(); bnMsg(`Connected — found ${bnTables.length} table${bnTables.length === 1 ? "" : "s"}. Pick the one for ${saved.current}.`);
    } catch (err) { saved.bn = null; saved.bnClientDraft = clientId; persist(); renderRoster(); bnMsg("Couldn't connect: " + (err && err.message || err) + ".", true); }
  }
  if (id === "bnLoad"){
    try { const values = await bnFetch(true); bnTables = Object.keys(bnParse(values)); renderRoster(); }
    catch (err) { bnMsg("Couldn't read the sheet: " + (err && err.message || err) + ".", true); }
  }
  if (id === "bnPull") bnPull(true);
  if (id === "bnDisconnect"){
    if (!confirm("Disconnect the Google Sheet? Rosters already pulled stay until you replace or forget them.")) return;
    try { if (bnToken && window.google && google.accounts) google.accounts.oauth2.revoke(bnToken.token, () => {}); } catch (err) {}
    saved.bn = null; saved.bnLinks = {}; bnToken = null; bnTables = null;
    try { sessionStorage.removeItem("partCopier.bnToken"); } catch (err) {}
    persist(); renderRoster();
  }
});
$("rosterBox").addEventListener("change", e => {
  if (e.target.id === "bnTable"){
    saved.bnLinks = saved.bnLinks || {};
    if (e.target.value) saved.bnLinks[saved.current] = e.target.value; else delete saved.bnLinks[saved.current];
    persist(); renderRoster();
    if (e.target.value) bnPull(true);
  }
});
$("rosterBox").addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("sheet-link")){ saved.bnOpen = e.target.open; } }, true);

function importPanel(){
  return `<div class="roster-import" ${rosterOpen ? "" : "hidden"}>
    <ol>
      <li>In your spreadsheet, select the columns <b>Name</b>, <b>Instrument</b> and <b>Chair</b> (a header row is fine — extra columns are ignored).</li>
      <li>Copy and paste them below, or upload a CSV file.</li>
    </ol>
    <textarea id="rosterText" placeholder="Name&#9;Instrument&#9;Chair&#10;Smith, Jordan&#9;Trumpet&#9;1&#10;Lee, Ava&#9;Trumpet&#9;2nd"></textarea>
    <div class="row" style="margin-top:8px">
      <button type="button" class="primary" id="rosterImport">Import</button>
      <button type="button" id="rosterCancel">Cancel</button>
      <label class="link" style="cursor:pointer;color:var(--accent);text-decoration:underline;font-size:14px">Upload CSV<input type="file" id="rosterFile" accept=".csv,.tsv,.txt,text/csv" hidden></label>
    </div>
    <div class="roster-msg" id="rosterMsg"></div>
  </div>`;
}
$("rosterBox").addEventListener("click", e => {
  const id = e.target.id;
  if (id === "rosterOpenBtn" || id === "rosterReplace"){ rosterOpen = true; renderRoster(); const t = $("rosterText"); if (t) t.focus(); }
  if (id === "rosterCancel"){ rosterOpen = false; renderRoster(); }
  if (id === "rosterForget"){
    if (!confirm(`Forget the roster for "${saved.current}"? Counts stay as they are now.`)) return;
    delete saved.rosters[saved.current]; persist(); rosterOpen = false; renderEnsemble(); refresh();
  }
  if (id === "rosterImport"){
    const res = importRoster($("rosterText").value);
    if (res.error){ $("rosterMsg").className = "roster-msg err"; $("rosterMsg").textContent = res.error; return; }
    saved.rosters = saved.rosters || {};
    const prev = roster();
    if (prev && prev.names === false) res.roster.names = false;
    saved.rosters[saved.current] = res.roster;
    syncCountsFromRoster(); persist(); rosterOpen = false; renderEnsemble(); refresh();
  }
});
$("rosterBox").addEventListener("change", async e => {
  if (e.target.id === "rosterNames"){ roster().names = e.target.checked; persist(); refresh(); }
  if (e.target.id === "rosterFile" && e.target.files[0]){
    $("rosterText").value = await e.target.files[0].text();
    $("rosterMsg").className = "roster-msg"; $("rosterMsg").textContent = `Loaded ${e.target.files[0].name} — click Import.`;
  }
});
function renderTotal(){
  const t = INSTR_IDS.reduce((s, id) => s + (counts()[id] || 0), 0);
  $("countTotal").textContent = `${t} player${t === 1 ? "" : "s"} in ${saved.current}`;
  if (typeof updateSummaries === "function") $("sum1").textContent = $("countTotal").textContent.replace(/ in .*$/, "");
}
function setCount(inst, v){
  v = Math.max(0, Math.min(200, v || 0));
  counts()[inst] = v;
  const tile = $("countGrid").querySelector(`[data-tile="${inst}"]`);
  if (tile) tile.classList.toggle("on", v > 0);
  persist(); renderTotal(); refresh();
}
$("countGrid").addEventListener("input", e => {
  const inst = e.target.dataset.inst; if (!inst || roster()) return;
  setCount(inst, parseInt(e.target.value, 10));
});
$("countGrid").addEventListener("focusin", e => { if (e.target.dataset.inst) e.target.select(); });
$("countGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-step]"); if (!b || roster()) return;
  const inst = b.dataset.for, input = $("cnt-" + inst);
  const v = (counts()[inst] || 0) + parseInt(b.dataset.step, 10);
  input.value = Math.max(0, v); setCount(inst, v);
});
// the folded step 1 keeps a working ensemble picker in its heading
["click", "keydown", "mousedown"].forEach(t => $("ensQuick").addEventListener(t, e => e.stopPropagation()));
$("ensQuick").addEventListener("change", e => { $("ensSelect").value = e.target.value; $("ensSelect").dispatchEvent(new Event("change")); });
$("ensSelect").addEventListener("change", e => { saved.current = e.target.value; rosterOpen = false; persist(); renderEnsemble(); refresh(); if (bnCfg() && bnLink()) bnPull(false, true); });
$("ensNew").addEventListener("click", () => {
  const name = (prompt("Name for the new ensemble (e.g. 7th Grade Band):") || "").trim();
  if (!name) return;
  if (saved.ensembles[name]) { alert("An ensemble with that name already exists."); return; }
  saved.ensembles[name] = blankCounts(); saved.current = name; persist(); renderEnsemble(); refresh();
});
$("ensRename").addEventListener("click", () => {
  const name = (prompt("New name:", saved.current) || "").trim();
  if (!name || name === saved.current) return;
  if (saved.ensembles[name]) { alert("An ensemble with that name already exists."); return; }
  saved.ensembles[name] = saved.ensembles[saved.current]; delete saved.ensembles[saved.current];
  if (saved.rosters && saved.rosters[saved.current]){ saved.rosters[name] = saved.rosters[saved.current]; delete saved.rosters[saved.current]; }
  saved.current = name; persist(); renderEnsemble(); refresh();
});
$("ensDelete").addEventListener("click", () => {
  if (Object.keys(saved.ensembles).length < 2) return;
  if (!confirm(`Delete "${saved.current}"?`)) return;
  delete saved.ensembles[saved.current]; if (saved.rosters) delete saved.rosters[saved.current];
  saved.current = Object.keys(saved.ensembles)[0]; persist(); renderEnsemble(); refresh();
});

