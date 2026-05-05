import type { Board } from "../game/board.ts";
import { colorOf, colorOfWithAlpha } from "./colors.ts";

export interface RendererOptions {
  /** 보드 좌표계의 폭/높이 */
  worldWidth: number;
  worldHeight: number;
  lineWidth?: number;
  /** 있으면 원형 영역(테두리 + 외부 음영)을 그린다 */
  circle?: { cx: number; cy: number; r: number };
}

/**
 * Board 내용물(배경/dot/path)을 현재 ctx의 변환 안에서 그린다.
 * App + Scene이 ctx의 translate/scale을 미리 설정한 상태로 호출.
 *
 * externalScale: 화면 픽셀 1px 을 보드 좌표 몇 단위로 매핑하는지의 역수.
 *   stroke width를 화면 기준 1px 로 만들고 싶을 때 1/externalScale 사용.
 */
export class Renderer {
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly lineWidth: number;
  private readonly circle: { cx: number; cy: number; r: number } | null;
  private externalScale = 1;

  constructor(opts: RendererOptions) {
    this.worldWidth = opts.worldWidth;
    this.worldHeight = opts.worldHeight;
    this.lineWidth = opts.lineWidth ?? 8;
    this.circle = opts.circle ?? null;
  }

  setExternalScale(s: number): void {
    this.externalScale = s;
  }

  draw(ctx: CanvasRenderingContext2D, board: Board): void {
    ctx.save();
    // 보드 배경
    if (this.circle) {
      // 원 밖은 비활성 음영, 안은 흰색
      ctx.fillStyle = "#f1f3f5";
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
      ctx.beginPath();
      ctx.arc(this.circle.cx, this.circle.cy, this.circle.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#9aa3ad";
      ctx.lineWidth = 2 / this.externalScale;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 1 / this.externalScale;
      ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);
    }

    for (const fp of board.getFinalizedPaths().values()) {
      this.drawPolyline(
        ctx,
        fp.segments.map((s) => s.a).concat([fp.segments[fp.segments.length - 1]!.b]),
        colorOf(fp.colorId),
        this.lineWidth,
        1,
      );
    }

    const cur = board.getCurrentBuilder();
    if (cur) {
      const segs = cur.getSegments();
      if (segs.length > 0) {
        const pts = segs.map((s) => s.a).concat([segs[segs.length - 1]!.b]);
        this.drawPolyline(ctx, pts, colorOf(cur.getColorId()), this.lineWidth, 0.85);
      }
    }

    for (const d of board.getDots()) {
      ctx.beginPath();
      ctx.arc(d.center.x, d.center.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(d.colorId);
      ctx.fill();
      ctx.lineWidth = 2 / this.externalScale;
      ctx.strokeStyle = colorOfWithAlpha(d.colorId, 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPolyline(
    ctx: CanvasRenderingContext2D,
    points: ReadonlyArray<{ x: number; y: number }>,
    color: string,
    width: number,
    alpha: number,
  ): void {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
