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
Playwright scripts live outside the repo (test PDFs are copyrighted). Planned: tests/ with synthetic PDFs.

## Open items (Mat approved all, 2026-11-01)
3. Pull roster from Band Ninja directly (Google sign-in; needs a Google Cloud OAuth client — Mat to set up with help).
4. Faster OCR for big scans/ePrints (header strip only, lower res, parallel, skip copies).
5. Printable hand-out list (part → students in chair order).
6. Auto-cover empty flex voices.
7. Synthetic test suite in the repo; update or retire the concert-copies skill.
