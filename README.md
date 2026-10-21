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
  copy (with a last initial when two students in the ensemble share a first name).
  Uncheck **Print names on parts** to use the roster for counts only.
- Rosters are saved only in that browser. On shared computers, use **Forget roster**.

### Moving your setup to another computer

Everything is saved in the browser you set it up in. Open **Use this setup on another
computer** → **Save** to download a setup file (ensembles, counts, rosters if checked,
print rules, scan-cleanup settings). On the other computer, open the tool and **Load setup
file**. Ensembles with the same name are replaced; others are kept. A file that includes
rosters contains student names — keep it in your school account.

## Default print rules (change under "Print rules")

- Split parts (1st/2nd/3rd): players divided evenly; an odd player goes to the 1st part.
- Combined parts ("1 & 2") and unnumbered parts: one copy per player.
- Every percussionist gets every percussion part.
- No spare copies, no score, single-sided.
- Bassoon with no bassoon part: gets the lowest trombone part.
- Trumpets with only cornet parts (or cornets with only trumpet parts) split across those parts.

## Publishing on GitHub Pages

1. Create a new public repository (e.g. `part-copier`).
2. Upload `index.html`, `README.md` and the whole `lib` folder to the repository root.
3. Settings → Pages → Build and deployment → Source: *Deploy from a branch* →
   Branch: `main`, folder `/ (root)` → Save.
4. After a minute or two the tool is live at `https://<username>.github.io/part-copier/`.

## Limitations

- PDFs locked by a publisher (encrypted) can be viewed but not copied into a new file.
- Part detection reads the top of each page; unusual layouts may need fixing in the page map.
- Only copy music your license allows you to copy.

## Credits

Uses [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) to read PDFs,
[pdf-lib](https://pdf-lib.js.org/) (MIT) to build the print file, and
[Tesseract.js](https://tesseract.projectnaptha.com/) (Apache-2.0) to read part names from
scanned pages; all are bundled in `lib/` (Tesseract in `lib/ocr/`).
