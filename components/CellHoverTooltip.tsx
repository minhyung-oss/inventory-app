import React from "react";
import type { ITooltipParams } from "ag-grid-community";

/**
 * ✅ 셀 hover 시 전체 내용을 보여주는 전용 툴팁
 * - 옵션 설명 툴팁(추후)과 분리하기 위해 클래스명을 별도로 둠.
 */
export default function CellHoverTooltip(props: ITooltipParams) {
  const value = (props.valueFormatted ?? props.value) as any;
  const text = value == null ? "" : String(value);
  if (!text) return null;

  return <div className="inv-tooltip-cell__inner">{text}</div>;
}
