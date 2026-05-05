import type {
  Level,
  LevelTemplate,
  LevelPack,
  LevelDot,
  LevelCircle,
  Variant,
} from "./types.ts";
import type { Dot } from "../game/types.ts";

const DEFAULT_DOT_RADIUS = 13;
const CIRCLE_BOUNDARY_TOL = 0.5; // px — float 누적 허용 오차

/** JSON 텍스트를 LevelPack으로 파싱하고 기본 검증을 수행한다. */
export function parseLevelPack(json: string): LevelPack {
  const data = JSON.parse(json) as unknown;
  if (!isObj(data)) throw new Error("level pack must be an object");
  const version = (data as Record<string, unknown>).version;
  const levels = (data as Record<string, unknown>).levels;
  if (typeof version !== "number") throw new Error("version must be number");
  if (!Array.isArray(levels)) throw new Error("levels must be array");

  const parsed: LevelTemplate[] = levels.map((l, i) => validateTemplate(l, i));
  return { version, levels: parsed };
}

function validateTemplate(raw: unknown, idx: number): LevelTemplate {
  if (!isObj(raw)) throw new Error(`level[${idx}] must be object`);
  const r = raw as Record<string, unknown>;
  const id = num(r.id, `level[${idx}].id`);
  const name = str(r.name, `level[${idx}].name`);
  const width = num(r.width, `level[${idx}].width`);
  const height = num(r.height, `level[${idx}].height`);
  if (!Array.isArray(r.variants))
    throw new Error(`level[${idx}].variants must be array`);
  if (r.variants.length === 0)
    throw new Error(`level[${idx}].variants must be non-empty`);

  const variants: Variant[] = r.variants.map((v, vi) =>
    validateVariant(v, idx, vi),
  );
  return { id, name, width, height, variants };
}

function validateVariant(raw: unknown, idx: number, vi: number): Variant {
  if (!isObj(raw))
    throw new Error(`level[${idx}].variants[${vi}] must be object`);
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.dots))
    throw new Error(`level[${idx}].variants[${vi}].dots must be array`);

  const dots: LevelDot[] = r.dots.map((d, di) => {
    if (!isObj(d))
      throw new Error(`level[${idx}].variants[${vi}].dots[${di}] must be object`);
    const dr = d as Record<string, unknown>;
    return {
      id: num(dr.id, `dots[${di}].id`),
      colorId: num(dr.colorId, `dots[${di}].colorId`),
      x: num(dr.x, `dots[${di}].x`),
      y: num(dr.y, `dots[${di}].y`),
      radius:
        dr.radius === undefined ? undefined : num(dr.radius, `dots[${di}].radius`),
    };
  });

  // 같은 색은 정확히 2개여야 한다 (선잇기 룰)
  const byColor = new Map<number, number>();
  for (const d of dots) byColor.set(d.colorId, (byColor.get(d.colorId) ?? 0) + 1);
  for (const [c, n] of byColor) {
    if (n !== 2)
      throw new Error(
        `level[${idx}].variants[${vi}] color ${c} must have exactly 2 dots, got ${n}`,
      );
  }

  // dot id 중복 금지
  const ids = new Set<number>();
  for (const d of dots) {
    if (ids.has(d.id))
      throw new Error(
        `level[${idx}].variants[${vi}] duplicate dot id ${d.id}`,
      );
    ids.add(d.id);
  }

  let circle: LevelCircle | undefined;
  if (r.circle !== undefined) {
    if (!isObj(r.circle))
      throw new Error(`level[${idx}].variants[${vi}].circle must be object`);
    const cr = r.circle as Record<string, unknown>;
    circle = {
      cx: num(cr.cx, `circle.cx`),
      cy: num(cr.cy, `circle.cy`),
      r: num(cr.r, `circle.r`),
    };
    if (circle.r <= 0)
      throw new Error(`level[${idx}].variants[${vi}].circle.r must be > 0`);

    // 색별로 정확히 한 dot은 원 위(거리 ≈ r), 나머지는 원 안(거리 < r)
    const byColor2 = new Map<number, LevelDot[]>();
    for (const d of dots) {
      let arr = byColor2.get(d.colorId);
      if (!arr) {
        arr = [];
        byColor2.set(d.colorId, arr);
      }
      arr.push(d);
    }
    for (const [c, ds] of byColor2) {
      let onBoundary = 0;
      let inside = 0;
      for (const d of ds) {
        const dist = Math.hypot(d.x - circle.cx, d.y - circle.cy);
        if (Math.abs(dist - circle.r) <= CIRCLE_BOUNDARY_TOL) onBoundary++;
        else if (dist < circle.r - CIRCLE_BOUNDARY_TOL) inside++;
        else
          throw new Error(
            `level[${idx}].variants[${vi}] color ${c} dot ${d.id} outside circle (dist=${dist.toFixed(2)}, r=${circle.r})`,
          );
      }
      if (onBoundary !== 1 || inside !== 1)
        throw new Error(
          `level[${idx}].variants[${vi}] color ${c} must have exactly 1 boundary + 1 inside dot (got ${onBoundary} boundary, ${inside} inside)`,
        );
    }
  }

  return { dots, circle };
}

/** Level의 LevelDot[] 를 게임에서 쓰는 Dot[] 로 변환 (반경 기본값 적용). */
export function toGameDots(level: Level): Dot[] {
  return level.dots.map((d) => ({
    id: d.id,
    colorId: d.colorId,
    center: { x: d.x, y: d.y },
    radius: d.radius ?? DEFAULT_DOT_RADIUS,
  }));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(`${label} must be finite number`);
  return v;
}
function str(v: unknown, label: string): string {
  if (typeof v !== "string") throw new Error(`${label} must be string`);
  return v;
}
