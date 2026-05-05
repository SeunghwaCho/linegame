import type { Rect } from "./types.ts";
import { Button, roundRect } from "./button.ts";

export interface ModalAction {
  label: string;
  onSelect: () => void;
  primary?: boolean;
}

/**
 * Canvas 모달 — 반투명 배경 + 타이틀/메시지 + 1~3개 버튼.
 * 위치는 layout 변경마다 setLayout()으로 갱신.
 */
export class Modal {
  private title: string;
  private message: string;
  private actions: ModalAction[];
  private buttons: Button[] = [];
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  visible = false;

  constructor(title: string, message: string, actions: ModalAction[]) {
    this.title = title;
    this.message = message;
    this.actions = actions;
    for (const a of actions) {
      this.buttons.push(
        new Button({
          bounds: { x: 0, y: 0, w: 0, h: 0 },
          label: a.label,
          onPress: () => {
            this.visible = false;
            a.onSelect();
          },
        }),
      );
    }
  }

  setLayout(canvasW: number, canvasH: number): void {
    const w = Math.min(canvasW * 0.85, 360);
    const h = 200;
    const x = (canvasW - w) / 2;
    const y = (canvasH - h) / 2;
    this.cardRect = { x, y, w, h };
    const btnGap = 8;
    const btnH = 44;
    const totalBtnW = w - 24;
    const each = (totalBtnW - btnGap * (this.actions.length - 1)) / this.actions.length;
    for (let i = 0; i < this.buttons.length; i++) {
      this.buttons[i]!.setBounds({
        x: x + 12 + i * (each + btnGap),
        y: y + h - btnH - 12,
        w: each,
        h: btnH,
      });
    }
  }

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  onDown(px: number, py: number): boolean {
    if (!this.visible) return false;
    for (const b of this.buttons) {
      if (b.onDown(px, py)) return true;
    }
    return true; // modal이 표시 중이면 배경 클릭은 항상 흡수
  }

  onMove(px: number, py: number): void {
    if (!this.visible) return;
    for (const b of this.buttons) b.onMove(px, py);
  }

  onUp(px: number, py: number): boolean {
    if (!this.visible) return false;
    for (const b of this.buttons) {
      if (b.onUp(px, py)) return true;
    }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    if (!this.visible) return;
    ctx.save();
    // 배경 dim
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvasW, canvasH);
    // 카드
    const r = this.cardRect;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#aab2bd";
    ctx.lineWidth = 1;
    roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 14);
    ctx.fill();
    ctx.stroke();
    // 타이틀
    ctx.fillStyle = "#111";
    ctx.font = "600 18px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(this.title, r.x + r.w / 2, r.y + 18);
    // 메시지
    ctx.fillStyle = "#444";
    ctx.font = "14px -apple-system, system-ui, sans-serif";
    ctx.fillText(this.message, r.x + r.w / 2, r.y + 54);
    ctx.restore();

    for (const b of this.buttons) b.draw(ctx);
  }
}
