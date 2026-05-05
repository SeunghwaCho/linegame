export interface LevelDot {
  id: number;
  colorId: number;
  x: number;
  y: number;
  radius?: number;
}

export interface Level {
  id: number;
  name: string;
  width: number;
  height: number;
  dots: LevelDot[];
}

export interface LevelPack {
  version: number;
  levels: Level[];
}
