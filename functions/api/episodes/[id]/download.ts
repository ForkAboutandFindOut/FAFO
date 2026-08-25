import type { PagesFunction } from "@cloudflare/workers-types";
import { EPISODES } from "../../../_episodes";

type Env = {
  EPISODES_BUCKET: R2Bucket;
};

function parseRange(rangeHeader: string, size: number) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!m) return null;

  const startStr = m[1];
  const endStr = m[2];

  if (startStr === "" && endStr !== "") {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0) return null;

  if (endStr === "") return { start, end: size - 1 };

  const end = Number(endStr);
  if (!Number.isFinite(end) || end < start) return null;

  return { start, end: Math.min(end, size - 1) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const id = String(params.id || "").toLowerCase();

  // Only allow ep### ids (ep001, ep002, ...)
  if (!/^ep\d{3}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  // Prefer metadata from EPISODES if it exists, but don't require it
  const ep = EPISODES.find((e) => String(e.id).toLowerCase() === id);

  const r2Key = ep?.r2_key ?? `episodes/${id}.mp3`;
  const filename = ep?.filename ?? `${id}.mp3`;

  const head = await env.EPISODES_BUCKET.head(r2Key);
  if (!head) return new Response("Missing file", { status: 404 });

  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    const r = parseRange(rangeHeader, head.size);
    if (!r) return new Response("Range Not Satisfiable", { status: 416 });

    const length = r.end - r.start + 1;
    const obj = await env.EPISODES_BUCKET.get(r2Key, { range: { offset: r.start, length } });
    if (!obj?.body) return new Response("Range Not Satisfiable", { status: 416 });

    return new Response(obj.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${r.start}-${r.end}/${head.size}`,
        "Content-Length": String(length),
      },
    });
  }

  const obj = await env.EPISODES_BUCKET.get(r2Key);
  if (!obj?.body) return new Response("Missing file", { status: 404 });

  return new Response(obj.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(head.size),
    },
  });
};

