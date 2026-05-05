import type { Segment } from "./types.ts";

export type SegmentId = number;

export interface StoredSegment {
  id: SegmentId;
  pathId: number;
  seg: Segment;
}

/**
 * 그리드 기반 broad-phase 인덱스.
 * 세그먼트가 지나는 모든 cell에 등록되어 query 시 후보만 반환.
 *
 * 라이프사이클:
 *   - insert: 신규 세그먼트 등록 → id 반환
 *   - remove(id): 단일 세그먼트 제거 (cellsOf 역인덱스로 O(k))
 *   - removePath(pathId): 같은 path 일괄 제거
 *   - clear: 전체 초기화
 *
 * 빈 버킷은 자동 정리하여 ghost 충돌과 메모리 누수를 방지한다.
 */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly grid = new Map<string, Set<SegmentId>>();
  private readonly segs = new Map<SegmentId, StoredSegment>();
  private readonly cellsOf = new Map<SegmentId, string[]>();
  private nextId: SegmentId = 1;

  constructor(cellSize: number) {
    if (cellSize <= 0) throw new Error("cellSize must be positive");
    this.cellSize = cellSize;
  }

  insert(pathId: number, seg: Segment): SegmentId {
    const id = this.nextId++;
    const stored: StoredSegment = { id, pathId, seg };
    const cells = this.cellsCovered(seg);
    for (const c of cells) {
      let bucket = this.grid.get(c);
      if (!bucket) {
        bucket = new Set();
        this.grid.set(c, bucket);
      }
      bucket.add(id);
    }
    this.segs.set(id, stored);
    this.cellsOf.set(id, cells);
    return id;
  }

  remove(id: SegmentId): void {
    const cells = this.cellsOf.get(id);
    if (!cells) return;
    for (const c of cells) {
      const bucket = this.grid.get(c);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) this.grid.delete(c);
    }
    this.segs.delete(id);
    this.cellsOf.delete(id);
  }

  removePath(pathId: number): void {
    const toRemove: SegmentId[] = [];
    for (const [id, s] of this.segs) {
      if (s.pathId === pathId) toRemove.push(id);
    }
    for (const id of toRemove) this.remove(id);
  }

  query(seg: Segment): StoredSegment[] {
    const seen = new Set<SegmentId>();
    const out: StoredSegment[] = [];
    const cells = this.cellsCovered(seg);
    for (const c of cells) {
      const bucket = this.grid.get(c);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = this.segs.get(id);
        if (s) out.push(s);
      }
    }
    return out;
  }

  clear(): void {
    this.grid.clear();
    this.segs.clear();
    this.cellsOf.clear();
  }

  bucketCount(): number {
    return this.grid.size;
  }

  /**
   * 세그먼트가 지나는 모든 그리드 cell 좌표 키.
   * Amanatides & Woo grid traversal — 빠짐 없이 cell을 모두 거친다.
   */
  private cellsCovered(seg: Segment): string[] {
    const cs = this.cellSize;
    const ax = seg.a.x;
    const ay = seg.a.y;
    const bx = seg.b.x;
    const by = seg.b.y;

    let x = Math.floor(ax / cs);
    let y = Math.floor(ay / cs);
    const endX = Math.floor(bx / cs);
    const endY = Math.floor(by / cs);

    const cells: string[] = [`${x},${y}`];
    if (x === endX && y === endY) return cells;

    const dx = bx - ax;
    const dy = by - ay;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    // 다음 x/y 경계까지 t값 (t는 a→b 사이 0..1)
    const nextBoundaryX = (x + (stepX > 0 ? 1 : 0)) * cs;
    const nextBoundaryY = (y + (stepY > 0 ? 1 : 0)) * cs;
    let tMaxX = stepX !== 0 ? (nextBoundaryX - ax) / dx : Infinity;
    let tMaxY = stepY !== 0 ? (nextBoundaryY - ay) / dy : Infinity;
    const tDeltaX = stepX !== 0 ? cs / Math.abs(dx) : Infinity;
    const tDeltaY = stepY !== 0 ? cs / Math.abs(dy) : Infinity;

    // 안전장치: 최악의 경우 |dx|/cs + |dy|/cs + 1 cell
    const maxSteps =
      Math.ceil(Math.abs(dx) / cs) + Math.ceil(Math.abs(dy) / cs) + 2;
    let steps = 0;
    while (steps++ < maxSteps) {
      if (tMaxX < tMaxY) {
        if (tMaxX > 1) break;
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        if (tMaxY > 1) break;
        y += stepY;
        tMaxY += tDeltaY;
      }
      cells.push(`${x},${y}`);
      if (x === endX && y === endY) break;
    }
    return cells;
  }
}
