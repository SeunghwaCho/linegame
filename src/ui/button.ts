import type { Rect } from "./types.ts";
import { pointInRect } from "./types.ts";

export interface ButtonOptions {
  bounds: Rect;
  label: string;
  onPress: () => void;
  /** 비활성 상태 */
  disabled?: boolean;
  /** 토글 켜짐 표시 (예: 뮤트 버튼) */
  active?: boolean;
}

/**
 * Canvas에서 그려지는 버튼.
 * - 좌표는 CSS pixel.
 * - 외부에서 매 프레임 setBounds() 갱신 권장 (폴더 전환 대응).
 */
export class Button {
  bounds: Rect;
  label: string;
  onPress: () => void;
  disabled: boolean;
  active: boolean;
  private hover = false;
  private pressed = false;

  constructor(opts: ButtonOptions) {
    this.bounds = opts.bounds;
    this.label = opts.label;
    this.onPress = opts.onPress;
    this.disabled = opts.disabled ?? false;
    this.active = opts.active ?? false;
  }

  setBounds(r: Rect): void {
    this.bounds = r;
  }

  hit(px: number, py: number): boolean {
    return pointInRect(px, py, this.bounds);
  }

  onDown(px: number, py: number): boolean {
    if (this.disabled || !this.hit(px, py)) return false;
    this.pressed = true;
    return true;
  }

  onMove(px: number, py: number): void {
    this.hover = this.hit(px, py);
    if (!this.hover) this.pressed = false;
  }

  onUp(px: number, py: number): boolean {
    const wasPressed = this.pressed;
    this.pressed = false;
    if (this.disabled) return false;
    if (wasPressed && this.hit(px, py)) {
      this.onPress();
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.bounds;
    ctx.save();
    const bg = this.disabled
      ? "#e8e8e8"
      : this.pressed
        ? "#cfd8e3"
        : this.active
          ? "#dde7f0"
          : this.hover
            ? "#f0f0f0"
            : "#ffffff";
    ctx.fillStyle = bg;
    ctx.strokeStyle = this.disabled ? "#d0d0d0" : "#aab2bd";
    ctx.lineWidth = 1;
    roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.disabled ? "#999" : "#222";
    ctx.font = `${Math.floor(r.h * 0.5)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
