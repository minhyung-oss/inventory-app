// app/api/synonyms/route.ts
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// (선택) 초기 데이터를 KV에 자동 주입(시드)하고 싶으면 아래 import 사용
// - 이미 너가 data/synonyms.json을 가지고 있으니 이게 제일 편함
import seed from "@/data/synonyms.json";

export const runtime = "nodejs";

type SynRow = {
  canonical: string;
  aliases: string[];
};

const KV_KEY = "inv:synonyms:v1";

function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

function cleanAliases(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const s = normStr(x);
    if (!s) continue;
    // 중복 제거(대소문자 그대로 유지). 대소문자 무시하고 싶으면 seen key를 s.toLowerCase()로 바꾸면 됨.
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeRows(rows: unknown): SynRow[] {
  if (!Array.isArray(rows)) return [];
  const out: SynRow[] = [];
  const seenCanon = new Set<string>();

  for (const r of rows as any[]) {
    const canonical = normStr(r?.canonical);
    if (!canonical) continue;
    if (seenCanon.has(canonical)) continue;
    seenCanon.add(canonical);
    out.push({
      canonical,
      aliases: cleanAliases(r?.aliases),
    });
  }
  return out;
}

/**
 * KV에 데이터가 없으면 seed(data/synonyms.json)로 자동 초기화
 * - 배포 첫 실행 시 편함
 * - seed를 원하지 않으면 seed import와 이 로직을 제거하면 됨
 */
async function loadRows(): Promise<SynRow[]> {
  const existing = await kv.get<SynRow[]>(KV_KEY);
  const rows = normalizeRows(existing);
  if (rows.length > 0) return rows;

  const seeded = normalizeRows(seed);
  if (seeded.length > 0) {
    await kv.set(KV_KEY, seeded);
    return seeded;
  }
  return [];
}

async function saveRows(rows: SynRow[]) {
  await kv.set(KV_KEY, rows);
}

export async function GET() {
  const rows = await loadRows();
  return NextResponse.json(
    { rows },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const canonical = normStr((body as any)?.canonical);
  const aliases = cleanAliases((body as any)?.aliases);

  if (!canonical) {
    return NextResponse.json({ error: "canonical required" }, { status: 400 });
  }

  const rows = await loadRows();

  // 같은 canonical 있으면 덮어쓰기 (UI에서 “추가”지만 사실상 upsert로 처리)
  const next = rows.filter((r) => r.canonical !== canonical);
  next.push({ canonical, aliases });

  await saveRows(next);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // page.tsx에서 synEditKey를 canonical로 보내고,
  // 수정된 키는 newCanonical로 보내는 흐름과 호환
  const canonical = normStr((body as any)?.canonical);
  const newCanonical = normStr((body as any)?.newCanonical);
  const aliases = cleanAliases((body as any)?.aliases);

  if (!canonical || !newCanonical) {
    return NextResponse.json(
      { error: "canonical/newCanonical required" },
      { status: 400 }
    );
  }

  const rows = await loadRows();
  const idx = rows.findIndex((r) => r.canonical === canonical);
  if (idx < 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // rename 시에 동일 newCanonical이 이미 존재하면 충돌 방지
  if (canonical !== newCanonical && rows.some((r) => r.canonical === newCanonical)) {
    return NextResponse.json(
      { error: "newCanonical already exists" },
      { status: 409 }
    );
  }

  const next = [...rows];
  next.splice(idx, 1);
  next.push({ canonical: newCanonical, aliases });

  await saveRows(next);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const canonical = normStr(url.searchParams.get("canonical"));

  if (!canonical) {
    return NextResponse.json({ error: "canonical required" }, { status: 400 });
  }

  const rows = await loadRows();
  const next = rows.filter((r) => r.canonical !== canonical);

  await saveRows(next);
  return NextResponse.json({ ok: true });
}
