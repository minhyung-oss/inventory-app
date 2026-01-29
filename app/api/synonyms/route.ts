import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KV_KEY = "synonyms:rows";

function requireEnv() {
  const missing: string[] = [];
  if (!process.env.KV_REST_API_URL) missing.push("KV_REST_API_URL");
  if (!process.env.KV_REST_API_TOKEN) missing.push("KV_REST_API_TOKEN");
  return missing;
}

async function readRows() {
  const rows = await kv.get<any[]>(KV_KEY);
  return Array.isArray(rows) ? rows : [];
}

async function writeRows(rows: any[]) {
  await kv.set(KV_KEY, rows);
}

export async function GET() {
  try {
    const missing = requireEnv();
    if (missing.length) {
      return NextResponse.json(
        { error: "MISSING_ENV", missing },
        { status: 500 }
      );
    }
    const rows = await readRows();
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error("GET /api/synonyms failed:", e);
    return NextResponse.json(
      { error: "KV_GET_FAILED", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const missing = requireEnv();
    if (missing.length) {
      return NextResponse.json(
        { error: "MISSING_ENV", missing },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { canonical, aliases } = body ?? {};
    if (!canonical) {
      return NextResponse.json(
        { error: "BAD_REQUEST", detail: "missing canonical" },
        { status: 400 }
      );
    }

    const rows = await readRows();
    const next = rows.filter((r: any) => r?.canonical !== canonical);
    next.push({ canonical, aliases: Array.isArray(aliases) ? aliases : [] });

    await writeRows(next);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("POST /api/synonyms failed:", e);
    return NextResponse.json(
      { error: "KV_SET_FAILED", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
