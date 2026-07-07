#!/usr/bin/env python3
"""Build dist/way-to-oscar.html — the entire app inlined into ONE file.

Perfect for Dropbox: share a single file, everyone double-clicks it.
Run after any change:  python3 scripts/build-standalone.py
(build-seed.py runs implicitly first so data is fresh)
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build-seed.py")], check=True)

    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()

    def inline_css(m):
        with open(os.path.join(ROOT, m.group(1)), encoding="utf-8") as f:
            return "<style>\n" + f.read() + "\n</style>"

    def inline_js(m):
        with open(os.path.join(ROOT, m.group(1)), encoding="utf-8") as f:
            # </script> inside string data would terminate the tag early
            body = f.read().replace("</script", "<\\/script")
            return "<script>\n" + body + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    out = os.path.join(ROOT, "dist", "way-to-oscar.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  standalone built: dist/way-to-oscar.html ({os.path.getsize(out)/1024:.0f} KB)")

if __name__ == "__main__":
    main()
