// Sound. The game talks to this interface; the synthesiser behind it lives in
// synth.ts so it can be swapped for sampled audio later without touching
// gameplay code.

export type SfxName =
  | 'ui_move' | 'ui_select' | 'ui_back'
  | 'count_beep' | 'count_go' | 'launch'
  | 'boost' | 'dash' | 'lock' | 'unlock' | 'denied'
  | 'swing_light' | 'swing_heavy' | 'hit_light' | 'hit_heavy' | 'block' | 'parry' | 'guard_break'
  | 'shot_carbine' | 'shot_scatter' | 'bullet_hit'
  | 'wall' | 'bump' | 'ko' | 'critical'
  | 'lap' | 'lap_phase' | 'final_lap' | 'finish' | 'win' | 'lose'
  | 'command' | 'comms'
  | 'gate' | 'cells_full'
  | 'overdrive' | 'breakaway' | 'snare_shot' | 'snared' | 'pulse' | 'ram' | 'aegis';

export interface SfxOptions {
  /** 0..1, default 1. */
  volume?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
  /** Playback pitch multiplier, default 1. */
  pitch?: number;
}

/** What the continuous sounds (engine, wind, scraping) follow each frame. */
export interface AudioScene {
  /** True while a race is on screen; engines are silent otherwise. */
  racing: boolean;
  /** Player speed in units per second (about 0..150). */
  speed: number;
  throttle: number;
  boosting: boolean;
  /** Locked on and fighting rather than racing. */
  battle: boolean;
  /** 1 formation, 2 battle, 3 speed. Music intensity follows it. */
  lapPhase: number;
  onStrip: boolean;
  drafting: boolean;
  /** Scraping along a barrier. */
  scraping: boolean;
  /** Armour below a quarter. */
  critical: boolean;
}

export interface AudioEngine {
  /** Must be called from a key press, click or button press before anything can sound. */
  unlock(): void;
  setVolumes(master: number, music: number, sfx: number): void;
  update(dt: number, scene: AudioScene): void;
  play(name: SfxName, opts?: SfxOptions): void;
  /** 'menu' is calm, 'race' builds with the lap phase, null fades out. */
  setMusic(track: 'menu' | 'race' | null): void;
}

/** Silent stand-in, used until the page has had a user gesture and in tests. */
export class NullAudio implements AudioEngine {
  unlock(): void {}
  setVolumes(): void {}
  update(): void {}
  play(): void {}
  setMusic(): void {}
}
