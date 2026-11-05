#!/usr/bin/env python3
"""Build index.html from src/.

Part Copier is served as ONE page (index.html) so a teacher's browser can never mix an old script with a new
page. The code lives in src/ in smaller files; this script puts them back together:

    src/index.html      the page markup, with <!--INLINE:path--> lines where files go
    src/css/app.css     all styles
    src/js/NN-*.js      the script, in the order listed in src/index.html (one shared scope, like before)

    python3 build.py           write index.html
    python3 build.py --check   exit 1 if index.html is not what src/ builds (the tests run this first)

Edit src/, never index.html: the next build overwrites it.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"
MARK = re.compile(r"^<!--INLINE:([\w./-]+)-->$")


def build():
    lines = []
    for line in (SRC / "index.html").read_text(encoding="utf-8").split("\n"):
        m = MARK.match(line)
        if not m:
            lines.append(line)
            continue
        path = SRC / m.group(1)
        if not path.is_file():
            sys.exit(f"build.py: {m.group(1)} is listed in src/index.html but doesn't exist")
        text = path.read_text(encoding="utf-8")
        lines.append(text[:-1] if text.endswith("\n") else text)
    listed = {MARK.match(l).group(1) for l in (SRC / "index.html").read_text(encoding="utf-8").split("\n") if MARK.match(l)}
    loose = sorted(str(p.relative_to(SRC)) for p in SRC.rglob("*") if p.is_file() and p.suffix in (".js", ".css")
                   and str(p.relative_to(SRC)) not in listed)
    if loose:
        sys.exit("build.py: not listed in src/index.html: " + ", ".join(loose))
    return "\n".join(lines)


if __name__ == "__main__":
    html = build()
    if "--check" in sys.argv:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == html
        print("index.html is up to date" if same else "index.html is out of date: run python3 build.py")
        sys.exit(0 if same else 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote index.html ({len(html.encode('utf-8')) // 1024} KB)")
