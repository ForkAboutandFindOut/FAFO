from __future__ import annotations
import datetime as dt
import email.utils
import pathlib
import xml.sax.saxutils as sax
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "episodes.yml"
OUT = ROOT / "docs" / "feed.xml"

ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"

def esc(s: str) -> str:
    return sax.escape(s or "")

def rfc2822(date_str: str) -> str:
    # date_str: YYYY-MM-DD
    d = dt.datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    return email.utils.format_datetime(d)

def main():
    cfg = yaml.safe_load(DATA.read_text(encoding="utf-8"))
    p = cfg["podcast"]
    episodes = cfg.get("episodes", [])

    items_xml = []
    for ep in episodes:
        items_xml.append(f"""
    <item>
      <title>{esc(ep["title"])}</title>
      <description>{esc(ep.get("summary",""))}</description>
      <pubDate>{rfc2822(ep["date"])}</pubDate>
      <guid>{esc(ep["audio_url"])}</guid>
      <enclosure url="{esc(ep["audio_url"])}" length="{int(ep.get("audio_bytes", 0))}" type="{esc(ep.get("audio_type","audio/mpeg"))}" />
      <link>{esc(ep.get("page_url", ""))}</link>
      <itunes:duration>{esc(ep.get("duration",""))}</itunes:duration>
    </item>
""".rstrip())

    owner_block = ""
    if p.get("email") or p.get("author"):
        owner_block = f"""
    <itunes:owner>
      <itunes:name>{esc(p.get("author",""))}</itunes:name>
      <itunes:email>{esc(p.get("email",""))}</itunes:email>
    </itunes:owner>
""".rstrip()

    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="{ITUNES_NS}">
  <channel>
    <title>{esc(p["title"])}</title>
    <link>{esc(p["site_url"])}</link>
    <description>{esc(p["description"])}</description>
    <language>{esc(p.get("language","en"))}</language>
    <lastBuildDate>{email.utils.format_datetime(dt.datetime.now(dt.timezone.utc))}</lastBuildDate>

    <itunes:author>{esc(p.get("author",""))}</itunes:author>
    <itunes:explicit>{esc(p.get("explicit","false"))}</itunes:explicit>
    <itunes:image href="{esc(p.get("cover_image",""))}" />
    <itunes:category text="{esc(p.get("category","Technology"))}" />
{owner_block}

{chr(10).join(items_xml)}
  </channel>
</rss>
"""
    OUT.write_text(feed, encoding="utf-8")
    print(f"Wrote {OUT}")

if __name__ == "__main__":
    main()
