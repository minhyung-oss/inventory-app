export type InventoryRow = {
  // ✅ 시트에 따라 "전략" / "일반"
  구분: string;

  // ✅ 기존 전략DB의 '구분(숫자)' 값을 여기로 옮겨담음 (일반은 없을 수도)
  번호?: string;

  // ✅ 전략구매 시트의 프로모션
  프로모션?: string;

  대표차종: string;
  차종명: string;
  옵션: string;

  차량연식?: string;

  외장: string;
  내장: string;

  가격: number;
  보조금: number;
  판매가능: number;
  즉시출고: number;

  생산예시일: string;
  공지: string;
};
