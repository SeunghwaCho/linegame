import type { Scene } from "./scene.ts";
import type { Layout, Rect } from "../ui/types.ts";
import { pointInRect } from "../ui/types.ts";
import type { SceneContext } from "./context.ts";
import type { LevelTemplate } from "../level/types.ts";
import { roundRect } from "../ui/button.ts";
import { sceneRegistry } from "./registry.ts";

interface CellRect extends Rect {
  template: LevelTemplate;
  done: boolean;
  stars: number; // 0~3
}

/**
 * 레벨 선택 메뉴.
 * - 100 레벨을 그리드로 (10×10 기본, 화면 비율에 따라 조정).
 * - 클리어한 레벨은 ✓ 표시.
 * - 셀 탭 → GameScene 전환.
 */
export class MenuScene implements Scene {
  private readonly ctx: SceneContext;
  private cells: CellRect[] = [];
  private completed: Set<number> = new Set();
  private bestStars: Map<number, number> = new Map();
  private hoverIdx = -1;
  private pressedIdx = -1;

  constructor(c: SceneContext) {
    this.ctx = c;
  }

  enter(): void {
    void this.ctx.persistence.getCompletedLevels().then((s) => {
      this.completed = s;
    });
    void this.ctx.persistence.getBestStars().then((m) => {
      this.bestStars = m;
    });
  }

  update(_dt: number, layout: Layout): void {
    this.layoutCells(layout);
  }

  private layoutCells(layout: Layout): void {
    const cols = 10;
    const rows = Math.ceil(this.ctx.pack.levels.length / cols);
    const r = layout.boardRect;
    const gap = 6;
    const cellW = (r.w - gap * (cols - 1)) / cols;
    const cellH = (r.h - gap * (rows - 1)) / rows;
    const size = Math.min(cellW, cellH, 64);
    const totalW = size * cols + gap * (cols - 1);
    const totalH = size * rows + gap * (rows - 1);
    const startX = r.x + (r.w - totalW) / 2;
    const startY = r.y + (r.h - totalH) / 2;
    this.cells = [];
    for (let i = 0; i < this.ctx.pack.levels.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lv = this.ctx.pack.levels[i]!;
      this.cells.push({
        x: startX + col * (size + gap),
        y: startY + row * (size + gap),
        w: size,
        h: size,
        template: lv,
        done: this.completed.has(lv.id),
        stars: this.bestStars.get(lv.id) ?? 0,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, layout: Layout): void {
    // 툴바
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layout.width, layout.toolbarH);
    ctx.strokeStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.moveTo(0, layout.toolbarH);
    ctx.lineTo(layout.width, layout.toolbarH);
    ctx.stroke();

    ctx.fillStyle = "#222";
    ctx.font = "600 18px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🧩 선잇기 퍼즐", layout.width / 2, layout.toolbarH / 2);

    // 진행도 (좌측) + 별 합계 (우측)
    ctx.fillStyle = "#666";
    ctx.font = "13px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `${this.completed.size} / ${this.ctx.pack.levels.length}`,
      12,
      layout.toolbarH / 2,
    );
    let totalStars = 0;
    for (const v of this.bestStars.values()) totalStars += v;
    ctx.textAlign = "right";
    ctx.fillStyle = "#f5b400";
    ctx.fillText(
      `★ ${totalStars} / ${this.ctx.pack.levels.length * 3}`,
      layout.width - 12,
      layout.toolbarH / 2,
    );
    ctx.restore();

    // 셀 그리기
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      const pressed = this.pressedIdx === i;
      const hover = this.hoverIdx === i;
      ctx.save();
      const bg = pressed
        ? "#cfd8e3"
        : hover
          ? "#f0f0f0"
          : c.done
            ? "#e8f5e9"
            : "#ffffff";
      ctx.fillStyle = bg;
      ctx.strokeStyle = c.done ? "#7cb342" : "#aab2bd";
      ctx.lineWidth = 1;
      roundRect(ctx, c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#222";
      ctx.font = `${Math.floor(c.w * 0.32)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.template.id), c.x + c.w / 2, c.y + c.h * 0.42);
      if (c.stars > 0) {
        // 셀 하단 별 ★★★ 미니어처
        const starSize = c.w * 0.16;
        const totalW = starSize * 3 + 2 * 2;
        const sx = c.x + (c.w - totalW) / 2;
        const sy = c.y + c.h * 0.7;
        for (let s = 0; s < 3; s++) {
          ctx.fillStyle = s < c.stars ? "#f5b400" : "#cfcfcf";
          ctx.font = `${starSize}px -apple-system, system-ui, sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(s < c.stars ? "★" : "☆", sx + s * (starSize + 2) + starSize / 2, sy);
        }
      } else if (c.done) {
        ctx.fillStyle = "#558b2f";
        ctx.font = `${Math.floor(c.w * 0.22)}px -apple-system, system-ui, sans-serif`;
        ctx.fillText("✓", c.x + c.w - c.w * 0.18, c.y + c.h * 0.22);
      }
      ctx.restore();
    }
  }

  private cellIndexAt(cssX: number, cssY: number): number {
    for (let i = 0; i < this.cells.length; i++) {
      if (pointInRect(cssX, cssY, this.cells[i]!)) return i;
    }
    return -1;
  }

  onDown(cssX: number, cssY: number): void {
    this.pressedIdx = this.cellIndexAt(cssX, cssY);
  }

  onMove(cssX: number, cssY: number): void {
    this.hoverIdx = this.cellIndexAt(cssX, cssY);
    if (this.pressedIdx !== -1 && this.hoverIdx !== this.pressedIdx) {
      this.pressedIdx = -1;
    }
  }

  onUp(cssX: number, cssY: number): void {
    const idx = this.cellIndexAt(cssX, cssY);
    if (idx !== -1 && idx === this.pressedIdx) {
      const tmpl = this.cells[idx]!.template;
      this.ctx.app.setScene(sceneRegistry.game(this.ctx, tmpl));
    }
    this.pressedIdx = -1;
  }
}
