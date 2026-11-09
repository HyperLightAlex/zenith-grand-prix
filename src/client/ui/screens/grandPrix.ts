// Grand Prix: the hub (the team series's Cup, Grand Tour and Season, the
// Sprint series's Sprint Cup and Sprint Tour, and the difficulty, with what
// the highlighted one holds shown beside it), the cup select (the three cups
// side by side, each with its circuits and the medals it has given; the
// Sprint Cups on their own ladder), the round briefing, and the standings
// after a round (the end: the ceremony, screens/ceremony.ts).

import { ROLE, SPRINT_POINTS, TRACKS } from '../../../sim/index';
import {
  CUPS,
  GP_DIFFICULTY,
  TOUR_ID,
  average,
  cupOpen,
  eventName,
  isOver,
  playedRounds,
  roundComplete,
  singleRaces,
  sprintEventGrid,
  sprintFavourite,
  sprintStandings,
  standings,
  tourOpen,
  yourRoundNumber,
  type GpEvent,
  type GpFixture,
  type GpSlot,
} from '../../../gp/grandPrix';
import type { Game } from '../../game/game';
import { UNLOCKS, earned, howTo, sprintUnlock, unlockName } from '../../game/unlocks';
import { LIVERIES, factionName } from '../../render/palette';
import { paintedTrack } from '../../render/painted';
import { h } from '../dom';
import { emblemUrl, medalBadgeUrl } from '../factionArt';
import { TRACK_BLURBS, type Menus } from '../menus';
import { colourCss } from '../sides';
import type { Medal } from '../../../gp/grandPrix';
import { BACK, CHANGE, SELECT, confirmDialog } from './common';
import { customName } from '../../../custom/mechBuild';

export interface GpData {
  slot: GpSlot;
}

export const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
export const MEDAL_NAMES: Record<string, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

export function emblem(f: number): HTMLElement {
  const el = h('i.emb');
  el.style.backgroundImage = `url(${emblemUrl(f)})`;
  return el;
}

export function circuitName(id: string): string {
  return TRACKS.find((t) => t.id === id)?.name ?? id;
}

/** The five-faction table after rounds 0..upTo. */
export function gpTable(ev: GpEvent, upTo: number): HTMLElement {
  const rows = standings(ev, upTo);
  const cup = singleRaces(ev);
  const table = h<'table'>('table.gptable');
  const head = h<'tr'>('tr');
  const cols = cup ? ['', 'Team', 'Races', 'Won', 'Points', 'Average'] : ['', 'Team', 'Played', 'Won', 'Lost', 'Rounds', 'Points'];
  cols.forEach((c, i) => head.append(h<'th'>('th' + (i >= 2 ? '.num' : ''), c)));
  table.append(head);
  rows.forEach((r, i) => {
    const tr = h<'tr'>('tr' + (r.faction === ev.faction ? '.me' : ''));
    const name = h<'td'>('td.team', emblem(r.faction), factionName(LIVERIES[r.faction]));
    const cells = cup
      ? [String(r.races), String(r.won), String(r.points), r.races ? average(r).toFixed(1) : '–']
      : [String(r.played), String(r.won), String(r.lost), `${r.roundsFor}–${r.roundsAgainst}`, String(r.points)];
    tr.append(h<'td'>('td.pos', String(i + 1)), name, ...cells.map((c) => h<'td'>('td.num', c)));
    table.append(tr);
  });
  return table;
}

export function fixtureLine(f: GpFixture, ev: GpEvent): HTMLElement {
  const a = factionName(LIVERIES[f.a]);
  const b = factionName(LIVERIES[f.b]);
  const r = f.result;
  const score = !r ? 'racing…' : singleRaces(ev) ? `${r.points[0]}–${r.points[1]}` : `${r.wins[0]}–${r.wins[1]}`;
  return h('div.fixture' + (f.a === ev.faction ? '.me' : ''), emblem(f.a), h('span', a), h('b', score), h('span', b), emblem(f.b));
}

/** A Sprint event's pilot, by seat (0 you, f + 1 faction f's): their name. */
export function seatName(g: Game, seat: number): string {
  return seat === 0 ? g.pilotName : (LIVERIES[seat - 1]?.pilots[ROLE.FW] ?? '');
}

/** A Sprint event's pilot's mark: their faction's emblem, or the league's in your colour for you. */
export function seatEmblem(g: Game, seat: number): HTMLElement {
  if (seat > 0) return emblem(seat - 1);
  const el = h('i.emb.you');
  el.style.backgroundImage = `url(${emblemUrl(-1)})`;
  el.style.setProperty('--tc', colourCss(g.pilotColour));
  return el;
}

/** Who a Sprint event's pilot races for: their faction, or none (you). */
function seatTeam(seat: number): string {
  return seat === 0 ? 'Independent' : factionName(LIVERIES[seat - 1]);
}

/** A Sprint event's table after rounds 0..upTo: the six, their races, wins, podiums and points (the favourite and the Showdown's rival marked). */
export function sprintTable(g: Game, ev: GpEvent, upTo: number): HTMLElement {
  const rows = sprintStandings(ev, upTo);
  const fav = sprintFavourite(ev);
  const rival = ev.rounds[Math.min(ev.rounds.length - 1, upTo + 1)]?.sprint?.rival;
  const table = h<'table'>('table.gptable.sprint');
  const head = h<'tr'>('tr');
  ['', 'Pilot', 'Races', 'Wins', 'Podiums', 'Points'].forEach((c, i) => head.append(h<'th'>('th' + (i >= 2 ? '.num' : ''), c)));
  table.append(head);
  rows.forEach((r, i) => {
    const tr = h<'tr'>('tr' + (r.seat === 0 ? '.me' : ''));
    const tags = [r.seat === fav ? h('span.tag', 'Favourite') : null, r.seat === rival && upTo < ev.rounds.length - 1 ? h('span.tag.rival', 'Your rival') : null];
    const name = h<'td'>('td.team', seatEmblem(g, r.seat), h('span', seatName(g, r.seat), h('small', seatTeam(r.seat))), ...tags);
    tr.append(h<'td'>('td.pos', String(i + 1)), name, ...[r.races, r.wins, r.podiums, r.points].map((c) => h<'td'>('td.num', String(c))));
    table.append(tr);
  });
  return table;
}

/** A Sprint event's race, its order: each pilot's place and the points it took (the Showdown's doubled). */
function sprintRaceLines(g: Game, ev: GpEvent, index: number): HTMLElement {
  const res = ev.rounds[index]?.sprint?.result;
  const box = h('div.fixtures.sprintrace');
  if (!res) return box;
  const order = res.places
    .map((place, seat) => ({ place, seat }))
    .sort((a, b) => (a.place || 99) - (b.place || 99) || a.seat - b.seat);
  for (const { place, seat } of order) {
    box.append(h('div.fixture.place' + (seat === 0 ? '.me' : ''), h('b', place ? ORD[place - 1] : 'Out'), seatEmblem(g, seat), h('span', seatName(g, seat)), h('b', `+${res.points[seat] ?? 0}`)));
  }
  return box;
}

/** The award: the medal or cup (if any), the headline and a line under it. */
export function awardLines(ev: GpEvent, place: number, medal: string | null): HTMLElement[] {
  let headline: string;
  let line: string;
  if (ev.sprint) {
    headline = medal ? `${MEDAL_NAMES[medal]} medal` : `${ORD[place - 1]} place`;
    line =
      medal === 'platinum'
        ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: every race won.`
        : medal
          ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: you finish ${ORD[place - 1]}.${place === 1 ? ' Win every race for platinum.' : ''}`
          : `You finish ${ORD[place - 1]}: a medal needs the top three.`;
  } else if (singleRaces(ev)) {
    const yours = factionName(LIVERIES[ev.faction]);
    headline = medal ? `${MEDAL_NAMES[medal]} medal` : `${ORD[place - 1]} place`;
    line =
      medal === 'platinum'
        ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: ${yours} win every round.`
        : medal
          ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: ${yours} finish ${ORD[place - 1]}.${place === 1 ? ' Win every round for platinum.' : ''}`
          : `${yours} finish ${ORD[place - 1]}: a medal needs the top three.`;
  } else {
    headline = place === 1 ? 'The Zenith Cup' : `${ORD[place - 1]} in the season`;
    line = place === 1 ? `${factionName(LIVERIES[ev.faction])} top the table at ${GP_DIFFICULTY[ev.difficulty]}. The cup is yours.` : `${factionName(LIVERIES[ev.faction])} finish ${ORD[place - 1]}. Only the top of the table takes the cup.`;
  }
  const kind = ev.kind === 'season' ? (place === 1 ? 'cup' : 'none') : (medal ?? 'none');
  const badge = h('div.medal.' + kind);
  if (kind !== 'none') badge.style.setProperty('--badge', `url(${medalBadgeUrl(kind === 'cup' ? 'gold' : kind)})`);
  return [badge, h('h1', headline), h('p', line)];
}

/** Each board's own ground colour (its corner's), once read: the frame round it is filled with it. */
const boardGround = new Map<string, string>();

/**
 * A circuit's board (its name and emblem, painted), for the cups and the
 * previews: every one the same shape (BOARD_ASPECT in the styles), the
 * painting fitted inside it and the rest filled with its own ground, so a
 * list of them lines up whatever each painting's proportions.
 */
function board(id: string): HTMLElement {
  const own = paintedTrack.circuits[id];
  if (!own) return h('div.board.plain', h('span', circuitName(id)));
  const img = h<'img'>('img');
  img.src = own.url;
  img.alt = circuitName(id);
  img.draggable = false;
  const frame = h('div.board', img);
  const known = boardGround.get(id);
  if (known) frame.style.background = known;
  else
    img.addEventListener(
      'load',
      () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 1;
          const g = c.getContext('2d', { willReadFrequently: true });
          if (!g) return;
          g.drawImage(img, 3, 3, 1, 1, 0, 0, 1, 1);
          const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
          const css = `rgb(${r}, ${gg}, ${b})`;
          boardGround.set(id, css);
          frame.style.background = css;
        } catch {
          // (The default ground, then.)
        }
      },
      { once: true },
    );
  return frame;
}

/** The medal an event has given at a difficulty (the one picked in the menu): one disc, empty for none yet. */
function pips(won: Record<number, Medal | undefined> | undefined, diff: number): HTMLElement {
  const m = won?.[diff];
  const d = GP_DIFFICULTY[diff];
  const disc = h('i.' + (m ?? 'empty'));
  // The league's badge struck into it.
  if (m) disc.style.setProperty('--badge', `url(${medalBadgeUrl(m)})`);
  const el = h('span.pip' + (m ? '.won' : ''), disc, m ? `${MEDAL_NAMES[m]} at ${d}` : `No medal at ${d}`);
  el.title = m === 'platinum' ? `Platinum at ${d}: every race won` : m ? `${MEDAL_NAMES[m]} at ${d}` : `No medal yet at ${d}`;
  return h('div.pips', el);
}

/** A trophy, in a cup's colours (or the Grand Tour's, or the Zenith Cup's). */
function trophy(id: string): HTMLElement {
  return h('div.trophy.' + id, h('i'));
}

/** Where an event under way is: "round 2 of 3" (a Sprint event's: "race 2 of 3"). */
function progress(ev: GpEvent): string {
  return `${ev.sprint ? 'Race' : singleRaces(ev) ? 'Round' : 'Matchday'} ${singleRaces(ev) ? Math.min(playedRounds(ev), yourRoundNumber(ev)) : ev.current + 1} of ${singleRaces(ev) ? playedRounds(ev) : ev.rounds.length}`;
}

/** A cup's name in a series ("Horizon Cup", "Horizon Sprint Cup"). */
function cupName(name: string, sprint: boolean): string {
  return sprint ? name.replace(/ Cup$/, ' Sprint Cup') : name;
}

/** The hub's preview pane, filled for the highlighted item. */
let preview: HTMLElement | null = null;

export function registerGrandPrix(m: Menus, g: Game): void {
  const fill = (key: string) => {
    const side = preview;
    if (!side) return;
    const medals = g.gpMedals();
    const diff = g.gpDifficulty();
    side.replaceChildren();
    if (key === 'cup') {
      const cupEv = g.gpEvent('cup');
      side.append(h('h2', 'Cups'), h('p', 'Three races, each against a different faction: gold, silver or bronze for the top three, platinum for winning every round. A medal opens the next cup.'));
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals.byCup);
        const going = cupEv && cupEv.cup === c.id && !isOver(cupEv) ? cupEv : null;
        side.append(
          h(
            'div.prev-cup' + (open ? '' : '.locked'),
            trophy(c.id),
            h('div.prev-name', h('b', c.name), h('small', going ? `Under way: ${progress(going)}` : open ? '' : `A medal in the ${CUPS[i - 1].name} opens it`)),
            pips(medals.byCup[c.id], diff),
            h('div.prev-boards', ...c.circuits.map(board)),
          ),
        );
      });
    } else if (key === 'tour') {
      const tour = g.gpEvent('tour');
      const open = tourOpen(medals.byCup) || !!tour;
      side.append(
        h('h2', 'Grand Tour'),
        h('p', open ? 'Nine races, every circuit in turn. Each rival twice, then a decider at Zenith Ring against the team nearest you on the table.' : 'Opens with a medal in each of the three cups.'),
        h('div.prev-grid.nine' + (open ? '' : '.locked'), ...TRACKS.map((t) => board(t.id))),
        h('div.prev-foot', trophy('tour'), tour && !isOver(tour) ? h('b', `Under way: ${progress(tour)}`) : pips(medals.byCup[TOUR_ID], diff)),
      );
    } else if (key === 'sprint-cup') {
      const cupEv = g.gpEvent('sprint-cup');
      side.append(h('h2', 'Sprint Cups'), h('p', 'The cups as Sprints: three races, six Forwards, every pilot for themselves. Points by place; the leader starts at the back. Their own medals (platinum for winning every race) and their own ladder: a medal opens the next Sprint Cup.'));
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals.sprint);
        const going = cupEv && cupEv.cup === c.id && !isOver(cupEv) ? cupEv : null;
        side.append(
          h(
            'div.prev-cup' + (open ? '' : '.locked'),
            trophy(c.id),
            h('div.prev-name', h('b', cupName(c.name, true)), h('small', going ? `Under way: ${progress(going)}` : open ? '' : `A medal in the ${cupName(CUPS[i - 1].name, true)} opens it`)),
            pips(medals.sprint[c.id], diff),
            h('div.prev-boards', ...c.circuits.map(board)),
          ),
        );
      });
    } else if (key === 'sprint-tour') {
      const tour = g.gpEvent('sprint-tour');
      const open = tourOpen(medals.sprint) || !!tour;
      side.append(
        h('h2', 'Sprint Tour'),
        h('p', open ? 'Nine Sprints, every circuit in turn. The last, at Zenith Ring, is the Showdown: double points, and the pilot nearest you on the table marked as your rival.' : 'Opens with a medal in each of the three Sprint Cups.'),
        h('div.prev-grid.nine' + (open ? '' : '.locked'), ...TRACKS.map((t) => board(t.id))),
        h('div.prev-foot', trophy('tour'), tour && !isOver(tour) ? h('b', `Under way: ${progress(tour)}`) : pips(medals.sprint[TOUR_ID], diff)),
      );
    } else if (key === 'season') {
      const season = g.gpEvent('season');
      const ids = TRACKS.map((t) => t.id).filter((id) => id !== 'zenith');
      side.append(
        h('h2', 'Zenith Cup season'),
        h('p', 'Ten matchdays: every other faction twice, best of 3, two days off. Top the table for the Zenith Cup. It keeps between sittings.'),
        h('div.prev-half', h('small', 'First half'), h('div.prev-boards', ...[...ids.slice(0, 4), 'zenith'].map(board))),
        h('div.prev-half', h('small', 'Second half'), h('div.prev-boards', ...[...ids.slice(4, 8), 'zenith'].map(board))),
        h('div.prev-foot', trophy('season'), h('b', season && !isOver(season) ? `Under way: ${progress(season)}` : `Zenith Cups won: ${GP_DIFFICULTY.map((d, i) => `${d} ${medals.season[i] ?? 0}`).join(' · ')}`)),
      );
    } else {
      side.append(
        h('h2', 'Difficulty'),
        h('p', 'How well the rival pilots race. Your teammates race the same at every difficulty. It applies to a new cup, Tour or season; one under way keeps its own.'),
        h('div.prev-levels', ...GP_DIFFICULTY.map((d, i) => h('div' + (i === diff ? '.on' : ''), h('b', d), h('small', ['New to it: rivals who leave room.', 'A fair fight.', 'Rivals who race to win, and know the lines.'][i])))),
      );
    }
  };

  m.register('gp', {
    render(m) {
      const col = h('div.col.gp');
      const list = h('div.list');
      const diff = g.gpDifficulty();
      const medals = g.gpMedals();
      const cupEv = g.gpEvent('cup');
      const tour = g.gpEvent('tour');
      const season = g.gpEvent('season');
      const sprintCup = g.gpEvent('sprint-cup');
      const sprintTour = g.gpEvent('sprint-tour');
      const tourIsOpen = tourOpen(medals.byCup) || !!tour;
      const sprintTourOpen = tourOpen(medals.sprint) || !!sprintTour;
      m.button(list, 'Cup', () => m.push('gp-cups'), { key: 'cup', note: cupEv && !isOver(cupEv) ? `${eventName(cupEv)}: ${progress(cupEv).toLowerCase()}` : 'Three cups, three races each' });
      m.button(list, 'Grand Tour', () => g.openGp('tour'), {
        key: 'tour',
        locked: tourIsOpen ? null : 'A medal in each of the three cups opens it',
        note: tour && !isOver(tour) ? progress(tour) : tourIsOpen ? 'Nine races, every circuit' : 'A medal in each cup opens it',
      });
      m.button(list, 'Season', () => g.openGp('season'), { key: 'season', note: season && !isOver(season) ? progress(season) : 'Ten matchdays for the Zenith Cup' });
      // The Sprint series: six Forwards, every pilot for themselves, on a ladder of its own.
      m.button(list, 'Sprint Cup', () => m.push('gp-cups', { sprint: true }), { key: 'sprint-cup', note: sprintCup && !isOver(sprintCup) ? `${eventName(sprintCup)}: ${progress(sprintCup).toLowerCase()}` : 'Every pilot for themselves, three Sprints a cup' });
      m.button(list, 'Sprint Tour', () => g.openGp('sprint-tour'), {
        key: 'sprint-tour',
        locked: sprintTourOpen ? null : 'A medal in each of the three Sprint Cups opens it',
        note: sprintTour && !isOver(sprintTour) ? progress(sprintTour) : sprintTourOpen ? 'Nine Sprints, the last the Showdown' : 'A medal in each Sprint Cup opens it',
      });
      m.choice(list, 'Difficulty', GP_DIFFICULTY[diff], (dir) => g.setGpDifficulty((diff + dir + 3) % 3), { key: 'difficulty' });
      const won = UNLOCKS.filter((u) => earned(u, g.progress)).length;
      m.button(list, 'Rewards', () => m.push('gp-rewards'), { key: 'rewards', note: `${won} of ${UNLOCKS.length} earned: patterns, paints, finishes and poses for your mech` });
      col.append(h('div.context', 'Grand Prix'), h('h1', 'Grand Prix'), list);
      preview = h('div.panel.gp-preview');
      m.root.append(h('div.shade'), m.panes(col, preview), m.footer(SELECT, CHANGE, BACK));
    },
    selected(_m, key) {
      fill(key);
    },
  });

  // The cups: the team series's, or (`sprint`) the Sprint series's, each on its own ladder.
  m.register<{ sprint?: boolean } | undefined>('gp-cups', {
    spatial: true,
    render(m, d) {
      const sprint = !!d?.sprint;
      const slot: GpSlot = sprint ? 'sprint-cup' : 'cup';
      const all = g.gpMedals();
      const medals = sprint ? all.sprint : all.byCup;
      const diff = g.gpDifficulty();
      const cupEv = g.gpEvent(slot);
      const going = cupEv && !isOver(cupEv) ? cupEv : null;
      const col = h('div.col.gp-cups-side');
      col.append(
        h('div.context', `Grand Prix · ${sprint ? 'Sprint series · ' : ''}${GP_DIFFICULTY[going ? going.difficulty : diff]}`),
        h('h1', sprint ? 'Choose a Sprint Cup' : 'Choose a cup'),
        h(
          'p',
          going
            ? `The ${eventName(going)} is under way (${progress(going).toLowerCase()}). Choosing another cup puts it away.`
            : sprint
              ? 'Three Sprints: you in your own Forward against a pilot from each faction, every pilot for themselves. A medal in one Sprint Cup opens the next.'
              : 'Three races, each against a different faction. A medal in one cup opens the next.',
        ),
      );
      const row = h('div.cuprow');
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals);
        const mine = going && going.cup === c.id ? going : null;
        const name = cupName(c.name, sprint);
        const opens = i > 0 ? `A medal in the ${cupName(CUPS[i - 1].name, sprint)} opens it` : '';
        const card = h(
          'div.item.cupcard' + (mine ? '.going' : '') + (sprint ? '.sprint' : ''),
          trophy(c.id),
          h('h3', name),
          h('div.boards', ...c.circuits.map(board)),
          pips(medals[c.id], diff),
          h('div.status', mine ? `Continue: ${progress(mine).toLowerCase()}` : open ? '' : opens),
        );
        m.addItem(
          row,
          card,
          () => {
            if (going && going.cup !== c.id) {
              confirmDialog(m, `Put the ${eventName(going)} away?`, `One cup at a time: the ${eventName(going)} under way is abandoned (its races so far are lost) and the ${name} starts. Medals already won are kept.`, `Start the ${name}`, () => {
                g.abandonGp(slot);
                g.openGp(slot, c.id);
              });
            } else g.openGp(slot, c.id);
          },
          undefined,
          { key: c.id, locked: open ? null : opens },
        );
      });
      const pane = h('div.panel.cups', row);
      m.root.append(h('div.shade'), m.panes(col, pane), m.footer(SELECT, BACK));
      // The cup under way, or else the furthest one open.
      const first = going ? going.cup : [...CUPS].reverse().find((c) => cupOpen(c.id, medals))?.id;
      if (first) m.focus(first);
    },
  });

  m.register<GpData>('briefing', {
    render(m, d) {
      const ev = g.gpEvent(d.slot);
      if (!ev) return void m.pop();
      if (ev.sprint) return sprintBriefing(m, g, ev, d.slot);
      const r = ev.rounds[ev.current];
      const col = h('div.col.briefing');
      const list = h('div.list');
      const total = playedRounds(ev);
      col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]} · ${factionName(LIVERIES[ev.faction])}`));
      if (r.you) {
        const rival = r.you.b;
        g.circuitAhead(r.circuit);
        col.append(
          h('h1', `Round ${yourRoundNumber(ev)} of ${total}`),
          h('div.versus', emblem(ev.faction), h('span', factionName(LIVERIES[ev.faction])), h('b', 'vs'), h('span', factionName(LIVERIES[rival])), emblem(rival)),
          h('p', `${circuitName(r.circuit)}. ${singleRaces(ev) ? 'A single race.' : 'Best of 3.'} ${ev.kind === 'tour' && ev.current === ev.rounds.length - 1 ? 'The decider: against the team nearest you on the table.' : ''} ${TRACK_BLURBS[r.circuit] ?? ''}`),
        );
        m.button(list, 'Start round', () => g.startGpRound(d.slot), { key: 'start', go: true });
      } else {
        const ready = roundComplete(ev, ev.current);
        col.append(h('h1', `Matchday ${ev.current + 1}`), h('p', 'You sit this one out. The other four race; their results go on the table.'));
        const fx = h('div.fixtures');
        for (const f of r.others) fx.append(fixtureLine(f, ev));
        col.append(fx);
        m.button(list, ready ? 'Continue' : 'Waiting for the other races…', () => (ready ? g.gpAdvance(d.slot) : m.toast('The other races are still running')), { key: 'start', go: ready });
      }
      m.button(list, 'Paddock', () => g.openGpPaddock(d.slot), { key: 'hangar', hint: 'Your frame, and your own mech or the stock one' });
      abandonButton(m, g, list, ev, d.slot);
      col.append(list);
      const side = h('div.panel.standings', h('h2', ev.current > 0 ? `Standings after ${singleRaces(ev) ? 'round' : 'matchday'} ${ev.current}` : 'Standings'), gpTable(ev, ev.current - 1));
      m.root.append(h('div.shade'), m.panes(col, side), m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Paddock', press: 'y' }, BACK));
    },
    press(_m, key, d) {
      if (key === 'y') {
        g.openGpPaddock(d.slot);
        return true;
      }
      return false;
    },
    back(m) {
      if (!m.popTo('gp')) m.pop();
    },
  });

  m.register<GpData>('standings', {
    render(m, d) {
      const ev = g.gpEvent(d.slot);
      if (!ev) return void m.pop();
      const r = ev.rounds[ev.current];
      const ready = roundComplete(ev, ev.current);
      const last = ev.current >= ev.rounds.length - 1;
      const col = h('div.col.standings-screen');
      if (ev.sprint) {
        const finale = !!r.sprint?.finale;
        col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]} · ${circuitName(r.circuit)}`), h('h1', finale ? 'After the Showdown' : `After race ${ev.current + 1}`), sprintRaceLines(g, ev, ev.current));
        if (finale) col.append(h('p.note', 'The Showdown counted double.'));
      } else {
        col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]}`), h('h1', singleRaces(ev) ? `After round ${ev.current + 1}` : `After matchday ${ev.current + 1}`));
        const fx = h('div.fixtures');
        for (const f of r.you ? [r.you, ...r.others] : r.others) fx.append(fixtureLine(f, ev));
        col.append(fx);
      }
      const list = h('div.list');
      m.button(list, ready ? (last ? 'Final standings' : 'Continue') : 'Waiting for the other races…', () => (ready ? g.gpAdvance(d.slot) : m.toast('The other races are still running')), { key: 'go', go: ready });
      col.append(list);
      const side = h('div.panel.standings', h('h2', 'Standings'), ev.sprint ? sprintTable(g, ev, ev.current) : gpTable(ev, ev.current));
      m.root.append(h('div.shade.full'), m.panes(col, side), m.footer(SELECT));
    },
    back() {},
  });

  // Everything the Grand Prix earns for your mech, and what opens each.
  m.register('gp-rewards', {
    render(m) {
      const col = h('div.col');
      const list = h('div.list');
      m.button(list, 'Back', () => m.pop(), { key: 'back', go: true });
      col.append(
        h('div.context', 'Grand Prix'),
        h('h1', 'Rewards'),
        h('p', 'Medals open these for your mechs, every frame: patterns, paints and finishes for a custom mech\'s livery (the editor, off the hangar), and victory poses for the podium (the hangar). Each series has its own: the team series\'s cups, Grand Tour and Zenith Cup, and the Sprint series\'s cups and Tour.'),
        list,
      );
      const rows = h('div.rewards');
      for (const [title, sprint] of [['Team series', false], ['Sprint series', true]] as const) {
        const mine = UNLOCKS.filter((u) => sprintUnlock(u) === sprint);
        const got = mine.filter((u) => earned(u, g.progress)).length;
        rows.append(h('h3', title, h('small', `${got} of ${mine.length}`)));
        for (const u of mine) {
          const has = earned(u, g.progress);
          rows.append(h('div.reward' + (has ? '.got' : ''), h('b', unlockName(u)), h('span', has ? 'Earned' : howTo(u))));
        }
      }
      m.root.append(h('div.shade'), m.panes(col, h('div.panel.gp-rewards', h('h2', 'For your mechs'), rows)), m.footer(SELECT, BACK));
    },
  });
}

/** The button to give an event up, and the question first. */
function abandonButton(m: Menus, g: Game, list: HTMLElement, ev: GpEvent, slot: GpSlot): void {
  m.button(
    list,
    `Abandon the ${eventName(ev)}`,
    () =>
      confirmDialog(m, `Abandon the ${eventName(ev)}?`, 'Its races so far are lost. Medals and cups already won are kept.', 'Abandon', () => {
        g.abandonGp(slot);
        if (!m.popTo('gp')) m.reset('gp', undefined, ['title', 'modes']);
      }),
    { key: 'abandon' },
  );
}

/**
 * A Sprint event's briefing: the race (its circuit, the Showdown's double
 * points and your rival), the grid (seats from pole, the favourite and the
 * rival marked), your Forward to edit, and the table so far.
 */
function sprintBriefing(m: Menus, g: Game, ev: GpEvent, slot: GpSlot): void {
  const r = ev.rounds[ev.current];
  const race = r.sprint!;
  const total = playedRounds(ev);
  const mine = customName(ROLE.FW, g.customMech(ROLE.FW));
  g.circuitAhead(r.circuit);
  const col = h('div.col.briefing.sprint');
  col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]} · ${mine}`));
  const fav = sprintFavourite(ev);
  const grid = sprintEventGrid(ev);
  const table = sprintStandings(ev, ev.current - 1);
  const pts = (seat: number) => table.find((row) => row.seat === seat)?.points ?? 0;
  if (race.finale) {
    const rival = race.rival ?? -1;
    const gap = pts(rival) - pts(0);
    const stands = gap > 0 ? `${gap} points ahead of you` : gap < 0 ? `${-gap} points behind you` : 'level with you on points';
    col.append(
      h('h1', 'The Showdown'),
      h('p', `${circuitName(r.circuit)}, race ${yourRoundNumber(ev)} of ${total}. Everything counts double: ${SPRINT_POINTS.map((p) => p * 2).join(', ')} points by place.`),
      rival >= 0 ? h('div.versus.rival', seatEmblem(g, 0), h('span', 'You'), h('b', 'vs'), h('span', seatName(g, rival)), seatEmblem(g, rival)) : '',
      rival >= 0 ? h('p', `Your rival, nearest you on the table: ${seatName(g, rival)} (${seatTeam(rival)}), ${stands}. Marked on the track.`) : '',
    );
  } else {
    col.append(
      h('h1', `Race ${yourRoundNumber(ev)} of ${total}`),
      h('p', `${circuitName(r.circuit)}. One race, six Forwards, every pilot for themselves: ${SPRINT_POINTS.join(', ')} points by place, none for a knockout. ${ev.current === 0 ? 'The grid is drawn by lot.' : 'The grid is the table reversed: the leader starts at the back.'} ${TRACK_BLURBS[r.circuit] ?? ''}`),
    );
  }
  // The grid, from pole.
  const slots = h('div.sprintgrid');
  grid.forEach((seat, i) => {
    const tags = [seat === fav ? h('span.tag', 'Favourite') : null, race.finale && seat === race.rival ? h('span.tag.rival', 'Your rival') : null];
    slots.append(h('div.slot' + (seat === 0 ? '.me' : ''), h('b', `P${i + 1}`), seatEmblem(g, seat), h('span', seatName(g, seat)), ...tags));
  });
  col.append(h('h2', 'The grid'), slots);
  const list = h('div.list');
  m.button(list, race.finale ? 'Start the Showdown' : 'Start race', () => g.startGpRound(slot), { key: 'start', go: true });
  m.button(list, 'Paddock', () => g.openGpPaddock(slot), { key: 'hangar', hint: `The Sprint series is raced in your own Forward, ${mine}` });
  abandonButton(m, g, list, ev, slot);
  col.append(list);
  const side = h('div.panel.standings', h('h2', ev.current > 0 ? `Standings after race ${ev.current}` : 'The field'), sprintTable(g, ev, ev.current - 1));
  if (ev.current === 0) side.append(h('p.note', `The same five all ${ev.kind === 'tour' ? 'Tour' : 'cup'}, one from each faction. ${seatName(g, fav)} of ${seatTeam(fav)} is the favourite.`));
  m.root.append(h('div.shade'), m.panes(col, side), m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Paddock', press: 'y' }, BACK));
}
