import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// ✅ Vercel(서버리스)에서 파일 저장(fs.writeFile)은 영구 저장이 불가하므로
//    Vercel KV(Redis)에 저장하도록 합니다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KV_KEY = "synonyms:rows";

type SynRow = { canonical: string; aliases: string[] };

function norm(s: unknown) {
  return String(s ?? "").trim();
}
function normKey(s: unknown) {
  // ✅ 삭제/비교는 대소문자 무시(영문) + 공백 제거 기준으로 안정화
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

// GET: 목록 조회
export async function GET() {
  const rows = await readRows();
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}

// POST: 추가/덮어쓰기(동일 canonical이면 aliases는 합집합으로 merge)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const canonical = norm(body?.canonical);
  const aliasesRaw = Array.isArray(body?.aliases) ? body.aliases : [];
  const aliases = uniq(aliasesRaw.map(norm)).filter(Boolean);

  if (!canonical) {
    return NextResponse.json({ error: "missing canonical" }, { status: 400 });
  }

  const rows = await readRows();
  const ck = normKey(canonical);

  const idx = rows.findIndex((r) => normKey(r?.canonical) === ck);

  if (idx >= 0) {
    // ✅ 기존 aliases + 신규 aliases merge
    const merged = uniq([...(rows[idx].aliases ?? []), ...aliases]);
    rows[idx] = { canonical, aliases: merged };
  } else {
    rows.push({ canonical, aliases });
  }

  await writeRows(rows);
  return NextResponse.json({ success: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

// PUT: 수정(원본 canonical → newCanonical, aliases는 교체)
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const canonical = norm(body?.canonical);
  const newCanonical = norm(body?.newCanonical);
  const aliasesRaw = Array.isArray(body?.aliases) ? body.aliases : [];
  const aliases = uniq(aliasesRaw.map(norm)).filter(Boolean);

  if (!canonical || !newCanonical) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const rows = await readRows();
  const idx = rows.findIndex((r) => normKey(r?.canonical) === normKey(canonical));

  if (idx === -1) {
    rows.push({ canonical: newCanonical, aliases });
  } else {
    rows[idx] = { canonical: newCanonical, aliases };
  }

  await writeRows(rows);
  return NextResponse.json({ success: true, rows }, { headers: { "Cache-Control": "no-store" } });
}

// DELETE: 삭제 (querystring canonical 또는 body canonical 둘 다 지원)
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  let canonical = norm(url.searchParams.get("canonical"));

  if (!canonical) {
    const body = await req.json().catch(() => ({}));
    canonical = norm(body?.canonical);
  }

  if (!canonical) {
    return NextResponse.json({ error: "missing canonical" }, { status: 400 });
  }

  const rows = await readRows();
  const ck = normKey(canonical);
  const next = rows.filter((r) => normKey(r?.canonical) !== ck);

  await writeRows(next);
  return NextResponse.json({ success: true, rows: next }, { headers: { "Cache-Control": "no-store" } });
}
