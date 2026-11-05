# Part Copier — rules for coding sessions

- **Edit the files in `src/`, then run `python3 build.py`.** `index.html` is generated from them; never edit it
  directly (the next build overwrites the change, and `tests/run_tests.py` refuses to run when it's stale).
- Before committing: `python3 tests/make_fixtures.py` (once) and `python3 tests/run_tests.py` — zero failures.
  Commit `src/` and the rebuilt `index.html` together.
- Read HANDOFF.md first (file map, data formats, open items). Update it and CHANGELOG.md when you ship.
- Public repo: no real student names, rosters or copyrighted music in it. Tests use made-up fixtures only.
