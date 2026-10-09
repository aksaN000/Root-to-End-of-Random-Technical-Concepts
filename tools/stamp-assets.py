#!/usr/bin/env python3
"""Add a content hash to every local .css/.js link in the site's HTML pages, e.g.
   ../assets/root-kit.css?v=1a2b3c4d
GitHub Pages lets browsers cache files for 10 minutes. Without a version, a browser can
pair a new page with an old cached stylesheet or script. Run this before every commit:
   python3 tools/stamp-assets.py
"""
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT = re.compile(r'((?:src|href)=")([^"#?:]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")')
changed = 0
for dirpath, _, files in os.walk(ROOT):
    if "/." in dirpath or "node_modules" in dirpath:
        continue
    for f in files:
        if not f.endswith(".html"):
            continue
        page = os.path.join(dirpath, f)
        src = open(page, encoding="utf-8").read()
        def stamp(m):
            target = os.path.normpath(os.path.join(dirpath, m.group(2)))
            if not os.path.isfile(target):
                print("missing:", os.path.relpath(page, ROOT), "->", m.group(2), file=sys.stderr)
                return m.group(0)
            h = hashlib.sha256(open(target, "rb").read()).hexdigest()[:8]
            return m.group(1) + m.group(2) + "?v=" + h + m.group(3)
        out = PAT.sub(stamp, src)
        if out != src:
            open(page, "w", encoding="utf-8").write(out)
            changed += 1
            print("stamped", os.path.relpath(page, ROOT))
print(changed, "page(s) updated")
