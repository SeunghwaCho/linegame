import type { Point } from "../geometry/types.ts";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

/**
 * 가벼운 파티클 시스템. 클리어 이펙트 등 한 번 발사 후 자연 소멸.
 */
export class Effects {
  private particles: Particle[] = [];

  burst(origin: Point, color: string, count = 24, speed = 80): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const s = speed * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        color,
        radius: 3 + Math.random() * 3,
      });
    }
  }

  clearBurst(points: ReadonlyArray<Point>, colors: ReadonlyArray<string>): void {
    for (let i = 0; i < points.length; i++) {
      this.burst(points[i]!, colors[i % colors.length]!, 18, 100);
    }
  }

  update(dtSec: number): void {
    if (this.particles.length === 0) return;
    const next: Particle[] = [];
    const drag = 0.85;
    const gravity = 60;
    for (const p of this.particles) {
      p.life += dtSec;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= Math.pow(drag, dtSec * 60);
      p.vy = p.vy * Math.pow(drag, dtSec * 60) + gravity * dtSec;
      next.push(p);
    }
    this.particles = next;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  isActive(): boolean {
    return this.particles.length > 0;
  }
}
