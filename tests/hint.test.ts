import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "../src/game/board.ts";
import { nextHint } from "../src/game/hint.ts";
import type { Dot } from "../src/game/types.ts";

const D = (id: number, c: number, x: number, y: number): Dot => ({
  id,
  colorId: c,
  center: { x, y },
  radius: 18,
});

test("미연결 색 중 가장 가까운 쌍을 반환", () => {
  const dots = [
    D(1, 0, 0, 0),
    D(2, 0, 300, 300), // 색 0: 거리 ~424
    D(3, 1, 0, 50),
    D(4, 1, 50, 50), // 색 1: 거리 50
  ];
  const board = new Board(dots);
  const h = nextHint(board);
  assert.notEqual(h, null);
  assert.equal(h?.colorId, 1);
});

test("이미 연결된 색은 제외", () => {
  const dots = [
    D(1, 0, 0, 0),
    D(2, 0, 100, 0),
    D(3, 1, 0, 50),
    D(4, 1, 100, 50),
  ];
  const board = new Board(dots);
  board.startPath(1);
  board.updatePath({ x: 100, y: 0 });
  const h = nextHint(board);
  assert.equal(h?.colorId, 1);
});

test("모든 색 연결되면 null", () => {
  const dots = [D(1, 0, 0, 0), D(2, 0, 100, 0)];
  const board = new Board(dots);
  board.startPath(1);
  board.updatePath({ x: 100, y: 0 });
  assert.equal(nextHint(board), null);
});
