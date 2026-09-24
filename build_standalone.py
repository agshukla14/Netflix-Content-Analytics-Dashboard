"""
build_standalone.py - Builds a completely self-contained single-file HTML dashboard
Bundles index.html, styles.css, data.js, and app.js into standalone.html.
Allows running the full interactive BI dashboard in a single file anywhere.
"""

import os
import re
import sys

# Ensure UTF-8 output on Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def build_standalone():
    print("Building standalone single-file dashboard...")
    base_dir = os.path.dirname(os.path.abspath(__file__))

    index_path = os.path.join(base_dir, "index.html")
    css_path = os.path.join(base_dir, "styles.css")
    data_path = os.path.join(base_dir, "data.js")
    app_path = os.path.join(base_dir, "app.js")
    output_path = os.path.join(base_dir, "standalone.html")

    if not os.path.exists(index_path):
        print(f"Error: {index_path} not found.")
        return

    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Inline CSS
    if os.path.exists(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()
        html = re.sub(r'<link\s+rel=["\']stylesheet["\']\s+href=["\']styles\.css["\']\s*\/?>',
                      f"<style>\n{css}\n</style>", html)

    # Inline data.js
    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            data_js = f.read()
        html = re.sub(r'<script\s+src=["\']data\.js["\']\s*><\/script>',
                      f"<script>\n{data_js}\n</script>", html)

    # Inline app.js
    if os.path.exists(app_path):
        with open(app_path, "r", encoding="utf-8") as f:
            app_js = f.read()
        html = re.sub(r'<script\s+src=["\']app\.js["\']\s*><\/script>',
                      f"<script>\n{app_js}\n</script>", html)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"✓ Standalone single-file dashboard generated: standalone.html ({size_mb:.2f} MB)")

if __name__ == "__main__":
    build_standalone()
