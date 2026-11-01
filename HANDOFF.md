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

## Open items
- none

## Decisions
- concert-copies skill retired (2026-11-01); the web tool is the only path.
- OCR stays at 1800 px header width — 1300 px was not faster on ePrints (JPEG decode bound) and misread Afro Blue.
