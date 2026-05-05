import { test } from "node:test";
import assert from "node:assert/strict";
import { SpatialHash } from "../src/geometry/spatialHash.ts";
import type { Segment } from "../src/geometry/types.ts";

const S = (ax: number, ay: number, bx: number, by: number): Segment => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

test("insert + query: 같은 cell에 들어간 세그먼트는 후보로 잡힌다", () => {
  const h = new SpatialHash(50);
  const id = h.insert(1, S(10, 10, 40, 40));
  const cands = h.query(S(20, 20, 30, 30));
  assert.equal(cands.length, 1);
  assert.equal(cands[0]!.id, id);
});

test("query: 다른 cell만 지나는 세그먼트는 후보 없음", () => {
  const h = new SpatialHash(50);
  h.insert(1, S(10, 10, 40, 40));
  const cands = h.query(S(500, 500, 600, 600));
  assert.equal(cands.length, 0);
});

test("query: 후보 중복 제거 (여러 cell을 공유해도 1번만)", () => {
  const h = new SpatialHash(50);
  h.insert(1, S(0, 25, 200, 25));
  const cands = h.query(S(10, 25, 190, 25));
  assert.equal(cands.length, 1);
});

test("remove: 삭제된 세그먼트는 더 이상 잡히지 않음", () => {
  const h = new SpatialHash(50);
  const id = h.insert(1, S(10, 10, 40, 40));
  h.remove(id);
  const cands = h.query(S(20, 20, 30, 30));
  assert.equal(cands.length, 0);
});

test("removePath: 같은 pathId의 모든 세그먼트 일괄 삭제", () => {
  const h = new SpatialHash(50);
  h.insert(7, S(10, 10, 40, 40));
  h.insert(7, S(60, 60, 90, 90));
  h.insert(8, S(110, 110, 140, 140));
  h.removePath(7);
  assert.equal(h.query(S(20, 20, 30, 30)).length, 0);
  assert.equal(h.query(S(70, 70, 80, 80)).length, 0);
  assert.equal(h.query(S(120, 120, 130, 130)).length, 1);
});

test("remove: 빈 버킷은 grid에서 정리되어 메모리 누수 없음", () => {
  const h = new SpatialHash(50);
  const id = h.insert(1, S(10, 10, 40, 40));
  const before = h.bucketCount();
  assert.ok(before > 0);
  h.remove(id);
  assert.equal(h.bucketCount(), 0);
});

test("긴 대각선 세그먼트도 모든 cell에 등록되어 broad-phase 누락 없음", () => {
  const h = new SpatialHash(50);
  // (0,0) -> (500,500) 대각선
  h.insert(1, S(0, 0, 500, 500));
  // (250,250) 근처 cell을 지나는 세그먼트
  const cands = h.query(S(240, 260, 260, 240));
  assert.equal(cands.length, 1);
});

test("remove 후 같은 id 재사용 안 됨 (insert는 단조 증가 id)", () => {
  const h = new SpatialHash(50);
  const id1 = h.insert(1, S(0, 0, 10, 10));
  h.remove(id1);
  const id2 = h.insert(1, S(0, 0, 10, 10));
  assert.notEqual(id1, id2);
});

test("clear: 전체 초기화", () => {
  const h = new SpatialHash(50);
  h.insert(1, S(10, 10, 40, 40));
  h.insert(2, S(60, 60, 90, 90));
  h.clear();
  assert.equal(h.query(S(20, 20, 30, 30)).length, 0);
  assert.equal(h.bucketCount(), 0);
});
