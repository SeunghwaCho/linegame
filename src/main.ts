import { parseLevelPack } from "./level/loader.ts";
import { Sound } from "./audio/sound.ts";
import { Persistence } from "./storage/persistence.ts";
import { App } from "./scene/app.ts";
import { MenuScene } from "./scene/menuScene.ts";
import { GameScene } from "./scene/gameScene.ts";
import { ResultScene } from "./scene/resultScene.ts";
import { sceneRegistry } from "./scene/registry.ts";
import type { SceneContext } from "./scene/context.ts";
import { pickVariantParams, resolveLevel, makeRng } from "./level/variant.ts";
import type { LevelTemplate } from "./level/types.ts";

function buildGameScene(
  ctx: SceneContext,
  template: LevelTemplate,
  opts?: { reuseVariant?: boolean },
): GameScene {
  let params = ctx.persistence.getVariantParams(template.id);
  if (!opts?.reuseVariant || !params) {
    const seed = (Date.now() ^ (template.id * 9931)) >>> 0;
    params = pickVariantParams(template, makeRng(seed));
    ctx.persistence.setVariantParams(template.id, params);
  }
  const level = resolveLevel(template, params);
  return new GameScene(ctx, level, template);
}

// 순환 import 방지용 레지스트리 등록 (모듈 로드 직후 1회).
sceneRegistry.menu = (ctx) => new MenuScene(ctx);
sceneRegistry.game = (ctx, template, opts) => buildGameScene(ctx, template, opts);
sceneRegistry.result = (ctx, args) => new ResultScene(ctx, args);

async function main(): Promise<void> {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("#game-canvas not found");

  const res = await fetch("./data/levels.json");
  if (!res.ok) throw new Error(`failed to load levels: ${res.status}`);
  const pack = parseLevelPack(await res.text());

  const sound = new Sound();
  const persistence = new Persistence();
  await persistence.init();
  await persistence.loadAllVariantParams();

  // 뮤트 옵션 복원
  const muted = (await persistence.getMuted()) ?? false;
  sound.setMuted(muted);

  const app = new App(canvas);
  const ctx: SceneContext = { app, pack, persistence, sound };

  // 마지막으로 열었던 레벨이 있으면 바로 그 게임으로 — 변형 유지.
  const lastLevelId = await persistence.getLastLevelId();
  if (lastLevelId !== undefined) {
    const tmpl = pack.levels.find((l) => l.id === lastLevelId);
    if (tmpl) {
      app.setScene(buildGameScene(ctx, tmpl, { reuseVariant: true }));
      app.start();
      return;
    }
  }
  app.setScene(new MenuScene(ctx));
  app.start();
}

main().catch((err: unknown) => {
  console.error(err);
  // 부팅 실패는 화면에 alert로 알림 (canvas UI 부팅 전이라 native 사용)
  const message = err instanceof Error ? err.message : String(err);
  document.body.innerHTML = `<pre style="padding:16px;font:14px monospace;color:#a00;">부팅 실패: ${message}</pre>`;
});
