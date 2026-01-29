import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KV_KEY = "synonyms:rows";

type SynRow = { canonical: string; aliases: string[] };

const norm = (v: unknown) => String(v ?? "").trim();
const normKey = (v: unknown) => norm(v).toLowerCase();

function uniq(arr: string[]) {
  const s = new Set<string>();
  arr.forEach(v => {
    const k = normKey(v);
    if (k) s.add(norm(v));
  });
  return [...s];
}

async function readRows(): Promise<SynRow[]> {
  const raw = await kv.get<string>(KV_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRows(rows: SynRow[]) {
  // 🔴 핵심: 반드시 stringify
  await kv.set(KV_KEY, JSON.stringify(rows));
}

async function readJson(req: Request) {
  const txt = await req.text().catch(() => "");
  if (!txt) return {};
  return JSON.parse(txt);
}

export async function GET() {
  const rows = await readRows();
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const canonical = norm(body.canonical);
  const aliases = uniq((body.aliases ?? []).map(norm));

  if (!canonical) {
    return NextResponse.json({ error: "missing canonical" }, { status: 400 });
  }

  const rows = await readRows();
  const ck = normKey(canonical);
  const idx = rows.findIndex(r => normKey(r.canonical) === ck);

  if (idx >= 0) {
    rows[idx].aliases = uniq([...rows[idx].aliases, ...aliases]);
  } else {
    rows.push({ canonical, aliases });
  }

  await writeRows(rows);
  return NextResponse.json({ success: true, rows });
}

export async function PUT(req: Request) {
  const body = await readJson(req);
  const canonical = norm(body.canonical);
  const newCanonical = norm(body.newCanonical);
  const aliases = uniq((body.aliases ?? []).map(norm));

  if (!canonical || !newCanonical) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const rows = await readRows();
  const idx = rows.findIndex(r => normKey(r.canonical) === normKey(canonical));

  if (idx >= 0) {
    rows[idx] = { canonical: newCanonical, aliases };
  } else {
    rows.push({ canonical: newCanonical, aliases });
  }

  await writeRows(rows);
  return NextResponse.json({ success: true, rows });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const canonical = norm(url.searchParams.get("canonical"));

  if (!canonical) {
    return NextResponse.json({ error: "missing canonical" }, { status: 400 });
  }

  const rows = await readRows();
  const next = rows.filter(r => normKey(r.canonical) !== normKey(canonical));

  await writeRows(next);
  return NextResponse.json({ success: true, rows: next });
}
