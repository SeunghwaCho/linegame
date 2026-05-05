import type { Point, Segment } from "../geometry/types.ts";
import { SpatialHash } from "../geometry/spatialHash.ts";
import { PathBuilder } from "./path.ts";
import type { Dot, MoveResult } from "./types.ts";

export interface FinalizedPath {
  pathId: number;
  colorId: number;
  startDotId: number;
  endDotId: number;
  segments: Segment[];
  segmentIds: number[];
}

export interface BoardOptions {
  /** SpatialHash cell 크기 */
  cellSize?: number;
  /** PathBuilder 옵션 — 동일 인스턴스 옵션이 모든 path에 공유됨 */
  minStep?: number;
  rewindRadius?: number;
  lineHalfWidth?: number;
}

/**
 * 보드 상태 관리.
 * - dots, spatialHash, 색상별 완성 path, 진행 중 PathBuilder를 보유.
 * - 같은 색 dot에서 새로 시작하면 기존 path를 자동 제거 (Flow Free 식 UX).
 * - 다른 색 dot에서 새로 시작하면 진행 중 builder는 cancel.
 */
export class Board {
  private readonly dots: ReadonlyArray<Dot>;
  private readonly hash: SpatialHash;
  private readonly opts: Required<Omit<BoardOptions, "cellSize">>;
  private readonly finalized = new Map<number, FinalizedPath>();
  private current: PathBuilder | null = null;
  private nextPathId = 1;

  constructor(dots: ReadonlyArray<Dot>, opts: BoardOptions = {}) {
    this.dots = dots;
    this.hash = new SpatialHash(opts.cellSize ?? 60);
    this.opts = {
      minStep: opts.minStep ?? 2,
      rewindRadius: opts.rewindRadius ?? 12,
      lineHalfWidth: opts.lineHalfWidth ?? 4,
    };
  }

  getDots(): ReadonlyArray<Dot> {
    return this.dots;
  }

  getCurrentBuilder(): PathBuilder | null {
    return this.current;
  }

  getFinalizedPaths(): ReadonlyMap<number, FinalizedPath> {
    return this.finalized;
  }

  /**
   * 좌표를 포함하는 dot을 반환 (반경 안이면).
   */
  findDotAt(p: Point): Dot | null {
    for (const d of this.dots) {
      const dx = p.x - d.center.x;
      const dy = p.y - d.center.y;
      if (dx * dx + dy * dy <= d.radius * d.radius) return d;
    }
    return null;
  }

  /**
   * 주어진 dotId에서 새 path 시작.
   * 진행 중 builder가 있으면 cancel. 같은 색의 finalized path가 있으면 제거.
   * @returns 새로 만든 PathBuilder, dot 못 찾으면 null
   */
  startPath(dotId: number): PathBuilder | null {
    const dot = this.dots.find((d) => d.id === dotId);
    if (!dot) return null;

    // 진행중인 것 cancel
    if (this.current && !this.current.isFinalized()) {
      this.current.cancel();
    }
    this.current = null;

    // 같은 색 finalized 제거
    const existing = this.finalized.get(dot.colorId);
    if (existing) {
      for (const id of existing.segmentIds) this.hash.remove(id);
      this.finalized.delete(dot.colorId);
    }

    const builder = new PathBuilder({
      colorId: dot.colorId,
      startDot: dot,
      allDots: this.dots,
      spatialHash: this.hash,
      pathId: this.nextPathId++,
      minStep: this.opts.minStep,
      rewindRadius: this.opts.rewindRadius,
      lineHalfWidth: this.opts.lineHalfWidth,
    });
    this.current = builder;
    return builder;
  }

  /**
   * 진행 중 path에 pointer 좌표 전달.
   * finalize 결과면 finalized로 이관.
   */
  updatePath(p: Point): MoveResult {
    if (!this.current) return { kind: "rejected", reason: "min-step" };
    const r = this.current.onPointerMove(p);
    if (r.kind === "finalized") {
      const fp: FinalizedPath = {
        pathId: this.current.getPathId(),
        colorId: r.endDot.colorId,
        startDotId: this.current.getStartDotId(),
        endDotId: r.endDot.id,
        segments: this.current.getSegments().map((s) => ({ ...s })),
        segmentIds: this.current.getSegmentIds(),
      };
      this.finalized.set(r.endDot.colorId, fp);
      this.current = null;
    }
    return r;
  }

  /**
   * 입력 종료. finalize 안된 path는 cancel.
   */
  endPath(): void {
    if (this.current && !this.current.isFinalized()) {
      this.current.cancel();
    }
    this.current = null;
  }

  /** 모든 색 쌍이 연결되었는가? */
  isCleared(): boolean {
    const colors = new Set<number>();
    for (const d of this.dots) colors.add(d.colorId);
    for (const c of colors) {
      if (!this.finalized.has(c)) return false;
    }
    return true;
  }

  /** 보드 전체 초기화. */
  reset(): void {
    if (this.current) this.current.cancel();
    this.current = null;
    this.finalized.clear();
    this.hash.clear();
  }

}
