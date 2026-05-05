export interface LevelDot {
  id: number;
  colorId: number;
  x: number;
  y: number;
  radius?: number;
}

export interface LevelCircle {
  cx: number;
  cy: number;
  r: number;
}

/**
 * 변형(variant)의 한 base 레이아웃.
 * 런타임에서 회전·색 순열을 적용해 Level로 resolve된다.
 */
export interface Variant {
  dots: LevelDot[];
  circle?: LevelCircle;
}

/**
 * 레벨 템플릿 — JSON 팩에서 로드되는 단위.
 * variants 중 하나 + 회전 각 + 색 매핑으로 한 판이 생성된다.
 */
export interface LevelTemplate {
  id: number;
  name: string;
  width: number;
  height: number;
  variants: Variant[];
}

/**
 * 한 판 플레이를 위한 resolve된 레벨.
 * 게임 코드(Board, Renderer)는 이 형태만 본다.
 */
export interface Level {
  id: number;
  name: string;
  width: number;
  height: number;
  dots: LevelDot[];
  /**
   * 있으면 보드는 원형 영역으로 제한된다.
   * - 모든 path는 원 안(거리 ≤ r)에 있어야 finalize 가능
   * - 색 쌍 중 한 dot은 원 위(중심으로부터 r), 나머지는 원 안에 위치
   */
  circle?: LevelCircle;
}

export interface LevelPack {
  version: number;
  levels: LevelTemplate[];
}
