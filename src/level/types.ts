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
  levels: Level[];
}
