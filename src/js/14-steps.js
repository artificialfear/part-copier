/* ---------------------------------------------------------------- collapsible steps */
const FOLD_KEY = "partCopier.folds";
function foldState(){ try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; } }
function setFold(id, collapsed, remember = true){
  const sec = $(id); if (!sec) return;
  sec.classList.toggle("collapsed", collapsed);
  sec.querySelector("h2.fold").setAttribute("aria-expanded", String(!collapsed));
  if (remember){ const f = foldState(); f[id] = collapsed; try { localStorage.setItem(FOLD_KEY, JSON.stringify(f)); } catch (e) {} }
  updateToPrint();
}
function openStep(id){ if ($(id) && $(id).classList.contains("collapsed")) setFold(id, false); }
document.querySelectorAll("h2.fold").forEach(h => {
  const toggle = () => setFold(h.dataset.fold, !$(h.dataset.fold).classList.contains("collapsed"));
  h.addEventListener("click", toggle);
  h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); toggle(); } });
});
$("foldAll").addEventListener("click", () => ["s1", "s2", "s3", "s4"].forEach(id => setFold(id, true)));
$("unfoldAll").addEventListener("click", () => ["s1", "s2", "s3", "s4"].forEach(id => setFold(id, false)));
{ const f = foldState(); for (const id of ["s1", "s2", "s3", "s4"]) if (f[id]) setFold(id, true, false); }
// anything that jumps to a control inside a folded step opens that step first
document.addEventListener("focusin", e => { const sec = e.target.closest && e.target.closest("section.card.collapsed"); if (sec && !e.target.closest("h2.fold")) setFold(sec.id, false); });
function updateSummaries(sum){
  $("sum1").textContent = ($("countTotal").textContent || "").replace(/ in .*$/, "");
  $("sum2").textContent = state.numPages ? `${state.fileName} · ${state.numPages} page${state.numPages === 1 ? "" : "s"}` : "";
  if (sum){
    $("sum3").textContent = `${sum.parts} part${sum.parts === 1 ? "" : "s"}${sum.flags ? ` · ${sum.flags} need${sum.flags === 1 ? "s" : ""} a look` : ""}`;
    $("sum4").textContent = (state.reprintMode ? "Reprint · " : "") + `${sum.copies} cop${sum.copies === 1 ? "y" : "ies"} · ${sum.sheets} sheet${sum.sheets === 1 ? "" : "s"}`;
  }
}
// "Go to print" shows while the print button is off screen
function updateToPrint(){
  const b = $("toPrint"), s4 = $("s4");
  if (s4.hidden){ b.hidden = true; return; }
  const r = (s4.classList.contains("collapsed") ? s4 : $("buildBtn")).getBoundingClientRect();
  b.hidden = r.top < innerHeight && r.bottom > 0;
}
addEventListener("scroll", updateToPrint, { passive: true }); addEventListener("resize", updateToPrint);
$("toPrint").addEventListener("click", () => { openStep("s4"); $("buildBtn").scrollIntoView({ behavior: "smooth", block: "center" }); });

function refresh(){
  if (!state.numPages) return;
  pmSoon();
  const { rows, missing } = plan();
  // missing instruments
  const unlabeled = rows.some(r => r.flag);
  $("missing").innerHTML = unlabeled ? "" : missing.map(m => {
    const name = LABEL[m.id];
    return `<li><span><b>${esc(name)}</b>: ${m.players} player${m.players === 1 ? "" : "s"}, but this set has no ${esc(SHORT(m.id))} part. Give them:</span>
      <select data-fallback="${esc(m.id)}">${fallbackOptions(m.id, m.target, rows)}</select></li>`;
  }).join("");
  // notice
  const unknown = rows.filter(r => r.flag).length;
  let notice = "";
  const guessed = rows.filter(r => r.guessed || r.inferred);
  const real = rows.filter(r => INSTR_IDS.includes(r.fam) && !r.dup), med = real.length ? real.map(r => r.pages).sort((a, b) => a - b)[Math.floor(real.length / 2)] : 0;
  const long = real.filter(r => r.pages >= 3 && r.pages >= med * 2.5);
  let extra = "";
  if (guessed.length) extra += `<p class="notice warn">${guessed.length} part name${guessed.length === 1 ? " was" : "s were"} unreadable and filled in (highlighted below): ${guessed.map(r => `p. ${r.start} ${esc(r.label)}`).join(", ")}. Check them against the page map.</p>`;
  // flex sets: say how players were placed, and warn when a whole voice has nobody on it
  const voiced = rows.filter(r => !r.dup && r.voice);
  if (voiced.length >= 2){
    const byV = {};
    voiced.forEach(r => { byV[r.voice] = (byV[r.voice] || 0) + r.copies; });
    const empty = Object.keys(byV).filter(v => !byV[v]).map(v => "Part " + v);
    extra += `<p class="notice ${empty.length ? "warn" : "info"}">Flex arrangement: each instrument's players are split by chair across the voices printed for that instrument (top chairs on Part 1). A voice nobody would be on gets the lowest-chair player of a section with two or more on a nearby voice.` +
      (empty.length ? ` <b>Nobody is on ${empty.join(" or ")}</b> — that line won't be covered. Type a copy count on one of its rows to assign it.` : "") + `</p>`;
  }
  if (long.length) extra += `<p class="notice warn">${long.map(r => `${esc(r.label)} (${r.pages} pages)`).join(", ")} ${long.length === 1 ? "is" : "are"} much longer than the other parts and may include another part. Check the page map.</p>`;
  if (state.knownParts && !unknown) notice = state.merge ? `<p class="notice ok">Merged ${state.merge.items.length} files — one part per file. Check the instruments and copy counts below.</p>`
                                                          : `<p class="notice ok">Found ${rows.filter(r => INSTR_IDS.includes(r.fam) && !r.copyOf).length} parts${rows.some(r => r.copyOf) ? ` (plus ${rows.filter(r => r.copyOf).length} extra copies the file came with — skipped; each student\u2019s copy prints from the first one)` : ""}. Check the instruments and copy counts below.</p>`;
  else if (state.knownParts && state.merge) notice = `<p class="notice warn">${unknown} file${unknown === 1 ? "" : "s"} didn't say which instrument in the file name. Pick the instrument for ${unknown === 1 ? "it" : "each"} below.</p>`;
  else if (state.scanned && !state.ocrDone) notice = `<p class="notice warn">This PDF is a scan with no readable text. The part names are being read from the page images — or open the page map below, check “start” on the first page of each part, and name each part yourself.</p>`;
  else if (unknown) notice = `<p class="notice warn">${unknown} section${unknown === 1 ? "" : "s"} couldn't be matched to an instrument. Pick one, or leave it as “Not a part” to skip it.</p>`;
  else notice = `<p class="notice ok">Found ${rows.filter(r => INSTR_IDS.includes(r.fam) && !r.copyOf).length} parts${rows.some(r => r.copyOf) ? ` (plus ${rows.filter(r => r.copyOf).length} extra copies the file came with — skipped; each student\u2019s copy prints from the first one)` : ""}. Spot-check the page ranges — open the page map if anything looks merged or split wrong.</p>`;
  $("scanNotice").innerHTML = notice + extra;
  // table
  $("partRows").innerHTML = rows.map(r => {
    const pages = r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`;
    const edited = r.override !== null && r.override !== undefined;
    return `<tr class="${r.copies === 0 ? "zero" : ""} ${r.flag || r.guessed || r.inferred ? "flag" : ""}" data-start="${r.start}">
      <td><span class="sw" style="background:${r.idx % 2 ? "var(--band-b)" : "var(--band-a)"}"></span>${pages}<div class="note">${r.pages} pg</div>${r.label !== "Front matter" ? `<button type="button" class="link rep" data-replace="${r.start}" title="Swap in a better PDF of this part">Replace…</button>` : ""}</td>
      <td><input type="text" data-field="label" value="${esc(r.label)}"></td>
      <td><select data-field="fam">${famOptions(r.fam)}</select></td>
      <td><div class="copies"><input type="number" min="0" max="500" data-field="copies" value="${r.copies}" class="${edited ? "edited" : ""}">
        ${edited ? `<button class="link" data-reset="${r.start}" title="Back to automatic">auto (${r.auto})</button>` : ""}</div></td>
      <td class="note">${esc(edited ? "Set by hand" : r.note)}${r.fam === "Score" && !r.front && !r.dup && !r.copies ? ` <button type="button" class="link" data-score="${r.start}">Print a copy</button>` : ""}${r.guessed ? `<div class="names" style="color:var(--warn)">Name unreadable — guessed from score order. Check page ${r.start}.</div>` : r.inferred ? `<div class="names" style="color:var(--warn)">Part number unreadable — assumed. Check page ${r.start}.</div>` : ""}${r.names.length ? `<div class="names">${r.names.map(esc).join(", ")}</div>` : ""}</td></tr>`;
  }).join("");
  paintPageMap();
  renderPerc(rows);
  renderReview(rows);
  // stats
  const pr = state.reprintMode ? printRows() : rows;
  const copies = pr.reduce((s, r) => s + r.copies, 0);
  const pages = pr.reduce((s, r) => s + r.copies * (r.pages + (S().duplex && r.pages % 2 ? 1 : 0)), 0);
  const sheets = S().duplex ? pages / 2 : pages;
  $("stats").innerHTML =
    `<div class="stat"><b>${copies}</b><span>part copies</span></div>
     <div class="stat"><b>${pages}</b><span>pages in the PDF</span></div>
     <div class="stat"><b>${Math.ceil(sheets)}</b><span>sheets of paper${S().duplex ? " (double-sided)" : ""}</span></div>`;
  const warns = state.reprintMode ? [] : preflight(rows);
  renderPreflight(warns);
  $("buildBtn").disabled = pages === 0 || (warns.length > 0 && !state.preflightOk);
  updateSummaries({ parts: rows.filter(r => INSTR_IDS.includes(r.fam) && !r.dup).length, flags: rows.filter(r => r.flag || r.guessed || r.inferred).length, copies, sheets: Math.ceil(sheets) });
  updateToPrint();
  const n = $("outName");
  if (n.dataset.auto !== "0") n.value = ((($("pieceName").value || "").trim().replace(/^Untitled piece$/, "")) || state.fileName.replace(/\.pdf$/i, "")) + " - " + saved.current + (state.reprintMode ? " - REPRINT.pdf" : " - PRINT.pdf");
}
$("outName").addEventListener("input", e => { e.target.dataset.auto = "0"; });

function percPlayers(rows){
  // everyone who could get a percussion part: the names on percussion rows before any assignment
  const out = [];
  rows.filter(r => r.percRow && !r.dup).forEach(r => (r.percPool || []).forEach(n => { if (!out.includes(n)) out.push(n); }));
  return out;
}
function renderPerc(rows){
  const parts = rows.filter(r => r.percRow && !r.dup);
  const ros = roster(), named = ros && ros.names !== false;
  const players = named ? percPlayers(rows) : [];
  const box = $("percBox");
  if (!named || parts.length < 2 || players.length < 1 || state.reprintMode){ box.hidden = true; return; }
  box.hidden = false;
  const m = percMap(false) || {};
  const has = (r, n) => m[r.label.toLowerCase()] ? m[r.label.toLowerCase()].includes(n) : true;
  $("percGrid").innerHTML = `<thead><tr><th>Student</th>${parts.map(r => `<th title="pp. ${r.start}${r.end > r.start ? "–" + r.end : ""}">${esc(r.label)}</th>`).join("")}<th>Parts</th></tr></thead><tbody>` +
    players.map(n => {
      const cnt = parts.filter(r => has(r, n)).length;
      return `<tr class="${cnt ? "" : "none"}"><td>${esc(n)}</td>${parts.map(r => `<td><input type="checkbox" data-perc-part="${esc(r.label.toLowerCase())}" data-perc-name="${esc(n)}" ${has(r, n) ? "checked" : ""} aria-label="${esc(n)} plays ${esc(r.label)}"></td>`).join("")}<td class="cnt">${cnt}</td></tr>`;
    }).join("") +
    `<tr><td class="cnt">Copies</td>${parts.map(r => `<td class="cnt">${players.filter(n => has(r, n)).length}</td>`).join("")}<td></td></tr></tbody>`;
  const noPart = players.filter(n => !parts.some(r => has(r, n)));
  const noOne = parts.filter(r => !players.some(n => has(r, n)));
  $("percNote").innerHTML = [noPart.length ? `<span style="color:var(--warn)">No part yet: ${noPart.map(esc).join(", ")}.</span>` : "",
                             noOne.length ? `<span style="color:var(--warn)">Nobody on: ${noOne.map(r => esc(r.label)).join(", ")}.</span>` : ""].filter(Boolean).join(" ");
  state.percGaps = { noPart, noOne: noOne.map(r => r.label) };
}
function setPerc(fn){
  const rows = plan().rows, parts = rows.filter(r => r.percRow && !r.dup), players = percPlayers(rows);
  const m = percMap(true);
  parts.forEach((r, j) => { m[r.label.toLowerCase()] = players.filter((n, i) => fn(n, i, r, j, parts.length)); });
  persist(); refresh();
}
$("percGrid").addEventListener("change", e => {
  const t = e.target; if (!t.dataset.percPart) return;
  const rows = plan().rows, parts = rows.filter(r => r.percRow && !r.dup), players = percPlayers(rows);
  const m = percMap(true);
  // first edit: start from "everyone on every part"
  parts.forEach(r => { const k = r.label.toLowerCase(); if (!m[k]) m[k] = players.slice(); });
  const k = t.dataset.percPart, n = t.dataset.percName;
  m[k] = t.checked ? [...new Set(m[k].concat(n))] : m[k].filter(x => x !== n);
  persist(); refresh();
});
$("percAll").addEventListener("click", () => { const m = percMap(false); if (m){ for (const k of Object.keys(m)) delete m[k]; persist(); } refresh(); });
$("percNone").addEventListener("click", () => setPerc(() => false));
$("percSpread").addEventListener("click", () => setPerc((n, i, r, j, np) => i % np === j));

/* ---------------------------------------------------------------- hand-out list */
$("handoutBtn").addEventListener("click", async () => {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const rows = (state.reprintMode ? printRows() : plan().rows).filter(r => r.copies > 0);
  if (!rows.length) return;
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2019]/g, "");
  const W = 612, H = 792, M = 48, colPart = 170, colN = 44, size = 10.5, lh = 14;
  let page = null, y = 0, pageNo = 0;
  const piece = ($("pieceName").value || "").trim().replace(/^Untitled piece$/, "") || state.fileName.replace(/\.pdf$/i, "");
  const header = () => {
    page = doc.addPage([W, H]); pageNo++; y = H - M;
    page.drawText(safe(piece), { x: M, y, size: 16, font: bold }); y -= 20;
    page.drawText(safe(`${saved.current}${state.reprintMode ? " — reprint" : ""} — hand-out list — ${new Date().toLocaleDateString()}`), { x: M, y, size: 10, font, color: rgb(.35, .35, .35) });
    if (pageNo > 1) page.drawText(`page ${pageNo}`, { x: W - M - 40, y, size: 10, font, color: rgb(.35, .35, .35) });
    y -= 24;
    page.drawText("Part", { x: M, y, size: 10, font: bold }); page.drawText("Copies", { x: M + colPart, y, size: 10, font: bold }); page.drawText("Students (chair order)", { x: M + colPart + colN + 8, y, size: 10, font: bold });
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: .8, color: rgb(.6, .6, .6) }); y -= 14;
  };
  const wrap = (text, width, f) => {
    const words = safe(text).split(" "), lines = []; let cur = "";
    for (const w of words){ const t = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(t, size) > width && cur){ lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines.length ? lines : [""];
  };
  header();
  let total = 0;
  for (const r of rows){
    const named = r.print.filter(Boolean), blank = r.print.length - named.length;
    const who = named.join(", ") + (blank ? `${named.length ? ", " : ""}${blank} without a name` : "");
    const L = wrap(who, W - 2*M - colPart - colN - 8, font), P = wrap(r.label, colPart - 8, bold);
    const h = Math.max(L.length, P.length) * lh + 6;
    if (y - h < M) header();
    P.forEach((t, i) => page.drawText(t, { x: M, y: y - i * lh, size, font: bold }));
    page.drawText(String(r.copies), { x: M + colPart + 10, y, size, font });
    L.forEach((t, i) => page.drawText(t, { x: M + colPart + colN + 8, y: y - i * lh, size, font }));
    y -= h; page.drawLine({ start: { x: M, y: y + lh - 4 }, end: { x: W - M, y: y + lh - 4 }, thickness: .3, color: rgb(.8, .8, .8) });
    total += r.copies;
  }
  if (y - 20 < M) header();
  page.drawText(`${total} part copies`, { x: M, y: y - 6, size: 10, font: bold });
  downloadBytes(await doc.save(), `${piece} - ${saved.current} - HAND-OUT LIST.pdf`);
});

/* ---------------------------------------------------------------- check before printing */
function preflight(rows){
  const out = [], ros = roster(), en = saved.current, mute = (saved.preflightMute || {})[en] || {};
  if (ros){
    const v = rosterView(ros);
    // split parts but nobody in that section has a chair
    const splitFams = [...new Set(rows.filter(r => !r.dup && r.nums && r.nums.length && (r.note || "").includes("÷")).map(r => r.fam))];
    const noChair = splitFams.filter(f => (v.byInst[f] || []).length > 1 && (v.byInst[f] || []).every(s => s.chair == null));
    if (noChair.length && !mute.chairs) out.push({ id: "chairs", text: `No chair placements for ${noChair.map(f => SHORT(f)).join(", ")} — 1st/2nd parts are split alphabetically.`,
      why: "If this ensemble normally has chairs, the chair sheet may have lost its connection. Re-copy the roster from Band Ninja once chairs show again.", mutable: true });
    // a tie that lands exactly where a part splits
    for (const f of splitFams){
      const g = (v.byInst[f] || []).filter(s => s.chair != null), parts = rows.filter(r => !r.dup && r.fam === f && r.nums.length === 1 && r.names.length);
      for (const r of parts){
        const last = g.find(s => s.display === r.names[r.names.length - 1]);
        if (!last) continue;
        const across = g.filter(s => s.chair === last.chair && !r.names.includes(s.display));
        const tk = f + ":" + last.chair; if (across.length && out.some(w => w.tk === tk)) continue;
        if (across.length) out.push({ tk, id: "tie", text: `${r.label}: ${last.display} and ${across.map(s => s.display).join(", ")} are tied at chair ${last.chair} but end up on different parts.`, why: "Decide who takes the higher part, then set their chairs in the roster." });
      }
    }
    const days = ros.imported ? Math.floor((Date.now() - new Date(ros.imported)) / 86400000) : null;
    const hours = ros.imported ? (Date.now() - new Date(ros.imported)) / 3600000 : null;
    if (bnCfg() && bnLink() && hours !== null && hours > 12)
      out.push({ id: "pull", text: `The roster was last pulled from the Google Sheet ${timeAgo(ros.imported)}.`, why: "Pull it again to pick up chair changes, new students and drops.", pull: true });
    else if (days !== null && days > 14 && !mute.stale) out.push({ id: "stale", text: `The roster was imported ${days} days ago.`, why: "New students, drops and chair changes since then won't be in this print. Re-copy it from Band Ninja (Replace roster).", mutable: true });
    if (ros.skipped && ros.skipped.length) out.push({ id: "skipped", text: `Not on any part: ${ros.skipped.join("; ")}.`, why: "These rows in the roster had no recognizable instrument, so they get no music. Fix the instrument in Band Ninja and re-copy the roster." });
  }
  const gaps = state.percGaps;
  if (gaps && !$("percBox").hidden){
    if (gaps.noPart.length) out.push({ id: "percNo", text: `Percussionists with no part: ${gaps.noPart.join(", ")}.`, why: "Tick at least one part for them in step 3." });
  }
  return out;
}
function renderPreflight(warns){
  const box = $("preflight");
  const sig = JSON.stringify(warns.map(w => w.text));
  if (sig !== state.preflightSig){ state.preflightSig = sig; state.preflightOk = false; }
  if (!warns.length){ box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<b class="h">Check before printing</b><ul>${warns.map(w => `<li>${esc(w.text)}<div class="why">${esc(w.why)}${w.pull ? ` <button type="button" class="link mute" data-pull="1">Pull roster now</button>` : ""}${w.mutable ? ` <button type="button" class="link mute" data-mute="${w.id}">Don't warn about this for ${esc(saved.current)}</button>` : ""}</div></li>`).join("")}</ul>
    <label class="ack"><input type="checkbox" id="preflightAck" ${state.preflightOk ? "checked" : ""}> I've checked these — let me download</label>`;
}
$("preflight").addEventListener("change", e => { if (e.target.id === "preflightAck"){ state.preflightOk = e.target.checked; $("buildBtn").disabled = !state.preflightOk; } });
$("preflight").addEventListener("click", e => {
  if (e.target.closest("[data-pull]")){ bnPull(true); return; }
  const b = e.target.closest("[data-mute]"); if (!b) return;
  saved.preflightMute = saved.preflightMute || {};
  (saved.preflightMute[saved.current] = saved.preflightMute[saved.current] || {})[b.dataset.mute] = true;
  persist(); refresh();
});

$("partRows").addEventListener("click", e => {
  const b = e.target.closest("[data-score]"); if (!b) return;
  const st = state.starts.get(+b.dataset.score); if (!st) return;
  st.override = 1; state.userTouched = true; refresh();
});
$("partRows").addEventListener("change", e => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const st = state.starts.get(+tr.dataset.start); if (!st) return;
  const f = e.target.dataset.field;
  st.guessed = st.inferred = st.unknown = false; state.userTouched = true;
  if (f === "label"){ st.label = e.target.value.trim() || st.label; st.also = alsoFams(classify(st.label), st.label); const fam = classify(st.label); if (fam && !st.famManual) st.fam = fam; }
  if (f === "fam"){ st.fam = e.target.value; st.famManual = true; }
  if (f === "copies"){ const v = parseInt(e.target.value, 10); st.override = isNaN(v) ? null : Math.max(0, v); }
  refresh();
});
$("partRows").addEventListener("click", e => {
  const p = +e.target.dataset.reset; if (!p) return;
  const st = state.starts.get(p); if (st) { st.override = null; refresh(); }
});
$("missing").addEventListener("change", e => {
  const id = e.target.dataset.fallback; if (!id) return;
  S().fallbacks[id] = e.target.value; persist(); refresh();
});
$("resetOverrides").addEventListener("click", () => { state.starts.forEach(s => s.override = null); refresh(); });

