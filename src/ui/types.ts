/** UI 위젯들이 공유하는 좌표 공간 = CSS pixel (canvas 컨테이너 기준). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** 화면 레이아웃 정보 — 매 프레임 갱신되어 위젯에 전달. */
export interface Layout {
  /** 캔버스 CSS 폭/높이 */
  width: number;
  height: number;
  /** 상단 툴바 영역 */
  toolbarH: number;
  /** 보드 영역 (게임 좌표계가 letterbox로 들어갈 박스) */
  boardRect: Rect;
}
