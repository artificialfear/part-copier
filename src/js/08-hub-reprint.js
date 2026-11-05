/* ---------------------------------------------------------------- reprint from a Hub lost-part request */
// Each request = { name: "Lane, Rio", inst: "Saxophone", part: "1" | "2" | "3" | "Snare" | … | "" }.
// A student on one of the rosters gets the part the copy plan gives them, with their name on it; anyone else gets a
// blank copy of the part matching their instrument and part number. Nothing prints until the teacher clicks Download.
const nameKey = s => { const n = splitName(s); return (n.first + " " + n.last).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim(); };
function findStudent(name){
  const k = nameKey(name);
  const order = [saved.current].concat(Object.keys(saved.rosters || {}).filter(n => n !== saved.current));
  for (const ens of order){
    const ros = (saved.rosters || {})[ens]; if (!ros || !ros.students || !saved.ensembles[ens]) continue;
    const v = rosterView(ros);
    for (const id in v.byInst) for (const st of v.byInst[id]) if (nameKey(st.name) === k) return { ens, display: st.display, inst: id };
  }
  return null;
}
const REPRINT_PERC = { Snare: /snare|drum|percussion/i, Mallets: /mallet|bell|glock|xylo|marimba|vibe/i, Timpani: /timp/i, Aux: /aux|cymbal|triangle|percussion/i };
function applyReprint(list){
  const found = list.map(q => ({ q, hit: findStudent(q.name) }));
  const tally = {}; found.forEach(f => { if (f.hit) tally[f.hit.ens] = (tally[f.hit.ens] || 0) + 1; });
  const ens = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  if (ens && ens !== saved.current){ saved.current = ens; persist(); renderEnsemble(); }
  // the whole-set plan says who is on which part
  document.querySelector('#printMode input[value="all"]').checked = true; state.reprintMode = false; state.reprint = new Map();
  const rows = plan().rows.filter(r => !r.dup && !r.front && r.fam !== "Score");
  const done = [], blank = [], missing = [];
  for (const { q, hit } of found){
    let mine = hit && hit.ens === saved.current ? rows.filter(r => (r.names || []).includes(hit.display)) : [];
    if (mine.length > 1 && REPRINT_PERC[q.part]) { const only = mine.filter(r => REPRINT_PERC[q.part].test(r.label)); if (only.length) mine = only; }
    if (mine.length){
      mine.forEach(r => { const sel = reprintSel(r.start); sel.on = true; sel.names.add(hit.display); if (sel.blank == null) sel.blank = 0; });
      done.push(`${hit.display} → ${mine.map(r => r.label).join(", ")}`); continue;
    }
    // not on this ensemble's roster: a blank copy of the matching part
    const id = (hit && hit.inst) || normInst(q.inst);
    let cands = id ? rows.filter(r => r.fam === id || (r.also || []).includes(id)) : [];
    if (cands.length > 1 && /^\d$/.test(q.part)) { const n = cands.filter(r => new RegExp("\\b" + q.part + "\\b").test(r.label)); if (n.length) cands = n; }
    if (cands.length > 1 && REPRINT_PERC[q.part]) { const n = cands.filter(r => REPRINT_PERC[q.part].test(r.label)); if (n.length) cands = n; }
    if (!cands.length){ missing.push(`${q.name} (${q.inst || "no instrument"})`); continue; }
    const r = cands[0], sel = reprintSel(r.start); sel.on = true; sel.blank = (sel.blank || 0) + 1;
    blank.push(`${q.name} → ${r.label}${cands.length > 1 ? " (check: more than one fits)" : ""}`);
  }
  const radio = document.querySelector('#printMode input[value="some"]');
  radio.checked = true; radio.dispatchEvent(new Event("change"));
  openStep("s4");
  const msg = [];
  if (done.length) msg.push(`Reprint ready${ens ? " (" + ens + ")" : ""}: ${done.join("; ")}.`);
  if (blank.length) msg.push(`Not on a roster here, so a blank copy: ${blank.join("; ")}.`);
  if (missing.length) msg.push(`No part found for ${missing.join("; ")}: pick it below.`);
  $("buildStatus").textContent = msg.join(" ") + " Check the parts, then Download print PDF.";
  return { done, blank, missing };
}

