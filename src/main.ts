import { parseLevelPack } from "./level/loader.ts";
import { Sound } from "./audio/sound.ts";
import { Persistence } from "./storage/persistence.ts";
import { App } from "./scene/app.ts";
import { MenuScene } from "./scene/menuScene.ts";
import { GameScene } from "./scene/gameScene.ts";
import { ResultScene } from "./scene/resultScene.ts";
import { sceneRegistry } from "./scene/registry.ts";
import type { SceneContext } from "./scene/context.ts";

// 순환 import 방지용 레지스트리 등록 (모듈 로드 직후 1회).
sceneRegistry.menu = (ctx) => new MenuScene(ctx);
sceneRegistry.game = (ctx, lv) => new GameScene(ctx, lv);
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

  // 뮤트 옵션 복원
  const muted = (await persistence.getMuted()) ?? false;
  sound.setMuted(muted);

  const app = new App(canvas);
  const ctx: SceneContext = { app, pack, persistence, sound };

  // 마지막으로 열었던 레벨이 있으면 바로 그 게임으로, 아니면 메뉴.
  const lastLevelId = await persistence.getLastLevelId();
  if (lastLevelId !== undefined) {
    const lv = pack.levels.find((l) => l.id === lastLevelId);
    if (lv) {
      app.setScene(new GameScene(ctx, lv));
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
