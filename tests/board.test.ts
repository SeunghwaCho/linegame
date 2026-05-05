import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "../src/game/board.ts";
import type { Dot } from "../src/game/types.ts";
import type { Point } from "../src/geometry/types.ts";

const P = (x: number, y: number): Point => ({ x, y });
const D = (id: number, c: number, x: number, y: number): Dot => ({
  id,
  colorId: c,
  center: P(x, y),
  radius: 18,
});

const dots2c = [D(1, 0, 0, 0), D(2, 0, 100, 0), D(3, 1, 0, 50), D(4, 1, 100, 50)];

test("초기 상태: 클리어 아님, 진행중 path 없음", () => {
  const board = new Board(dots2c);
  assert.equal(board.isCleared(), false);
  assert.equal(board.getCurrentBuilder(), null);
  assert.equal(board.getFinalizedPaths().size, 0);
});

test("startPath: 존재하지 않는 dotId면 null", () => {
  const board = new Board(dots2c);
  assert.equal(board.startPath(999), null);
});

test("startPath + updatePath + finalize → finalizedPaths 등록", () => {
  const board = new Board(dots2c);
  const ok = board.startPath(1);
  assert.notEqual(ok, null);
  board.updatePath(P(50, 0));
  const r = board.updatePath(P(100, 0)); // dot 2에 닿음
  assert.equal(r.kind, "finalized");
  assert.equal(board.getCurrentBuilder(), null);
  assert.equal(board.getFinalizedPaths().size, 1);
  assert.equal(board.getFinalizedPaths().get(0)?.colorId, 0);
});

test("isCleared: 모든 색이 연결되면 true", () => {
  const board = new Board(dots2c);
  // 색 0: dot1 → dot2
  board.startPath(1);
  board.updatePath(P(100, 0));
  assert.equal(board.isCleared(), false);
  // 색 1: dot3 → dot4
  board.startPath(3);
  board.updatePath(P(100, 50));
  assert.equal(board.isCleared(), true);
});

test("같은 색 dot에서 다시 시작하면 기존 finalized path 제거", () => {
  const board = new Board(dots2c);
  board.startPath(1);
  board.updatePath(P(100, 0));
  assert.equal(board.getFinalizedPaths().size, 1);

  // 같은 색 다른 dot에서 다시 시작
  board.startPath(2);
  assert.equal(board.getFinalizedPaths().size, 0);
  assert.notEqual(board.getCurrentBuilder(), null);
});

test("진행중 path 위에 다른 dot에서 startPath하면 진행중인 것 cancel", () => {
  const board = new Board(dots2c);
  board.startPath(1);
  board.updatePath(P(50, 0));
  const builder1 = board.getCurrentBuilder();
  assert.notEqual(builder1, null);

  board.startPath(3); // 다른 색 시작
  // 이전 builder는 cancel, 새 builder 시작
  assert.notEqual(board.getCurrentBuilder(), builder1);
  assert.equal(board.getCurrentBuilder()?.getSegmentCount(), 0);
});

test("endPath: finalize 안되면 진행중 path는 cancel (남지 않음)", () => {
  const board = new Board(dots2c);
  board.startPath(1);
  board.updatePath(P(50, 0));
  board.endPath();
  assert.equal(board.getCurrentBuilder(), null);
  assert.equal(board.getFinalizedPaths().size, 0);
});

test("새 path가 finalized path와 교차하지 못함", () => {
  // 색 0: 가운데 가로선 → finalize
  // 색 1: dot3 → dot4 직선이 색 0 라인을 가로질러야 함
  const board = new Board(dots2c);
  board.startPath(1);
  board.updatePath(P(100, 0)); // 가로선 (0,0)-(100,0) — dot2에 도달
  assert.equal(board.getFinalizedPaths().size, 1);

  board.startPath(3); // 색 1 시작 — (0, 50)
  // (50, -50) 으로 가면 색 0 라인 통과? 색 0 라인은 y=0 위. (0,50)→(50,-50)은 y=0 통과.
  const r = board.updatePath(P(50, -50));
  assert.equal(r.kind, "rejected");
});

test("reset: 모든 path 제거, 클리어 false", () => {
  const board = new Board(dots2c);
  board.startPath(1);
  board.updatePath(P(100, 0));
  board.startPath(3);
  board.updatePath(P(100, 50));
  assert.equal(board.isCleared(), true);

  board.reset();
  assert.equal(board.isCleared(), false);
  assert.equal(board.getFinalizedPaths().size, 0);
  assert.equal(board.getCurrentBuilder(), null);
});

test("findDotAt: 좌표가 dot 반경 안이면 dot 반환", () => {
  const board = new Board(dots2c);
  const d = board.findDotAt(P(5, 5));
  assert.equal(d?.id, 1);
  const none = board.findDotAt(P(500, 500));
  assert.equal(none, null);
});

test("getDots: 입력한 dots 반환", () => {
  const board = new Board(dots2c);
  assert.equal(board.getDots().length, 4);
});
