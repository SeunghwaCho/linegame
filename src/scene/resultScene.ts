import type { Scene } from "./scene.ts";
import type { Layout } from "../ui/types.ts";
import type { SceneContext } from "./context.ts";
import type { ResultArgs } from "./registry.ts";
import { Button, roundRect } from "../ui/button.ts";
import { sceneRegistry } from "./registry.ts";

const AUTO_NEXT_DELAY = 5; // 초

/**
 * 클리어 결과 — 별 ★★★ + 시간 + 메뉴/다시/다음 버튼.
 * 다음 레벨이 있고 사용자가 입력하지 않으면 AUTO_NEXT_DELAY 후 자동 진행.
 */
export class ResultScene implements Scene {
  private readonly ctx: SceneContext;
  private readonly args: ResultArgs;
  private readonly btnMenu: Button;
  private readonly btnRetry: Button;
  private readonly btnNext: Button;
  private readonly hasNext: boolean;
  private autoNextRemaining: number;
  private autoNextCancelled = false;

  constructor(c: SceneContext, args: ResultArgs) {
    this.ctx = c;
    this.args = args;
    const idx = c.pack.levels.findIndex((l) => l.id === args.level.id);
    this.hasNext = idx >= 0 && idx < c.pack.levels.length - 1;
    this.autoNextRemaining = this.hasNext ? AUTO_NEXT_DELAY : 0;

    this.btnMenu = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "메뉴",
      onPress: () => this.gotoMenu(),
    });
    this.btnRetry = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "다시",
      onPress: () => this.retry(),
    });
    this.btnNext = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "다음 ▶",
      onPress: () => this.next(),
      disabled: !this.hasNext,
    });
  }

  update(dt: number, layout: Layout): void {
    const cardW = Math.min(layout.width * 0.9, 360);
    const cardH = 280;
    const cardX = (layout.width - cardW) / 2;
    const cardY = (layout.height - cardH) / 2;
    const btnH = 44;
    const btnW = (cardW - 24 - 16) / 3;
    const by = cardY + cardH - btnH - 16;
    this.btnMenu.setBounds({ x: cardX + 12, y: by, w: btnW, h: btnH });
    this.btnRetry.setBounds({ x: cardX + 12 + btnW + 8, y: by, w: btnW, h: btnH });
    this.btnNext.setBounds({
      x: cardX + 12 + (btnW + 8) * 2,
      y: by,
      w: btnW,
      h: btnH,
    });
    this.cardRect = { x: cardX, y: cardY, w: cardW, h: cardH };

    if (this.hasNext && !this.autoNextCancelled && this.autoNextRemaining > 0) {
      this.autoNextRemaining -= dt;
      if (this.autoNextRemaining <= 0) this.next();
    }
  }

  private cardRect = { x: 0, y: 0, w: 0, h: 0 };

  draw(ctx: CanvasRenderingContext2D, layout: Layout): void {
    ctx.save();
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.restore();

    const r = this.cardRect;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#aab2bd";
    ctx.lineWidth = 1;
    roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#222";
    ctx.font = "600 26px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("🎉 클리어!", r.x + r.w / 2, r.y + 22);

    // 별
    const starY = r.y + 70;
    const starSize = 36;
    const starGap = 12;
    const totalW = starSize * 3 + starGap * 2;
    const startX = r.x + (r.w - totalW) / 2;
    for (let i = 0; i < 3; i++) {
      const filled = i < this.args.stars;
      ctx.fillStyle = filled ? "#f5b400" : "#ddd";
      ctx.font = `${starSize}px -apple-system, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(filled ? "★" : "☆", startX + i * (starSize + starGap) + starSize / 2, starY);
    }

    // 메타
    ctx.fillStyle = "#444";
    ctx.font = "15px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.args.level.name, r.x + r.w / 2, r.y + 130);
    ctx.fillStyle = "#777";
    ctx.font = "13px -apple-system, system-ui, sans-serif";
    ctx.fillText(
      `시간 ${formatTime(this.args.elapsedSec)} · 레벨 ${this.args.level.id}`,
      r.x + r.w / 2,
      r.y + 155,
    );

    if (this.hasNext && !this.autoNextCancelled && this.autoNextRemaining > 0) {
      ctx.fillStyle = "#999";
      ctx.font = "12px -apple-system, system-ui, sans-serif";
      ctx.fillText(
        `${Math.ceil(this.autoNextRemaining)}초 후 다음 레벨로 자동 진행 (탭으로 취소)`,
        r.x + r.w / 2,
        r.y + 180,
      );
    }
    ctx.restore();

    this.btnMenu.draw(ctx);
    this.btnRetry.draw(ctx);
    this.btnNext.draw(ctx);
  }

  onDown(cssX: number, cssY: number): void {
    // 카드 외부를 탭하면 auto-next 취소
    if (!pointInRect(cssX, cssY, this.cardRect)) {
      this.autoNextCancelled = true;
    }
    if (this.btnMenu.onDown(cssX, cssY)) return;
    if (this.btnRetry.onDown(cssX, cssY)) return;
    if (this.btnNext.onDown(cssX, cssY)) return;
  }

  onMove(cssX: number, cssY: number): void {
    this.btnMenu.onMove(cssX, cssY);
    this.btnRetry.onMove(cssX, cssY);
    this.btnNext.onMove(cssX, cssY);
  }

  onUp(cssX: number, cssY: number): void {
    if (this.btnMenu.onUp(cssX, cssY)) return;
    if (this.btnRetry.onUp(cssX, cssY)) return;
    if (this.btnNext.onUp(cssX, cssY)) return;
  }

  private gotoMenu(): void {
    this.ctx.app.setScene(sceneRegistry.menu(this.ctx));
  }

  private retry(): void {
    this.ctx.app.setScene(sceneRegistry.game(this.ctx, this.args.level));
  }

  private next(): void {
    if (!this.hasNext) return;
    const idx = this.ctx.pack.levels.findIndex((l) => l.id === this.args.level.id);
    const nextLevel = this.ctx.pack.levels[idx + 1]!;
    this.ctx.app.setScene(sceneRegistry.game(this.ctx, nextLevel));
  }
}

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pointInRect(
  px: number,
  py: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
