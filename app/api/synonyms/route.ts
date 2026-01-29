import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// ✅ Vercel(서버리스)에서 파일 저장(fs.writeFile)은 영구 저장이 불가하므로
//    Vercel KV(Redis)에 저장하도록 변경합니다.
//
// 저장 키
const KV_KEY = "synonyms:rows";

// 헬퍼: KV에서 읽기
async function readSynonyms(): Promise<any[]> {
  const rows = await kv.get<any[]>(KV_KEY);
  return Array.isArray(rows) ? rows : [];
}

// 헬퍼: KV에 쓰기
async function writeSynonyms(data: any[]) {
  await kv.set(KV_KEY, data);
}

// GET: 목록 조회
export async function GET() {
  const rows = await readSynonyms();
  return NextResponse.json({ rows });
}

// POST: 추가
export async function POST(req: Request) {
  const body = await req.json();
  const { canonical, aliases } = body ?? {};
  if (!canonical) return NextResponse.json({ error: "missing canonical" }, { status: 400 });

  const rows = await readSynonyms();

  // 중복 제거 후 추가
  const newRows = rows.filter((r: any) => r?.canonical !== canonical);
  newRows.push({ canonical, aliases: Array.isArray(aliases) ? aliases : [] });

  await writeSynonyms(newRows);
  return NextResponse.json({ success: true });
}

// PUT: 수정
export async function PUT(req: Request) {
  const body = await req.json();
  const { canonical, newCanonical, aliases } = body ?? {};
  if (!canonical || !newCanonical) return NextResponse.json({ error: "missing data" }, { status: 400 });

  const rows = await readSynonyms();
  const idx = rows.findIndex((r: any) => r?.canonical === canonical);

  if (idx === -1) {
    // 없으면 새로 추가
    rows.push({ canonical: newCanonical, aliases: Array.isArray(aliases) ? aliases : [] });
  } else {
    // 있으면 수정
    rows[idx] = { canonical: newCanonical, aliases: Array.isArray(aliases) ? aliases : [] };
  }

  await writeSynonyms(rows);
  return NextResponse.json({ success: true });
}

// DELETE: 삭제
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const canonical = searchParams.get("canonical");
  if (!canonical) return NextResponse.json({ error: "missing canonical" }, { status: 400 });

  let rows = await readSynonyms();
  rows = rows.filter((r: any) => r?.canonical !== canonical);

  await writeSynonyms(rows);
  return NextResponse.json({ success: true });
}

// ✅ Node 런타임 고정 (Edge 방지)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
