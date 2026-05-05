import type { Layout } from "../ui/types.ts";

/**
 * 모든 Scene이 구현하는 인터페이스.
 * - draw(ctx, layout): ctx 변환은 dpr-only (CSS pixel 좌표). save/restore 필수.
 * - 입력 좌표는 CSS pixel.
 */
export interface Scene {
  enter?(): void;
  leave?(): void;
  update?(dt: number, layout: Layout): void;
  draw(ctx: CanvasRenderingContext2D, layout: Layout): void;
  onDown(cssX: number, cssY: number): void;
  onMove(cssX: number, cssY: number): void;
  onUp(cssX: number, cssY: number): void;
}
