/** All sound is synthesised with the Web Audio API: no audio files, nothing to license. */
export type Sfx =
  | "pick"
  | "light"
  | "pulse"
  | "hit"
  | "jump"
  | "dash"
  | "win"
  | "lose"
  | "spawn"
  | "tick"
  | "wind"
  | "steal"
  | "charm"
  | "ui";

const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private timer: number | null = null;
  private beat = 0;
  volume = 0.7;

  /** Must be called from a user gesture the first time. */
  ensure(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.35;
      this.music.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, bus?: GainNode): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, from: number, to: number, delay = 0): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
  }

  play(name: Sfx): void {
    if (!this.ctx || this.volume <= 0) return;
    switch (name) {
      case "pick": this.tone(880, 0.09, "sine", 0.25, 0, 1320); break;
      case "light": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "sine", 0.3, i * 0.09)); break;
      case "pulse": this.noise(0.35, 0.5, 400, 3000); this.tone(300, 0.3, "sine", 0.3, 0, 900); break;
      case "hit": this.noise(0.25, 0.6, 1200, 200); this.tone(160, 0.3, "square", 0.3, 0, 55); break;
      case "jump": this.tone(300, 0.14, "triangle", 0.3, 0, 640); break;
      case "dash": this.noise(0.18, 0.35, 2500, 700); break;
      case "win": [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.3, i * 0.13)); break;
      case "lose": this.tone(420, 0.9, "sawtooth", 0.2, 0, 90); break;
      case "spawn": this.tone(110, 0.5, "sine", 0.35, 0, 70); this.tone(165, 0.4, "triangle", 0.15, 0.05, 90); break;
      case "tick": this.tone(1000, 0.06, "square", 0.15); break;
      case "wind": this.noise(1.6, 0.35, 300, 1800); break;
      case "steal": this.tone(620, 0.25, "triangle", 0.3, 0, 180); break;
      case "charm": this.tone(700, 0.25, "sine", 0.3, 0, 1400); this.tone(1050, 0.25, "sine", 0.2, 0.08, 2100); break;
      case "ui": this.tone(660, 0.07, "sine", 0.2); break;
    }
  }

  startMusic(night: number): void {
    this.ensure();
    this.stopMusic();
    if (!this.ctx) return;
    const ms = night === 3 ? 520 : night === 2 ? 600 : 680;
    this.beat = 0;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      if (this.beat % 8 === 0) {
        // slow pad chord
        const root = PENTA[(this.beat / 8) % 3 === 0 ? 0 : (this.beat / 8) % 3 === 1 ? 2 : 3] / 2;
        this.tone(root, 5, "sine", 0.18, 0, undefined, this.music);
        this.tone(root * 1.5, 5, "triangle", 0.1, 0, undefined, this.music);
      }
      if (Math.random() < 0.55) {
        const f = PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.3 ? 2 : 1);
        this.tone(f, 1.4, "sine", 0.12, 0, undefined, this.music);
      }
      this.beat++;
    }, ms);
  }

  stopMusic(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
