# Part Copier — handoff notes

Single-page tool (index.html) on GitHub Pages: https://artificialfear.github.io/part-copier/
Libraries bundled in lib/ (PDF.js 3.11.174, pdf-lib 1.17.1, Tesseract.js 5.1.1 + eng best_int).
No student data in the repo — rosters live in each browser's localStorage (key partCopier.v1).

## Code layout (split 2026-11-04)
**Edit src/, then run `python3 build.py`. Never edit index.html** — it is generated, and the tests refuse to run
(`build.py --check`) when it doesn't match src/. Served as one page on purpose: no stale-cache mix of old/new files.
- src/index.html — markup; `<!--INLINE:path-->` lines mark where the CSS and each script go (that list = load order).
- src/css/app.css — all styles.
- src/js — one shared scope, concatenated in order (top-level `const`/`let` are visible to later files):
  01-instruments (part-name detection, OCR word fixes, flex) · 02-settings-roster (saved setup, roster import) ·
  03-copy-plan (state, plan(), percussion assignments) · 04-ensemble (ensemble/roster UI; defines `$`, `esc`) ·
  05-sheet-roster (Google sign-in, Sheet roster pull, counts UI) · 06-setup-sync (setup file, Google sync,
  print history, print rules UI) · 07-music-library (Drive loader, page lists for the Hub) · 08-hub-reprint ·
  09-load-pdf (open/merge files, detectStarts, inferNames) · 10-scan-cleanup · 11-ocr (readPageImages, findScore) ·
  12-review (replace a part, reprint mode, review, piece library, download) · 13-page-map (page map, parts table) ·
  14-steps (folds, refresh(), percussion grid, hand-out list, preflight) · 15-print (hidden-text strip, name spot,
  build) · 16-start (theme toggle, start-up).
- A new file: add it to src/js and add its `<!--INLINE:js/…-->` line in src/index.html (build.py stops if a
  .js/.css file in src/ isn't listed).

## Google features switch (2026-11-04)
googleOn() (07-music-library.js) = bnCfg() || saved.googleOn || mlPending (a Hub link). Off → sheetPanel() returns "",
mlRender() empties #mlBox, renderSyncAuto() hides #syncAuto and #syncHint points to the setup file, and renderRoster()
shows a one-line "Import names (optional)" (same #rosterOpenBtn). Switch = Print rules → #setGoogle (locked on while
connected). Built for directors who only type counts (Mat's wife, high school band). Tests: t_basic; Google tests
call google_on(pg) first.

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

## Reprint link from the Hub (2026-11-02, night)
- ?folder=&title=&lib=&r=Last, First|Instrument|Part (repeated). mlFromLink → mlPending.reprint → mlLoad(…, reprint) →
  applyReprint(): findStudent() matches nameKey (first+last, accents/punctuation stripped) across all rosters (current ensemble
  first), switches to the ensemble with most matches, ticks rows whose plan names include the student (percussion narrowed by
  part: Snare/Mallets/Timpani/Aux), else one blank copy by normInst + part number; status note lists done/blank/missing. t_reprint.

## Loose roster pastes (2026-11-05)
- parseTable (02-settings-roster.js): with no tab and no quote in the text, each line is plain CSV when its 2nd cell is only
  an instrument ("Smith,Flute,1", "Lee,Alto Sax"); otherwise looseRow() reads it as "<name> <instrument> [chair]" from the
  end (≤3 instrument words; a longer ending only counts if its first word is in INST_LEAD, so "Ava Alto Sax" → Ava + Alto Sax).
  A spaced header row ("Name Instrument Chair") is split on whitespace. Tab and quoted-CSV input unchanged. t_loose (9 checks).
- Real case: a "Last, First<spaces>Instrument" list copied out of chat printed last names only.

## GMEA All-State audition packets (2026-11-05, outside the repo)
- Mat prints his students' middle school GMEA district audition packets through Part Copier with no app change: one 80-page PDF
  (16 five-page packets) carries a PartCopierMap with one segment per instrument (Eb contra-alto mapped to "Alto Clarinet",
  Euphonium BC/TC separate, Percussion). He opens it in step 2 with an "auditioners" ensemble roster. The file holds GMEA's
  music, so it is never committed. Percussion needs Print rules → "Every percussionist gets every percussion part" on
  (off = one unnamed copy). Rebuild the file each year from GMEA's new folders.

## Open items
- Confirm on the school computer: Hub 🖨 button, Find my Music Library, and the new sync prompt (needs the Google Drive API on in
  the "Part Copier" Cloud project; drive.appdata may need adding to the consent screen's scopes if Google refuses it).
- Deletions don't sync (an ensemble deleted on one computer stays on others) — by design for now.
- **Concert mode (on hold, Mat 2026-11-04: wait until more pieces have PDFs).** Idea: pick an ensemble + several pieces
  (Music Library for Mat, dropped PDFs for directors without Google) → one print PDF, piece-by-piece or each student's
  whole folder together, one hand-out list. Questions still to ask Mat: default order; stop only on pieces where
  detection was unsure (recommended) vs. review every piece.
- Mat's wife (high school band, counts only, no Google) will try it with a real HS set: watch for Horn 1–4,
  Trumpet 1–3 and doubles (piccolo, English horn) being misread.

## Decisions
- concert-copies skill retired (2026-11-01); the web tool is the only path.
- OCR stays at 1800 px header width — 1300 px was not faster on ePrints (JPEG decode bound) and misread Afro Blue.

## Page lists for the Raven Band Hub (2026-11-04)
- New scope DRIVEFILE_SCOPE (drive.file: only files Part Copier creates); cfg.drivefileOk forces one consent prompt.
- mlLoad remembers the Drive source when a piece's full set is ONE PDF (state.driveSrc = { id, name, offset = score pages put
  in front }); openFile clears it, so a PDF opened from the computer is never saved as a Drive piece.
- refresh() → pmSoon() (3 s debounce) → pmSave(): segments() instrument parts in the Drive file's own page numbers → one file
  "Part Copier – part pages.json" in My Drive: { v: 1, files: { <fileId>: { name, total, saved, parts: [{label, start, end}] } } }.
  Read-modify-write; skipped when nothing changed (pmLast), while a scan is still being read (ocrDone), or without the scope.
- The Hub (MusicRequests.js rbhMreqPageMap_) reads that file to print just one student's pages from a full set. Keep the format.
- t_pagemap (5 checks). 88/88 pass as of 2026-11-05 (t_sync's "connect first" check can fail when run alone, not in the full run).
