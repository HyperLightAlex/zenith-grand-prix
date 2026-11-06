// The ceremony's readout, over the podium at a match's or an event's end
// (game/ceremony.ts): the result (an event's award: your medal or the cup),
// the mentions (the MVP, the top racer, the most knockouts, the best
// support, the heaviest hitter, the ironclad: whoever earned them, wherever
// they placed), your own contribution (where your points came from, your
// support by kind, your share of your team's), what you earned for your
// mech; and every pilot's points broken down, beside an event's final table.

import { AWARD_NAMES, MENTION_NAMES, ROLE_NAMES, mentionLine, standings, type PilotLine } from '../../../sim/index';
import { eventMedal, eventName, finalPlace, singleRaces, type GpEvent } from '../../../gp/grandPrix';
import type { Game } from '../../game/game';
import { h } from '../dom';
import type { Menus } from '../menus';
import { factionLook, independent, teamLooks, type TeamLook } from '../sides';
import { SELECT } from './common';
import { awardLines, gpTable, sprintTable } from './grandPrix';
import { unlockName } from '../../game/unlocks';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A pilot's side as it looks (its colour and emblem): a match's team (a Sprint's pilot), an event's faction. */
function lookOf(g: Game, l: PilotLine): TeamLook {
  // (A Sprint event's: you in your colour, for no faction.)
  if (g.ceremonyEvent?.sprint && l.faction < 0) return independent(l.colour);
  if (g.ceremonyEvent) return factionLook(Math.max(0, l.faction));
  const race = g.resultsRace;
  const looks = race ? teamLooks(race, g.factions) : [];
  return looks[l.team] ?? factionLook(0);
}

/** Where a pilot's points came from: a bar in three (placing, knockouts, support), as long as its share of the most anyone scored. */
function pointsBar(l: PilotLine, most: number): HTMLElement {
  const bar = h('div.ptsbar');
  const scale = most > 0 ? 100 / most : 0;
  for (const [cls, v, what] of [
    ['.placing', l.placing, 'placing'],
    ['.ko', l.koPts, 'knockouts'],
    ['.support', l.support, 'support'],
  ] as const) {
    if (v <= 0) continue;
    const seg = h('i' + cls);
    seg.style.width = `${(v * scale).toFixed(1)}%`;
    seg.title = `${v} from ${what}`;
    bar.append(seg);
  }
  return bar;
}

/** Your own contribution: where your points came from, your support by kind, your share of your team's. */
function yours(g: Game, me: PilotLine, lines: readonly PilotLine[]): HTMLElement {
  const box = h('div.yours');
  const team = lines.filter((l) => (g.ceremonyEvent ? l.faction === me.faction : l.team === me.team));
  const teamPts = team.reduce((a, l) => a + l.points, 0);
  const share = teamPts > 0 && team.length > 1 ? Math.round((100 * me.points) / teamPts) : -1;
  box.append(
    h('h2', 'Your contribution'),
    h(
      'p',
      `${plural(me.points, 'point', 'points')}${share >= 0 ? `, ${share}% of your team's` : ''}: ${me.placing} placing` +
        (me.koPts > 0 ? `, ${me.koPts} from knockouts` : '') +
        (me.support > 0 ? `, ${me.support} from support` : '') +
        '.',
    ),
  );
  const facts = [
    plural(me.races, 'race', 'races'),
    me.wins > 0 ? plural(me.wins, 'win', 'wins') : '',
    me.podiums > 0 ? `${me.podiums} in the first three` : '',
    me.kos > 0 ? plural(me.kos, 'knockout', 'knockouts') : '',
    `${me.dmgDealt} damage dealt, ${me.dmgTaken} taken`,
    me.out > 0 ? `knocked out ${plural(me.out, 'time', 'times')}` : 'never knocked out',
  ].filter(Boolean);
  box.append(h('p.facts', facts.join(' · ')));
  const chips = h('div.chips');
  AWARD_NAMES.forEach((name, kind) => {
    if (me.awards[kind] > 0) chips.append(h('span.chip', `${name} `, h('b', String(me.awards[kind]))));
  });
  if (chips.children.length) box.append(chips);
  return box;
}

/** The mentions: what for, who, and the number it is for. */
function mentionCards(g: Game, me: number): HTMLElement {
  const c = g.ceremony!;
  const list = h('div.mentions');
  for (const m of c.mentions) {
    const l = c.lines.find((x) => x.id === m.id);
    if (!l) continue;
    const look = lookOf(g, l);
    const card = h(
      'div.mention' + (m.kind === 'mvp' ? '.mvp' : '') + (l.id === me && l.human ? '.me' : ''),
      h('span.kind', MENTION_NAMES[m.kind]),
      h('b', l.name + (l.id === me && l.human ? ' (you)' : '')),
      h('small', `${mentionLine(m)} · ${ROLE_NAMES[l.role as 0 | 1 | 2] ?? ''}, ${look.name}`),
    );
    card.style.setProperty('--tc', look.css);
    list.append(card);
  }
  return list;
}

/** Every pilot, best first: their points and where they came from, their wins, knockouts and damage. */
function pilotTable(g: Game, me: number): HTMLElement {
  const c = g.ceremony!;
  const table = h<'table'>('table.pilots');
  const head = h<'tr'>('tr');
  for (const [label, num] of [['', false], ['Pilot', false], ['Points', true], ['', false], ['Races', true], ['Wins', true], ['KOs', true], ['Damage', true]] as const) head.append(h<'th'>('th' + (num ? '.num' : ''), label));
  table.append(head);
  const most = Math.max(1, ...c.lines.map((l) => l.points));
  c.lines.forEach((l, i) => {
    const look = lookOf(g, l);
    const tr = h<'tr'>('tr' + (l.id === me && l.human ? '.me' : ''));
    tr.style.setProperty('--tc', look.css);
    tr.append(
      h<'td'>('td.pos', String(i + 1)),
      h<'td'>('td.who', h('b', l.name), h('small', `${ROLE_NAMES[l.role as 0 | 1 | 2] ?? ''}, ${look.name}`)),
      h<'td'>('td.num.pts', String(l.points)),
      h<'td'>('td.bar', pointsBar(l, most)),
      h<'td'>('td.num', String(l.races)),
      h<'td'>('td.num', String(l.wins)),
      h<'td'>('td.num', String(l.kos)),
      h<'td'>('td.num', String(l.dmgDealt)),
    );
    table.append(tr);
  });
  return table;
}

/** The result at the top: an event's award, or the match's. */
function result(g: Game): HTMLElement[] {
  const c = g.ceremony!;
  const ev: GpEvent | null = g.ceremonyEvent;
  if (ev) {
    const place = finalPlace(ev);
    return awardLines(ev, place, eventMedal(ev));
  }
  const m = g.match;
  const top = c.steps[0];
  const winner = c.lines.find((l) => l.id === top?.pilots[0]?.id);
  if (c.kind === 'sprint') {
    const me = c.lines.find((l) => l.id === g.ceremonyMe() && l.human);
    const yourPlace = me && m ? standings(m).indexOf(me.team) : -1;
    return [h('h1', `${winner?.name ?? ''} ${m && m.rounds.length > 1 ? 'wins the Sprint' : 'wins'}`), h('p', me ? `You finished ${ORD[yourPlace] ?? `${yourPlace + 1}th`} with ${plural(me.points, 'point', 'points')}.` : '')];
  }
  const race = g.resultsRace;
  const looks = race ? teamLooks(race, g.factions) : [];
  const w = top?.side ?? 0;
  const tally = !m ? '' : m.cfg.mode === 'series' && m.cfg.bestOf > 1 ? `${m.wins[w]}–${m.wins[1 - w]}` : `${m.totals[w]}–${m.totals[1 - w]}`;
  const meLine = c.lines.find((l) => l.id === g.ceremonyMe() && l.human);
  const yourTeamWon = meLine ? meLine.team === w : false;
  return [
    h('h1', `${looks[w]?.name ?? ''} win ${m && m.rounds.length > 1 ? 'the match ' : ''}`, h('span.pts', tally)),
    h('p', meLine ? (yourTeamWon ? 'Your team takes it.' : `Your team, ${looks[meLine.team]?.name ?? ''}, comes second.`) : ''),
  ];
}

export function registerCeremony(m: Menus, g: Game): void {
  m.register('ceremony', {
    render(m) {
      const c = g.ceremony;
      if (!c) return;
      const ev = g.ceremonyEvent;
      const me = g.ceremonyMe();
      const col = h('div.col.ceremony');
      const context = ev ? `${eventName(ev)} · the ceremony` : g.resultsRace ? `${g.circuitName} · the ceremony` : 'The ceremony';
      col.append(h('div.context', context), ...result(g));
      if (c.mentions.length) col.append(h('h2', 'Mentions'), mentionCards(g, me));
      const mine = c.lines.find((l) => l.id === me && l.human);
      if (mine) col.append(yours(g, mine, c.lines));
      if (ev && g.justEarned.length) col.append(h('div.unlocked', h('h2', 'Earned for your mech'), ...g.justEarned.map((u) => h('div', unlockName(u)))));
      const list = h('div.list');
      if (g.mode === 'online') {
        const v = g.online.lobby;
        if (v?.gp) m.button(list, 'Back to Online', () => g.leaveRoom(), { key: 'done', go: true, note: 'Online results are not kept' });
        else {
          const done = v?.continued.includes(g.online.pid);
          const t = Math.max(0, v?.timer ?? 0);
          m.button(list, done ? 'Waiting…' : 'Back to the room', () => g.online.sendRoom('continue', { at: v?.phase }), { key: 'done', go: !done, note: `Back to the room in ${t}` });
          m.button(list, 'Leave room', () => g.confirmLeaveRoom(), { key: 'leave' });
        }
      } else if (ev) {
        m.button(list, 'Back to Grand Prix', () => g.ceremonyOver(), { key: 'done', go: true });
      } else {
        const match = g.match;
        const single = !match || (match.cfg.mode === 'series' && match.cfg.bestOf === 1) || (match.cfg.mode === 'races' && (match.cfg.races ?? 1) <= 1);
        m.button(list, single ? 'Race again' : c.kind === 'sprint' ? 'New Sprint' : 'New match', () => g.next(), { key: 'done', go: true });
        if (g.canReplay) m.button(list, 'Watch the last race', () => g.watchReplay(), { key: 'replay' });
        m.button(list, 'Change setup', () => g.toSetup(), { key: 'setup' });
        m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
      }
      if (g.canPodium) m.button(list, 'The podium again', () => g.podiumAgain(), { key: 'podium', note: 'And photo mode' });
      col.append(list);
      // (An event's pilots, many of them: a closer table.)
      const side = h('div.panel.ceremony-pilots' + (c.lines.length > 8 ? '.many' : ''));
      if (ev) side.append(h('h2', 'Final standings'), ev.sprint ? sprintTable(g, ev, ev.rounds.length - 1) : gpTable(ev, ev.rounds.length - 1));
      side.append(h('h2', ev && !ev.sprint ? 'The pilots of your races' : 'The pilots'), h('p.key', 'Points from', h('i.placing'), 'placing', h('i.ko'), 'knockouts', h('i.support'), 'support'), pilotTable(g, me));
      m.root.append(h('div.shade'), m.panes(col, side), m.footer(SELECT));
    },
    back: () => {},
  });
}

