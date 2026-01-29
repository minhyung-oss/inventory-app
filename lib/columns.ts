import type { ColDef } from "ag-grid-community";

export const STORAGE_KEYS = {
  colState: "inv_col_state_v1",
  lastQuery: "inv_last_query_v1",
};

const cellCenterClass = "cell-center";
const cellRightClass = "cell-right";

/**
 * ✅ 툴팁은 page.tsx(defaultColDef.tooltipValueGetter)에서 "잘릴 때만" 처리한다.
 * ✅ 번호는 "번호" 값 그대로 표시 (체크 아이콘/체크박스 UI 없음)
 */
export const columnDefs: ColDef[] = [
  // 시트에 따라 "전략/일반" 값이 들어온다.
  { headerName: "구분", field: "구분", width: 78, cellClass: cellCenterClass },

  // ✅ 번호: 서버에서 내려주는 번호 그대로 표시
  { headerName: "번호", field: "번호", width: 92, cellClass: cellCenterClass, sortable: true },

  // ✅ 프로모션 (전략구매 시트에 존재)
  { headerName: "프로모션", field: "프로모션", width: 110, cellClass: cellCenterClass },

  { headerName: "대표차종", field: "대표차종", width: 140, cellClass: cellCenterClass },
  { headerName: "차종명", field: "차종명", width: 220, cellClass: cellCenterClass },
  { headerName: "옵션", field: "옵션", width: 240, cellClass: cellCenterClass },

  // 옵션과 외장 사이
  { headerName: "차량연식", field: "차량연식", width: 110, cellClass: cellCenterClass },

  { headerName: "외장", field: "외장", width: 120, cellClass: cellCenterClass },
  { headerName: "내장", field: "내장", width: 120, cellClass: cellCenterClass },

  // 숫자 4개: 우측정렬 + 콤마
  { headerName: "가격", field: "가격", width: 120, cellClass: cellRightClass, valueFormatter: (p) => fmtNum(p.value) },
  { headerName: "보조금", field: "보조금", width: 120, cellClass: cellRightClass, valueFormatter: (p) => fmtNum(p.value) },

  // ✅ 현대/기아(일반구매) 데이터는 판매가능이 0으로 내려오는 경우가 있어,
  //    판매가능 값이 0(또는 비어있음)이면 즉시출고 값을 그대로 표시한다.
  {
    headerName: "판매가능",
    colId: "판매가능",
    width: 110,
    cellClass: cellRightClass,
    valueGetter: (p: any) => {
      const sale = Number(p?.data?.판매가능 ?? 0);
      const instant = Number(p?.data?.즉시출고 ?? 0);

      // 판매가능이 유효하면 그대로, 아니면 즉시출고로 대체
      return sale > 0 ? sale : instant;
    },
    valueFormatter: (p) => fmtNum(p.value),
  },

  { headerName: "즉시출고", field: "즉시출고", width: 110, cellClass: cellRightClass, valueFormatter: (p) => fmtNum(p.value) },

  { headerName: "생산예시일", field: "생산예시일", width: 130, cellClass: cellCenterClass },
  { headerName: "공지", field: "공지", width: 260, cellClass: cellCenterClass },
];

export function fmtNum(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return "";
  return n.toLocaleString();
}
