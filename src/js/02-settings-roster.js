/* ---------------------------------------------------------------- saved settings */
const STORE = "partCopier.v1";
const DEFAULT_SETTINGS = { oddTo:"first", percAll:true, spares:0, includeScore:false, scoreCopies:1, duplex:false,
                           fallbacks:{ "Bassoon":"Trombone|low", "Trumpet":"Cornet|split", "Cornet":"Trumpet|split",
                                        "Horn":"Mellophone|split", "Mellophone":"Horn|split", "Tuba":"Sousaphone|split", "Sousaphone":"Tuba|split",
                                        "Snare":"Percussion|split", "Bass Drum":"Percussion|split", "Tenors":"Percussion|split", "Cymbals":"Percussion|split" },
                           clean:{ v:2, deskew:true, mode:"bw", darkness:0, edges:false, blanks:true, fit:"letter", dpi:300 } };
function blankCounts(){ return Object.fromEntries(INSTR_IDS.map(id => [id, 0])); }
let saved = load();
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (s && s.ensembles && Object.keys(s.ensembles).length) {
      s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
      s.settings.fallbacks = Object.assign({}, DEFAULT_SETTINGS.fallbacks, (s.settings||{}).fallbacks || {});
      const oldClean = (s.settings||{}).clean || {};
      s.settings.clean = Object.assign({}, DEFAULT_SETTINGS.clean, oldClean);
      if (oldClean.v !== 2){ s.settings.clean.edges = false; s.settings.clean.v = 2; }
      for (const k in s.ensembles) s.ensembles[k] = Object.assign(blankCounts(), s.ensembles[k]);
      if (!s.ensembles[s.current]) s.current = Object.keys(s.ensembles)[0];
      s.rosters = s.rosters || {};
      return s;
    }
  } catch (e) {}
  return { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ensembles: { "My Band": blankCounts() }, current: "My Band", rosters: {} };
}
let syncQuiet = false;   // true while a synced setup is being applied (not a local change)
function persist(){
  if (!syncQuiet) saved.localAt = new Date().toISOString();
  try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) {}
  if (!syncQuiet && typeof syncSoon === "function") syncSoon();
}
const S = () => saved.settings;
const counts = () => saved.ensembles[saved.current];
const roster = () => (saved.rosters || {})[saved.current] || null;

/* ---------------------------------------------------------------- roster import */
const INST_RX = [
  [/\b(snare|snares|snare drum|sd)\b/, "Snare"],
  [/\b(bass drum|bass drums|bd|basses)\b/, "Bass Drum"],
  [/\b(tenors?|tenor drums?|quints|quads|tri ?toms)\b(?!\s*(sax|saxophone))/, "Tenors"],
  [/\b(cymbals?|cyms?)\b/, "Cymbals"],
  [/\b(perc|percussion|drums?|mallets?|timp|timpani|bells|xylophone|marimba|pit|front ensemble)\b/, "Percussion"],
  [/\balto\s*(clar|clarinet|cl)\b/, "Alto Clarinet"],
  [/\b(bass|contra\w*)\s*(clar|clarinet|cl)\b|\bbcl\b/, "Bass Clarinet"],
  [/\b(clar|clarinet|cl|bb clarinet)\b/, "Clarinet"],
  [/\b(bari|baritone)\s*(sax|saxophone)\b|\bbari\b/, "Bari Sax"],
  [/\btenor\s*(sax|saxophone)\b|\btsax\b/, "Tenor Sax"],
  [/\b(alto\s*)?(sax|saxophone|asax)\b/, "Alto Sax"],
  [/\b(picc|piccolo|flute|fl|flt)\b/, "Flute"],
  [/\b(oboe|ob)\b/, "Oboe"],
  [/\b(bassoon|bsn)\b/, "Bassoon"],
  [/\b(cornet|cnt)\b/, "Cornet"],
  [/\b(trumpet|tpt|trp)\b/, "Trumpet"],
  [/\b(mellophone|mello)\b/, "Mellophone"],
  [/\b(horn|hn)\b/, "Horn"],
  [/\b(trombone|tbn|trb|tbone|bone)\b/, "Trombone"],
  [/\b(euph|euphonium|baritone)\b.*\b(tc|treble)\b|\b(tc|treble)\b.*\b(euph|euphonium|baritone)\b/, "Euphonium TC"],
  [/\b(euph|euphonium|baritone)\b/, "Euphonium BC"],
  [/\b(sousaphone|sousa)\b/, "Sousaphone"],
  [/\b(tuba|tba)\b/, "Tuba"],
  [/\b(piano|keyboard|keys|pno)\b/, "Piano"],
  [/\b(string bass|electric bass|bass guitar|upright bass|double bass|bass)\b/, "String Bass"]
];
function normInst(text){
  const t = norm(String(text || "")).replace(/[.\-_\/]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [re, id] of INST_RX) if (re.test(t)) return id;
  return null;
}
function parseTable(text){
  text = String(text || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  if (text.includes("\t")) return text.split("\n").map(l => l.split("\t"));
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){ if (ch === '"'){ if (text[i+1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ","){ row.push(cell); cell = ""; }
    else if (ch === "\n"){ row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}
function splitName(full){
  full = String(full || "").replace(/\s+/g, " ").trim();
  if (full.includes(",")){ const [last, first] = full.split(/,(.*)/s).map(x => (x || "").trim()); return { first: first || last, last: first ? last : "" }; }
  const parts = full.split(" "); return { first: parts[0], last: parts.slice(1).join(" ") };
}
function importRoster(text){
  const rows = parseTable(text).filter(r => r.some(c => String(c).trim()));
  if (!rows.length) return { error: "Nothing to import — paste your roster first." };
  const head = rows[0].map(c => String(c).trim().toLowerCase());
  const find = re => head.findIndex(h => re.test(h));
  let iName = find(/^(name|student|student name|full name|students?)$/), iFirst = find(/^first( name)?$/), iLast = find(/^last( name)?$/);
  let iInst = find(/instrument|^inst\.?$|^part$/);
  let iChair = find(/^rank#?$|^rank\b/); if (iChair < 0) iChair = find(/chair|seat|position/);
  const hasHeader = (iName >= 0 || iFirst >= 0) && iInst >= 0;
  if (!hasHeader){ iName = 0; iInst = 1; iChair = rows[0].length > 2 ? 2 : -1; iFirst = iLast = -1; }
  const body = hasHeader ? rows.slice(1) : rows;
  const students = [], skipped = [];
  for (const r of body){
    const cell = i => (i >= 0 && i < r.length ? String(r[i]).trim() : "");
    const name = iName >= 0 ? cell(iName) : [cell(iFirst), cell(iLast)].filter(Boolean).join(" ");
    const instText = cell(iInst);
    if (!name && !instText) continue;
    if (!name){ skipped.push(`(no name) — ${instText}`); continue; }
    const inst = normInst(instText);
    if (!inst){ skipped.push(instText ? `${name} — instrument "${instText}" not recognized` : `${name} — no instrument listed`); continue; }
    const m = cell(iChair).match(/\d+/);
    const nm = (iName < 0 && iLast >= 0) ? { first: cell(iFirst), last: cell(iLast) } : splitName(name);
    students.push({ name, first: nm.first, last: nm.last, inst, chair: m ? parseInt(m[0], 10) : null });
  }
  if (!students.length) return { error: "No students could be read. Check that the columns are Name, Instrument, Chair." };
  return { roster: { students, skipped, names: true, imported: new Date().toISOString() } };
}
function rosterView(ros){
  const studs = ros.students.map(s => Object.assign({}, s));
  const byFirst = {};
  studs.forEach(s => (byFirst[s.first.toLowerCase()] = byFirst[s.first.toLowerCase()] || []).push(s));
  for (const g of Object.values(byFirst)) g.forEach(s => {
    if (g.length < 2 || !s.last){ s.display = s.first; return; }
    const ini = s.last[0].toUpperCase();
    const clash = g.some(o => o !== s && o.last && o.last[0].toUpperCase() === ini);
    s.display = s.first + " " + (clash ? s.last : ini + ".");
  });
  const byInst = {}, notes = [];
  studs.forEach(s => (byInst[s.inst] = byInst[s.inst] || []).push(s));
  const noChair = [], ties = [];
  for (const [id, g] of Object.entries(byInst)){
    g.sort((a, b) => (a.chair == null) - (b.chair == null) || (a.chair ?? 0) - (b.chair ?? 0) || a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    const seen = {};
    g.forEach(s => { if (s.chair == null) noChair.push(`${s.display} (${SHORT(id)})`); else (seen[s.chair] = seen[s.chair] || []).push(s.display); });
    for (const [ch, names] of Object.entries(seen)) if (names.length > 1) ties.push(`${LABEL[id]} chair ${ch}: ${names.join(", ")}`);
  }
  if (noChair.length) notes.push(`No chair number (placed last in their section, alphabetically): ${noChair.join("; ")}`);
  if (ties.length) notes.push(`Tied chairs (ordered alphabetically — check if a tie falls where a part splits): ${ties.join("; ")}`);
  if (ros.skipped && ros.skipped.length) notes.push(`Not imported: ${ros.skipped.join("; ")}`);
  return { byInst, notes, total: studs.length };
}
function syncCountsFromRoster(){
  const ros = roster(); if (!ros) return;
  const v = rosterView(ros), c = counts();
  for (const id of INSTR_IDS) c[id] = (v.byInst[id] || []).length;
}

