import { NextResponse } from "next/server";

/**
 * ✅ inventory API (FULL VERSION)
 *
 * 포함 기능(유지)
 * - 전략구매(고정 시트, 헤더 자동탐색)
 * - 일반구매: ✅ 현대차/기아차 시트 연결 (요청 반영)
 * - CSV 헤더가 1행이 아니어도 자동 탐색
 * - 헤더 공백/BOM/표기 흔들림 흡수
 * - 검색(q)
 * - 전략/일반 병합
 * - ✅ 전략구매에서 대표차종·차종명이 둘 다 비면 제외
 * - ✅ 현대차(일반구매)에서 대표차종·차종명이 둘 다 비면 제외
 */

// ================== 공통 시트 ==================
const SHEET_ID = "1JrnMmMgN925WEjJ-NtDhUM0yFFSc1dXHb4Hs8azNsqk";

// ================== 전략구매 시트 ==================
const STRATEGY_GID = "944955295";
const URL_STRATEGY =
  process.env.URL_STRATEGY_CSV ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${STRATEGY_GID}`;

// ================== 일반구매(현대) 시트 ==================
const HYUNDAI_GID = "875719914";
const URL_HYUNDAI =
  process.env.URL_HYUNDAI_CSV ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${HYUNDAI_GID}`;

// ================== 일반구매(기아) 시트 ==================
const KIA_GID = "2036918269";
const URL_KIA =
  process.env.URL_KIA_CSV ||
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${KIA_GID}`;

// ================== CSV 파서 ==================
function parseCSVToMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === "\r") continue;
    cur += ch;
  }
  pushCell();
  if (row.length) pushRow();
  return rows;
}

// ================== 헤더 자동 탐색 ==================
function normKey(s: string): string {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function matrixToRecordsByAutoHeader(matrix: string[][], mustKeys: string[]): Record<string, string>[] {
  if (!matrix.length) return [];

  let headerRowIdx = 0;
  let bestScore = -1;

  for (let r = 0; r < Math.min(40, matrix.length); r++) {
    const set = new Set((matrix[r] || []).map(normKey));
    let score = 0;
    for (const k of mustKeys) if (set.has(normKey(k))) score++;
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = r;
    }
  }

  const header = matrix[headerRowIdx] || [];
  const data = matrix.slice(headerRowIdx + 1);
  const maxCols = Math.max(header.length, ...data.map((r) => r.length));
  const hdr = Array.from({ length: maxCols }, (_, i) => header[i] ?? `__col_${i}`);

  return data
    .filter((r) => !r.every((c) => String(c ?? "").trim() === ""))
    .map((cols) => {
      const o: Record<string, string> = {};
      for (let i = 0; i < maxCols; i++) o[hdr[i]] = String(cols[i] ?? "").trim();
      return o;
    });
}

// ================== 유틸 ==================
function buildKeyMap(r: Record<string, string>) {
  const m: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) m[normKey(k)] = v;
  return m;
}

function pickFlex(r: Record<string, string>, cands: string[], fb = "") {
  const m = buildKeyMap(r);
  for (const c of cands) {
    const v = m[normKey(c)];
    if (v && v.trim()) return v.trim();
  }
  for (const c of cands) {
    const nc = normKey(c);
    const hit = Object.keys(m).find((k) => k.includes(nc) || nc.includes(k));
    if (hit && m[hit]?.trim()) return m[hit].trim();
  }
  return fb;
}

const toNum = (v: any) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fetchCsv = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.statusText);
  return r.text();
};

// ================== 정규화 ==================
function normStrategy(r: Record<string, string>) {
  return {
    구분: "전략",
    번호: pickFlex(r, ["구분번호", "번호"], ""),
    프로모션: pickFlex(r, ["프로모션"], ""),
    대표차종: pickFlex(r, ["대표차종"], ""),
    차종명: pickFlex(r, ["차종명"], ""),
    옵션: pickFlex(r, ["옵션명", "옵션"], ""),
    차량연식: pickFlex(r, ["차량연식", "연식"], ""),
    외장: pickFlex(r, ["외장색상", "외장"], ""),
    내장: pickFlex(r, ["내장색상", "내장"], ""),
    가격: toNum(pickFlex(r, ["차량가격", "가격"], "")),
    보조금: toNum(pickFlex(r, ["보조금가격", "보조금"], "")),
    판매가능: toNum(pickFlex(r, ["판매가능대수", "판매가능"], "")),
    즉시출고: toNum(pickFlex(r, ["즉시출고대수", "즉시출고"], "")),
    생산예시일: pickFlex(r, ["생산 중 빠른예시일", "생산예시일"], ""),
    공지: pickFlex(r, ["구매팀 공지(예정월) / 변경 有", "공지"], ""),
  };
}

// ✅ 현대차(일반구매) 매핑: 대표차종=대표차종, 차종=차종명, 옵션=옵션, 외장=외장, 내장=내장, 가격=가격, 재고=즉시출고
function normHyundai(r: Record<string, string>, idx: number) {
  return {
    구분: "현대",
    번호: pickFlex(r, ["번호", "No", "NO"], String(idx + 1)),
    프로모션: pickFlex(r, ["프로모션"], ""),
    대표차종: pickFlex(r, ["대표차종"], ""),
    차종명: pickFlex(r, ["차종", "차종명"], ""),
    옵션: pickFlex(r, ["옵션", "옵션명"], ""),
    차량연식: pickFlex(r, ["차량연식", "연식"], ""),
    외장: pickFlex(r, ["외장", "외장색상"], ""),
    내장: pickFlex(r, ["내장", "내장색상"], ""),
    가격: toNum(pickFlex(r, ["가격", "차량가격"], "")),
    보조금: 0,
    판매가능: 0,
    즉시출고: toNum(pickFlex(r, ["재고", "즉시출고", "즉시출고대수"], "")),
    생산예시일: pickFlex(r, ["생산예시일", "생산 중 빠른예시일"], ""),
    공지: pickFlex(r, ["공지"], ""),
  };
}


// ✅ 기아차(일반구매) 매핑: 대표차종=대표차종, 차종명=차종명, 옵션=옵션, 외장=외장, 내장=내장, 가격=가격, 재고=즉시출고
function normKia(r: Record<string, string>, idx: number) {
  return {
    구분: "기아",
    번호: pickFlex(r, ["번호", "No", "NO"], String(idx + 1)),
    프로모션: pickFlex(r, ["프로모션"], ""),
    대표차종: pickFlex(r, ["대표차종"], ""),
    차종명: pickFlex(r, ["차종명", "차종"], ""),
    옵션: pickFlex(r, ["옵션", "옵션명"], ""),
    차량연식: pickFlex(r, ["차량연식", "연식"], ""),
    외장: pickFlex(r, ["외장", "외장색상"], ""),
    내장: pickFlex(r, ["내장", "내장색상"], ""),
    가격: toNum(pickFlex(r, ["가격", "차량가격"], "")),
    보조금: 0,
    판매가능: 0,
    즉시출고: toNum(pickFlex(r, ["재고", "즉시출고", "즉시출고대수"], "")),
    생산예시일: pickFlex(r, ["생산예시일", "생산 중 빠른예시일"], ""),
    공지: pickFlex(r, ["공지"], ""),
  };
}

// ================== 동의어(검색어 별명) ==================
// ✅ 로컬 서버(Node 런타임)에서만 파일 저장/수정 가능
// data/synonyms.json 구조 예:
// [{ "canonical":"AVANTE", "aliases":["아반떼","아반테","아반퉤"] }]
import { promises as fs } from "fs";
import path from "path";

type SynRow = { canonical: string; aliases: string[] };

function normText(s: string) {
  return String(s ?? "").trim().toLowerCase();
}

function synonymsFilePath() {
  return path.join(process.cwd(), "data", "synonyms.json");
}

async function loadSynonyms(): Promise<SynRow[]> {
  try {
    const p = synonymsFilePath();
    const buf = await fs.readFile(p, "utf-8");
    const arr = JSON.parse(buf);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: any) => ({
        canonical: String(x?.canonical ?? "").trim(),
        aliases: Array.isArray(x?.aliases) ? x.aliases.map((a: any) => String(a ?? "").trim()).filter(Boolean) : [],
      }))
      .filter((x: SynRow) => x.canonical);
  } catch {
    return [];
  }
}

function expandQueryTokens(tokens: string[], syns: SynRow[]) {
  // token 하나당 확장 후보들의 Set을 만든다. (여러 토큰이면 AND)
  const synIndex = syns.map((s) => ({
    canonical: normText(s.canonical),
    canonicalRaw: s.canonical,
    aliases: (s.aliases ?? []).map(normText).filter(Boolean),
  }));

  const perToken: string[][] = tokens.map((tRaw) => {
    const t = normText(tRaw);
    if (!t) return [];
    const set = new Set<string>();
    set.add(t);

    for (const s of synIndex) {
      // 1) 별명이 token으로 시작하면 canonical을 추가 (prefix 매칭)
      if (s.aliases.some((a) => a.startsWith(t))) {
        set.add(s.canonical);
      }
      // 2) canonical 자체가 token으로 시작해도 canonical 추가
      if (s.canonical && s.canonical.startsWith(t)) {
        set.add(s.canonical);
      }
    }
    return Array.from(set).filter(Boolean);
  });

  return perToken;
}

function rowMatchesExpandedQuery(rowText: string, expanded: string[][]) {
  // AND: 각 토큰 그룹(확장 후보들) 중 하나라도 포함되어야 통과
  for (const group of expanded) {
    if (!group || group.length === 0) continue;
    const ok = group.some((term) => rowText.includes(term));
    if (!ok) return false;
  }
  return true;
}

// ================== API ==================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cats = (searchParams.get("category") ?? "").split(",").map((s) => s.trim());
  const q = (searchParams.get("q") ?? "").toLowerCase();

  const wantStrategy = cats.includes("strategy");
  const wantGeneral = cats.includes("general");

  const out: any[] = [];

  if (wantStrategy) {
    const txt = await fetchCsv(URL_STRATEGY);
    const matrix = parseCSVToMatrix(txt);
    const raw = matrixToRecordsByAutoHeader(matrix, [
      "대표차종",
      "차종명",
      "옵션명",
      "차량연식",
      "외장색상",
      "내장색상",
      "차량가격",
      "보조금가격",
    ]);

    const strategyRows = raw
      .map(normStrategy)
      .filter((r) => {
        // ✅ 대표차종·차종명이 둘 다 비면 제외
        return String(r.대표차종).trim() !== "" || String(r.차종명).trim() !== "";
      });

    out.push(...strategyRows);
  }

  if (wantGeneral) {
    // ✅ 현대차 먼저 연결
    if (URL_HYUNDAI) {
      const h = await fetchCsv(URL_HYUNDAI);
      const hRaw = matrixToRecordsByAutoHeader(parseCSVToMatrix(h), [
        "대표차종",
        "차종",
        "옵션",
        "외장",
        "내장",
        "가격",
        "재고",
      ]);

      const hyundaiRows = hRaw
        .map((r, i) => normHyundai(r, i))
        .filter((r) => {
          // ✅ 대표차종·차종명이 둘 다 비면 제외
          return String(r.대표차종).trim() !== "" || String(r.차종명).trim() !== "";
        });

      out.push(...hyundaiRows);
    }

    // ✅ 기아차 연결
    if (URL_KIA) {
      const k = await fetchCsv(URL_KIA);
      const kRaw = matrixToRecordsByAutoHeader(parseCSVToMatrix(k), [
        "대표차종",
        "차종명",
        "옵션",
        "외장",
        "내장",
        "가격",
        "재고",
      ]);

      const kiaRows = kRaw
        .map((r, i) => normKia(r, i))
        .filter((r) => {
          // ✅ 대표차종·차종명이 둘 다 비면 제외
          return String(r.대표차종).trim() !== "" || String(r.차종명).trim() !== "";
        });

      out.push(...kiaRows);
    }
  }

  // ================== 검색 (동의어 확장 포함) ==================
let rows = out;

if (q && q.trim()) {
  const syns = await loadSynonyms();
  const tokens = q.trim().split(/\s+/g).filter(Boolean);
  const expanded = expandQueryTokens(tokens, syns);

  rows = out.filter((r) => {
    const rowText = Object.values(r).join(" ").toLowerCase();
    return rowMatchesExpandedQuery(rowText, expanded);
  });
}

return NextResponse.json({ rows, count: rows.length });
}
