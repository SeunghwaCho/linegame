/**
 * Web Audio 기반 사운드 신디시스.
 * 외부 오디오 파일 / base64 의존 없이 OscillatorNode로 효과음 생성.
 * 사용자 상호작용 후에야 AudioContext 가 활성화되는 브라우저 정책에 대응.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private muted = false;

  /** 첫 사용자 입력 시 호출 (브라우저 autoplay policy 우회). */
  ensureCtx(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** path 시작 시 짧은 톡 톤. */
  playStart(): void {
    this.tone({ freq: 440, duration: 0.07, type: "triangle", gain: 0.15 });
  }

  /** path 완성 시 상승 톤 */
  playFinalize(): void {
    this.sequence([
      { freq: 523.25, duration: 0.08, type: "sine", gain: 0.18 },
      { freq: 659.25, duration: 0.08, type: "sine", gain: 0.18, delay: 0.05 },
    ]);
  }

  /** 잘못된 입력 (교차 등) — 짧은 부저 */
  playReject(): void {
    this.tone({ freq: 180, duration: 0.06, type: "square", gain: 0.08 });
  }

  /** 스테이지 클리어 — 장조 아르페지오 */
  playClear(): void {
    const base = 523.25; // C5
    const seq = [1, 5 / 4, 3 / 2, 2].map((r, i) => ({
      freq: base * r,
      duration: 0.18,
      type: "sine" as OscillatorType,
      gain: 0.2,
      delay: 0.08 * i,
    }));
    this.sequence(seq);
  }

  private tone(opts: {
    freq: number;
    duration: number;
    type: OscillatorType;
    gain: number;
    delay?: number;
  }): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.value = opts.freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(opts.gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + opts.duration + 0.02);
  }

  private sequence(
    notes: ReadonlyArray<{
      freq: number;
      duration: number;
      type: OscillatorType;
      gain: number;
      delay?: number;
    }>,
  ): void {
    for (const n of notes) this.tone(n);
  }
}
