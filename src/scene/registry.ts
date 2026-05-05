import type { Scene } from "./scene.ts";
import type { SceneContext } from "./context.ts";
import type { Level } from "../level/types.ts";

/**
 * Scene 팩토리 레지스트리.
 * 모듈 간 순환 의존을 피하기 위해 — main.ts 부팅 시 모든 scene 클래스를 import 한 뒤 등록.
 * 각 scene 코드는 다른 scene 인스턴스를 만들 때 이 레지스트리를 통해 호출.
 */
export interface ResultArgs {
  level: Level;
  stars: 1 | 2 | 3;
  elapsedSec: number;
}

export interface SceneRegistry {
  menu: (ctx: SceneContext) => Scene;
  game: (ctx: SceneContext, level: Level) => Scene;
  result: (ctx: SceneContext, args: ResultArgs) => Scene;
}

const notRegistered = (name: string) => () => {
  throw new Error(`scene factory not registered: ${name}`);
};

export const sceneRegistry: SceneRegistry = {
  menu: notRegistered("menu") as SceneRegistry["menu"],
  game: notRegistered("game") as SceneRegistry["game"],
  result: notRegistered("result") as SceneRegistry["result"],
};
