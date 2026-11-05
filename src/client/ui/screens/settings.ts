// Settings: one screen, five tabs (LB and RB, or Q and E, or a click on the
// tab): Video (the picture, as the old Video screen had it), Sound (the
// volumes), Camera (distance, field of view, shake, speed effects, the look
// turned round, rumble), Controls (every race action on the gamepad and the
// keys, remapped by pressing the new button) and Accessibility (flashes,
// motion, the HUD's size and hints, guard and carve held or toggled).
// Everything applies at once and is kept on this device.

import type { Game } from '../../game/game';
import type { FeelKey } from '../../game/tuning';
import { canFullscreen, isFullscreen, toggleFullscreen } from '../../fullscreen';
import { ACTIONS, HUD_SCALES, KEYS_RESERVED, PAD_RESERVED, actionKeys, bindKey, bindPad, changeSettings, keyName, padButton, padName, resetBinding, settings, type ActionDef } from '../../settings';
import { FRAME_RATES, RESOLUTIONS, video } from '../../video';
import { h, setClass } from '../dom';
import type { Menus, Prompt } from '../menus';
import { BACK, CHANGE, confirmDialog } from './common';

const TABS = [
  { id: 'video', label: 'Video' },
  { id: 'sound', label: 'Sound' },
  { id: 'camera', label: 'Camera' },
  { id: 'controls', label: 'Controls' },
  { id: 'access', label: 'Accessibility' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export interface SettingsData {
  tab?: TabId;
  /** Controls: the column being remapped. */
  col?: 'pad' | 'keys';
}

/** What the highlighted setting does. */
const ABOUT: Record<string, string> = {
  panels: "The panel lines cut into the mechs' armor.",
  crt: "A tube TV: scanlines, the phosphor mask, colour that bleeds along the line, and the tube's dark corners.",
  drawings: "How often the mechs' poses and the effects are redrawn. 12 is animation on twos, as the series was drawn; 30 is smoother. The race itself always runs at full speed.",
  resolution: 'How sharp the 3D picture is drawn. Full is the sharpest, with the mechs\' ink lines at their proper weight. A lower one runs faster on a slow device, but the picture and its lines come out softer and thinner. Automatic lowers it by itself whenever frames run slow.',
  rate: 'How many pictures a second the game draws: as many as the screen shows (120 on a 120 Hz handheld), or at most 60, which on such a screen is half the work, so the device runs cooler and its battery lasts longer. The race itself runs the same either way.',
  aspect: '16:9 fills the screen. 4:3 is the shape of an old TV, with the picture boxed in the middle. On a phone held upright the menus fill the screen either way.',
  full: 'The game on the whole screen, without the browser round it. On a keyboard, F does the same.',
  volMaster: 'Everything together.',
  volMusic: 'The race songs, the menus\' music and the hangar\'s radio.',
  volEffects: 'The race and the menus: hits, boosts, carves, the crowd, and the mech under you.',
  mixEngine: 'The turbine and the rush of the road and the wind, under everything else.',
  camDist: 'How far behind your mech the race camera sits (locked on too).',
  camFov: 'How wide the race camera sees. Wider shows more round you; narrower looks closer.',
  speedFx: 'The blur and the lines that stream past at speed.',
  shake: 'The camera shaking and darting in on big hits, the road rumbling under you, and the view jumping wider as a boost lights.',
  invertX: 'The right stick\'s look round your mech, the other way round.',
  invertY: 'The right stick\'s look up and down (locked on, and the replay camera), the other way round.',
  rumble: 'The gamepad shaking with hits, the road and the barrier.',
  reduceFlashes: 'The white flash on big hits and boosts a quarter as bright, no anime impact frames, and the lightning at Monsoon Ruins dimmed.',
  reduceMotion: 'Turns the screen shake off and the speed effects down (the Camera tab has both), and stills the movement in the menus and the HUD.',
  hudScale: 'How big the race HUD is drawn.',
  hints: 'The buttons along the bottom of a race, and what they do right now.',
  toggleGuard: 'Hold: the guard is up while the button is held. Toggle: one press raises it, the next lowers it.',
  toggleCarve: 'Hold: the carve lasts while the trigger is held. Toggle: a press with the stick over starts it, the next press lets it go (and pays the burst).',
  controls: 'Choose an action and press its new button or key. Whatever was on it takes the old one. Menus keep their own buttons.',
};

const pctLabel = (v: number) => `${Math.round(v * 100)}%`;
const step = (v: number, dir: number, lo: number, hi: number, by: number) => Math.round(Math.min(hi, Math.max(lo, v + dir * by)) * 100) / 100;
/** The nearest of a set of levels to a value. */
const nearest = (levels: readonly number[], v: number) => levels.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(levels[best] - v) ? i : best), 0);
const cycle = <T>(list: readonly T[], i: number, dir: number) => list[(((i + dir) % list.length) + list.length) % list.length];

const LEVELS3 = ['Off', 'Low', 'Full'] as const;
const DISTANCES = [0.85, 1, 1.15, 1.3];
const DISTANCE_NAMES = ['Near', 'Normal', 'Far', 'Farthest'];
const FOVS = [56, 60, 64, 68, 72, 76, 80];

export function registerSettings(m: Menus, g: Game): void {
  const about = h('div.match-blurb');
  const say = (key: string) => (about.textContent = ABOUT[key] ?? ABOUT.controls);
  const feel = (k: FeelKey) => g.feelValue(k);
  const set = (changes: Partial<Record<FeelKey, number>>) => {
    for (const [k, v] of Object.entries(changes)) g.setFeel(k as FeelKey, v as number);
    m.refresh();
  };
  const onOff = (v: boolean) => (v ? 'On' : 'Off');

  function videoTab(list: HTMLElement): void {
    m.choice(list, 'Armor panel lines', onOff(video.panels), () => g.setVideo({ panels: !video.panels }), { key: 'panels' });
    m.choice(list, 'CRT screen', onOff(video.crt), () => g.setVideo({ crt: !video.crt }), { key: 'crt' });
    const steps = g.drawingsPerSecond;
    m.choice(list, 'Animation', `${steps} drawings a second`, () => g.setDrawings(steps === 30 ? 12 : 30), { key: 'drawings', locked: g.lookOn() ? null : 'The plain look always animates smoothly' });
    const res = RESOLUTIONS.findIndex((r) => r.id === video.resolution);
    m.choice(list, 'Resolution', RESOLUTIONS[res]?.label ?? 'Full', (dir) => g.setVideo({ resolution: cycle(RESOLUTIONS, res, dir < 0 ? -1 : 1).id }), { key: 'resolution' });
    const rate = FRAME_RATES.findIndex((r) => r.id === video.frameRate);
    m.choice(list, 'Frame rate', FRAME_RATES[rate]?.label ?? "The screen's", (dir) => g.setVideo({ frameRate: cycle(FRAME_RATES, rate, dir < 0 ? -1 : 1).id }), { key: 'rate' });
    m.choice(list, 'Screen shape', video.aspect === 'classic' ? '4:3' : '16:9', () => g.setVideo({ aspect: video.aspect === 'classic' ? 'wide' : 'classic' }), { key: 'aspect' });
    if (canFullscreen()) m.choice(list, 'Full screen', isFullscreen() ? 'On' : 'Off', () => void toggleFullscreen().then(() => m.refresh()), { key: 'full' });
  }

  function soundTab(list: HTMLElement): void {
    for (const [key, label] of [['volMaster', 'Master volume'], ['volMusic', 'Music'], ['volEffects', 'Effects']] as const) {
      m.choice(list, label, pctLabel(feel(key)), (dir) => set({ [key]: step(feel(key), dir, 0, 1, 0.1) }), { key });
    }
    // The engine and the road and wind together: the bed under everything.
    m.choice(list, 'Engine and wind', pctLabel(feel('mixEngine')), (dir) => {
      const v = step(feel('mixEngine'), dir, 0, 1, 0.1);
      set({ mixEngine: v, mixWind: v });
    }, { key: 'mixEngine' });
  }

  function cameraTab(list: HTMLElement): void {
    const dist = nearest(DISTANCES, feel('camDist') / 13);
    m.choice(list, 'Distance', DISTANCE_NAMES[dist], (dir) => {
      const f = DISTANCES[Math.max(0, Math.min(DISTANCES.length - 1, dist + dir))];
      set({ camDist: 13 * f, camLockDist: 12.5 * f, camHeight: 8.4 * f, camLockHeight: 8.2 * f });
    }, { key: 'camDist' });
    const fov = nearest(FOVS, feel('camFov'));
    m.choice(list, 'Field of view', `${FOVS[fov]}°`, (dir) => set({ camFov: FOVS[Math.max(0, Math.min(FOVS.length - 1, fov + dir))] }), { key: 'camFov' });
    const fx = nearest([0, 0.5, 1], feel('speedLines'));
    m.choice(list, 'Speed effects', LEVELS3[fx], (dir) => {
      const v = [0, 0.5, 1][Math.max(0, Math.min(2, fx + dir))];
      set({ speedBlur: v, speedLines: v });
    }, { key: 'speedFx' });
    const sh = nearest([0, 0.5, 1], feel('camShake'));
    m.choice(list, 'Screen shake', LEVELS3[sh], (dir) => {
      const v = [0, 0.5, 1][Math.max(0, Math.min(2, sh + dir))];
      set({ camShake: v, camPunch: v, camRumble: v, camLurch: 7 * v });
    }, { key: 'shake' });
    m.choice(list, 'Look left and right', settings.invertX ? 'Inverted' : 'Normal', () => changeSettings({ invertX: !settings.invertX }), { key: 'invertX' });
    m.choice(list, 'Look up and down', settings.invertY ? 'Inverted' : 'Normal', () => changeSettings({ invertY: !settings.invertY }), { key: 'invertY' });
    const ru = nearest([0, 0.5, 1], feel('rumble'));
    m.choice(list, 'Gamepad rumble', LEVELS3[ru], (dir) => set({ rumble: [0, 0.5, 1][Math.max(0, Math.min(2, ru + dir))] }), { key: 'rumble' });
  }

  function accessTab(list: HTMLElement): void {
    m.choice(list, 'Reduce flashes', onOff(settings.reduceFlashes), () => changeSettings({ reduceFlashes: !settings.reduceFlashes }), { key: 'reduceFlashes' });
    m.choice(list, 'Reduce motion', onOff(settings.reduceMotion), () => {
      const on = !settings.reduceMotion;
      changeSettings({ reduceMotion: on });
      // On: shake off and the speed effects down (the Camera tab can put them back).
      if (on) set({ camShake: 0, camPunch: 0, camRumble: 0, camLurch: 0, speedBlur: 0.5, speedLines: 0.5 });
    }, { key: 'reduceMotion' });
    const hs = HUD_SCALES.indexOf(settings.hudScale as (typeof HUD_SCALES)[number]);
    m.choice(list, 'HUD size', pctLabel(settings.hudScale), (dir) => changeSettings({ hudScale: HUD_SCALES[Math.max(0, Math.min(HUD_SCALES.length - 1, (hs < 0 ? 1 : hs) + dir))] }), { key: 'hudScale' });
    m.choice(list, 'Button hints in races', onOff(settings.hints), () => changeSettings({ hints: !settings.hints }), { key: 'hints' });
    m.choice(list, 'Guard', settings.toggleGuard ? 'Toggle' : 'Hold', () => changeSettings({ toggleGuard: !settings.toggleGuard }), { key: 'toggleGuard' });
    m.choice(list, 'Carve', settings.toggleCarve ? 'Toggle' : 'Hold', () => changeSettings({ toggleCarve: !settings.toggleCarve }), { key: 'toggleCarve' });
  }

  function controlsTab(list: HTMLElement, d: SettingsData): void {
    if (m.device === 'touch') {
      list.append(h('p.note', 'The touch controls are laid out for the screen and are not remapped. With a gamepad or a keyboard in hand, this tab remaps them.'));
      return;
    }
    const col = d.col ?? (m.device === 'pad' ? 'pad' : 'keys');
    list.append(h('div.bind.head', h('span', 'Action'), h('span' + (col === 'pad' ? '.on' : ''), 'Gamepad'), h('span' + (col === 'keys' ? '.on' : ''), 'Keyboard')));
    for (const a of ACTIONS) {
      const pad = padButton(a.id);
      const padCell = h('span.cell' + (col === 'pad' ? '.on' : '') + (pad === null ? '.fixed' : ''), pad === null ? (a.padFixed ?? '') : padName(pad));
      const keyCell = h('span.cell' + (col === 'keys' ? '.on' : ''), actionKeys(a.id).map(keyName).join(', '));
      const el = h('div.item.bind', h('span', a.label), padCell, keyCell);
      m.addItem(
        list,
        el,
        () => rebind(a, col, d),
        () => {
          d.col = col === 'pad' ? 'keys' : 'pad';
          m.refresh();
        },
        { key: `bind-${a.id}`, locked: col === 'pad' && pad === null ? `${a.padFixed} on the gamepad, as it comes` : null },
      );
    }
  }

  /** Waiting for the new button: an overlay, and the next press is it. */
  function rebind(a: ActionDef, col: 'pad' | 'keys', d: SettingsData): void {
    if (col === 'pad' && a.pad === null) return;
    const card = h('div.capture', h('b', a.label), h('p', col === 'pad' ? 'Press the gamepad button for it.' : 'Press the key for it.'), h('small', col === 'pad' ? 'Start to leave it as it is' : 'Esc to leave it as it is'));
    m.root.append(card);
    g.input.capture((c) => {
      card.remove();
      if ('key' in c) {
        if (col !== 'keys') m.toast('That was a key: press a gamepad button, or switch to the Keyboard column');
        else if (KEYS_RESERVED.has(c.key)) m.toast(`${keyName(c.key)} is kept for pausing, the team plays and the like: choose another key`);
        else bindKey(a.id, c.key);
      } else if ('pad' in c) {
        if (col !== 'pad') m.toast('That was a gamepad button: press a key, or switch to the Gamepad column');
        else if (PAD_RESERVED.has(c.pad)) m.toast(`${padName(c.pad)} is kept for pausing and the team plays: choose another button`);
        else bindPad(a.id, c.pad);
      }
      d.col = col;
      m.refresh();
    });
  }

  m.register<SettingsData>('settings', {
    render(m, d) {
      const tab: TabId = d?.tab ?? 'video';
      const col = h('div.col.settings');
      const tabs = h('div.tabs', m.key('LB', 'Q'));
      for (const t of TABS) {
        const el = h('span.tab' + (t.id === tab ? '.on' : ''), t.label);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          go(t.id);
        });
        tabs.append(el);
      }
      tabs.append(m.key('RB', 'E'));
      const list = h('div.list');
      if (tab === 'video') videoTab(list);
      else if (tab === 'sound') soundTab(list);
      else if (tab === 'camera') cameraTab(list);
      else if (tab === 'controls') controlsTab(list, d ?? {});
      else accessTab(list);
      setClass(col, 'binds', tab === 'controls');
      col.append(h('div.context', 'Kept on this device'), h('h1', 'Settings'), tabs, list, about);
      say(tab === 'controls' ? 'controls' : '');
      const prompts: Prompt[] =
        tab === 'controls' && m.device !== 'touch'
          ? [{ pad: 'A', keys: 'Enter', label: 'Remap', press: 'confirm' }, { pad: '◀ ▶', keys: '← →', label: 'Gamepad or keyboard' }, { pad: 'X', keys: 'X', label: 'As it comes', press: 'x' }, { pad: 'Y', keys: 'Y', label: 'All as they come', press: 'y' }, BACK]
          : [{ pad: 'LB RB', keys: 'Q E', label: 'Tab' }, CHANGE, BACK];
      m.root.append(h('div.shade'), m.panes(col), m.footer(...prompts));
    },
    selected(_m, key) {
      if (key.startsWith('bind-')) say('controls');
      else say(key);
    },
    press(m, key, d) {
      const tab = d?.tab ?? 'video';
      const at = TABS.findIndex((t) => t.id === tab);
      if (key === 'lb' || key === 'rb') {
        go(TABS[(at + (key === 'rb' ? 1 : TABS.length - 1)) % TABS.length].id);
        return true;
      }
      if (tab === 'controls' && key === 'x') {
        const sel = m.selectedKey;
        if (sel?.startsWith('bind-')) {
          resetBinding(sel.slice(5) as ActionDef['id']);
          m.refresh();
        }
        return true;
      }
      if (tab === 'controls' && key === 'y') {
        confirmDialog(m, 'Every control as it comes?', 'The gamepad and the keyboard both go back to how they came.', 'Reset', () => resetBinding());
        return true;
      }
      return false;
    },
  });

  /** To another tab (the highlight to its first item). */
  function go(tab: TabId): void {
    m.replace<SettingsData>('settings', { tab });
  }
}
