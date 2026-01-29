import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// 데이터 파일 경로: 프로젝트 최상위 data/synonyms.json
const dataPath = path.join(process.cwd(), "data", "synonyms.json");

// 헬퍼: 파일 읽기
async function readSynonyms() {
  try {
    const txt = await fs.readFile(dataPath, "utf-8");
    return JSON.parse(txt);
  } catch (e) {
    return []; // 파일 없으면 빈 배열
  }
}

// 헬퍼: 파일 쓰기
async function writeSynonyms(data: any[]) {
  // data 폴더가 없으면 생성
  const dir = path.dirname(dataPath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2), "utf-8");
}

// GET: 목록 조회
export async function GET() {
  const rows = await readSynonyms();
  return NextResponse.json({ rows });
}

// POST: 추가
export async function POST(req: Request) {
  const body = await req.json();
  const { canonical, aliases } = body;
  if (!canonical) return NextResponse.json({ error: "missing canonical" }, { status: 400 });

  const rows = await readSynonyms();
  // 중복 제거 후 추가
  const newRows = rows.filter((r: any) => r.canonical !== canonical);
  newRows.push({ canonical, aliases });
  
  await writeSynonyms(newRows);
  return NextResponse.json({ success: true });
}

// PUT: 수정
export async function PUT(req: Request) {
  const body = await req.json();
  const { canonical, newCanonical, aliases } = body;
  if (!canonical || !newCanonical) return NextResponse.json({ error: "missing data" }, { status: 400 });

  const rows = await readSynonyms();
  const idx = rows.findIndex((r: any) => r.canonical === canonical);
  if (idx === -1) {
    // 없으면 새로 추가
    rows.push({ canonical: newCanonical, aliases });
  } else {
    // 있으면 수정
    rows[idx] = { canonical: newCanonical, aliases };
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
  rows = rows.filter((r: any) => r.canonical !== canonical);

  await writeSynonyms(rows);
  return NextResponse.json({ success: true });
}