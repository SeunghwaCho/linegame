import type { Point } from "../geometry/types.ts";

export interface Dot {
  id: number;
  colorId: number;
  center: Point;
  radius: number;
}

export type MoveResult =
  | { kind: "extended" }
  | { kind: "rewound"; segmentsPopped: number }
  | {
      kind: "rejected";
      reason: "min-step" | "foreign-dot" | "cross-other" | "self-cross";
    }
  | { kind: "finalized"; endDot: Dot };
