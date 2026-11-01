#!/usr/bin/env python3
"""Synthetic test PDFs and rosters for Part Copier (made-up music, made-up names — safe for a public repo).
Run:  python3 tests/make_fixtures.py   (writes tests/fixtures/)"""
import os
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(OUT, exist_ok=True)
W, H = 612, 792

def music(c, tag):
    c.setFont("Helvetica", 9)
    for k in range(20):
        y = 640 - k * 28
        for j in range(5): c.line(40, y - j * 4, 572, y - j * 4)
        c.drawString(40, y + 8, f"{tag} m.{k * 4 + 1}")

def text_set(path, title, parts, copies=None):
    """parts: [(label, pages)] — first page has the title, later pages a running header"""
    c = canvas.Canvas(path, pagesize=(W, H))
    for label, pages in parts:
        for n in range(copies.get(label, 1) if copies else 1):
            for pg in range(1, pages + 1):
                if pg == 1:
                    c.setFont("Helvetica-Bold", 20); c.drawCentredString(W / 2, 740, title)
                    c.setFont("Helvetica", 11); c.drawString(40, 712, label); c.drawRightString(572, 712, "Arr. A. Composer")
                else:
                    c.setFont("Helvetica", 10); c.drawString(40, 760, f"{label} - {pg}")
                music(c, f"{label} p{pg}")
                c.showPage()
    c.save()

CONCERT = [("Full Score", 2), ("Flute", 1), ("Bb Clarinet 1", 2), ("Bb Clarinet 2", 1), ("Eb Alto Saxophone", 1),
           ("Bb Trumpet 1", 2), ("Bb Trumpet 2", 1), ("F Horn", 1), ("Trombone", 1), ("Baritone B.C.", 1), ("Tuba", 1),
           ("Mallet Percussion", 1), ("Timpani", 1), ("Percussion 1", 1), ("Percussion 2", 1)]
text_set(os.path.join(OUT, "concert.pdf"), "Lighthouse March", CONCERT)
text_set(os.path.join(OUT, "copies.pdf"), "Snowfall", [("Flute", 1), ("Bb Clarinet", 1), ("Bb Trumpet 1", 1), ("Percussion", 1)],
         copies={"Flute": 3, "Bb Clarinet": 2, "Bb Trumpet 1": 2})

# numbered flex set
c = canvas.Canvas(os.path.join(OUT, "flex.pdf"), pagesize=(W, H))
for a, b in [("Part 1 - C Instruments", "Flute, Oboe"), ("Part 1 in Bb", "Clarinet, Trumpet"), ("Part 2 in Bb", "Clarinet, Trumpet"),
             ("Part 2 in Eb", "Alto Saxophone"), ("Part 3 in Bb", "Clarinet, Trumpet, Tenor Saxophone"), ("Part 3 - Bass Clef", "Trombone, Euphonium, Bassoon"),
             ("Part 4 - Bass Clef", "Trombone, Euphonium, Bassoon"), ("Part 5 - Bass Clef", "Tuba, Bassoon"), ("Percussion", "")]:
    c.setFont("Helvetica-Bold", 20); c.drawCentredString(W / 2, 740, "Midnight Parade")
    c.setFont("Helvetica", 11); c.drawString(40, 712, a)
    if b: c.drawString(40, 698, b)
    music(c, a); c.showPage()
c.save()

# marching set
c = canvas.Canvas(os.path.join(OUT, "march.pdf"), pagesize=(W, H))
for a in ["Mellophone 1", "Mellophone 2", "Bb Trumpet", "Sousaphone", "Snare Drum", "Tenors", "Bass Drum 1", "Bass Drum 2", "Cymbals"]:
    c.setFont("Helvetica-Bold", 20); c.drawCentredString(W / 2, 740, "Friday Lights"); c.setFont("Helvetica", 11); c.drawString(40, 712, a)
    music(c, a); c.showPage()
c.save()

# hidden scanner text layer: invisible words, a font per word (what phone scanners produce)
c = canvas.Canvas(os.path.join(OUT, "hiddentext.pdf"), pagesize=(W, H))
fonts = ["Helvetica", "Times-Roman", "Courier", "Helvetica-Oblique", "Times-Italic"]
for a in ["Flute", "Bb Clarinet", "Bb Trumpet", "Percussion"]:
    c.setFont("Helvetica-Bold", 20); c.drawCentredString(W / 2, 740, "Night Owl"); c.setFont("Helvetica", 11); c.drawString(40, 712, a)
    music(c, a)
    t = c.beginText(60, 300); t.setTextRenderMode(3)
    for i in range(30): t.setFont(fonts[i % 5], 10); t.textOut(f"word{i} ")
    c.drawText(t); c.showPage()
c.save()

# image-only "scan" (needs OCR)
def font(sz):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
pages = []
for label, n in [("Flute", 2), ("Bb Clarinet 1", 2), ("Bb Trumpet", 2), ("Trombone", 2), ("Percussion", 2)]:
    for pg in range(1, n + 1):
        im = Image.new("L", (1700, 2200), 255); d = ImageDraw.Draw(im)
        if pg == 1:
            d.text((850, 90), "HARBOR LIGHTS", font=font(64), fill=0, anchor="mm"); d.text((110, 190), label.upper(), font=font(40), fill=0)
        else:
            d.text((110, 70), f"{label.upper()} - 2", font=font(36), fill=0)
        for k in range(10):
            y = 420 + k * 170
            for j in range(5): d.line((110, y + j * 18, 1590, y + j * 18), fill=0, width=3)
        pages.append(im.convert("RGB"))
pages[0].save(os.path.join(OUT, "scan.pdf"), save_all=True, append_images=pages[1:], resolution=200)

# rosters (made-up names)
open(os.path.join(OUT, "roster_chairs.tsv"), "w").write("\n".join(["Name\tInstrument\tChair"] + [
    "Adams, Ava\tFlute\t1", "Baker, Ben\tFlute\t2", "Cole, Cara\tClarinet\t1", "Diaz, Dan\tClarinet\t2", "Evans, Eli\tClarinet\t3",
    "Ford, Fay\tSaxophone\t1", "Gray, Gus\tTrumpet\t1", "Hill, Hana\tTrumpet\t2", "Irwin, Ian\tTrumpet\t3", "Jones, Jo\tHorn\t1",
    "King, Kai\tTrombone\t1", "Lee, Lia\tTrombone\t2", "Moss, Max\tEuphonium\t1", "Nash, Nia\tTuba\t1",
    "Ortiz, Omar\tPercussion\t1", "Price, Pia\tPercussion\t2", "Quinn, Quin\tPercussion\t3", "Reed, Rae\tPercussion\t4"]))
open(os.path.join(OUT, "roster_nochairs.tsv"), "w").write("\n".join(["Name\tInstrument\tChair"] + [
    "Stone, Sam\tClarinet\t", "Tate, Tia\tClarinet\t", "Upton, Uma\tClarinet\t", "Vance, Val\tTrumpet\t", "Ward, Wes\tTrumpet\t",
    "Young, Yara\tTrombone\t", "Zane, Zoe\tTrombone\t", "Abel, Al\tTrombone\t", "Bell, Bo\tPercussion\t", "Cruz, Cy\t\t"]))
open(os.path.join(OUT, "roster_march.tsv"), "w").write("\n".join(["Name\tInstrument\tChair"] + [
    "Mel, One\tMellophone\t1", "Mel, Two\tMellophone\t2", "Mel, Three\tMellophone\t3", "Horn, Hal\tHorn\t1", "Sou, Sue\tSousaphone\t1",
    "Tub, Ted\tTuba\t1", "Sn, Sid\tSnare\t1", "Sn, Sal\tSnare\t2", "Ten, Tom\tQuints\t1", "Bd, Bea\tBass Drum\t1", "Bd, Bob\tBass Drum\t2",
    "Cym, Cy\tCymbals\t1", "Tp, Tara\tTrumpet\t1"]))
print("fixtures written to", OUT)
