# Part Copier

Turn a full set of band parts (one PDF with every part) into one print-ready PDF
with the right number of copies of each part. Runs entirely in the browser — no
files are uploaded, nothing to install.

## Using it

1. **Your ensemble** — enter how many students play each instrument. Save one
   ensemble per class (New ensemble). Numbers are remembered in your browser.
2. **Full set PDF** — drop in the PDF. Parts are found automatically when the PDF
   has readable text; for scanned PDFs, use the page map to mark where each part starts.
3. **Check the parts** — confirm page ranges and copies. Type over any copy count
   to set it by hand. If an instrument has no part in the set (e.g. bassoon),
   choose which part those players get.
4. **Print** — download the PDF and send it to the copier as one job, single copy.

## Default print rules (change under "Print rules")

- Split parts (1st/2nd/3rd): players divided evenly; an odd player goes to the 1st part.
- Combined parts ("1 & 2") and unnumbered parts: one copy per player.
- Every percussionist gets every percussion part.
- No spare copies, no score, single-sided.
- Bassoon with no bassoon part: gets the lowest trombone part.

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

Uses [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) to read PDFs and
[pdf-lib](https://pdf-lib.js.org/) (MIT) to build the print file; both are bundled in `lib/`.
