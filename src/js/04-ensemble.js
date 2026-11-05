/* ---------------------------------------------------------------- UI: ensemble */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));

function renderEnsemble(){
  $("ensSelect").innerHTML = $("ensQuick").innerHTML = Object.keys(saved.ensembles).map(n => `<option ${n === saved.current ? "selected" : ""}>${esc(n)}</option>`).join("");
  $("ensQuick").value = saved.current;
  $("countGrid").innerHTML = SECTIONS.map(([sec, list]) =>
    `<div class="sec"><div class="sec-title">${esc(sec)}</div><div class="tiles">` +
    list.map(([id, lab]) => {
      const v = counts()[id] || 0;
      return `<div class="tile ${v > 0 ? "on" : ""}" data-tile="${esc(id)}">
        <label class="tile-name" for="cnt-${esc(id)}">${esc(lab)}</label>
        <div class="stepper">
          <button type="button" data-step="-1" data-for="${esc(id)}" aria-label="One fewer ${esc(lab)}">−</button>
          <input type="number" min="0" max="200" id="cnt-${esc(id)}" data-inst="${esc(id)}" value="${v}" inputmode="numeric">
          <button type="button" data-step="1" data-for="${esc(id)}" aria-label="One more ${esc(lab)}">+</button>
        </div></div>`;
    }).join("") + `</div></div>`).join("");
  const ros = roster();
  $("countGrid").querySelectorAll(".tiles").forEach(t => t.classList.toggle("locked", !!ros));
  $("countGrid").querySelectorAll("input[data-inst]").forEach(i => { i.readOnly = !!ros; i.tabIndex = ros ? -1 : 0; });
  renderRoster();
  renderTotal();
  $("ensDelete").disabled = Object.keys(saved.ensembles).length < 2;
}
let rosterOpen = false;
function renderRoster(){
  setTimeout(renderSyncAuto, 0);
  if (typeof mlRender === "function") setTimeout(mlRender);   // the Music Library loader appears once Google sign-in is set up
  const ros = roster(), box = $("rosterBox");
  if (ros){
    const v = rosterView(ros), when = new Date(ros.imported);
    box.innerHTML = `<div class="roster-card has">
      <div class="roster-head">
        <div class="t"><b>Roster: ${v.total} student${v.total === 1 ? "" : "s"}</b>
          <span>Imported ${esc(isNaN(when) ? "" : when.toLocaleDateString())} · counts below come from the roster · split parts follow chair order</span></div>
        <div class="row">
          <label class="chk"><input type="checkbox" id="rosterNames" ${ros.names !== false ? "checked" : ""}> Print names on parts</label>
          <button type="button" id="rosterReplace">Replace roster</button>
          <button type="button" id="rosterForget">Forget roster</button>
        </div>
      </div>
      ${v.notes.length ? `<ul class="roster-notes">${v.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="note" style="margin:8px 0 0">Names are saved only in this browser. On a shared computer, click Forget roster when you're done.</p>
      ${sheetPanel()}
      ${importPanel()}
    </div>`;
  } else {
    box.innerHTML = `<div class="roster-card">
      <div class="roster-head">
        <div class="t"><b>Have a roster with chair placements? (optional)</b>
          <span>Import names to print one named copy per student, with split parts assigned by chair.</span></div>
        <button type="button" id="rosterOpenBtn">Import roster</button>
      </div>
      ${sheetPanel()}
      ${importPanel()}
    </div>`;
  }
}
