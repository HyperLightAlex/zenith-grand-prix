import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-500-italic.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import './ui/styles.css';
import { ROLE, type Role } from '../sim/index';
import { NullAudio, type AudioEngine } from './audio/audio';
import { Game } from './game/game';
import { useOldSwift } from './render/mech/frames';
import { preloadSunhawks } from './render/mech/sunhawkAsset';
import { preloadRoster } from './render/mech/rosterAsset';
import { setRosterModel } from './render/mech/rosterSelection';
import { isSunhawkModel, setSunhawkModel, setSunhawkPanels } from './render/mech/sunhawkSelection';

// Dev shortcuts, all optional:
//   ?auto=FW|MF|DF  jump straight into a race     &demo=1   computer flies your mech
//   &skip=95        start that many seconds in    &seed=7   repeatable race
//   &team=1         fly for Vanta                 &rivals=0..2 (their skill)
//   &rival=2        race against Mirage          &oldswift=1 Solstice's first Swift design
//   &mute=1         no sound                      ?debug=mechs  model viewer
//   &match=0..4     match format                  &tune=1   tuning panel open
//   &track=canyon   circuit: meridian, canyon or helios
//   &sunhawk=current|updated|game   model comparison; B cycles without restarting
//   &sunhawkPanels=1              projected panel lines on the imported armor
const q = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  // Approved defaults are independent of old art-review preferences.
  // Comparisons remain opt-in URL tools, not player settings.
  const model = q.get('sunhawk');
  if (isSunhawkModel(model)) setSunhawkModel(model);
  const roster = q.get('roster');
  if (roster === 'updated' || roster === 'current') setRosterModel(roster);
  setSunhawkPanels(q.get('sunhawkPanels') === '1');
  const loading = document.createElement('div');
  loading.className = 'model-loading';
  loading.textContent = 'Loading mech models…';
  document.getElementById('app')!.append(loading);
  try { await Promise.all([preloadSunhawks(),preloadRoster()]); }
  catch (error) {
    console.error('Mech model loading failed',error);
    loading.textContent = 'The mech models could not load. ';
    const retry = document.createElement('button');
    retry.textContent = 'Retry'; retry.onclick = () => location.reload();
    loading.append(retry);
    return;
  }
  loading.remove();
  if (q.has('oldswift')) useOldSwift(true);
  if (q.get('debug') === 'mechs') {
    const { runMechDebug } = await import('./debugMechs');
    runMechDebug();
    return;
  }
  // The trackside boards and number decals draw text to canvases, so the
  // font has to be ready first.
  try {
    await Promise.all([document.fonts.load('italic 800 40px "Barlow Condensed"'), document.fonts.load('italic 700 20px "Barlow Condensed"')]);
  } catch {
    /* fall back to system fonts */
  }
  const canvas = document.createElement('canvas');
  canvas.id = 'stage';
  const ui = document.getElementById('app')!;
  document.body.prepend(canvas);

  let audio: AudioEngine = new NullAudio();
  if (!q.has('mute')) {
    try {
      const { SynthAudio } = await import('./audio/synth');
      audio = new SynthAudio();
    } catch (err) {
      console.warn('Audio unavailable', err);
    }
  }
  const roles: Record<string, Role> = { FW: ROLE.FW, MF: ROLE.MF, DF: ROLE.DF };
  const auto = q.get('auto')?.toUpperCase();
  const game = new Game(canvas, ui, {
    auto: auto && auto in roles ? roles[auto] : undefined,
    demo: q.has('demo'),
    skip: q.has('skip') ? Number(q.get('skip')) : undefined,
    seed: q.has('seed') ? Number(q.get('seed')) : undefined,
    team: q.has('team') ? Number(q.get('team')) : undefined,
    rival: q.has('rival') ? Number(q.get('rival')) : undefined,
    rivals: q.has('rivals') ? Number(q.get('rivals')) : undefined,
    match: q.has('match') ? Number(q.get('match')) : undefined,
    tune: q.has('tune'),
    track: q.get('track') ?? undefined,
    audio,
  });
  (window as unknown as { game: Game }).game = game;
}

boot();
