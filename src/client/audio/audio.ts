// Sound. The game talks to this interface; the synthesiser behind it lives in
// synth.ts so it can be swapped for sampled audio later without touching
// gameplay code.

import type { LayerMix } from './layers';

export type { LayerMix } from './layers';

export type SfxName =
  | 'ui_move' | 'ui_select' | 'ui_back'
  | 'count_beep' | 'count_go' | 'launch'
  | 'boost' | 'dash' | 'lock' | 'unlock' | 'denied'
  | 'carve_tier' | 'carve_burst'
  | 'swing_light' | 'swing_heavy' | 'hit_light' | 'hit_heavy' | 'block' | 'parry' | 'guard_break'
  | 'tell' | 'tell_dodge' | 'momentum' | 'momentum_hit' | 'ringout'
  | 'shot_carbine' | 'shot_scatter' | 'bullet_hit'
  | 'wall' | 'bump' | 'ko' | 'critical'
  | 'takeoff' | 'land' | 'fall' | 'recover' | 'pad'
  | 'lap' | 'lap_phase' | 'final_lap' | 'finish' | 'win' | 'lose'
  | 'command' | 'comms'
  | 'gate' | 'cells_full' | 'award'
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
  /**
   * Player speed in units per second (about 0..250): 110 and 125 at the
   * limiters of the first two laps, up to 160 flat out on the speed lap,
   * 190 with boost, 210 in Overdrive and for a moment as much as 250.
   */
  speed: number;
  throttle: number;
  /** The afterburner is lit: a boost, or an Overdrive. */
  boosting: boolean;
  /**
   * An Overdrive is running. The afterburner then burns louder, brighter and
   * higher than for a boost. Optional: left out, an Overdrive sounds like a boost.
   */
  surge?: boolean;
  /** Locked on and fighting rather than racing. */
  battle: boolean;
  /** 1 formation, 2 battle, 3 speed. Music intensity follows it. */
  lapPhase: number;
  onStrip: boolean;
  drafting: boolean;
  /** Scraping along a barrier. */
  scraping: boolean;
  /**
   * Carving: how tight it is held (0 for no carve, up to 1), and the tier its
   * charge has reached (0 to 3). Optional: left out, there is no carve.
   */
  carve?: number;
  carveTier?: number;
  /** Armour below a quarter. */
  critical: boolean;
  /**
   * The race is over for the player (finished, or the race has ended). A
   * recorded song goes on to its ending. Optional: left out, it is not.
   */
  finished?: boolean;
}

export interface AudioEngine {
  /** Must be called from a key press, click or button press before anything can sound. */
  unlock(): void;
  setVolumes(master: number, music: number, sfx: number): void;
  /** Turn the continuous layers (engine, wind, afterburner...) up or down, 0..1 each. */
  setLayerMix(mix: Partial<LayerMix>): void;
  update(dt: number, scene: AudioScene): void;
  play(name: SfxName, opts?: SfxOptions): void;
  /**
   * 'menu' is calm, 'race' builds with the lap phase, null fades out.
   * `style` picks the race music: the circuit's theme ('meridian', 'canyon', 'helios').
   */
  setMusic(track: 'menu' | 'race' | null, style?: string): void;
  /**
   * The next race is likely on this circuit (its theme): get its race music
   * ready ahead of time (a recorded song is decoded, which takes a moment).
   * Optional: only an engine with recorded songs has anything to do.
   */
  prepareMusic?(style: string): void;
}

/** Silent stand-in, used until the page has had a user gesture and in tests. */
export class NullAudio implements AudioEngine {
  unlock(): void {}
  setVolumes(): void {}
  setLayerMix(): void {}
  update(): void {}
  play(): void {}
  setMusic(): void {}
}
