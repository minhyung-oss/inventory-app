import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type SynRow = { canonical: string; aliases: string[] };

function normText(s: string) {
  return String(s ?? "").trim();
}

function filePath() {
  return path.join(process.cwd(), "data", "synonyms.json");
}

async function ensureDir() {
  const dir = path.join(process.cwd(), "data");
  await fs.mkdir(dir, { recursive: true });
}

async function readAll(): Promise<SynRow[]> {
  try {
    const raw = await fs.readFile(filePath(), "utf-8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: any) => ({
        canonical: normText(x?.canonical),
        aliases: Array.isArray(x?.aliases) ? x.aliases.map(normText).filter(Boolean) : [],
      }))
      .filter((x: SynRow) => x.canonical);
  } catch {
    return [];
  }
}

async function writeAll(rows: SynRow[]) {
  await ensureDir();
  const p = filePath();
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf-8");
  await fs.rename(tmp, p);
}

function checkAdmin(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true; // 로컬 테스트: 토큰 미설정이면 누구나 수정 가능
  const got = req.headers.get("x-admin-token") ?? "";
  return got === token;
}

export async function GET() {
  const rows = await readAll();
  return NextResponse.json({ rows, count: rows.length });
}

export async function POST(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const canonical = normText(body?.canonical);
  const aliasesRaw = body?.aliases;

  const aliases =
    Array.isArray(aliasesRaw)
      ? aliasesRaw.map(normText).filter(Boolean)
      : String(aliasesRaw ?? "")
          .split(/[,\n]/g)
          .map(normText)
          .filter(Boolean);

  if (!canonical) return NextResponse.json({ error: "canonical is required" }, { status: 400 });

  const rows = await readAll();
  const idx = rows.findIndex((r) => r.canonical.toLowerCase() === canonical.toLowerCase());

  if (idx >= 0) {
    // upsert(병합)
    const merged = new Set<string>(rows[idx].aliases.map((a) => a.trim()).filter(Boolean));
    for (const a of aliases) merged.add(a);
    rows[idx] = { canonical: rows[idx].canonical, aliases: Array.from(merged) };
  } else {
    rows.push({ canonical, aliases });
  }

  await writeAll(rows);
  return NextResponse.json({ ok: true, rows, count: rows.length });
}

export async function PUT(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const canonical = normText(body?.canonical);
  const newCanonical = normText(body?.newCanonical) || canonical;

  const aliasesRaw = body?.aliases;
  const aliases =
    Array.isArray(aliasesRaw)
      ? aliasesRaw.map(normText).filter(Boolean)
      : String(aliasesRaw ?? "")
          .split(/[,\n]/g)
          .map(normText)
          .filter(Boolean);

  if (!canonical) return NextResponse.json({ error: "canonical is required" }, { status: 400 });

  const rows = await readAll();
  const idx = rows.findIndex((r) => r.canonical.toLowerCase() === canonical.toLowerCase());
  if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  rows[idx] = { canonical: newCanonical, aliases };
  await writeAll(rows);
  return NextResponse.json({ ok: true, rows, count: rows.length });
}

export async function DELETE(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const canonical = normText(searchParams.get("canonical") ?? "");
  if (!canonical) return NextResponse.json({ error: "canonical is required" }, { status: 400 });

  const rows = await readAll();
  const next = rows.filter((r) => r.canonical.toLowerCase() !== canonical.toLowerCase());
  await writeAll(next);
  return NextResponse.json({ ok: true, rows: next, count: next.length });
}
