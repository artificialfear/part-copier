# Part Copier

Turn a full set of band parts (one PDF with every part) into one print-ready PDF
with the right number of copies of each part. Runs entirely in the browser — no
files are uploaded, nothing to install.

## Using it

1. **Your ensemble** — enter how many students play each instrument. Save one
   ensemble per class (New ensemble). Numbers are remembered in your browser.
2. **Full set PDF** — drop in the PDF. Parts are found automatically when the PDF
   has readable text. For scans, the tool reads the part names straight from the page
   images (this takes about a second per page; the reader loads once, ~7 MB, then is
   cached). It also re-reads any part name the copier's own text recognition garbled.
   Anything it still can't read is highlighted — fix it in the page map.
   **Separate part files?** Drop them all at once. Each file becomes one part, named from
   its file name (e.g. "Trumpet 1.pdf"; a shared prefix like "Piece Title - " is ignored),
   and they're sorted into score order — or by number if every file name starts with one.
   Reorder or remove files in the **Merged files** list, and use **Download merged full
   set** to save one combined PDF.
3. **Check the parts** — confirm page ranges and copies. Type over any copy count
   to set it by hand. If an instrument has no part in the set (e.g. bassoon),
   choose which part those players get.
4. **Review & print** — every part that will print is shown as a close-up of the top of its
   first page (where the part name is printed), with its page count, copies and students.
   Highlighted cards need a look; **Page** shows the whole page, and clicking a card jumps to
   it in the parts list. Then download the PDF and send it to the copier as one job, single copy.

### Less scrolling

Click any step's heading to fold it down to one line; the folded heading shows a summary
(players, file, parts, copies), and folded step 1 keeps an ensemble dropdown so you can switch classes without opening it. **Collapse all / Expand all** sit above step 1, and your folds are
remembered. Loading a PDF folds steps 1–2 automatically (step 2 stays open for a scan, so you can
clean it up); opening a saved piece also folds step 3 and goes straight to printing. **Go to print ↓**
in the corner jumps to the download button from anywhere.

### A student lost their music

In step 4, switch to **Reprint only some parts** and tick **Reprint** on the part(s) you need.
With a roster loaded, tick the student(s) who lost music — their copy comes out with their name
on it, exactly as before. **Extra copies without a name** (or **Copies**, without a roster) adds
plain copies. The download (named "… - REPRINT.pdf") contains only those parts. Switch back to
**Print the whole set** for a full print.

### Replacing a bad scan of one part

In the parts list (step 3), click **Replace…** under a part's pages and choose a PDF of just that
part — a better scan, or a clean digital copy. It takes the place of that part's pages only; the
part's name, instrument and copies stay, and every other part is untouched. A scanned replacement
is cleaned up with your current scan-cleanup settings. If the piece is in your library, click
**Save to my library** again to keep the new pages.

### Percussion: who plays which part

With a roster loaded, step 3 shows a grid of your percussionists against the piece's percussion parts. Tick
the parts each student plays — they only get copies of those. Untouched, every percussionist gets every
part. **Spread the parts out** deals one part to each student round-robin as a starting point. Choices are
saved per piece and ensemble in this browser, and the grid warns about students with no part.

### Check before printing

Step 4 stops you before downloading when something looks off, and you tick "I've checked these" to go on:

- no chair placements for an instrument whose parts are split (1st/2nd would be alphabetical)
- two students tied at the chair where a part splits
- a roster imported more than two weeks ago
- roster rows with no recognizable instrument (those students get no music)
- percussionists with no part assigned

The chair and roster-age warnings can be turned off per ensemble (e.g. a 6th grade band with no chairs).

### Hand-out list

**Hand-out list** (next to Download print PDF) saves a one-page PDF listing every part that prints and the students
who get it, in chair order — for passing out music and for a last check before the copier runs.

### Saving pieces

Under **Keep this piece** (step 4):

- **Save to my library** stores the piece — the pages (cleaned, if you cleaned them) and the
  parts exactly as you confirmed them — in this browser. It appears under **Your saved pieces**
  in step 2: **Open** loads it in a couple of seconds with nothing to re-check, ready for any
  ensemble.
- **Download piece file** saves a normal PDF with the part list built in. Open it in Part Copier
  on any computer, or give it to another director who owns the piece, and the parts load ready
  to print — no detection, no fixing. The library lives in one browser; piece files go anywhere.

### Optional: clean up a scanned set

After loading a PDF made on a copier or phone, open **Clean up a scanned set**:
straighten crooked pages, black & white or grayscale with a darkness control, remove
dark scanner edges, drop blank pages, and fit 9×12 parts onto letter paper (empty
margins are trimmed first so the music stays as large as possible). Preview any page,
then **Clean up all pages**; the parts list switches to the cleaned pages, and
**Download cleaned PDF** saves a copy for your library. Clean up before marking parts
in the page map, since removing blank pages renumbers them.

**Remove dark scanner edges** is off by default. Turn it on only for scans with black
shadows or bands along the edges (e.g. scanned on the glass with the lid up); it removes
solid dark areas, lid lines and dust at the edges, but it can nibble music that touches
the edge of the scan. If the music itself runs off the edge of the original scan, cleanup lists those
pages: that part was cut off by the copier and can only be fixed by rescanning.

Best scan settings on a copier: document feeder, scan-to-email, 300 dpi, black & white,
original size set to Auto/Mixed (or 11×17) so 9×12 pages aren't cut off.

### Optional: import a roster for named copies

Under **Your ensemble**, click **Import roster** and paste three columns from any
spreadsheet — **Name**, **Instrument**, **Chair** (a header row and extra columns are
fine) — or upload a CSV. Then:

- Counts come from the roster, and every student gets exactly one copy.
- Split parts (1st/2nd/3rd) are assigned in chair order; chairs can be numbers or
  ordinals like "2nd" or "3rd (tie)". Students without a chair go last in their section.
- Each student's first name is printed in the top-right corner of every page of their
  copy (moved along the top, or to the bottom, if that corner has something in it, like a QR code) (with a last initial when two students in the ensemble share a first name).
  Uncheck **Print names on parts** to use the roster for counts only.
- Rosters are saved only in that browser. On shared computers, use **Forget roster**.

### Pull the roster straight from a Google Sheet (optional)

Instead of pasting, connect the spreadsheet once under **Pull the roster from a Google Sheet instead of pasting**
(step 1): your Google sign-in client ID (see "Setting up Google sign-in" below), the spreadsheet link, and the tab
name (default *Part Copier Roster*). The tool finds every *Name / Instrument / Chair* table on that tab, by the
title above it; pick the one for each ensemble. After that:

- **Pull roster now** re-reads it any time. While you're signed in (about an hour), opening a PDF or switching
  ensembles pulls the latest roster automatically.
- Step 4 warns when the roster hasn't been pulled in the last 12 hours and offers **Pull roster now**.
- Access is read-only, with your own Google account. The sheet stays private — nothing is published or shared.

#### Setting up Google sign-in (once, about 15 minutes)

1. Go to console.cloud.google.com with the Google account that owns the sheet → create a project ("Part Copier").
2. APIs & Services → Library → **Google Sheets API** → Enable.
3. APIs & Services → OAuth consent screen → External → app name "Part Copier", your email → Save. Leave it in
   **Testing** and add your own email under **Test users** (and any colleague who will use it).
4. APIs & Services → Credentials → Create credentials → **OAuth client ID** → Web application →
   Authorized JavaScript origins: `https://<username>.github.io` → Create. Copy the client ID.
5. Paste it into the tool. The first sign-in shows Google's "this app isn't verified" screen (expected for a
   personal test app) → Continue.

### Moving your setup to another computer

Everything is saved in the browser you set it up in. Open **Use this setup on another
computer** → **Save** to download a setup file (ensembles, counts, rosters if checked,
print rules, scan-cleanup settings). On the other computer, open the tool and **Load setup
file**. Ensembles with the same name are replaced; others are kept. A file that includes
rosters contains student names — keep it in your school account.

### ePrint and download sets

- Sets that come with several copies of each part (e.g. ePrint files with 8 flute pages) are recognized: the
  extra copies are skipped and each student's copy prints from the first one.
- A full score is found from the instrument names down its left margin, even when its first page looks like a
  part. A cover page and program notes before it are treated as front matter.
- Mallet parts keep their own names (Bells, Chimes, Xylophone…) so separate mallet parts aren't merged.

### Flex arrangements

- Flex parts that name several instruments ("Clarinet in Bb Trumpet in Bb", "Trombone Baritone Bassoon") go to
  every instrument they name.
- Numbered flex sets (Part 1 C, Part 1 B♭, Part 2 E♭, Part 4 Bass Clef…) are recognized by voice and key. Each
  instrument's players are split by chair across the voices printed for that instrument — top chairs on Part 1.
  When a part doesn't list instruments, the key decides (C: flute/oboe; B♭: clarinet, trumpet, tenor sax,
  baritone T.C.; E♭: alto/bari sax; F: horn; bass clef: trombone, euphonium, bassoon, plus tuba on Parts 4–5).
- If nobody ends up on a voice (e.g. Part 5 with no tubas), the lowest-chair player of a section with two or more on a
  nearby voice is moved to cover it (the row says who moved). If nobody can be moved, the tool warns you.

## Default print rules (change under "Print rules")

- Split parts (1st/2nd/3rd): players divided evenly; an odd player goes to the 1st part.
- Combined parts ("1 & 2") and unnumbered parts: one copy per player.
- Every percussionist gets every percussion part.
- No spare copies, no score, single-sided. To print the score for one piece, click **Print a copy** on the Score row
  in step 3 (or type a copy count); to always print it, tick **Include the full score** in Print rules.
- Bassoon with no bassoon part: gets the lowest trombone part.
- Trumpets with only cornet parts (or cornets with only trumpet parts) split across those parts.
- Mellophones with only horn parts (or horns with only mellophone parts) split across those parts;
  sousaphones and tubas share parts the same way.
- Marching percussion (snare, bass drum, tenors/quints, cymbals) gets its own parts, split by chair when
  numbered (e.g. Bass Drum 1–5). A band with no marching percussion entered gives a concert set's
  "Snare Drum" or "Cymbals" part to every percussionist; marching percussion with no part of its own in a
  set gets every percussion part.

## Publishing on GitHub Pages

1. Create a new public repository (e.g. `part-copier`).
2. Upload `index.html`, `README.md` and the whole `lib` folder to the repository root.
3. Settings → Pages → Build and deployment → Source: *Deploy from a branch* →
   Branch: `main`, folder `/ (root)` → Save.
4. After a minute or two the tool is live at `https://<username>.github.io/part-copier/`.

## Tests

`python3 tests/make_fixtures.py` builds made-up test PDFs and rosters; `python3 tests/run_tests.py` runs the
checks in a headless browser (needs Playwright with Chromium, pypdf, reportlab, Pillow). Run them before every change.

## Limitations

- Scans made with a phone or tablet (e.g. iPhone "Scan Documents") carry an invisible, searchable
  text layer with a separate font for almost every word. Copiers can run out of memory partway through
  and stop printing, so the print file leaves that layer out. Nothing visible changes.
- PDFs locked by a publisher (encrypted) can be viewed but not copied into a new file.
- Part detection reads the top of each page; unusual layouts may need fixing in the page map.
- Only copy music your license allows you to copy.

## Credits

Uses [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) to read PDFs,
[pdf-lib](https://pdf-lib.js.org/) (MIT) to build the print file, and
[Tesseract.js](https://tesseract.projectnaptha.com/) (Apache-2.0) to read part names from
scanned pages; all are bundled in `lib/` (Tesseract in `lib/ocr/`).

### Page lists (Raven Band Hub)
When a piece is loaded from Google Drive and its whole set is one PDF, Part Copier saves which pages are which part
to a small file in your Drive, "Part Copier – part pages.json". It can only see files it made itself. The Raven Band Hub
uses it to print just one student's pages for a lost part. Signing in asks for this permission once.
