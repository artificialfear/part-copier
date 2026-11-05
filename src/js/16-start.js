/* ---------------------------------------------------------------- theme toggle */
const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function paintThemeToggle(){
  const light = document.documentElement.getAttribute("data-theme") === "light";
  const btn = $("themeToggle");
  btn.innerHTML = light ? ICON_MOON + "<span>Dark mode</span>" : ICON_SUN + "<span>Light mode</span>";
  btn.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  document.querySelector('meta[name="theme-color"]').setAttribute("content", light ? "#f6f4ef" : "#131518");
}
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("partCopier.theme", next); } catch (e) {}
  paintThemeToggle();
});
paintThemeToggle();

/* ---------------------------------------------------------------- start */
renderEnsemble(); renderSettings(); renderCleanSettings(); renderLibrary(); mlRender(); renderSyncAuto(); renderLog(); mlFromLink();
if (syncOn() && syncHasScope()) syncNow(false);   // signed in this session: pick up changes from another computer
(() => { let first = true; try { first = !localStorage.getItem(STORE); } catch (e) {} if (first) $("settingsBox").open = true; })();
