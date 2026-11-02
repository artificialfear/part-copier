#!/usr/bin/env python3
"""Part Copier regression tests. Needs: playwright (Chromium), pypdf, reportlab, Pillow.
  python3 tests/make_fixtures.py      # once
  python3 tests/run_tests.py          # serves the repo on a free port and runs every check
Exit code 0 = all passed."""
import functools, http.server, os, socketserver, sys, threading, traceback
from pypdf import PdfReader
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(ROOT, "tests", "fixtures")
OUTDIR = os.path.join(ROOT, "tests", "out"); os.makedirs(OUTDIR, exist_ok=True)
fx = lambda n: os.path.join(FX, n)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/index.html"

results, page_errors = [], []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  — {detail}"))

def rows(pg):
    return pg.eval_on_selector_all("#partRows tr", """rs => rs.map(r => ({pages: r.cells[0].childNodes[1].textContent, label: r.querySelector('input[data-field=label]').value,
      fam: r.querySelector('select').value, copies: +r.querySelector('input[data-field=copies]').value,
      names: (r.querySelector('.names') || {textContent: ''}).textContent, why: r.cells[4].innerText.split('\\n')[0]}))""")
def labels(pg): return [r["pages"] + " " + r["label"] for r in rows(pg)]
def fresh(pg):
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload()
    # keep steps 1–2 open so the tests can use them
    pg.evaluate("window.setFold = ((s) => (id, c, r = true) => { if (r === false && c) return; s(id, c, r); })(window.setFold)")
def roster(pg, f):
    pg.evaluate("openStep('s1')"); pg.click("#rosterOpenBtn"); pg.fill("#rosterText", open(fx(f)).read()); pg.click("#rosterImport")
def load(pg, f, ocr=False):
    pg.set_input_files("#file", fx(f)); pg.wait_for_selector("#s3:not([hidden])", timeout=120000)
    if ocr: pg.wait_for_function("(()=>{const b=document.getElementById('ocrStatus'); return /^(This PDF|Read the|Re-read|Re-checked|Couldn)/.test(b.innerText);})()", timeout=600000)
    pg.wait_for_timeout(400)
def download(pg, sel, name):
    pg.evaluate("openStep('s4')")
    with pg.expect_download(timeout=300000) as d: pg.click(sel)
    path = os.path.join(OUTDIR, name); d.value.save_as(path); return path
def row(pg, label): return next((r for r in rows(pg) if r["label"] == label), None)

def t_concert(pg):
    fresh(pg); roster(pg, "roster_chairs.tsv"); load(pg, "concert.pdf")
    L = labels(pg)
    check("concert: 2-page parts stay together", "4–5 Clarinet 1" in L and "8–9 Trumpet 1" in L, L)
    check("concert: score found", row(pg, "Score") is not None, L)
    t1, t2 = row(pg, "Trumpet 1"), row(pg, "Trumpet 2")
    check("concert: trumpets split by chair (odd player on 1st)", t1 and t1["names"] == "Gus, Hana" and t2["names"] == "Ian", (t1, t2))
    check("concert: bassoon-less band, euphonium gets Baritone B.C.", row(pg, "Baritone B.C.")["names"] == "Max")
    check("concert: every percussionist on every percussion part", all(row(pg, x)["copies"] == 4 for x in ["Mallet Percussion", "Timpani", "Percussion 1", "Percussion 2"]))
    check("concert: no warnings with chairs present", not pg.is_visible("#preflight"))
    out = download(pg, "#buildBtn", "concert.pdf"); r = PdfReader(out)
    exp = pg.evaluate("plan().rows.reduce((s,r)=>s+r.copies*r.pages,0)")
    check("concert: print PDF page count matches the plan", len(r.pages) == exp, (len(r.pages), exp))
    check("concert: student names stamped", any("Gus" in (p.extract_text() or "") for p in r.pages))
    h = download(pg, "#handoutBtn", "handout.pdf"); txt = PdfReader(h).pages[0].extract_text()
    check("hand-out list lists parts and students", "Trumpet 1" in txt and "Gus, Hana" in txt, txt[:200])
    # percussion grid
    check("percussion grid shows with a roster", pg.is_visible("#percBox"))
    pg.evaluate("openStep('s3')"); pg.click("#percSpread"); pg.wait_for_timeout(200)
    check("percussion: spread = one part each", sum(row(pg, x)["copies"] for x in ["Mallet Percussion", "Timpani", "Percussion 1", "Percussion 2"]) == 4)
    pg.click('#percGrid input[data-perc-name="Omar"]:checked'); pg.wait_for_timeout(200)
    pg.evaluate("openStep('s4')")
    check("preflight: percussionist with no part blocks download", pg.is_visible("#preflight") and pg.is_disabled("#buildBtn"), pg.inner_text("#preflight") if pg.is_visible("#preflight") else "")
    pg.check("#preflightAck"); check("preflight: tick unlocks download", not pg.is_disabled("#buildBtn"))
    pg.evaluate("openStep('s3')"); pg.click("#percAll"); pg.wait_for_timeout(200)
    check("percussion: everyone plays everything restores", row(pg, "Timpani")["copies"] == 4)
    # reprint one student
    pg.evaluate("openStep('s4')"); pg.check('#printMode input[value="some"]'); pg.wait_for_timeout(200)
    pg.check('#review [data-rp-name][value="Gus"]'); pg.wait_for_timeout(200)
    rp = download(pg, "#buildBtn", "reprint.pdf")
    check("reprint: only the chosen student's part", len(PdfReader(rp).pages) == 2, len(PdfReader(rp).pages))

def t_nochairs(pg):
    fresh(pg); roster(pg, "roster_nochairs.tsv"); load(pg, "concert.pdf"); pg.evaluate("openStep('s4')")
    txt = pg.inner_text("#preflight") if pg.is_visible("#preflight") else ""
    check("preflight: missing chairs warned", "No chair placements" in txt, txt)
    check("preflight: student without an instrument warned", "Cruz" in txt, txt)
    check("preflight: download locked until checked", pg.is_disabled("#buildBtn"))
    pg.click('[data-mute="chairs"]'); pg.wait_for_timeout(200)
    check("preflight: chair warning can be muted per ensemble", "No chair placements" not in (pg.inner_text("#preflight") if pg.is_visible("#preflight") else ""))

def t_copies(pg):
    fresh(pg); pg.fill('input[data-inst="Flute"]', "2"); pg.fill('input[data-inst="Clarinet"]', "3"); pg.fill('input[data-inst="Trumpet"]', "2")
    load(pg, "copies.pdf"); R = rows(pg)
    first = [r for r in R if not r["why"].startswith("Another copy")]
    check("copies: repeated pages recognized as copies", len(first) == 4 and sum(r["why"].startswith("Another copy") for r in R) == 4, [(r["label"], r["why"]) for r in R])
    check("copies: not renumbered", [r["label"] for r in first] == ["Flute", "Clarinet", "Trumpet 1", "Percussion"], [r["label"] for r in first])

def t_flex(pg):
    fresh(pg)
    for k, v in {"Clarinet": 3, "Trumpet": 2, "Trombone": 4, "Flute": 1}.items(): pg.fill(f'input[data-inst="{k}"]', str(v))
    load(pg, "flex.pdf"); R = {r["label"]: r for r in rows(pg)}
    check("flex: voices read with keys", "Part 1 B♭ – Clarinet / Trumpet" in R and "Part 5 Bass Clef – Tuba / Bassoon" in R, list(R))
    check("flex: clarinets split by chair across B♭ voices", [R[k]["copies"] for k in ["Part 1 B♭ – Clarinet / Trumpet", "Part 2 B♭ – Clarinet / Trumpet", "Part 3 B♭ – Clarinet / Trumpet / Tenor Sax"]] == [2, 2, 1])
    check("flex: empty Part 5 covered by moving a trombone", R["Part 5 Bass Clef – Tuba / Bassoon"]["copies"] == 1 and "moved" in R["Part 5 Bass Clef – Tuba / Bassoon"]["why"], R["Part 5 Bass Clef – Tuba / Bassoon"])

def t_march(pg):
    fresh(pg); roster(pg, "roster_march.tsv"); load(pg, "march.pdf"); R = {r["label"]: r for r in rows(pg)}
    check("marching: mellophones + horn split across mellophone parts", R["Mellophone 1"]["copies"] + R["Mellophone 2"]["copies"] == 4)
    check("marching: sousaphone part covers tubas too", R["Sousaphone"]["copies"] == 2)
    check("marching: snare/tenors/cymbals to their players", (R["Snare Drum"]["copies"], R["Tenors"]["copies"], R["Cymbals"]["copies"]) == (2, 1, 1))
    check("marching: bass drums 1 per part", R["Bass Drum 1"]["names"] == "Bea" and R["Bass Drum 2"]["names"] == "Bob", (R["Bass Drum 1"], R["Bass Drum 2"]))

def t_hidden(pg):
    fresh(pg); pg.fill('input[data-inst="Flute"]', "1"); pg.fill('input[data-inst="Clarinet"]', "1"); pg.fill('input[data-inst="Trumpet"]', "1"); pg.fill('input[data-inst="Percussion"]', "1")
    load(pg, "hiddentext.pdf"); out = download(pg, "#buildBtn", "hidden.pdf")
    txt = " ".join((p.extract_text() or "") for p in PdfReader(out).pages)
    check("print file drops invisible scanner text", "word7" not in txt and "Flute" in txt, txt[:120])

def t_scan(pg):
    fresh(pg); load(pg, "scan.pdf", ocr=True); L = labels(pg)
    check("scan: parts read from page images, 2-page parts kept", L == ["1–2 Flute", "3–4 Clarinet 1", "5–6 Trumpet", "7–8 Trombone", "9–10 Percussion"], L)

def t_sheet(pg):
    import json
    vals = {"values": [["title"], ["8th Grade (1st Block)", "", "", "", "7th Grade (3rd + 4th Block)"], ["Name", "Instrument", "Chair", "", "Name", "Instrument", "Chair"],
                       ["Adams, Ava", "Flute", "1", "", "Gray, Gus", "Trumpet", "1"], ["", "", "", "", "Hill, Hana", "Trumpet", "2"]]}
    gis = "window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:'t',expires_in:3600}),5)}),revoke:(t,c)=>c&&c()}}};"
    pg.route("https://accounts.google.com/gsi/client", lambda r: r.fulfill(status=200, content_type="text/javascript", body=gis))
    pg.route("https://sheets.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(vals)))
    fresh(pg); pg.evaluate("sessionStorage.clear()"); pg.evaluate("openStep('s1')"); pg.click(".sheet-link summary")
    pg.fill("#bnClient", "1-x.apps.googleusercontent.com"); pg.fill("#bnSheet", "https://docs.google.com/spreadsheets/d/AAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit"); pg.click("#bnConnect"); pg.wait_for_timeout(400)
    check("sheet: tables found on the tab", pg.eval_on_selector_all("#bnTable option", "l=>l.map(o=>o.text)")[1:] == ["8th Grade (1st Block)", "7th Grade (3rd + 4th Block)"])
    pg.select_option("#bnTable", "7th Grade (3rd + 4th Block)"); pg.wait_for_timeout(400)
    check("sheet: picking a table pulls the roster", pg.evaluate("counts().Trumpet") == 2 and pg.evaluate("roster().source") == "sheet")
    pg.unroute("https://accounts.google.com/gsi/client"); pg.unroute("https://sheets.googleapis.com/**")

def t_drive(pg):
    import json, io
    from reportlab.pdfgen import canvas
    def mk(label):
        b = io.BytesIO(); c = canvas.Canvas(b, pagesize=(612, 792)); c.setFont("Helvetica-Bold", 22); c.drawString(60, 740, label)
        c.setFont("Helvetica", 12); c.drawString(60, 700, "Frost March - test part"); c.showPage(); c.save(); return b.getvalue()
    files = {"f1": "Frost March - Score.pdf", "f2": "Frost March - Flute.pdf", "f3": "Frost March - Trumpet 1.pdf", "f4": "Frost March - Trumpet 2.pdf", "f5": "._Frost March - Flute.pdf"}
    blobs = {k: mk(v.split(" - ")[1][:-4]) for k, v in files.items()}
    lib = {"values": [["Number", "Title", "Composer", "Grade", "PDF Folder"], ["325", "Frost March", "R. Writer", "1.5", "https://drive.google.com/drive/folders/FOLDERFROST123"],
                      ["12", "Paper Only Piece", "", "2", ""]]}
    seen = []
    def drive(r):
        u = r.request.url; seen.append(u)
        if "alt=media" in u:
            fid = u.split("/files/")[1].split("?")[0]; return r.fulfill(status=200, content_type="application/pdf", body=blobs[fid])
        return r.fulfill(status=200, content_type="application/json", body=json.dumps({"files": [{"id": k, "name": v, "size": "1"} for k, v in files.items()]}))
    gis = "window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:'t',expires_in:3600,scope:o.scope}),5)}),revoke:(t,c)=>c&&c()}}};"
    pg.route("https://accounts.google.com/gsi/client", lambda r: r.fulfill(status=200, content_type="text/javascript", body=gis))
    pg.route("https://sheets.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(lib)))
    pg.route("https://www.googleapis.com/drive/**", drive)
    fresh(pg); pg.evaluate("sessionStorage.clear()")
    check("drive: no library loader before Google sign-in is set up", not pg.is_visible("#mlDetails"))
    pg.evaluate("saved.bn={clientId:'1-x.apps.googleusercontent.com',sheetId:'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',tab:'Part Copier Roster',consented:true}; persist(); renderRoster()"); pg.wait_for_timeout(100)
    pg.evaluate("openStep('s2')"); pg.click("#mlDetails summary")
    pg.fill("#mlSheet", "https://docs.google.com/spreadsheets/d/LIBLIBLIBLIBLIBLIBLIBLIBLIB/edit"); pg.click("#mlSave"); pg.click("#mlFetch"); pg.wait_for_timeout(400)
    names = pg.eval_on_selector_all(".ml-list button", "l=>l.map(b=>b.innerText)")
    check("drive: library lists only pieces with a PDF folder", len(names) == 1 and "Frost March" in names[0], names)
    pg.click(".ml-list button"); pg.wait_for_selector("#s3:not([hidden])", timeout=60000); pg.wait_for_timeout(400)
    L = [r["label"] for r in rows(pg)]
    check("drive: picking a piece loads its parts (score and Mac junk left out)", L == ["Flute", "Trumpet 1", "Trumpet 2"], L)
    check("drive: the token asked for read-only Drive access", "drive.readonly" in pg.evaluate("bnToken.scope"))
    # link from the Raven Band Hub, already signed in: loads by itself
    seen.clear()
    pg.goto(URL + "?folder=FOLDERFROST123&title=Frost%20March&lib=LIBLIBLIBLIBLIBLIBLIBLIBLIB"); pg.wait_for_selector("#s3:not([hidden])", timeout=60000); pg.wait_for_timeout(400)
    check("drive: a Hub link loads the piece straight away when signed in", [r["label"] for r in rows(pg)] == ["Flute", "Trumpet 1", "Trumpet 2"] and any("FOLDERFROST123" in u for u in seen))
    check("drive: the link is cleaned out of the address bar", "folder=" not in pg.url)
    # not signed in: a button to click (Google's sign-in needs a click)
    pg.evaluate("sessionStorage.clear()"); pg.goto(URL + "?folder=FOLDERFROST123&title=Frost%20March"); pg.wait_for_timeout(300)
    check("drive: not signed in, the Hub link shows a Load button", pg.is_visible("#mlPendingGo") and "Frost March" in pg.inner_text("#mlBox"))
    pg.click("#mlPendingGo"); pg.wait_for_selector("#s3:not([hidden])", timeout=60000); pg.wait_for_timeout(400)
    check("drive: …which signs in and loads the parts", [r["label"] for r in rows(pg)] == ["Flute", "Trumpet 1", "Trumpet 2"])
    for u in ["https://accounts.google.com/gsi/client", "https://sheets.googleapis.com/**", "https://www.googleapis.com/drive/**"]: pg.unroute(u)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium")
    ctx = b.new_context(accept_downloads=True, viewport={"width": 1100, "height": 900}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: page_errors.append(str(e)))
    only = sys.argv[1:]
    for t in [t_concert, t_nochairs, t_copies, t_flex, t_march, t_hidden, t_sheet, t_drive, t_scan]:
        if only and t.__name__[2:] not in only: continue
        try: t(pg)
        except Exception as e: check(t.__name__ + " ran", False, traceback.format_exc(limit=2))
    b.close()
check("no JavaScript errors", not page_errors, page_errors[:3])
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
