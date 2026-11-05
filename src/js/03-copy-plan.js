/* ---------------------------------------------------------------- piece state */
const state = { bytes:null, fileName:"", pdf:null, numPages:0, pageInfo:[], starts:new Map(), scanned:false };

function segments(){
  const keys = [...state.starts.keys()].sort((a,b) => a-b);
  return keys.map((p, i) => Object.assign({ start:p, end:(i+1 < keys.length ? keys[i+1]-1 : state.numPages), idx:i }, state.starts.get(p)));
}

/* ---------------------------------------------------------------- copy plan */
function playerLists(){
  const ros = roster(), c = counts(), g = {};
  if (ros){
    const v = rosterView(ros), named = ros.names !== false;
    for (const id of INSTR_IDS) g[id] = (v.byInst[id] || []).map(s => named ? s.display : null);
  } else for (const id of INSTR_IDS) g[id] = Array(c[id] || 0).fill(null);
  return g;
}
function plan(){
  const st = S(), groups = playerLists();
  const rows = segments().map(sg => Object.assign({}, sg, { pages: sg.end - sg.start + 1, nums: [], dup:false, list:[], note:"", flag:false }));
  const seen = new Set();
  for (const r of rows){
    if (INSTR_IDS.includes(r.fam)) r.nums = partNums(r.label);
    const key = r.fam + "|" + r.label.toLowerCase().trim();
    if (r.fam !== "Other" && r.fam !== "Score" && seen.has(key)) r.dup = true;
    seen.add(key);
  }
  // several "Score" sections (cover + notes + the score itself): the longest one is the score
  const scores = rows.filter(r => r.fam === "Score");
  if (scores.length > 1){ const keep = scores.reduce((a, b) => b.pages > a.pages ? b : a); scores.forEach(r => { if (r !== keep) r.front = true; }); }
  const numsBy = {};
  for (const r of rows) if (!r.dup && r.nums.length) { numsBy[r.fam] = numsBy[r.fam] || new Set(); r.nums.forEach(n => numsBy[r.fam].add(n)); }

  // flex-band voices: each instrument's players are split by chair across the voices it appears on
  const flexRows = rows.filter(r => !r.dup && INSTR_IDS.includes(r.fam) && (r.voice = flexVoice(r.label)));
  const isFlex = flexRows.length >= 2;
  if (isFlex){
    flexRows.forEach(r => { r.flexList = []; r.flexFrom = []; r.flexBy = {}; });
    for (const id of INSTR_IDS){
      if (id === "Percussion" || BATTERY.includes(id)) continue;
      const g = groups[id] || []; if (!g.length) continue;
      const targets = flexRows.filter(r => r.fam === id || (r.also || []).includes(id)).sort((a, b) => a.voice - b.voice || a.start - b.start);
      if (!targets.length) continue;
      const n = targets.length, base = Math.floor(g.length / n), rem = g.length % n;
      let off = 0;
      targets.forEach((r, i) => {
        const sh = base + ((st.oddTo === "first" ? i < rem : i >= n - rem) ? 1 : 0);
        const part = g.slice(off, off + sh); off += sh;
        if (part.length) r.flexBy[id] = part;
      });
    }
    // a voice nobody is on: move the lowest-chair player of a section that has two or more on a nearby voice
    const keyOf = r => { const m = r.label.match(/^Part\s*\d\s+(C|B♭|E♭|F|Bass Clef)\b/); return m ? m[1] : null; };
    const covered = v => flexRows.some(r => r.voice === v && Object.values(r.flexBy).some(a => a.length));
    const voices = [...new Set(flexRows.map(r => r.voice))].sort((a, b) => a - b);
    for (const v of voices){
      if (covered(v)) continue;
      let best = null;
      for (const r of flexRows.filter(x => x.voice === v)){
        const k = keyOf(r), cands = [r.fam].concat(r.also || [], k ? FLEX_DEFAULTS[k](v) : []);
        for (const id of [...new Set(cands)]){
          for (const d of flexRows){
            const have = d.flexBy[id] || [];
            if (d === r || d.voice === v || have.length < 2) continue;
            const dist = Math.abs(d.voice - v) * 10 + (d.voice < v ? 0 : 5) + (cands.indexOf(id) > (r.also || []).length ? 1 : 0);
            if (!best || dist < best.dist) best = { r, d, id, dist };
          }
        }
      }
      if (!best) continue;
      const who = best.d.flexBy[best.id].pop();
      (best.r.flexBy[best.id] = best.r.flexBy[best.id] || []).push(who);
      best.r.flexMoved = `${who || "1 " + SHORT(best.id)} moved from Part ${best.d.voice} to cover this voice`;
    }
    flexRows.forEach(r => { for (const [id, a] of Object.entries(r.flexBy)) if (a.length){ r.flexList = r.flexList.concat(a); r.flexFrom.push(`${a.length} ${SHORT(id)}`); } });
  }

  // instruments with no part of their own whose players split across another instrument's parts
  const present = new Set(rows.filter(r => !r.dup).map(r => r.fam));
  if (isFlex) flexRows.forEach(r => (r.also || []).forEach(f => present.add(f)));
  const pooled = {}, pooledFrom = {};
  for (const r of rows){
    if (r.dup || !r.also || !r.also.length || (isFlex && r.voice)) continue;
    for (const f of r.also){
      if (present.has(f)) continue;
      present.add(f);
      const g = groups[f] || [];
      if (!g.length) continue;
      pooled[r.fam] = (pooled[r.fam] || []).concat(g);
      (pooledFrom[r.fam] = pooledFrom[r.fam] || []).push(`${g.length} ${SHORT(f)}`);
    }
  }
  for (const id of INSTR_IDS){
    const g = groups[id], target = st.fallbacks[id] || "";
    if (!g.length || present.has(id) || !target.endsWith("|split")) continue;
    const fam = target.split("|")[0];
    if (!present.has(fam)) continue;
    pooled[fam] = (pooled[fam] || []).concat(g);
    (pooledFrom[fam] = pooledFrom[fam] || []).push(`${g.length} ${SHORT(id)}`);
  }

  for (const r of rows){
    const list = (groups[r.fam] || []).concat(pooled[r.fam] || []), p = list.length;
    const incl = pooledFrom[r.fam] ? ` (incl. ${pooledFrom[r.fam].join(", ")})` : "";
    if (r.fam === "Other"){ r.note = "Not counted — pick an instrument if this is a part"; r.flag = r.pages > 0 && r.label !== "Front matter"; continue; }
    if (r.front){ r.note = "Front matter (cover / notes) — not printed"; continue; }
    if (r.dup){ r.note = r.copyOf ? `Another copy of the part on p. ${r.copyOf} — printed from there` : "Duplicate of an earlier part"; continue; }
    if (isFlex && r.voice && r.flexList){
      r.list = r.flexList.slice();
      r.note = r.list.length ? `Flex part ${r.voice} — ${r.flexFrom.join(", ")}${r.flexMoved ? ` (${r.flexMoved})` : ""}` : "No players on this voice";
      continue;
    }
    if (r.fam === "Score"){ r.list = st.includeScore ? Array(st.scoreCopies).fill(null) : []; r.note = st.includeScore ? "Score" : "Score not included"; continue; }
    if (BATTERY.includes(r.fam) && !(groups[r.fam] || []).length && (groups.Percussion || []).length){
      // e.g. a concert set's "Snare Drum" part, for a band with no marching snares entered
      const perc = groups.Percussion;
      if (st.percAll){ r.list = perc.slice(); r.note = `Every percussionist (no ${SHORT(r.fam)} players entered)`; } else { r.list = [null]; r.note = "1 each — adjust"; }
      r.percRow = true; applyPerc(r);
      continue;
    }
    if (!p){ r.note = "No players entered"; continue; }
    if (r.fam === "Percussion"){
      if (st.percAll){ r.list = list.slice(); r.note = "Every percussionist" + incl; } else { r.list = [null]; r.note = "1 each — adjust"; }
      r.percRow = true; applyPerc(r);
      continue;
    }
    const set = numsBy[r.fam];
    if (r.nums.length && set && set.size > 1){
      const parts = [...set].sort((a,b) => a-b), n = parts.length, base = Math.floor(p/n), rem = p % n;
      let offset = 0; const span = {};
      parts.forEach((num, i) => { const sh = base + ((st.oddTo === "first" ? i < rem : i >= n - rem) ? 1 : 0); span[num] = [offset, offset + sh]; offset += sh; });
      r.list = r.nums.reduce((acc, num) => acc.concat(list.slice(span[num][0], span[num][1])), []);
      r.note = (r.nums.length > 1 ? `${p} players, combined part` : `${p} players ÷ ${n} parts`) + incl;
    } else { r.list = list.slice(); r.note = "All players" + incl; }
  }

  // players with no part in this set
  const missing = [];
  for (const id of INSTR_IDS){
    const g = groups[id];
    if (!g.length) continue;
    if (rows.some(r => !r.dup && (r.fam === id || (r.also || []).includes(id)))) continue;
    const target = st.fallbacks[id] || "";
    let hit = null;
    if (target.endsWith("|split")){
      if (present.has(target.split("|")[0])) hit = true;
    } else if (target){
      const [fam, which] = target.split("|");
      const cands = rows.filter(r => r.fam === fam && !r.dup);
      if (cands.length){
        const hi = r => r.nums.length ? Math.max(...r.nums) : 0;
        hit = cands.reduce((a, b) => which === "low" ? (hi(b) > hi(a) ? b : a) : (hi(b) < hi(a) ? b : a));
        hit.list = hit.list.concat(g); hit.note += ` + ${g.length} ${SHORT(id)}`;
      }
    }
    missing.push({ id, players:g.length, target, applied: !!hit });
  }
  for (const r of rows) if (r.list.length && r.fam !== "Score") r.list = r.list.concat(Array(st.spares).fill(null));
  for (const r of rows){
    r.auto = r.list.length;
    const ov = (r.override ?? null) !== null ? r.override : null;
    r.copies = ov !== null ? ov : r.auto;
    r.print = ov === null ? r.list : (ov <= r.list.length ? r.list.slice(0, ov) : r.list.concat(Array(ov - r.list.length).fill(null)));
    r.names = r.print.filter(Boolean);
  }
  return { rows, missing };
}

/* ---------------------------------------------------------------- percussion assignments (per piece, per ensemble) */
// saved.percAssign[piece][ensemble][part label] = [names who play it]; parts not listed = every percussionist
const pieceKey = () => (($("pieceName") && $("pieceName").value || "").trim().replace(/^Untitled piece$/, "") || state.fileName.replace(/\.pdf$/i, "")).toLowerCase();
function percMap(create){
  const pk = pieceKey(), en = saved.current;
  if (!pk) return null;
  saved.percAssign = saved.percAssign || {};
  if (!saved.percAssign[pk]){ if (!create) return null; saved.percAssign[pk] = {}; }
  if (!saved.percAssign[pk][en]){ if (!create) return null; saved.percAssign[pk][en] = {}; }
  return saved.percAssign[pk][en];
}
function applyPerc(r){
  const m = percMap(false), key = r.label.toLowerCase();
  r.percPool = r.list.filter(Boolean);
  if (!m || !m[key] || !r.list.length || !r.list.some(Boolean)) return;
  const who = new Set(m[key]);
  r.list = r.list.filter(n => n && who.has(n));
  r.note = r.list.length ? `Assigned: ${r.list.length} of the percussion section` : "No percussionist assigned";
  r.percAssigned = true;
}

