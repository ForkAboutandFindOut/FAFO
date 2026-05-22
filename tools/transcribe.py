"""
Transcribe a FAFO episode via AssemblyAI.

Usage:
    export ASSEMBLYAI_API_KEY="..."
    python3 tools/transcribe.py <path-to-audio>

Outputs (next to the audio file):
    <basename>_AssemblyAI.json   raw API response (for analysis)
    <basename>_Transcript.md     speaker-labelled markdown (presentable)

Speakers default to "Speaker A / Speaker B" — rename by hand after listening
to the first 30s, or ask Claude to rename based on context.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import urllib.request
import urllib.error

API_BASE = "https://api.assemblyai.com/v2"
POLL_INTERVAL_SEC = 5


def api_key() -> str:
    key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not key:
        sys.exit("ERROR: set ASSEMBLYAI_API_KEY env var")
    return key


def http(method: str, url: str, key: str, *, data=None, headers=None, raw_body=None):
    h = {"authorization": key}
    if headers:
        h.update(headers)
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        h["content-type"] = "application/json"
    else:
        body = raw_body
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {url}: {e.read().decode('utf-8', 'replace')}")


def upload(path: pathlib.Path, key: str) -> str:
    print(f"Uploading {path.name} ({path.stat().st_size / 1e6:.1f} MB)...")
    with path.open("rb") as f:
        body = f.read()
    resp = http("POST", f"{API_BASE}/upload", key, raw_body=body,
                headers={"content-type": "application/octet-stream"})
    return resp["upload_url"]


def submit(audio_url: str, key: str) -> str:
    print("Submitting transcription job (speaker_labels=on)...")
    payload = {
        "audio_url": audio_url,
        "speech_models": ["universal-2"],
        "speaker_labels": True,
        "language_detection": True,
        "punctuate": True,
        "format_text": True,
    }
    resp = http("POST", f"{API_BASE}/transcript", key, data=payload)
    return resp["id"]


def poll(tid: str, key: str) -> dict:
    print(f"Polling transcript {tid}...")
    start = time.time()
    while True:
        resp = http("GET", f"{API_BASE}/transcript/{tid}", key)
        status = resp["status"]
        elapsed = time.time() - start
        print(f"  [{elapsed:5.0f}s] status={status}")
        if status == "completed":
            return resp
        if status == "error":
            sys.exit(f"AssemblyAI error: {resp.get('error')}")
        time.sleep(POLL_INTERVAL_SEC)


def fmt_ts(ms: int) -> str:
    s = ms // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def to_markdown(t: dict, audio_name: str) -> str:
    lines = [f"# Transcript — {audio_name}", ""]
    lines.append(f"_Auto-generated via AssemblyAI. Speakers labelled A/B — rename after listening to the first ~30s._")
    lines.append("")
    lines.append(f"- Duration: {fmt_ts(t.get('audio_duration', 0) * 1000) if isinstance(t.get('audio_duration'), int) else 'n/a'}")
    lang = t.get("language_code", "?")
    lines.append(f"- Language detected: {lang}")
    lines.append("")
    lines.append("---")
    lines.append("")

    utterances = t.get("utterances") or []
    if not utterances:
        # Fallback: no diarization, dump plain text
        lines.append(t.get("text", ""))
        return "\n".join(lines)

    for u in utterances:
        speaker = u.get("speaker", "?")
        ts = fmt_ts(u.get("start", 0))
        text = u.get("text", "").strip()
        lines.append(f"**Speaker {speaker}** [{ts}]")
        lines.append("")
        lines.append(text)
        lines.append("")

    return "\n".join(lines)


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 tools/transcribe.py <path-to-audio>")
    path = pathlib.Path(sys.argv[1]).expanduser().resolve()
    if not path.exists():
        sys.exit(f"File not found: {path}")

    key = api_key()
    audio_url = upload(path, key)
    tid = submit(audio_url, key)
    result = poll(tid, key)

    base = path.with_suffix("")
    json_out = base.with_name(base.name + "_AssemblyAI.json")
    md_out = base.with_name(base.name.replace("_FullInterview", "") + "_Transcript.md")

    json_out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    md_out.write_text(to_markdown(result, path.name), encoding="utf-8")

    print()
    print(f"Done.")
    print(f"  Raw JSON:    {json_out}")
    print(f"  Markdown:    {md_out}")


if __name__ == "__main__":
    main()
