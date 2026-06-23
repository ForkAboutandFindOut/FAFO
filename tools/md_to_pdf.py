#!/usr/bin/env python3
"""One-off: render the ep008 LiveSheet markdown to a PDF via headless Chrome.

Stdlib only (per FAFO tools convention). Minimal markdown renderer — handles
only the features actually used in the live sheet (h1-h3, bold, italic, lists
with one level of nesting, blockquote, hr, paragraphs). Not a general-purpose
converter.
"""
from __future__ import annotations

import html as html_lib
import re
import subprocess
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: A4; margin: 18mm 18mm 18mm 18mm; }
html { font: 11pt/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #111; }
body { max-width: 100%; }
h1 { font-size: 20pt; margin: 0 0 4pt; border-bottom: 2px solid #111; padding-bottom: 4pt; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 2pt; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 14pt 0 4pt; page-break-after: avoid; }
p  { margin: 6pt 0; }
ul, ol { margin: 4pt 0 8pt; padding-left: 18pt; }
ul ul, ul ol, ol ul, ol ol { margin: 2pt 0; }
li { margin: 2pt 0; page-break-inside: avoid; }
ol > li { margin: 4pt 0; }
hr { border: none; border-top: 1px dashed #888; margin: 12pt 0; }
blockquote { margin: 6pt 0; padding: 4pt 10pt; border-left: 3px solid #888; color: #444; font-style: italic; background: #f6f6f6; }
strong { color: #000; }
em { color: #333; }
code { font: 10pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
.anchor { background: #fff3cd; padding: 1px 4px; border-radius: 3px; font-weight: bold; color: #5a3e00; }
.checkbox { font-family: "SF Mono", Menlo, monospace; }
"""

INLINE_BOLD = re.compile(r"\*\*(.+?)\*\*")
INLINE_ITAL = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
INLINE_CODE = re.compile(r"`([^`]+?)`")
ANCHOR_TAG  = re.compile(r"\[ANCHOR\]")
CHECKBOX    = re.compile(r"^\s*-\s+\[ \]\s+(.*)")


def inline(text: str) -> str:
    text = html_lib.escape(text)
    text = INLINE_CODE.sub(r"<code>\1</code>", text)
    text = INLINE_BOLD.sub(r"<strong>\1</strong>", text)
    text = INLINE_ITAL.sub(r"<em>\1</em>", text)
    text = ANCHOR_TAG.sub(r'<span class="anchor">[ANCHOR]</span>', text)
    return text


def render(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    list_stack: list[tuple[int, str]] = []  # (indent, tag) for currently open lists

    def close_lists_to(target_depth: int):
        while len(list_stack) > target_depth:
            _, tag = list_stack.pop()
            out.append(f"</{tag}>")

    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        # blank line: close all open lists, flush
        if not stripped:
            close_lists_to(0)
            i += 1
            continue

        # horizontal rule
        if stripped == "---":
            close_lists_to(0)
            out.append("<hr>")
            i += 1
            continue

        # headings
        m = re.match(r"^(#{1,3})\s+(.*)", stripped)
        if m:
            close_lists_to(0)
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2))}</h{level}>")
            i += 1
            continue

        # blockquote (single-line; live sheet only uses these)
        if stripped.startswith(">"):
            close_lists_to(0)
            body = stripped[1:].lstrip()
            out.append(f"<blockquote>{inline(body)}</blockquote>")
            i += 1
            continue

        # list item — bullet (-) or ordered (1.)
        m_bul = re.match(r"^(\s*)-\s+(.*)", raw)
        m_ord = re.match(r"^(\s*)\d+\.\s+(.*)", raw)
        if m_bul or m_ord:
            m = m_bul or m_ord
            tag = "ul" if m_bul else "ol"
            indent = len(m.group(1)) // 2  # 2 spaces = one nesting level
            body = m.group(2)
            cb = re.match(r"^\[ \]\s+(.*)", body)
            if cb:
                body = '<span class="checkbox">☐</span> ' + cb.group(1)
                rendered = inline(body).replace(
                    "&lt;span class=&quot;checkbox&quot;&gt;☐&lt;/span&gt;",
                    '<span class="checkbox">☐</span>',
                )
            else:
                rendered = inline(body)
            # close lists deeper than current indent, or with wrong tag at this depth
            while list_stack and (
                list_stack[-1][0] > indent
                or (list_stack[-1][0] == indent and list_stack[-1][1] != tag)
            ):
                _, t = list_stack.pop()
                out.append(f"</{t}>")
            # open a new list at this depth if needed
            if not list_stack or list_stack[-1][0] < indent:
                out.append(f"<{tag}>")
                list_stack.append((indent, tag))
            out.append(f"<li>{rendered}</li>")
            i += 1
            continue

        # paragraph (collect contiguous non-blank, non-special lines)
        close_lists_to(0)
        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith(("#", ">", "-", "---")) or re.match(r"^\d+\.\s", nxt):
                break
            para_lines.append(nxt)
            i += 1
        out.append(f"<p>{inline(' '.join(para_lines))}</p>")

    close_lists_to(0)
    return "\n".join(out)


def main():
    md = SRC.read_text()
    body = render(md)
    html_doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{SRC.stem}</title>
<style>{CSS}</style></head><body>
{body}
</body></html>"""
    tmp_html = Path("/tmp") / (SRC.stem + ".html")
    tmp_html.write_text(html_doc)
    print(f"wrote {tmp_html}")

    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={OUT}",
        f"file://{tmp_html.resolve()}",
    ]
    print(" ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("stderr:", r.stderr, file=sys.stderr)
        sys.exit(r.returncode)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
