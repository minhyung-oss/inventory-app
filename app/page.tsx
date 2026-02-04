"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AgGridReact } from "ag-grid-react";
import type { GridApi, GridReadyEvent, ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import type { InventoryRow } from "@/lib/types";
import { columnDefs, STORAGE_KEYS, fmtNum } from "@/lib/columns";
import CellHoverTooltip from "@/components/CellHoverTooltip";

type QueryState = {
  strategy: boolean;
  general: boolean;
  q: string;
};

// [Fix] JSX에서 참조하는 주행거리 옵션 배열 정의 (누락되었던 부분 추가)
const mileageOptionsDefault = [
  "연 1만KM", "연 1.5만KM", "연 2만KM", "연 2.5만KM", "연 3만KM", 
  "연 3.5만KM", "연 4만KM", "연 5만KM"
];
const mileageOptionsCorporate = [
  "연 1만KM", "연 1.5만KM", "연 2만KM", "연 2.5만KM", "연 3만KM", 
  "반납형 무제한"
];


type SearchControlsProps = {
  applied: QueryState;
  loading: boolean;
  canQuote: boolean;
  onApplyAndSearch: (draft: QueryState) => void;
  onQuote: () => void;
  mobile?: boolean;
};

const SearchControls = React.memo(function SearchControls({
  applied,
  loading,
  canQuote,
  onApplyAndSearch,
  onQuote,
  mobile,
}: SearchControlsProps) {
  const [draft, setDraft] = useState<QueryState>(applied);

  useEffect(() => {
    // applied 값이 바뀌면 draft도 동기화
    setDraft(applied);
  }, [applied.strategy, applied.general, applied.q]);

  return (
    <>
      <div
        style={{
          width: mobile ? "100%" : undefined,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "6px 8px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#f8fafc",
        }}
      >
        <PillCheckbox checked={draft.strategy} onChange={(v) => setDraft((s) => ({ ...s, strategy: v }))}>
          전략구매
        </PillCheckbox>
        <PillCheckbox checked={draft.general} onChange={(v) => setDraft((s) => ({ ...s, general: v }))}>
          일반구매(현대/기아)
        </PillCheckbox>
      </div>

      {mobile ? (
        <div style={{ width: "100%", display: "flex", gap: 8 }}>
          <input
            className="search"
            style={{ flex: 1, minWidth: 0 }}
            value={draft.q}
            onChange={(e) => setDraft((s) => ({ ...s, q: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) {
                e.preventDefault();
                onApplyAndSearch(draft);
              }
            }}
            placeholder="차종, 옵션, 색상 등..."
          />
          <button
            className="btn primary"
            onClick={() => onApplyAndSearch(draft)}
            disabled={loading}
            style={{ whiteSpace: "nowrap" }}
          >
            {loading ? "조회중..." : "조회"}
          </button>
          <button
            className="btn accent"
            onClick={onQuote}
            disabled={!canQuote}
            style={{ whiteSpace: "nowrap" }}
          >
            견적 생성
          </button>
        </div>
      ) : (
        <>
          <input
            className="search"
            value={draft.q}
            onChange={(e) => setDraft((s) => ({ ...s, q: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) {
                e.preventDefault();
                onApplyAndSearch(draft);
              }
            }}
            placeholder="차종, 옵션, 색상 등..."
          />

          <button className="btn primary" onClick={() => onApplyAndSearch(draft)} disabled={loading}>
            {loading ? "조회중..." : "데이터 조회"}
          </button>

          <button className="btn accent" onClick={onQuote} disabled={!canQuote}>
            견적 생성
          </button>
        </>
      )}
    </>
  );
});


function loadQueryState(): QueryState {
  if (typeof window === "undefined") return { strategy: true, general: false, q: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastQuery);
    if (!raw) return { strategy: true, general: false, q: "" };
    const p = JSON.parse(raw);
    return {
      // ✅ 기본값: 전략구매만 체크
      strategy: p.strategy === undefined ? true : !!p.strategy,
      general: p.general === undefined ? false : !!p.general,
      q: typeof p.q === "string" ? p.q : "",
    };
  } catch {
    return { strategy: true, general: false, q: "" };
  }
}

function saveQueryState(s: QueryState) {
  try {
    localStorage.setItem(STORAGE_KEYS.lastQuery, JSON.stringify(s));
  } catch {}
}

/**
 * ✅ "텍스트가 셀에서 잘릴 때만" 툴팁을 보여준다.
 * - globals.css에 .ag-cell-value 말줄임 CSS(overflow/ellipsis/nowrap)가 있어야 판정이 정확하다.
 */
function tooltipOnlyWhenTruncated(p: any): string {
  const raw = p?.valueFormatted ?? p?.value;
  const text = raw == null ? "" : String(raw);
  if (!text) return "";

  const cell: HTMLElement | null =
    (p?.eGridCell as HTMLElement) ||
    (p?.event?.target as HTMLElement)?.closest?.(".ag-cell") ||
    null;

  if (!cell) return "";

  const candidates: HTMLElement[] = [];
  const push = (el: Element | null) => {
    if (el && el instanceof HTMLElement) candidates.push(el);
  };

  push(cell);
  push(cell.querySelector(".ag-cell-value"));
  push(cell.querySelector(".ag-cell-wrapper"));
  push(cell.querySelector(".ag-cell-value > *"));

  const uniq = Array.from(new Set(candidates));

  const isTruncated = uniq.some((el) => {
    const cw = el.clientWidth;
    const sw = el.scrollWidth;
    if (!cw || !sw) return false;
    return sw - cw > 1;
  });

  return isTruncated ? text : "";
}

type SavedColWidth = { colId: string; width?: number };

// ✅ PC/모바일 공통: 체크박스를 'pill' 형태로 렌더링 (디자인 통일)
// ✅ PC/모바일 공통: 체크박스를 'pill' 형태로 렌더링 (디자인 통일)
// - pill(라벨) 배경/글자색은 체크 여부와 무관하게 고정
// - 체크박스는 네모(파란색, 체크 시) + 체크표시만 보이도록 네이티브 checkbox 사용 (hydration 안전)
function PillCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 900,
    fontSize: 13,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  return (
    <label style={base}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        // ✅ 체크박스만 파란 네모 + 체크표시
        style={{
          width: "18px",
          height: "18px",
          flex: "0 0 auto",
          accentColor: "#2563eb",
          cursor: "pointer",
        }}
      />
      <span>{children}</span>
    </label>
  );
}

export default function Page() {
  const ADMIN_SETTINGS_PASSWORD = "21482148";
  const ADMIN_FLAG_KEY = "inv_admin_authed_v1";
  const [appliedQs, setAppliedQs] = useState<QueryState>(loadQueryState());

  // ✅ 모바일 전용 UI(카드/스와이프) 적용 여부
  const [isMobile, setIsMobile] = useState(false);
  // 📏 모바일 카드 높이 고정 (스크롤/주소창 변화에도 테두리 변형 방지)
  const MOBILE_CARD_HEIGHT = "calc(100svh - 280px)";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(!!mql.matches);
    apply();
    // @ts-ignore
    if (mql.addEventListener) mql.addEventListener("change", apply);
    else mql.addListener(apply);
    return () => {
      // @ts-ignore
      if (mql.removeEventListener) mql.removeEventListener("change", apply);
      else mql.removeListener(apply);
    };
  }, []);

  
  // 🔒 모바일에서 페이지(바디) 세로 스크롤 잠금: 주소창/툴바 변화로 카드 높이 흔들림 방지
  useEffect(() => {
    if (!isMobile) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = (document.documentElement.style as any).overscrollBehaviorY;
    const prevBodyOverscroll = (document.body.style as any).overscrollBehaviorY;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    (document.documentElement.style as any).overscrollBehaviorY = "none";
    (document.body.style as any).overscrollBehaviorY = "none";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      (document.documentElement.style as any).overscrollBehaviorY = prevHtmlOverscroll;
      (document.body.style as any).overscrollBehaviorY = prevBodyOverscroll;
    };
  }, [isMobile]);

// ✅ 새 링크(첫 진입)에서는 이전 lastQuery를 무시하고 기본 체크 상태로 고정
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    if (!isFirstLoadRef.current) return;
    setAppliedQs({ strategy: true, general: false, q: "" });
    isFirstLoadRef.current = false;
  }, []);


  const [loadedOnce, setLoadedOnce] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  // ✅ PC/모바일 선택 행
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  const [mobileSelected, setMobileSelected] = useState<InventoryRow | null>(null);

  // ✅ 견적 모달 오픈 상태(PC/모바일)
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteOpenMobile, setQuoteOpenMobile] = useState(false);

  // ✅ 모바일 카드 캐러셀 ref
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  // ✅ 모바일 스크롤 rAF 스로틀
  const mobileScrollRafRef = useRef<number | null>(null);

  // ✅ 모바일 카드 step(px) 계산(스크롤/보정 모두 동일 로직 사용)
  const getMobileStepPx = useCallback((el: HTMLDivElement) => {
    // ✅ 가장 정확: 첫 카드와 둘째 카드의 offsetLeft 차이(실제 레이아웃 간격 포함)
    const cards = el.querySelectorAll<HTMLElement>("[data-inv-card]");
    if (cards && cards.length >= 2) {
      const a = cards[0];
      const b = cards[1];
      const diff = b.offsetLeft - a.offsetLeft;
      if (Number.isFinite(diff) && diff > 0) return diff;
    }

    // ✅ 보조: 카드 폭 + gap(12px). (카드 탐색 실패 시 화면 비율 fallback)
    const firstCard =
      el.querySelector<HTMLElement>('[data-inv-card="0"]')
      ?? (el.firstElementChild as HTMLElement | null);

    const cardW =
      firstCard?.getBoundingClientRect().width
      ?? Math.max(1, Math.floor((el.clientWidth || 1) * 0.86));

    return cardW + 12;
  }, []);


  // ✅ PC/모바일 공통: 견적/복사 등에 사용할 '현재 선택 행' (PC는 selected, 모바일은 mobileSelected)
  const selectedForQuote = isMobile ? mobileSelected : selected;

  // ✅ 모바일: 대량 조회 시 렌더 부담을 줄이기 위해 '점진 로딩'(앞 100개부터, 50개 남으면 +100개)
const [mobileLoadedCount, setMobileLoadedCount] = useState(0);

const mobileRowsToRender = useMemo(() => {
  if (!isMobile) return rows;
  const n = Math.max(0, Math.min(mobileLoadedCount, rows.length));
  return rows.slice(0, n);
}, [isMobile, rows, mobileLoadedCount]);

  // ✅ 모바일: 조회 결과가 생기면
// - 기본 선택(첫 항목)
// - 캐러셀을 처음으로
// - 점진 로딩 초기값(앞 100개)
useEffect(() => {
  if (!isMobile) return;
  if (!loadedOnce) return;

  const el = mobileCarouselRef.current;

  if (rows && rows.length > 0) {
    setMobileSelected((prev) => prev ?? rows[0]);
    setMobileLoadedCount(Math.min(100, rows.length));
    if (el) el.scrollLeft = 0;
  } else {
    setMobileSelected(null);
    setMobileLoadedCount(0);
    if (el) el.scrollLeft = 0;
  }
}, [isMobile, loadedOnce, rows]);

  

  // ✅ 모바일/PC: 견적 모달 내부 스크롤 힌트(↓ 아래로 스크롤)
  const mobileQuoteBodyRef = useRef<HTMLDivElement | null>(null);
  const pcQuoteBodyRef = useRef<HTMLDivElement | null>(null);
  const [showMobileScrollHint, setShowMobileScrollHint] = useState(false);
  const [showPcScrollHint, setShowPcScrollHint] = useState(false);

  const [quoteCopied, setQuoteCopied] = useState(false);
  // ✅ 모달 열릴 때: 스크롤 가능하면 '↓ 아래로 스크롤' 힌트 잠깐 표시
  useEffect(() => {
    // ✅ 스크롤이 실제로 가능한 경우에만 힌트 노출 (스크롤하면 사라짐)
    if (!quoteOpenMobile) {
      setShowMobileScrollHint(false);
      return;
    }
    window.requestAnimationFrame(() => {
      const el = mobileQuoteBodyRef.current;
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight > 8;
      setShowMobileScrollHint(scrollable && el.scrollTop <= 2);
    });
  }, [quoteOpenMobile, selectedForQuote?.번호]);

  useEffect(() => {
    // ✅ PC에서도: 스크롤 가능하면 힌트 노출 (스크롤하면 사라짐)
    if (!quoteOpen || isMobile) {
      setShowPcScrollHint(false);
      return;
    }
    window.requestAnimationFrame(() => {
      const el = pcQuoteBodyRef.current;
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight > 8;
      setShowPcScrollHint(scrollable && el.scrollTop <= 2);
    });
  }, [quoteOpen, isMobile, selectedForQuote?.번호]);

  const onMobileQuoteScroll = () => {
    const el = mobileQuoteBodyRef.current;
    if (!el) return;
    if (el.scrollTop > 6) setShowMobileScrollHint(false);
  };

  const onPcQuoteScroll = () => {
    const el = pcQuoteBodyRef.current;
    if (!el) return;
    if (el.scrollTop > 6) setShowPcScrollHint(false);
  };

// ---------------------------------------------------------------------------
  // 설정 관리: 검색어(동의어/별명) 사전 (서버 저장)
  // ---------------------------------------------------------------------------
  type SynRow = { canonical: string; aliases: string[] };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return sessionStorage.getItem(ADMIN_FLAG_KEY) === "1"; } catch { return false; }
  });
  const [adminPwOpen, setAdminPwOpen] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminPwErr, setAdminPwErr] = useState("");
  const [synLoading, setSynLoading] = useState(false);
  const [synRows, setSynRows] = useState<SynRow[]>([]);
  const [synCanonical, setSynCanonical] = useState<string>("");
  const [synAliases, setSynAliases] = useState<string>("");
  const [synEditKey, setSynEditKey] = useState<string>(""); // 편집중인 canonical(원본)

  const loadSynonyms = async () => {
    try {
      setSynLoading(true);
      const res = await fetch("/api/synonyms", { cache: "no-store" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`GET /api/synonyms failed: ${res.status} ${msg}`);
      }
      const data = await res.json();
      setSynRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setSynRows([]);
    } finally {
      setSynLoading(false);
    }
  };

  const verifyAdminAndOpenSettings = () => {
    const pw = adminPw.trim();
    if (pw !== ADMIN_SETTINGS_PASSWORD) {
      setAdminPwErr("비밀번호가 올바르지 않습니다.");
      return;
    }
    try { sessionStorage.setItem(ADMIN_FLAG_KEY, "1"); } catch {}
    setAdminAuthed(true);
    setAdminPw("");
    setAdminPwErr("");
    setAdminPwOpen(false);
    setSettingsOpen(true);
  };


  const resetSynForm = () => {
    setSynCanonical("");
    setSynAliases("");
    setSynEditKey("");
  };

  const saveSynonym = async () => {
    const canonical = synCanonical.trim();
    if (!canonical) return;
    try {
      setSynLoading(true);
      const aliases = synAliases
        .split(/[,\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);

      if (synEditKey) {
        const res = await fetch("/api/synonyms", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canonical: synEditKey, newCanonical: canonical, aliases }),
          cache: "no-store",
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`PUT /api/synonyms failed: ${res.status} ${msg}`);
        }
      } else {
        const res = await fetch("/api/synonyms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canonical, aliases }),
          cache: "no-store",
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`POST /api/synonyms failed: ${res.status} ${msg}`);
        }
      }

      await loadSynonyms();
      resetSynForm();
    } catch (e) {
      console.error(e);
      alert("저장에 실패했습니다. 콘솔을 확인하세요");
    } finally {
      setSynLoading(false);
    }
  };

  const editSynonym = (r: SynRow) => {
    setSynEditKey(r.canonical);
    setSynCanonical(r.canonical);
    setSynAliases((r.aliases ?? []).join("\n"));
  };

  const deleteSynonym = async (canonical: string) => {
    if (!canonical) return;
    if (!confirm(`삭제할까요? (${canonical})`)) return;
    try {
      setSynLoading(true);
      const res = await fetch(`/api/synonyms?canonical=${encodeURIComponent(canonical)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`DELETE /api/synonyms failed: ${res.status} ${msg}`);
      }
      await loadSynonyms();
      if (synEditKey && synEditKey === canonical) resetSynForm();
    } catch (e) {
      console.error(e);
      alert("삭제에 실패했습니다. 콘솔을 확인하세요");
    } finally {
      setSynLoading(false);
    }
  };

  // 설정창 열리면 목록 로드
  useEffect(() => {
    if (!settingsOpen) return;
    loadSynonyms();
  }, [settingsOpen]);

  // ---------------------------------------------------------------------------
  // 견적 생성: 계약조건 입력(드롭다운 + 직접입력)
  // ---------------------------------------------------------------------------
  type ClientType = "개인" | "개인사업자" | "법인";
  type TermType = "24개월" | "36개월" | "48개월" | "60개월";
  type InsuranceAgeType = "만 21세 이상" | "만 24세 이상" | "만 26세 이상" | "만 30세 이상" | "만 35세 이상";
  type LiabilityType = "1억" | "2억" | "3억" | "5억" | "10억";
  type GuaranteeType = "없음" | "직접입력";
  
  // [Fix] GoodsType 타입을 GoodsMode로 통일 (아래 state 변수명과 일치)
  type GoodsMode = "블박+선팅 포함" | "블박만 포함" | "선팅만 포함" | "모두 미포함" | "직접입력";

  const mileageOptionsFor = (client: ClientType) => {
    // 법인: 반납형 무제한 포함, 3.5/4/5만 제외
    if (client === "법인") return mileageOptionsCorporate;
    return mileageOptionsDefault;
  };

  const [clientType, setClientType] = useState<ClientType>("개인");
  const [term, setTerm] = useState<TermType>("36개월");
  const [mileage, setMileage] = useState<string>("연 2만KM");
  const [guaranteeType, setGuaranteeType] = useState<GuaranteeType>("없음");
  const [guaranteeText, setGuaranteeText] = useState<string>("");
  const [insuranceAge, setInsuranceAge] = useState<InsuranceAgeType>("만 26세 이상");
  const [liability, setLiability] = useState<LiabilityType>("1억");
  
  // [Fix] 변수명 수정: goodsType -> goodsMode / goodsInput -> goodsText
  const [goodsMode, setGoodsMode] = useState<GoodsMode>("블박+선팅 포함");
  const [goodsText, setGoodsText] = useState<string>("");
  
  const [fee, setFee] = useState<string>("");
  
  // [Fix] 변수명 수정: note -> notes (JSX에서 notes를 사용하므로)
  const [notes, setNotes] = useState<string>("");

  // 견적창을 열 때 기본값 세팅(선택 행이 바뀌어도 계약조건은 기본값으로 리셋)
  useEffect(() => {
    if (!quoteOpen) return;
    setClientType("개인");
    setTerm("36개월");
    setMileage("연 2만KM");
    setGuaranteeType("없음");
    setGuaranteeText("");
    setInsuranceAge("만 26세 이상");
    setLiability("1억");
    setGoodsMode("블박+선팅 포함"); // 변수명 수정 반영
    setGoodsText(""); // 변수명 수정 반영
    setFee("");
    setNotes(""); // 변수명 수정 반영
  }, [quoteOpen, selected?.번호]);

  // 법인/개인 변경 시 주행거리 옵션이 바뀌므로, 현재 값이 옵션 목록에 없으면 기본값으로 되돌림
  useEffect(() => {
    const opts = mileageOptionsFor(clientType);
    if (!opts.includes(mileage as any)) setMileage("연 2만KM");
  }, [clientType]);

  const gridApiRef = useRef<GridApi | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // ✅ 텍스트 복사 알림(3초 노출)
  const [copyToast, setCopyToast] = useState<string>("");
  const [copyBtnFlash, setCopyBtnFlash] = useState<"idle" | "done" | "fail">("idle");
  const copyBtnFlashTimerRef = useRef<number | null>(null);

  const copyToastTimerRef = useRef<number | null>(null);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: true,
      filter: false,
      suppressMenu: true,
      wrapText: false,
      autoHeight: false,

      // ✅ 열 위치 변경 금지 (폭만 조절)
      suppressMovable: true,

      // ✅ 셀 내용은 항상 hover 툴팁으로 전체 표시 (클릭 불필요)
      tooltipValueGetter: (p: any) => {
        const v = p?.valueFormatted ?? p?.value;
        return v == null ? "" : String(v);
      },
      tooltipClass: "inv-tooltip-cell",
    }),
    []
  );

  useEffect(() => {
    const flush = () => {
      try {
        saveColumnState();
      } catch {}
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
      if (copyBtnFlashTimerRef.current) {
        window.clearTimeout(copyBtnFlashTimerRef.current);
        copyBtnFlashTimerRef.current = null;
      }
    };
  }, []);

  const overlayNoRowsTemplate = useMemo(() => {
    return `
      <div style="padding:14px; color:#6b7280; font-weight:700;">
        조회된 내용이 없습니다.
      </div>
    `;
  }, []);

  function getAllColIds(api: GridApi): string[] {
    const cols: any[] = (api as any).getColumns?.() ?? [];
    const ids = cols.map((c) => c?.getColId?.()).filter(Boolean);
    if (ids.length) return ids;

    const state = api.getColumnState();
    return (state ?? []).map((s) => s.colId).filter(Boolean);
  }

  // ✅ 과거 hide:true 찌꺼기 제거 + 폭(width)만 복원
  function restoreColumnState() {
    const api = gridApiRef.current;
    if (!api) return;

    try {
      const colIds = getAllColIds(api);
      if (colIds.length) api.setColumnsVisible(colIds, true);

      const raw = localStorage.getItem(STORAGE_KEYS.colState);
      if (!raw) return;

      const saved = JSON.parse(raw) as SavedColWidth[];
      if (!Array.isArray(saved) || saved.length === 0) return;

      const widthMap = new Map<string, number>();
      for (const s of saved) {
        if (s && typeof s.colId === "string" && typeof s.width === "number") {
          widthMap.set(s.colId, s.width);
        }
      }

      const state = colIds
        .map((colId) => {
          const w = widthMap.get(colId);
          return typeof w === "number" ? ({ colId, width: w, hide: false } as any) : null;
        })
        .filter(Boolean) as any[];

      if (state.length) api.applyColumnState({ state, applyOrder: false });
    } catch {}
  }

  function saveColumnState() {
    const api = gridApiRef.current;
    if (!api) return;

    try {
      const slim: SavedColWidth[] = (api.getColumnState() ?? []).map((s) => ({
        colId: s.colId,
        width: s.width,
      }));
      localStorage.setItem(STORAGE_KEYS.colState, JSON.stringify(slim));
    } catch {}
  }

  function scheduleSaveColumnState() {
    if (typeof window === "undefined") return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveColumnState();
      saveTimerRef.current = null;
    }, 250);
  }

  function onGridReady(e: GridReadyEvent) {
    gridApiRef.current = e.api;
    restoreColumnState();
    e.api.showNoRowsOverlay();
  }

  async function onSearch(qsParam?: QueryState) {
    const qs = qsParam ?? appliedQs;
    if (!qs.strategy && !qs.general) {
      setLoadedOnce(true);
      setRows([]);
      setCount(0);
      setSelected(null);
      gridApiRef.current?.showNoRowsOverlay();
      saveQueryState(qs);
      return;
    }

    setLoading(true);
    setLoadedOnce(true);
    setSelected(null);
    saveQueryState(qs);

    try {
      const cats: string[] = [];
      if (qs.strategy) cats.push("strategy");
      if (qs.general) cats.push("general");

      const url = `/api/inventory?category=${encodeURIComponent(cats.join(","))}&q=${encodeURIComponent(qs.q ?? "")}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rRaw: InventoryRow[] = Array.isArray(data.rows) ? data.rows : [];
      const r: InventoryRow[] = rRaw.map((row, i) => ({ ...(row as any), __i: i })) as any;
      setRows(r);
      setCount(Number(data.count) || r.length);

      if (r.length === 0) gridApiRef.current?.showNoRowsOverlay();
      else gridApiRef.current?.hideOverlay();
    } catch (err) {
      console.error(err);
      setRows([]);
      setCount(0);
      gridApiRef.current?.showNoRowsOverlay();
      alert("데이터 조회에 실패했습니다. (콘솔을 확인하세요)");
    } finally {
      setLoading(false);
    }
  }

  function onApplyAndSearch(next: QueryState) {
    // ✅ 타이핑/체크 변경은 여기서만 반영되고, 조회 버튼을 눌렀을 때만 검색/조회 수행
    setAppliedQs(next);
    saveQueryState(next);
    void onSearch(next);
  }


  
  function onMobileCarouselScroll() {
    const el = mobileCarouselRef.current;
    if (!el) return;

    // ✅ rAF 스로틀: 관성 스크롤에서도 프레임당 1회만 계산
    if (mobileScrollRafRef.current != null) return;

    mobileScrollRafRef.current = requestAnimationFrame(() => {
      mobileScrollRafRef.current = null;
      const el2 = mobileCarouselRef.current;
      if (!el2) return;
      if (!rows || rows.length === 0) return;

const stepPx = getMobileStepPx(el2);

// ✅ 현재 렌더된 카드 기준으로 인덱스 산출 (렌더 범위 밖은 존재하지 않음)
const raw = stepPx > 0 ? Math.round(el2.scrollLeft / stepPx) : 0;
const renderLen = mobileRowsToRender.length || 0;
const idx = Math.max(0, Math.min(raw, Math.max(0, renderLen - 1)));

// ✅ 선택 업데이트
const r = rows[idx];
if (r && (mobileSelected?.번호 !== r.번호 || mobileSelected?.구분 !== r.구분)) {
  setMobileSelected(r);
}

// ✅ 점진 로딩: 남은 카드가 50개 이하가 되면 다음 100개를 추가로 렌더
if (isMobile && rows.length > mobileLoadedCount) {
  const threshold = Math.max(0, mobileLoadedCount - 50);
  if (idx >= threshold) {
    setMobileLoadedCount((c) => {
      if (c >= rows.length) return c;
      // idx는 렌더된 범위 내 값이므로, 여기 도달했으면 충분히 가까움
      const next = Math.min(c + 100, rows.length);
      return next;
    });
  }
}
    });
  }


function onQuote() {
    const target = selectedForQuote;
    if (!target) return;
    if (isMobile) setQuoteOpenMobile(true);
    else setQuoteOpen(true);
  }

  
  // ✅ 그리드의 '판매가능' 표시 로직과 동일하게: 판매가능이 0/비어있으면 즉시출고를 판매대수로 사용
  const saleCount = useMemo(() => {
    if (!selectedForQuote) return 0;
    const sale = Number((selectedForQuote as any).판매가능 ?? 0);
    const instant = Number((selectedForQuote as any).즉시출고 ?? 0);
    return sale > 0 ? sale : instant;
  }, [selectedForQuote]);

const quoteText = useMemo(() => {
    if (!selectedForQuote) return "";

    const reg = selectedForQuote.구분 ?? "";
    const no = selectedForQuote.번호 ?? "";
    const colors = `${selectedForQuote.외장 ?? ""}${selectedForQuote.외장 && selectedForQuote.내장 ? "/" : ""}${selectedForQuote.내장 ?? ""}`.trim();

    const gLine =
      guaranteeType === "직접입력"
        ? (guaranteeText.trim() || "")
        : guaranteeType;

    // [Fix] goodsCustom -> goodsText / goodsMode 변수명 수정 반영
    const goodsLine =
      goodsMode === "직접입력"
        ? (goodsText.trim() || "")
        : goodsMode;

    // [Fix] note -> notes 변수명 수정 반영
    return [
      "",
      `- 구분 번호 : ${reg}${no ? ` ${no}` : ""}`,
      `- 대표차종 : ${selectedForQuote.대표차종 ?? ""}`,
      `- 차종명: ${selectedForQuote.차종명 ?? ""}`,
      `- 옵션 : ${selectedForQuote.옵션 ?? ""}`,
      `- 차량가 : ${fmtNum(selectedForQuote.가격)}`,
      `- 색상 : ${colors}`,
      `- 개인/법인 : ${clientType}`,
      `- 계약기간 : ${term}`,
      `- 주행거리 : ${mileage}`,
      `- 보증/선납 : ${gLine}`,
      `- 보험연령 : ${insuranceAge}`,
      `- 용품 : ${goodsLine || ""}`,
      `- 수수료 : ${fee.trim()}`,
      `- 대물 : ${liability}`,
      `- 기타사항: ${notes.trim()}`,
      "",
      "견적서 부탁드리겠습니다.",
    ].join("\n");
  }, [selectedForQuote, clientType, term, mileage, guaranteeType, guaranteeText, insuranceAge, liability, goodsMode, goodsText, fee, notes]);

  

  // ✅ 견적 생성 제목 클릭 시, 표시 티 안나게 핵심 항목만 클립보드로 복사

  // ✅ 견적 대상 선택(PC: 그리드 선택, 모바일: 카드 선택)

  const quoteHeadText = useMemo(() => {
    if (!selectedForQuote) return "";

    const colors = `${selectedForQuote.외장 ?? ""}${selectedForQuote.외장 && selectedForQuote.내장 ? "/" : ""}${selectedForQuote.내장 ?? ""}`.trim();

    return [
      `- 대표차종 : ${selectedForQuote.대표차종 ?? ""}`,
      `- 차종명: ${selectedForQuote.차종명 ?? ""}`,
      `- 옵션 : ${selectedForQuote.옵션 ?? ""}`,
      `- 색상 : ${colors}`,
      `- 차량가 : ${fmtNum(selectedForQuote.가격)}`,
      `- 즉시출고: ${fmtNum((selectedForQuote as any).즉시출고)}`,
    ].join("\n");
  }, [selectedForQuote]);

  
  async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    // 1) Modern API (works on HTTPS + user gesture)
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    // 2) Fallback (better compatibility on mobile Safari etc.)
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

async function copyQuoteHeadSilent() {
    try {
      if (!quoteHeadText) return;
      const ok = await copyToClipboard(quoteHeadText);
      if (!ok) return;
      setQuoteCopied(true);
      window.setTimeout(() => setQuoteCopied(false), 2000);
    } catch {
      // 실패해도 UI 티 안나게 조용히 무시
    }
  }

async function copyQuote() {
    // ✅ 모바일 포함: 클립보드 복사 호환 + 버튼 3초 강조
    try {
      const ok = await copyToClipboard(quoteText);

      if (copyBtnFlashTimerRef.current) {
        window.clearTimeout(copyBtnFlashTimerRef.current);
        copyBtnFlashTimerRef.current = null;
      }

      if (ok) {
        setCopyBtnFlash("done");
        setCopyToast("");
        copyBtnFlashTimerRef.current = window.setTimeout(() => {
          setCopyBtnFlash("idle");
          copyBtnFlashTimerRef.current = null;
        }, 3000);
        return;
      }

      // 실패
      setCopyBtnFlash("fail");
      setCopyToast("복사 실패");
      if (copyToastTimerRef.current) window.clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = window.setTimeout(() => {
        setCopyToast("");
        copyToastTimerRef.current = null;
        setCopyBtnFlash("idle");
      }, 3000);
    } catch {
      setCopyBtnFlash("fail");
      setCopyToast("복사 실패");
      if (copyToastTimerRef.current) window.clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = window.setTimeout(() => {
        setCopyToast("");
        copyToastTimerRef.current = null;
        setCopyBtnFlash("idle");
      }, 3000);
    }
  }

  return (
    <div className="page">
      {isMobile ? (
        <>

      {/* ✅ 모바일: 좌우 스와이프 카드뷰 */}
      <div className="topbar" style={{ gap: 8, flexWrap: "wrap" }}>
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
          <Image
            src="/banner.png"
            alt="Bizcar x Auto.ST"
            width={240}
            height={36}
            priority
            style={{ height: 34, width: "auto", objectFit: "contain" }}
          />
        </div>

        <SearchControls
        mobile
        applied={appliedQs}
        loading={loading}
        canQuote={!!selectedForQuote}
        onApplyAndSearch={onApplyAndSearch}
        onQuote={onQuote}
      />

      </div>

      <div className="sectionTitle">
        <div className="left">
          <span>▸ 재고목록</span>
          <span className="badge">{loadedOnce ? `조회결과 ${count.toLocaleString()}건` : "조회 전"}</span>
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          {!appliedQs.strategy && !appliedQs.general ? "조회 대상을 선택하세요." : "좌우로 넘겨주세요."}
        </div>
      </div>

      <div style={{ padding: "6px 10px 8px" }}>
        {loading && (
          <div style={{ padding: 12, color: "#6b7280", fontWeight: 700 }}>조회중…</div>
        )}

        {!loading && loadedOnce && rows.length === 0 && (
          <div style={{ padding: 12, color: "#6b7280", fontWeight: 700 }}>조회된 내용이 없습니다.</div>
        )}

        {!loading && rows.length > 0 && (
          <div
            ref={mobileCarouselRef}
            onScroll={onMobileCarouselScroll}
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 6,
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
              height: MOBILE_CARD_HEIGHT,
              maxHeight: MOBILE_CARD_HEIGHT,
            }}
          >
            {mobileRowsToRender.map((r, i) => {
              const isSel = mobileSelected?.번호 === r.번호 && mobileSelected?.구분 === r.구분;
              const colors = `${r.외장 ?? ""}${r.외장 && r.내장 ? "/" : ""}${r.내장 ?? ""}`.trim();
              const price = fmtNum(r.가격);

              return (
                <div
                  key={`${r.구분 ?? ""}-${r.번호 ?? ""}-${i}`}
                  data-inv-card={String(i)}
                  onClick={() => setMobileSelected(r)}
                  style={{
                    scrollSnapAlign: "center",
                    flex: "0 0 86%",
                    borderRadius: 16,
                    border: isSel ? "2px solid #10b981" : "1px solid #e5e7eb",
                    background: "#fff",
                    padding: 10,
                    boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    maxHeight: "100%",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 18,
                      lineHeight: 1.2,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "#10b981" }}>{r.구분 ?? "-"}</span>
                    <span style={{ color: "#9ca3af" }}>·</span>
                    <span>{r.대표차종 ?? r.차종명 ?? "차량"}</span>
                  </div>

                  
                  <div style={{ marginTop: 6, flex: 1, overflowY: "auto", paddingRight: 4, WebkitOverflowScrolling: "touch" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "78px 1fr",
                        gap: "6px 10px",
                        fontSize: 12,
                        lineHeight: 1.2,
                        color: "#111827",
                      }}
                    >
<div style={{ color: "#6b7280", fontWeight: 800 }}>프로모션</div>
                      <div style={{ fontWeight: 700 }}>{(r as any).프로모션 ?? "-"}</div>
<div style={{ color: "#6b7280", fontWeight: 800 }}>차종명</div>
                      <div style={{ fontWeight: 700 }}>{r.차종명 ?? "-"}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>옵션</div>
                      <div style={{ fontWeight: 700, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {r.옵션 ?? "-"}
                      </div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>차량연식</div>
                      <div style={{ fontWeight: 700 }}>{(r as any).차량연식 ?? "-"}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>외장/내장</div>
                      <div style={{ fontWeight: 700 }}>{colors || "-"}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>가격</div>
                      <div style={{ fontWeight: 900 }}>{price}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>보조금</div>
                      <div style={{ fontWeight: 700 }}>{fmtNum((r as any).보조금)}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>판매가능</div>
                      <div style={{ fontWeight: 700 }}>{fmtNum((r as any).판매가능)}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>즉시출고</div>
                      <div style={{ fontWeight: 700 }}>{fmtNum((r as any).즉시출고)}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>생산예시일</div>
                      <div style={{ fontWeight: 700 }}>{(r as any).생산예시일 ?? "-"}</div>

                      <div style={{ color: "#6b7280", fontWeight: 800 }}>공지</div>
                      <div style={{ fontWeight: 700, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {(r as any).공지 ?? "-"}
                      </div>
                    </div>
                  </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#6b7280", paddingRight: 2 }}>
                      {`${i + 1}/${count || rows.length}`}
                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        )}

        {copyToast && (
          <div style={{ marginTop: 6, color: "#10b981", fontWeight: 800, paddingLeft: 2 }}>
            {copyToast}
          </div>
        )}
      </div>
        </>
      ) : (
        <>
      <div className="topbar" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image
            src="/banner.png"
            alt="Bizcar x Auto.ST"
            width={240}
            height={36}
            priority
            style={{ height: 34, width: "auto", objectFit: "contain" }}
          />
        </div>

        <SearchControls
        applied={appliedQs}
        loading={loading}
        canQuote={!!selected}
        onApplyAndSearch={onApplyAndSearch}
        onQuote={onQuote}
      />

<button className="btn" onClick={() => {
          if (adminAuthed) {
            setSettingsOpen(true);
          } else {
            setAdminPwErr("");
            setAdminPw("");
            setAdminPwOpen(true);
          }
        }}>
          설정 관리
        </button>
      </div>

      <div className="sectionTitle">
        <div className="left">
          <span>▸ 재고목록</span>
          <span className="badge">{loadedOnce ? `조회결과 ${count.toLocaleString()}건` : "조회 전"}</span>
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          {!appliedQs.strategy && !appliedQs.general ? "조회 대상을 선택하세요." : "체크 후 [데이터 조회]를 누르세요."}
        </div>
      </div>

      <div className="gridWrap">
        {loading && (
          <div className="gridLoading" role="status" aria-live="polite">
            <div className="gridLoadingCard">
              <div className="spinner" />
              <div className="gridLoadingText">조회중입니다…</div>
              <div className="gridLoadingSub">잠시만 기다려주세요</div>
            </div>
          </div>
        )}
        <div className="ag-theme-quartz" style={{ width: "100%", height: "100%" }}>
          <AgGridReact<InventoryRow>
            rowData={loadedOnce ? rows : []}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}

            suppressMovableColumns={true}
            suppressDragLeaveHidesColumns={true}

            suppressAutoSize={true}
            suppressSizeToFit={true}

            enableBrowserTooltips={false}
            tooltipComponent={CellHoverTooltip}
            tooltipShowDelay={0}
            tooltipHideDelay={12000}

            suppressCellFocus={true}
            enableCellTextSelection={true}
            rowSelection={{ mode: "singleRow", enableClickSelection: true }}
            onRowClicked={(e) => e.node.setSelected(true, true)}

            onGridReady={onGridReady}
            onFirstDataRendered={() => restoreColumnState()}

            onSelectionChanged={(e) => {
              const sel = e.api.getSelectedRows();
              const first = sel?.[0] ?? null;
              setSelected(first);
            }}

            onColumnResized={scheduleSaveColumnState}

            suppressMenuHide={true}
            headerHeight={38}
            rowHeight={34}
            overlayNoRowsTemplate={overlayNoRowsTemplate}
          />
        </div>
      </div>

              </>
      )}


      {/* ✅ 모바일 견적 생성: 바텀시트 */}
      {quoteOpenMobile && selectedForQuote && (
        <div className="backdrop" onClick={() => setQuoteOpenMobile(false)} style={{ alignItems: "flex-end" }}>
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "100%",
              maxHeight: "90vh",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              margin: 0,
              overflow: "hidden",
            }}
          >
            <div className="dialogHeader" style={{ padding: "12px 14px" }}>
              <div>견적 생성</div>
              <button className="btn" onClick={() => setQuoteOpenMobile(false)}>
                닫기
              </button>
            </div>

            <div className="dialogBody" ref={mobileQuoteBodyRef} onScroll={onMobileQuoteScroll} style={{ padding: 10, overflowY: "auto", maxHeight: "calc(90vh - 120px)", position: "relative" }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>
                {(selectedForQuote.차종명 ?? selectedForQuote.대표차종 ?? "")} / {fmtNum(selectedForQuote.가격)}
              </div>
              

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>개인/법인</div>
                  <select className="search" value={clientType} onChange={(e) => setClientType(e.target.value as ClientType)}>
                                        <option value="개인">개인</option>
                    <option value="개인사업자">개인사업자</option>
                    <option value="법인">법인</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>계약기간</div>
                  <select className="search" value={term} onChange={(e) => setTerm(e.target.value as TermType)}>
                                        <option value="24개월">24개월</option>
                    <option value="36개월">36개월</option>
                    <option value="48개월">48개월</option>
                    <option value="60개월">60개월</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>주행거리</div>
                  <select className="search" value={mileage} onChange={(e) => setMileage(e.target.value)}>
                    {(clientType === "법인" ? mileageOptionsCorporate : mileageOptionsDefault).map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>보증/선납</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                    <select
                      className="search"
                      value={guaranteeType}
                      onChange={(e) => setGuaranteeType(e.target.value as GuaranteeType)}
                    >
                      <option value="없음">없음</option>
                      <option value="직접입력">직접입력</option>
                    </select>
                    <input
                      className="search"
                      value={guaranteeText}
                      onChange={(e) => setGuaranteeText(e.target.value)}
                      placeholder={guaranteeType === "직접입력" ? "예: 보증금 10%" : ""}
                      disabled={guaranteeType !== "직접입력"}
                    />
                  </div>
</label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>보험연령</div>
                  <select className="search" value={insuranceAge} onChange={(e) => setInsuranceAge(e.target.value as InsuranceAgeType)}>
                                        <option value="만 21세 이상">만 21세 이상</option>
                    <option value="만 24세 이상">만 24세 이상</option>
                    <option value="만 26세 이상">만 26세 이상</option>
                    <option value="만 30세 이상">만 30세 이상</option>
                    <option value="만 35세 이상">만 35세 이상</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>용품</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                    <select className="search" value={goodsMode} onChange={(e) => setGoodsMode(e.target.value as GoodsMode)}>
                      <option value="블박+선팅 포함">블박+선팅 포함</option>
                      <option value="블박만 포함">블박만 포함</option>
                      <option value="선팅만 포함">선팅만 포함</option>
                      <option value="모두 미포함">모두 미포함</option>
                      <option value="직접입력">직접입력</option>
                    </select>
                    <input
                      className="search"
                      value={goodsText}
                      onChange={(e) => setGoodsText(e.target.value)}
                      placeholder={goodsMode === "직접입력" ? "예: 기본 용품" : ""}
                      disabled={goodsMode !== "직접입력"}
                    />
                  </div>
</label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>수수료</div>
                  <input className="search" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="예: 5피" />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>대물보험</div>
                  <select className="search" value={liability} onChange={(e) => setLiability(e.target.value as LiabilityType)}>
                                        <option value="1억">1억</option>
                    <option value="2억">2억</option>
                    <option value="3억">3억</option>
                    <option value="5억">5억</option>
                    <option value="10억">10억</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>기타사항</div>
                  <textarea
                    className="search"
                    style={{ minHeight: 80, whiteSpace: "pre-wrap" }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="필요한 내용을 적어주세요"
                  />
                </label>

                                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "#ef4444", fontSize: 12, lineHeight: 1.35 }}>
                    <div>※ 전략구매 즉시출고 물량은 일반적으로 1~2주 내로 고객에게 인도</div>
                    <div>※ 일반구매 재고 물량은 일반적으로 2~3주대로 고객에게 인도</div>
                    <div>※ 즉시출고 현황은 실시간은 아닌 점 참고 바랍니다</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                    <button
                      className="btn accent"
                      style={{
                        padding: "10px 14px",
                        whiteSpace: "nowrap",
                        background: copyBtnFlash === "done" ? "#ef4444" : undefined,
                        borderColor: copyBtnFlash === "done" ? "#ef4444" : undefined,
                      }}
                      onClick={copyQuote}
                    >
                      {copyBtnFlash === "done" ? "복사완료" : "텍스트 복사"}
                    </button>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                      복사 후 카카오톡/메일에 붙여넣으면 됩니다.
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      borderRadius: 16,
                      background: "linear-gradient(180deg, #0b1220, #0a1020)",
                      padding: 16,
                      color: "#e5e7eb",
                      boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                      overflow: "hidden",
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12, lineHeight: 1.5 }}>
{quoteText}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

                        <div style={{ display: "flex", gap: 10, padding: 10, borderTop: "1px solid #e5e7eb" }}>
              <button className="btn" style={{ flex: 1, padding: "12px 14px" }} onClick={() => setQuoteOpenMobile(false)}>
                닫기
              </button>
            
              {showMobileScrollHint && (
                <div style={{ position: "sticky", bottom: 10, display: "flex", justifyContent: "center", pointerEvents: "none", marginTop: 10, zIndex: 5 }}>
                  <div style={{ background: "rgba(0,0,0,0.72)", color: "#fff", fontWeight: 900, fontSize: 12, padding: "7px 12px", borderRadius: 999, letterSpacing: 0.2 }}>
                    ↓ 아래로 스크롤
                  </div>
                </div>
              )}
</div>
          </div>
        </div>
      )}

{quoteOpen && !isMobile && selectedForQuote && (
        <div className="backdrop" onClick={() => setQuoteOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialogHeader">
              <div>견적 생성</div>
              <button className="btn" onClick={() => setQuoteOpen(false)}>
                닫기
              </button>
            </div>
            <div className="dialogBody" ref={pcQuoteBodyRef} onScroll={onPcQuoteScroll} style={{ position: "relative" }}>
              <div className="quoteLayout">
              
                {/* 좌측: 차량 정보 */}
                <div className="quoteInfo">
                  <div className="quoteTitle" style={{ cursor: "pointer", userSelect: "none" }} onDoubleClick={copyQuoteHeadSilent}>
                    견적 생성
                    {quoteCopied && (
                      <span style={{ marginLeft: 8, color: "#16a34a", fontSize: 13 }}>
                        차량정보복사완료
                      </span>
                    )}
                  </div>
                  <div className="kv quoteKv">
                    <div>구분</div>
                    <div>{selectedForQuote.구분}</div>
                    <div>번호</div>
                    <div>{selectedForQuote.번호 ?? ""}</div>
                    <div>프로모션</div>
                    <div>{selected.프로모션 ?? ""}</div>
                    <div>대표차종</div>
                    <div>{selectedForQuote.대표차종}</div>
                    <div>차종명</div>
                    <div>{selectedForQuote.차종명}</div>
                    <div>옵션</div>
                    <div>{selectedForQuote.옵션}</div>
                    <div>차량연식</div>
                    <div>{selected.차량연식 ?? ""}</div>
                    <div>외장/내장</div>
                    <div>
                      {selectedForQuote.외장} / {selectedForQuote.내장}
                    </div>
                    <div>가격</div>
                    <div>{fmtNum(selectedForQuote.가격)}</div>
                    <div>보조금</div>
                    <div>{fmtNum(selected.보조금)}</div>
                    <div>판매가능</div>
                    <div>{fmtNum(saleCount)}</div>
                    <div>즉시출고</div>
                    <div>{fmtNum(selected.즉시출고)}</div>
                    <div>생산예시일</div>
                    <div>{selected.생산예시일}</div>
                    <div>공지</div>
                    <div>{selected.공지}</div>
                  </div>
                </div>

                {/* 우측: 계약 조건 */}
                <div className="quoteContract">
                  <div className="contractHeader">계약 조건</div>

                  <div className="contractGrid">
                    <label>개인/법인</label>
                    <select value={clientType} onChange={(e) => setClientType(e.target.value as ClientType)}>
                      <option value="개인">개인</option>
                      <option value="개인사업자">개인사업자</option>
                      <option value="법인">법인</option>
                    </select>

                    <label>계약기간</label>
                    <select value={term} onChange={(e) => setTerm(e.target.value as TermType)}>
                      <option value="24개월">24개월</option>
                      <option value="36개월">36개월</option>
                      <option value="48개월">48개월</option>
                      <option value="60개월">60개월</option>
                    </select>

                    <label>주행거리</label>
                    {/* [Fix] 상수로 정의한 주행거리 배열 사용 */}
                    <select value={mileage} onChange={(e) => setMileage(e.target.value)}>
                      {(clientType === "법인" ? mileageOptionsCorporate : mileageOptionsDefault).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <label>보증/선납</label>
                    <div className="inline">
                      <select value={guaranteeType} onChange={(e) => setGuaranteeType(e.target.value as GuaranteeType)}>
                        <option value="없음">없음</option>
                        <option value="직접입력">직접입력</option>
                      </select>
                      <input
                        value={guaranteeText}
                        onChange={(e) => setGuaranteeText(e.target.value)}
                        placeholder={guaranteeType === "직접입력" ? "예: 보증금 10%" : ""}
                        disabled={guaranteeType !== "직접입력"}
                      />
                    </div>

                    <label>보험연령</label>
                    <select value={insuranceAge} onChange={(e) => setInsuranceAge(e.target.value as InsuranceAgeType)}>
                      <option value="만 21세 이상">만 21세 이상</option>
                      <option value="만 24세 이상">만 24세 이상</option>
                      <option value="만 26세 이상">만 26세 이상</option>
                      <option value="만 30세 이상">만 30세 이상</option>
                      <option value="만 35세 이상">만 35세 이상</option>
                    </select>

                    <label>대물보험</label>
                    <select value={liability} onChange={(e) => setLiability(e.target.value as LiabilityType)}>
                      <option value="1억">1억</option>
                      <option value="2억">2억</option>
                      <option value="3억">3억</option>
                      <option value="5억">5억</option>
                      <option value="10억">10억</option>
                    </select>

                    <label>용품설정</label>
                    <div className="inline">
                      {/* [Fix] goodsType -> goodsMode 변수명 수정 반영 */}
                      <select value={goodsMode} onChange={(e) => setGoodsMode(e.target.value as GoodsMode)}>
                        <option value="블박+선팅 포함">블박+선팅 포함</option>
                        <option value="블박만 포함">블박만 포함</option>
                        <option value="선팅만 포함">선팅만 포함</option>
                        <option value="모두 미포함">모두 미포함</option>
                        <option value="직접입력">직접입력</option>
                      </select>
                      {/* [Fix] goodsInput -> goodsText 변수명 수정 반영 */}
                      <input
                        value={goodsText}
                        onChange={(e) => setGoodsText(e.target.value)}
                        placeholder={goodsMode === "직접입력" ? "예: 기본 용품" : ""}
                        disabled={goodsMode !== "직접입력"}
                      />
                    </div>

                    <label>수수료</label>
                    <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="예: 5피" />

                    <label>기타사항</label>
                    {/* [Fix] note -> notes 변수명 수정 반영 */}
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="내용 입력" />
                  </div>

                  <div className="quoteNotice" role="note">
                    <div>※ 전략구매 즉시출고 물량은 일반적으로 1~2주 내로 고객에게 인도</div>
                    <div>※ 일반구매 재고 물량은 일반적으로 2~3주내로 고객에게 인도</div>
                    <div>※ 즉시출고 현황은 실시간은 아닌 점 참고 바랍니다</div>
                  </div>
                </div>
              </div>

              <div className="smallRow" style={{ marginTop: 14 }}>
                <button
                  className="btn accent"
                  style={{
                    background: copyBtnFlash === "done" ? "#ef4444" : undefined,
                    borderColor: copyBtnFlash === "done" ? "#ef4444" : undefined,
                  }}
                  onClick={copyQuote}
                >
                  {copyBtnFlash === "done" ? "복사완료" : "텍스트 복사"}
                </button>
                <div className={`copyToast ${copyToast ? "show" : ""}`} aria-live="polite">
                  {copyToast}
                </div>
                <div className="copyHint">복사 후 카카오톡/메일에 붙여넣으면 됩니다.</div>
              </div>

              <div className="pre">{quoteText}</div>
            </div>
          </div>
        
              {showPcScrollHint && (
                <div style={{ position: "sticky", bottom: 10, display: "flex", justifyContent: "center", pointerEvents: "none", marginTop: 10, zIndex: 5 }}>
                  <div style={{ background: "rgba(0,0,0,0.72)", color: "#fff", fontWeight: 900, fontSize: 12, padding: "7px 12px", borderRadius: 999, letterSpacing: 0.2 }}>
                    ↓ 아래로 스크롤
                  </div>
                </div>
              )}
</div>
      )}


      {adminPwOpen && (
        <div className="backdrop" onClick={() => setAdminPwOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialogHeader">
              <div>관리자 인증</div>
              <button className="btn" onClick={() => setAdminPwOpen(false)}>
                닫기
              </button>
            </div>
            <div className="dialogBody">
              <div style={{ fontSize: 12, color: "#374151", fontWeight: 700, marginBottom: 8 }}>
                설정관리 비밀번호를 입력하세요.
              </div>
              <input
                className="invInput"
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="비밀번호"
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyAdminAndOpenSettings();
                }}
              />
              {adminPwErr && (
                <div style={{ marginTop: 8, color: "#ef4444", fontSize: 12, fontWeight: 800 }}>
                  {adminPwErr}
                </div>
              )}
              <div className="quoteActions">
                <button className="btn" onClick={() => setAdminPwOpen(false)}>
                  취소
                </button>
                <button className="btn primary" onClick={verifyAdminAndOpenSettings}>
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

{settingsOpen && (
  <div className="backdrop" onClick={() => { setSettingsOpen(false); resetSynForm(); }}>
    <div className="dialog settingsDialog" onClick={(e) => e.stopPropagation()}>
      <div className="dialogHeader">
        <div>설정 관리</div>
        <button className="btn" onClick={() => { setSettingsOpen(false); resetSynForm(); }}>
          닫기
        </button>
      </div>

      <div className="dialogBody">
        <div className="settingsSectionTitle">
          <div className="left">
            <span>▸ 검색어(동의어/별명) 설정</span>
            <span className="badge">{synLoading ? "로딩..." : `총 ${synRows.length}건`}</span>
          </div>
          <div className="settingsHint">
            예canonical: AVANTE / 별명: 아반떼, 아반테 … → 사용자가 &quot;아반&quot;만 입력해도 AVANTE 행이 검색됩니다.
          </div>
        </div>

        <div className="settingsForm">
          <div className="settingsGrid">
            <label>원본 키워드(canonical)</label>
            <input
              value={synCanonical}
              onChange={(e) => setSynCanonical(e.target.value)}
              placeholder="예: AVANTE"
            />

            <label>별명(aliases)</label>
            <textarea
              value={synAliases}
              onChange={(e) => setSynAliases(e.target.value)}
              placeholder="여러 개를 입력하세요 (줄바꿈 또는 콤마로 구분)&#10;예: 아반떼&#10;아반테&#10;아반퉤"
            />
          </div>

          <div className="settingsActions">
            <button className="btn primary" onClick={saveSynonym} disabled={synLoading || !synCanonical.trim()}>
              {synEditKey ? "수정 저장" : "추가 저장"}
            </button>
            <button className="btn" onClick={resetSynForm} disabled={synLoading}>
              초기화
            </button>
          </div>

          {synEditKey && (
            <div className="settingsEditNote">
              편집중: <b>{synEditKey}</b>
            </div>
          )}
        </div>

        <div className="settingsTableWrap">
          <table className="settingsTable">
            <thead>
              <tr>
                <th style={{ width: 180 }}>원본 키워드</th>
                <th>별명</th>
                <th style={{ width: 170, textAlign: "right" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {synRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="settingsEmpty">
                    등록된 검색어가 없습니다.
                  </td>
                </tr>
              )}

              {synRows.map((r) => (
                <tr key={r.canonical}>
                  <td className="settingsCanonical">{r.canonical}</td>
                  <td className="settingsAliases">{(r.aliases ?? []).join(", ")}</td>
                  <td className="settingsBtns">
                    <button className="btn" onClick={() => editSynonym(r)} disabled={synLoading}>
                      수정
                    </button>
                    <button className="btn danger" onClick={() => deleteSynonym(r.canonical)} disabled={synLoading}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settingsFootnote">
          ※ 이 설정은 서버에 저장됩니다. (로컬 PC에서 실행 중이면 링크로 접속한 모든 사용자가 동일하게 적용)
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}