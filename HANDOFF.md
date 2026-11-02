# Part Copier — handoff notes

Single-page tool (index.html) on GitHub Pages: https://artificialfear.github.io/part-copier/
Libraries bundled in lib/ (PDF.js 3.11.174, pdf-lib 1.17.1, Tesseract.js 5.1.1 + eng best_int).
No student data in the repo — rosters live in each browser's localStorage (key partCopier.v1).

## How it works (where to look)
- Detection: RX/famHits/classify/labelFromLines (part names), flexParse (numbered flex voices),
  detectStarts (title-based part starts, continuation headers), inferNames (copies, renumbering, score order),
  readPageImages/ocrHeader/ocrLeft/findScore (OCR for scans, nameless or junk text layers).
- Copy plan: plan() — chair splits, combined/flex parts, fallbacks (settings.fallbacks), percussion
  (applyPerc + saved.percAssign[piece][ensemble][label]), BATTERY fallback to percussionists.
- Checks: preflight()/renderPreflight() — mutable warnings stored in saved.preflightMute[ensemble].
- Build: stripHiddenText (drop invisible OCR text), stampSpot/inkMap (blank spot for names), embedPages + stamp.
- Library: IndexedDB partCopierLibrary/pieces; piece files carry a PartCopierMap info-dict entry.

## Data source
Band Ninja Tracker → 'Part Copier Roster' tab (8th A:C, 7th E:G, 6th both I:K, 6th Block M:O, 7th Block Q:S).
Chairs come from the 7th/8th chair sheets via IMPORTRANGE; if chairs vanish, re-"Allow access" on the
Ref tabs, Test Scores (Admin – Band Ninja) and the Part Copier Roster column.

## Testing
tests/make_fixtures.py (synthetic PDFs + made-up rosters) and tests/run_tests.py (Playwright; 31 checks:
detection, chair splits, copies, flex + auto-cover, marching, hidden-text strip, OCR scan, preflight,
percussion grid, reprint, hand-out list). Run both before committing. Real copyrighted sets are only
tested locally, never committed.

## Google Sheet roster (built 2026-11-01)
- Google Identity Services token client (loaded from accounts.google.com — can't be bundled), scope spreadsheets.readonly,
  token kept in sessionStorage (~1 h). Config in saved.bn {clientId, sheetId, tab}, saved.bnLinks[ensemble] = table title.
  bnParse finds each Name|Instrument|Chair header and uses the cell above as the title. Setup file carries bn + bnLinks.
- Mat's Cloud project "Part Copier" (project number 224291250382, owner mathew.t.graham@gmail.com) is set up and connected (2026-11-01). Sheets API enabled. Consent screen stays in Testing; colleagues must be test users.

## Music Library → Drive loader (2026-11-02)
- Same Google token as the roster (BN_SCOPE now spreadsheets.readonly + drive.readonly; tokens without Drive are dropped,
  cfg.driveOk forces one consent prompt). saved.mlibId = Music Library sheet; tab "Music Library", columns by header
  (Title, PDF Folder required; Number, Grade, Composer optional). Folder files: Drive v3 files.list (PDFs, direct children
  only, so Originals/ is skipped) minus score/conductor/narrator and Mac "._" files → File objects → openFiles().
- Deep link from the Raven Band Hub library: ?folder=<id>&title=<t>&lib=<sheet id>. Signed in → loads at once; otherwise a
  "Load the parts" button (Google's popup needs a click). The URL is cleaned with history.replaceState.
- "Find my Music Library" (mlFind): Drive search for spreadsheets named *Library*, keeps those with a "Music Library" tab
  (Sheets metadata call); one hit is picked automatically, several are listed, none → paste-the-link fallback.
- Needs the Google Drive API enabled in the "Part Copier" Cloud project.

## Google sync + print history (2026-11-02, evening)
- Scope adds drive.appdata (APPDATA_SCOPE); cfg.appdataOk forces one consent prompt. Sync = one file part-copier-setup.json in
  appDataFolder holding setupData(true) (same as the setup file, rosters + printLog + mlibId). persist() stamps saved.localAt and
  calls syncSoon() (3 s debounce) unless syncQuiet. syncNow(): remote newer than saved.syncAt (+1 s for Google's clock) → apply
  (applySetup, merge semantics: same-named ensembles replaced, nothing deleted); local newer → push; both → syncConflict UI.
  saved.syncAuto === false = off (default on once Google is connected). Consent flags (consented/driveOk/appdataOk) stay per browser.
- Print history: saved.printLog [{at, piece, ensemble, copies, pages, reprint, who}], max 300, merged by at|piece|ensemble.
  Logged after a successful build; shown in step 4 (#logBox).
- Colleague check: no Music Library sheet → "No spreadsheet…" + paste-the-link box (t_colleague). 59 checks.

## Open items
- Confirm on the school computer: Hub 🖨 button, Find my Music Library, and the new sync prompt (needs the Google Drive API on in
  the "Part Copier" Cloud project; drive.appdata may need adding to the consent screen's scopes if Google refuses it).
- Deletions don't sync (an ensemble deleted on one computer stays on others) — by design for now.

## Decisions
- concert-copies skill retired (2026-11-01); the web tool is the only path.
- OCR stays at 1800 px header width — 1300 px was not faster on ePrints (JPEG decode bound) and misread Afro Blue.
