import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "../src/game/board.ts";
import type { Dot } from "../src/game/types.ts";

const D = (id: number, c: number, x: number, y: number): Dot => ({
  id,
  colorId: c,
  center: { x, y },
  radius: 18,
});

test("findFinalizedPathAt: 라인 위 점은 매치, 떨어진 점은 null", () => {
  const dots = [D(1, 0, 0, 0), D(2, 0, 100, 0)];
  const board = new Board(dots);
  board.startPath(1);
  board.updatePath({ x: 100, y: 0 });
  // 라인 (0,0)-(100,0) 위
  assert.equal(board.findFinalizedPathAt({ x: 50, y: 0 }, 5)?.colorId, 0);
  // 라인 위에 너무 멀리
  assert.equal(board.findFinalizedPathAt({ x: 50, y: 50 }, 5), null);
  // 허용오차 안
  assert.equal(board.findFinalizedPathAt({ x: 50, y: 4 }, 5)?.colorId, 0);
});

test("removeFinalizedPath: 색별 path 제거 + 다시 시작 가능", () => {
  const dots = [
    D(1, 0, 0, 0),
    D(2, 0, 100, 0),
    D(3, 1, 0, 50),
    D(4, 1, 100, 50),
  ];
  const board = new Board(dots);
  board.startPath(1);
  board.updatePath({ x: 100, y: 0 });
  board.startPath(3);
  board.updatePath({ x: 100, y: 50 });
  assert.equal(board.getFinalizedPaths().size, 2);
  assert.equal(board.removeFinalizedPath(0), true);
  assert.equal(board.getFinalizedPaths().size, 1);
  // 제거된 후 같은 색을 다시 그릴 수 있음
  assert.notEqual(board.startPath(1), null);
});

test("removeFinalizedPath: 존재하지 않는 색은 false", () => {
  const dots = [D(1, 0, 0, 0), D(2, 0, 100, 0)];
  const board = new Board(dots);
  assert.equal(board.removeFinalizedPath(99), false);
});

test("removeFinalizedPath 후 SpatialHash에서도 사라짐 (다른 path가 그 자리 통과 가능)", () => {
  const dots = [
    D(1, 0, 0, 0),
    D(2, 0, 100, 0),
    D(3, 1, 0, 50),
    D(4, 1, 100, 50),
  ];
  const board = new Board(dots);
  // 색 0: 가운데 가로선
  board.startPath(1);
  board.updatePath({ x: 100, y: 0 });

  // 색 1 시작
  board.startPath(3);
  // (50, -50)으로 가면 색 0 라인을 통과 → reject
  let r = board.updatePath({ x: 50, y: -50 });
  assert.equal(r.kind, "rejected");

  // 색 0 path 제거
  board.removeFinalizedPath(0);

  // 다시 시도 — 이제 색 1이 그 영역으로 갈 수 있어야 함
  board.startPath(3);
  r = board.updatePath({ x: 50, y: -50 });
  assert.equal(r.kind, "extended");
});
