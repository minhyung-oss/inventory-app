import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KV_KEY = "synonyms:rows";

type SynRow = { canonical: string; aliases: string[] };

function norm(s: unknown) {
  return String(s ?? "").trim();
}
function normKey(s: unknown) {
  return norm(s).toLowerCase();
}
function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const k = normKey(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(norm(x));
  }
  return out;
}

async function readRows(): Promise<SynRow[]> {
  const rows = await kv.get<SynRow[]>(KV_KEY);
  return Array.isArray(rows) ? rows : [];
}
async function writeRows(rows: SynRow[]) {
  await kv.set(KV_KEY, rows);
}

// ✅ JSON body 파싱을 더 안전하게(빈 body / 깨진 JSON 대비)
async function readJson(req: Request): Promise<any> {
  const txt = await req.text().catch(() => "");
  if (!txt || !txt.trim()) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return { __invalid_json: true, __raw: txt };
  }
}

export async function GET() {
  const rows = await readRows();
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body?.__invalid_json) {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const canonical = norm(body?.canonical);
  const aliasesRaw = Array.isArray(body?.aliases) ? body.aliases : [];
  const aliases = uniq(aliasesRaw.map(norm)).filter(Boolean);

  if (!canonical) return NextResponse.json({ error: "missing canonical" }, { status: 400 });

  const rows = await readRows();
  const ck = normKey(canonical);
  const idx = rows.findIndex((r) => normKey(r?.canonical) === ck);

  if (idx >= 0) {
    // ✅ 기존 + 신규 aliases merge (저장하면 기존이 '삭제'된 것처럼 보이는 문제 방지)
    rows[idx] = { canonical, aliases: uniq([...(rows[idx].aliases ?? []), ...aliases]) };
  } else {
    rows.push({ canonical, aliases });
  }

  await writeRows(rows);
  return NextResponse.json({ success: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const body = await readJson(req);
  if (body?.__invalid_json) {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const canonical = norm(body?.canonical);
  const newCanonical = norm(body?.newCanonical);
  const aliasesRaw = Array.isArray(body?.aliases) ? body.aliases : [];
  const aliases = uniq(aliasesRaw.map(norm)).filter(Boolean);

  if (!canonical || !newCanonical) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const rows = await readRows();
  const idx = rows.findIndex((r) => normKey(r?.canonical) === normKey(canonical));

  if (idx === -1) rows.push({ canonical: newCanonical, aliases });
  else rows[idx] = { canonical: newCanonical, aliases };

  await writeRows(rows);
  return NextResponse.json({ success: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  let canonical = norm(url.searchParams.get("canonical"));

  if (!canonical) {
    const body = await readJson(req);
    if (body?.__invalid_json) {
      return NextResponse.json({ error: "invalid json body" }, { status: 400 });
    }
    canonical = norm(body?.canonical);
  }

  if (!canonical) return NextResponse.json({ error: "missing canonical" }, { status: 400 });

  const rows = await readRows();
  const ck = normKey(canonical);
  const next = rows.filter((r) => normKey(r?.canonical) !== ck);

  await writeRows(next);
  return NextResponse.json({ success: true, rows: next }, { headers: { "Cache-Control": "no-store" } });
}
