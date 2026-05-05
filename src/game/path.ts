import type { Point, Segment } from "../geometry/types.ts";
import {
  segmentsIntersect,
  pointSegDistance,
  closestPointOnSegment,
} from "../geometry/intersection.ts";
import { SpatialHash, type SegmentId } from "../geometry/spatialHash.ts";
import type { Dot, MoveResult } from "./types.ts";

interface PathSegment {
  id: SegmentId;
  seg: Segment;
}

export interface PathBuilderOptions {
  colorId: number;
  startDot: Dot;
  allDots: ReadonlyArray<Dot>;
  spatialHash: SpatialHash;
  pathId: number;
  /** 새 세그먼트로 인정되는 최소 픽셀 거리 */
  minStep?: number;
  /** 과거 세그먼트 근처로 들어왔다고 판단하는 반경 (되감기 트리거) */
  rewindRadius?: number;
  /** 라인 두께의 절반 — dot 충돌 반경에 더해진다 */
  lineHalfWidth?: number;
}

/**
 * 단일 path의 드래그 입력 처리기.
 * onPointerMove 한 번 호출이 한 프레임의 입력 한 단위.
 *
 * 파이프라인:
 *   1. 되감기 검사 (가장 최근 → 과거 순)
 *   2. MIN_STEP
 *   3. foreign-dot 터널링 검사 (같은 색 목적 dot은 finalize 신호)
 *   4. 타 path 교차 검사 (broad-phase via SpatialHash)
 *   5. 자기 교차 검사 (직전 세그먼트 제외)
 *   6. 통과 → push + hash insert
 */
export class PathBuilder {
  private readonly colorId: number;
  private readonly startDot: Dot;
  private readonly allDots: ReadonlyArray<Dot>;
  private readonly hash: SpatialHash;
  private readonly pathId: number;
  private readonly minStep: number;
  private readonly rewindRadius: number;
  private readonly lineHalfWidth: number;

  private readonly segments: PathSegment[] = [];
  private tip: Point;
  private finalized = false;
  private endDot: Dot | null = null;

  constructor(opts: PathBuilderOptions) {
    this.colorId = opts.colorId;
    this.startDot = opts.startDot;
    this.allDots = opts.allDots;
    this.hash = opts.spatialHash;
    this.pathId = opts.pathId;
    this.minStep = opts.minStep ?? 2;
    this.rewindRadius = opts.rewindRadius ?? 12;
    this.lineHalfWidth = opts.lineHalfWidth ?? 4;
    this.tip = { x: opts.startDot.center.x, y: opts.startDot.center.y };
  }

  getTip(): Point {
    return { x: this.tip.x, y: this.tip.y };
  }

  getColorId(): number {
    return this.colorId;
  }

  getPathId(): number {
    return this.pathId;
  }

  getStartDotId(): number {
    return this.startDot.id;
  }

  getSegmentCount(): number {
    return this.segments.length;
  }

  getSegments(): ReadonlyArray<Segment> {
    return this.segments.map((s) => s.seg);
  }

  getSegmentIds(): number[] {
    return this.segments.map((s) => s.id);
  }

  isFinalized(): boolean {
    return this.finalized;
  }

  getEndDot(): Dot | null {
    return this.endDot;
  }

  cancel(): void {
    for (const s of this.segments) this.hash.remove(s.id);
    this.segments.length = 0;
    this.finalized = true; // 이후 입력 무시
  }

  onPointerMove(p: Point): MoveResult {
    if (this.finalized) return { kind: "rejected", reason: "min-step" };

    // 1) 되감기 검사 — 직전 세그먼트(N-1)는 본질적으로 tip 근처이므로 제외하고
    //    N-2부터 거꾸로 본다.
    const rewound = this.tryRewind(p);
    if (rewound !== null) return rewound;

    // 2) 최소 이동 거리
    const dx = p.x - this.tip.x;
    const dy = p.y - this.tip.y;
    if (dx * dx + dy * dy < this.minStep * this.minStep) {
      return { kind: "rejected", reason: "min-step" };
    }

    const newSeg: Segment = { a: this.tip, b: { x: p.x, y: p.y } };

    // 3) foreign dot / 같은 색 목적 dot 검사
    const dotHit = this.firstDotHit(newSeg);
    if (dotHit) {
      if (dotHit.colorId === this.colorId && dotHit.id !== this.startDot.id) {
        // finalize: 세그먼트 끝점을 dot 중심으로 스냅
        const finalSeg: Segment = {
          a: this.tip,
          b: { x: dotHit.center.x, y: dotHit.center.y },
        };
        if (this.violatesIntersection(finalSeg)) {
          return { kind: "rejected", reason: "cross-other" };
        }
        this.pushSegment(finalSeg);
        this.finalized = true;
        this.endDot = dotHit;
        return { kind: "finalized", endDot: dotHit };
      }
      return { kind: "rejected", reason: "foreign-dot" };
    }

    // 4) 타 path 교차
    if (this.crossesOtherPath(newSeg)) {
      return { kind: "rejected", reason: "cross-other" };
    }

    // 5) 자기 교차 (직전 세그먼트 제외)
    if (this.crossesSelf(newSeg)) {
      return { kind: "rejected", reason: "self-cross" };
    }

    // 6) 통과
    this.pushSegment(newSeg);
    return { kind: "extended" };
  }

  private pushSegment(seg: Segment): void {
    const id = this.hash.insert(this.pathId, seg);
    this.segments.push({ id, seg });
    this.tip = { x: seg.b.x, y: seg.b.y };
  }

  /**
   * N-2 부터 거꾸로 검사하여 p가 과거 세그먼트 근처면 그 지점까지 pop.
   * 투영점이 세그먼트 시작점에 닿으면 한 단계 더 들어가 체이닝 (zero-length 잔재 방지).
   */
  private tryRewind(p: Point): MoveResult | null {
    const r = this.rewindRadius;
    const NEAR = 1; // 1px 미만은 같은 점으로 본다
    let popped = 0;
    let i = this.segments.length - 2;

    while (i >= 0) {
      const s = this.segments[i]!.seg;
      if (pointSegDistance(s.a, s.b, p) > r) break;

      // i+1 .. end 모두 pop
      while (this.segments.length > i + 1) {
        const removed = this.segments.pop()!;
        this.hash.remove(removed.id);
        popped++;
      }

      const proj = closestPointOnSegment(s.a, s.b, p);
      const dxa = proj.x - s.a.x;
      const dya = proj.y - s.a.y;
      if (dxa * dxa + dya * dya < NEAR * NEAR) {
        // 투영이 시작점 — 이 세그먼트도 통째로 pop, 이전으로 체이닝
        const removed = this.segments.pop()!;
        this.hash.remove(removed.id);
        popped++;
        this.tip = { x: s.a.x, y: s.a.y };
        i--;
        continue;
      }

      // 통상 truncate
      const truncated: Segment = { a: { x: s.a.x, y: s.a.y }, b: proj };
      const oldId = this.segments[i]!.id;
      this.hash.remove(oldId);
      const newId = this.hash.insert(this.pathId, truncated);
      this.segments[i] = { id: newId, seg: truncated };
      this.tip = proj;
      return { kind: "rewound", segmentsPopped: popped };
    }

    if (popped > 0) return { kind: "rewound", segmentsPopped: popped };
    return null;
  }

  /**
   * newSeg가 어떤 dot의 (radius + lineHalfWidth) 안을 통과하는가?
   * 통과하는 dot 중 가장 가까운 것을 반환 (segment 진행 방향 우선).
   */
  private firstDotHit(newSeg: Segment): Dot | null {
    const tipBefore = newSeg.a;
    let best: Dot | null = null;
    let bestT = Infinity;

    for (const dot of this.allDots) {
      // 시작 dot 자신은 무시 (출발 후 즉시 빠져나가는 경우)
      if (dot.id === this.startDot.id) continue;

      const blockR = dot.radius + this.lineHalfWidth;
      const dist = pointSegDistance(newSeg.a, newSeg.b, dot.center);
      if (dist > blockR) continue;

      // 가장 가까운 hit을 t값으로 결정 (a→b 진행 방향 기준)
      const proj = closestPointOnSegment(newSeg.a, newSeg.b, dot.center);
      const t = Math.hypot(proj.x - tipBefore.x, proj.y - tipBefore.y);
      if (t < bestT) {
        bestT = t;
        best = dot;
      }
    }
    return best;
  }

  private crossesOtherPath(newSeg: Segment): boolean {
    const candidates = this.hash.query(newSeg);
    for (const c of candidates) {
      if (c.pathId === this.pathId) continue; // 본인 path는 self 검사에서
      if (segmentsIntersect(newSeg, c.seg)) return true;
    }
    return false;
  }

  private crossesSelf(newSeg: Segment): boolean {
    // 마지막 세그먼트(N-1)는 tip 공유 → 항상 endpoint 일치하므로 제외
    const last = this.segments.length - 1;
    for (let i = 0; i < last; i++) {
      if (segmentsIntersect(newSeg, this.segments[i]!.seg)) return true;
    }
    return false;
  }

  /** finalize용: 최종 스냅 세그먼트가 타 path와 교차하는지만 확인. */
  private violatesIntersection(seg: Segment): boolean {
    return this.crossesOtherPath(seg) || this.crossesSelf(seg);
  }
}
