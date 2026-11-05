/* ---------------------------------------------------------------- UI: page map */
let observer = null;
function buildPageMap(){
  const box = $("pages"); box.innerHTML = "";
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting){ observer.unobserve(en.target); renderThumb(en.target); } }), { rootMargin: "300px" });
  for (let p = 1; p <= state.numPages; p++){
    const d = document.createElement("div");
    d.className = "pg"; d.dataset.page = p;
    d.innerHTML = `<canvas></canvas><div class="lbl"></div><div class="meta"><span>p. ${p}</span>
      <label><input type="checkbox" data-start="${p}" ${p === 1 ? "disabled" : ""}>start</label></div>`;
    box.appendChild(d); observer.observe(d);
  }
}
async function renderThumb(el){
  try {
    const page = await state.pdf.getPage(+el.dataset.page);
    const vp1 = page.getViewport({ scale: 1 }), scale = 220 / vp1.width, vp = page.getViewport({ scale });
    const cv = el.querySelector("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.minHeight = "0";
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  } catch (e) {}
}
$("pages").addEventListener("change", e => {
  const p = +e.target.dataset.start; if (!p) return;
  state.userTouched = true;
  if (e.target.checked){
    const pi = state.pageInfo[p-1] || {};
    state.starts.set(p, { label: pi.label || ("Part starting p. " + p), fam: pi.fam || "Other", override: null });
  } else state.starts.delete(p);
  refresh();
});
function paintPageMap(){
  const segs = segments();
  segs.forEach(sg => {
    for (let p = sg.start; p <= sg.end; p++){
      const el = $("pages").querySelector(`[data-page="${p}"]`); if (!el) continue;
      el.style.borderColor = sg.idx % 2 ? "var(--band-b)" : "var(--band-a)";
      el.classList.toggle("start", p === sg.start);
      el.querySelector(".lbl").textContent = p === sg.start ? sg.label : "";
      el.querySelector("input").checked = p === sg.start;
    }
  });
}

/* ---------------------------------------------------------------- UI: parts table */
function famOptions(sel){ return FAMS.map(f => `<option value="${esc(f)}" ${f === sel ? "selected" : ""}>${esc(LABEL[f])}</option>`).join(""); }
function fallbackOptions(id, cur, rows){
  const fams = INSTR_IDS.filter(f => rows.some(r => r.fam === f && !r.dup));
  let html = `<option value="">no copies</option>`;
  for (const f of fams){
    const multi = f !== "Percussion" && rows.filter(r => r.fam === f && !r.dup).length > 1;
    if (f === "Percussion"){
      html += `<option value="Percussion|split" ${cur && cur.startsWith("Percussion|") ? "selected" : ""}>Percussion — every percussion part</option>`;
    } else if (multi){
      html += `<option value="${esc(f)}|split" ${cur === f+"|split" ? "selected" : ""}>${esc(LABEL[f])} — split across its parts</option>`;
      html += `<option value="${esc(f)}|top" ${cur === f+"|top" ? "selected" : ""}>${esc(LABEL[f])} — top part</option>`;
      html += `<option value="${esc(f)}|low" ${cur === f+"|low" ? "selected" : ""}>${esc(LABEL[f])} — lowest part</option>`;
    } else {
      // one part: split / top / lowest all mean "that part"
      html += `<option value="${esc(f)}|low" ${cur && cur.startsWith(f + "|") ? "selected" : ""}>${esc(LABEL[f])}</option>`;
    }
  }
  return html;
}

