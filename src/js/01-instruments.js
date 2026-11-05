"use strict";
pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

/* ---------------------------------------------------------------- instruments & detection */
const SECTIONS = [
  ["Woodwinds", [["Flute","Flute / Piccolo"],["Oboe","Oboe"],["Bassoon","Bassoon"],["Clarinet","Clarinet"],
                 ["Alto Clarinet","Alto Clarinet"],["Bass Clarinet","Bass Clarinet"],
                 ["Alto Sax","Alto Sax"],["Tenor Sax","Tenor Sax"],["Bari Sax","Bari Sax"]]],
  ["Brass", [["Trumpet","Trumpet"],["Cornet","Cornet"],["Horn","Horn"],["Mellophone","Mellophone"],["Trombone","Trombone"],
             ["Euphonium BC","Euphonium B.C."],["Euphonium TC","Euphonium T.C."],["Tuba","Tuba"],["Sousaphone","Sousaphone"]]],
  ["Percussion & other", [["Percussion","Percussion"],["Piano","Piano / Keyboard"],["String Bass","String / Electric Bass"]]],
  ["Marching percussion", [["Snare","Snare Drum"],["Bass Drum","Bass Drum"],["Tenors","Tenors / Quints"],["Cymbals","Cymbals"]]]
];
// marching battery: their own parts, but a concert set's "Snare Drum" part still goes to the percussionists
const BATTERY = ["Snare","Bass Drum","Tenors","Cymbals"];
const INSTR = SECTIONS.flatMap(s => s[1]);
const INSTR_IDS = INSTR.map(x => x[0]);
const LABEL = Object.fromEntries(INSTR);
LABEL["Score"] = "Score"; LABEL["Other"] = "Not a part / unknown";
const FAMS = INSTR_IDS.concat(["Score","Other"]);
const SHORT = id => LABEL[id].split(" /")[0].replace(/\s*\(.*\)/, "").toLowerCase();

const RX = [
  [/\b(full\s+)?(conductor|score)\b/, "Score"],
  [/\bpiccolo\b/, "Flute"], [/\bflutes?\b/, "Flute"],
  [/\boboes?\b/, "Oboe"], [/\bbassoons?\b/, "Bassoon"],
  [/\balto\s+clarinet/, "Alto Clarinet"], [/\b(bass|contra(alto|bass)?)\s+clarinet/, "Bass Clarinet"], [/\bclarinets?\b/, "Clarinet"],
  [/\bbari(tone)?\s+sax/, "Bari Sax"], [/\bbari\b/, "Bari Sax"], [/\btenor\s+sax/, "Tenor Sax"], [/\balto\s+sax/, "Alto Sax"], [/\bsaxophones?\b/, "Alto Sax"],
  [/\b(trumpets?|flugelhorns?)\b/, "Trumpet"], [/\bcornets?\b/, "Cornet"],
  [/\b(mellophones?|mellos?)\b/, "Mellophone"],
  [/\bhorns?\b/, "Horn"],
  [/\b(baritone|euphonium)\b[^\n]{0,14}(t\.?\s?c\.?|treble)/, "Euphonium TC"],
  [/\b(baritone|euphonium)\b/, "Euphonium BC"],
  [/\btrombones?\b/, "Trombone"], [/\btubas?\b/, "Tuba"], [/\b(sousaphones?|sousas?)\b/, "Sousaphone"],
  [/\b(snares?|snare drums?|snare line)\b/, "Snare"],
  [/\b(bass drums?|bass line|basses)\b|(^|\n)\s*bass\s*([1-6]|i{1,3}|iv|v)?\s*(\n|$)/, "Bass Drum"],
  [/\b(tenors|tenor drums?|tenor line|quints|quads|quad toms|tri-?toms)\b|(^|\n)\s*tenor\s*(\n|$)/, "Tenors"],
  [/\b(cymbals|cymbal line|crash cymbals|cyms)\b/, "Cymbals"],
  [/\bkeyboard\s+percussion\b/, "Percussion"],
  [/\b(mallets?|bells|glockenspiel|xylophone|marimba|vibraphone|chimes)\b/, "Percussion"],
  [/\btimpani\b/, "Percussion"],
  [/\b(percussion|auxiliary|drum ?set|drums?|front ensemble|pit)\b/, "Percussion"],
  [/\b(piano|keyboard)\b/, "Piano"],
  [/\b(string ?bass|electric bass|bass guitar|upright bass|double bass)\b/, "String Bass"]
];
const norm = t => t.toLowerCase().replace(/♭/g, "b");

/* ---- OCR-tolerant reading of part names (copier OCR mangles letters) */
const OCR_WORDS = ["flute","flutes","piccolo","oboe","bassoon","clarinet","clarinets","saxophone","saxophones","trumpet","trumpets",
  "cornet","horn","horns","trombone","trombones","baritone","euphonium","tuba","percussion","timpani","mallet","mallets","bells",
  "marimba","xylophone","vibraphone","glockenspiel","piano","string","alto","tenor","score","conductor","snare",
  "mellophone","mellophones","sousaphone","sousaphones","snares","tenors","quints","basses",
  // real words that must never be "corrected" into an instrument name
  "drumset","drums","cymbal","cymbals","shaker","bongos","congas","timbales","triangle","tambourine","woodblock","cowbell",
  "arranged","composed","words","music","slowly","moderato","allegro","andante","maestoso","latin","swing","ballad","march",
  "opt","optional","solo","soli","tutti","divisi","mute","muted","open"];
function lev(a, b){
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++){
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function fixWord(tok){
  if (!/[a-z]/i.test(tok)) return tok;
  if (/^\d+(st|nd|rd|th)$/i.test(tok)) return tok;          // "1st" is not "lst"
  if (/^[lI|](st)$/.test(tok)) return "1st";                  // …but OCR often reads "1st" as "lst"
  let t = tok;
  if (/\d/.test(t)) t = t.replace(/0/g, "o").replace(/1/g, "l").replace(/5/g, "s");
  const w = t.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length >= 5 && !OCR_WORDS.includes(w)){
    let best = null, bd = 9;
    for (const k of OCR_WORDS){
      if (Math.abs(k.length - w.length) > 2) continue;
      const d = lev(w, k), lim = k.length >= 7 ? 2 : 1;
      if (d <= lim && d < bd){ bd = d; best = k; }
    }
    if (best) return best;
  }
  // digits swapped for letters only help when that spells a known word
  return /\d/.test(tok) && !OCR_WORDS.includes(w) ? tok : t;
}
function mergeFragments(line){
  const toks = line.split(/\s+/);
  for (let i = 0; i + 1 < toks.length; i++){
    const a = toks[i].toLowerCase().replace(/[^a-z]/g, ""), b = toks[i+1].toLowerCase().replace(/[^a-z]/g, "");
    if (!a || !b || OCR_WORDS.includes(a) || OCR_WORDS.includes(b)) continue;
    const joined = fixWord(a + b);
    if (OCR_WORDS.includes(joined)) toks.splice(i, 2, joined);
  }
  return toks.join(" ");
}
function fixOcr(text){
  return String(text || "").replace(/♭/g, "b").split("\n").map(mergeFragments).map(line => line.split(/\s+/).map(tok => {
    if (!tok) return tok;
    const glued = tok.match(/^([A-Za-z]{4,})(\d)$/);                 // PERCUSSION2 -> percussion 2
    if (glued) return fixWord(glued[1]) + " " + glued[2];
    if (/^[1-4](?!st|nd|rd|th)[a-z]$/i.test(tok)) return tok[0];     // "1e" -> 1
    return fixWord(tok);
  }).join(" ")).join("\n");
}
const CANON = { "Flute":"Flute", "Oboe":"Oboe", "Bassoon":"Bassoon", "Clarinet":"Clarinet", "Alto Clarinet":"Alto Clarinet",
  "Bass Clarinet":"Bass Clarinet", "Alto Sax":"Alto Sax", "Tenor Sax":"Tenor Sax", "Bari Sax":"Bari Sax", "Trumpet":"Trumpet",
  "Cornet":"Cornet", "Horn":"Horn", "Trombone":"Trombone", "Euphonium BC":"Euphonium B.C.", "Euphonium TC":"Euphonium T.C.",
  "Tuba":"Tuba", "Percussion":"Percussion", "Piano":"Piano", "String Bass":"String Bass", "Score":"Score",
  "Mellophone":"Mellophone", "Sousaphone":"Sousaphone", "Snare":"Snare Drum", "Bass Drum":"Bass Drum", "Tenors":"Tenors", "Cymbals":"Cymbals" };
function numText(nums){ return !nums.length ? "" : nums.length === 1 ? " " + nums[0] : nums.length === 2 ? ` ${nums[0]} & ${nums[1]}` : ` ${nums[0]}–${nums[nums.length-1]}`; }
function canonLabel(fam, text){
  const t = norm(fixOcr(stripAlt(text)));
  let base = CANON[fam] || fam;
  if (fam === "Percussion"){
    const mal = t.match(/\b(bells|marimba|xylophone|vibraphone|glockenspiel|chimes)\b/g) || [];
    if (/\b(keyboard percussion|mallet percussion|mallets?)\b/.test(t) || new Set(mal).size > 1) base = "Mallet Percussion";
    else if (mal.length) base = mal[0][0].toUpperCase() + mal[0].slice(1);   // "Bells" and "Chimes" are different parts
    else if (/\btimpani\b/.test(t)) base = "Timpani";
  }
  if ((fam === "Euphonium BC" || fam === "Euphonium TC") && /\bbaritone\b/.test(t) && !/\beuphonium\b/.test(t)) base = fam === "Euphonium BC" ? "Baritone B.C." : "Baritone T.C.";
  if (fam === "Flute" && /\bpiccolo\b/.test(t) && !/\bflute\b/.test(t)) base = "Piccolo";
  if (fam === "Trombone" && /\bbass trombone\b/.test(t)) base = "Bass Trombone";
  if (fam === "Score") return "Score";
  const also = alsoFams(fam, text);
  // "Solo Percussion" is a different part from "Percussion"
  if (/\bsolo\b/.test(t) && t.split(/\s+/).length <= 5) base = "Solo " + base;
  return [base + numText(partNums(text))].concat(also.map(f => CANON[f] || f)).join(" / ");
}

// "(Opt. Flute 2)", "(alt. Horn)" etc. name a substitute, not the part
const stripAlt = t => String(t || "").replace(/\((?=[^)]*\b(opt|optional|alt|alternate|or|doubles?)\b)[^)]*\)/gi, " ");
function famHits(text){
  const t = norm(fixOcr(stripAlt(text))), hits = [];
  RX.forEach(([re, fam], order) => { const m = re.exec(t); if (m) hits.push({ fam, at: m.index, end: m.index + m[0].length, order }); });
  hits.sort((a, b) => a.at - b.at || a.order - b.order);
  // one word can't name two instruments: "Baritone Saxophone" is a bari sax, not also a baritone (euphonium)
  const kept = []; let reach = -1;
  for (const h of hits){ if (h.at < reach) continue; kept.push(h); reach = Math.max(reach, h.end); }
  return kept;
}
function classify(text){
  const hits = famHits(text), fams = hits.map(h => h.fam);
  const distinct = new Set(fams); distinct.delete("Percussion"); BATTERY.forEach(f => distinct.delete(f));
  if (fams.includes("Score") || distinct.size >= 5) return "Score";
  return fams[0] || null;
}
// every instrument a combined part names, e.g. "Trombone/Euphonium/Bassoon"
function classifyAll(text){
  const out = [];
  for (const h of famHits(text)) if (h.fam !== "Score" && !out.includes(h.fam)) out.push(h.fam);
  return out;
}
// the other instruments a combined part names: "Trombone / Euphonium / Bassoon", or flex parts printed
// without separators ("Clarinet in Bb Trumpet in Bb", "Flute Oboe")
function alsoFams(fam, text){
  if (!fam || fam === "Score") return [];
  return classifyAll(text).filter(f => f !== fam && INSTR_IDS.includes(f) && !(fam === "Percussion" && BATTERY.includes(f)) && !(BATTERY.includes(fam) && f === "Percussion"));
}
function partNums(label){
  const t = norm(fixOcr(stripAlt(label)));
  let m = t.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:&|and|\/|-|–|,)\s*([1-4])(?:st|nd|rd|th)?\b/);
  if (m){ const a=+m[1], b=+m[2], out=[]; for (let i=Math.min(a,b); i<=Math.max(a,b); i++) out.push(i); return out; }
  m = t.match(/\b([1-4])(?:st|nd|rd|th)?\b/);
  if (m) return [+m[1]];
  m = t.match(/\b(?:bass(?: drum)?|snare(?: drum)?|tenors?|quints|cymbals?)\s*([5-6])\b/);   // bass drums run to 5 or 6
  if (m) return [+m[1]];
  m = t.match(/(clarinet|trumpet|cornet|trombone|horn|mellophone|flute|sax(?:ophone)?|percussion|bass(?: drum)?|snare(?: drum)?)\s+(vi|v|iv|iii|ii|i)\b/);
  if (m) return [{i:1,ii:2,iii:3,iv:4,v:5,vi:6}[m[2]]];
  return [];
}
function cleanLabel(s){
  s = s.replace(/\s[-–]\s*\d+\s*[-–]?\s*$/, "");
  s = s.replace(/\b(page|pg|p)\.?\s*\d+(\s*(of|\/)\s*\d+)?/gi, "");
  s = s.replace(/\b\d+\s*\/\s*\d+\b/g, "");
  return s.replace(/\s+/g, " ").replace(/^[\s\-–]+|[\s\-–]+$/g, "").slice(0, 60);
}
/* ---- flex-band sets: numbered voices (Part 1–5), each printed in several keys/clefs */
const FLEX_DEFAULTS = {
  "C":          v => ["Flute","Oboe"],
  "B♭":         v => v >= 4 ? ["Clarinet","Trumpet","Tenor Sax","Euphonium TC","Bass Clarinet"] : ["Clarinet","Trumpet","Tenor Sax","Euphonium TC"],
  "E♭":         v => ["Alto Sax","Bari Sax"],
  "F":          v => ["Horn"],
  "Bass Clef":  v => v >= 4 ? ["Trombone","Euphonium BC","Bassoon","Tuba"] : ["Trombone","Euphonium BC","Bassoon"]
};
const ROMAN = { i:1, ii:2, iii:3, iv:4, v:5 };
function flexVoice(label){
  const m = norm(String(label || "")).match(/^(?:flex\s+)?part\s*([1-6])\b/);
  return m ? +m[1] : 0;
}
function flexParse(lines){
  const all = lines.map(l => norm(fixOcr(l)));
  const k = all.findIndex(l => /\b(?:flex\s+)?part\s*(?:[1-6]|i{1,3}|iv|v)\b/.test(l));
  if (k < 0) return null;
  const line = all[k], m = line.match(/\b(?:flex\s+)?part\s*([1-6]|i{1,3}|iv|v)\b/);
  const voice = /\d/.test(m[1]) ? +m[1] : ROMAN[m[1]];
  const rest = line.slice(m.index + m[0].length) + " " + line.slice(0, m.index);
  let key = null;
  if (/\bbass\s*clef\b|\bb\.\s?c\.|\(bc\)/.test(rest)) key = "Bass Clef";
  else if (/\b(bb|b flat|b-flat)\b/.test(rest)) key = "B♭";
  else if (/\b(eb|e flat|e-flat)\b/.test(rest)) key = "E♭";
  else if (/\bf\b|\bin f\b/.test(rest)) key = "F";
  else if (/\bc\b|\bconcert\b/.test(rest)) key = "C";
  else if (/\bbass\b(?!\s*(clarinet|sax|saxophone|trombone|drum))/.test(rest)) key = "Bass Clef";
  // instruments named on the part line or the lines just below it
  const named = [];
  for (const l of all.slice(k, k + 3)) for (const f of classifyAll(l)) if (INSTR_IDS.includes(f) && !named.includes(f)) named.push(f);
  if (!key && !named.length) return null;     // "Part 1" alone isn't enough to call it a flex part
  let fams = named.filter(f => f !== "Percussion" || named.length === 1);
  if (!fams.length && key) fams = FLEX_DEFAULTS[key](voice);
  if (!fams.length) return null;
  const label = `Part ${voice}${key ? " " + key : ""} – ${fams.map(f => CANON[f] || f).join(" / ")}`;
  return { fam: fams[0], label, also: fams.slice(1), voice };
}
function labelFromLines(lines){
  const flex = flexParse(lines);
  if (flex) return { fam: flex.fam, label: flex.label, also: flex.also };
  // "Trombone/" + "Euphonium/" + "Bassoon" printed on separate lines is one part name
  // (the title and composer lines can sit between them, so look a few lines ahead for the next instrument)
  lines = lines.slice();
  for (let i = 0; i < lines.length; i++){
    while (/[\/&]\s*$/.test(lines[i])){
      let j = i + 1; while (j < lines.length && j <= i + 3 && !classify(lines[j])) j++;
      if (j >= lines.length || j > i + 3) break;
      lines[i] = lines[i] + " " + lines[j]; lines.splice(j, 1);
    }
  }
  const fam = classify(lines.join("\n"));
  if (!fam) return null;
  const line = lines.find(l => fam === "Score" ? /score|conductor/i.test(l) : classify(l) === fam) || lines.join(" ");
  const clean = cleanLabel(line);
  const also = alsoFams(fam, clean);
  return { fam, label: canonLabel(fam, clean), also };
}

