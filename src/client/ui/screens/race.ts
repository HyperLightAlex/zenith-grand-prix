// Over the race: pause (offline it stops the race; online the race runs on
// and your seat's computer pilot flies until you resume) and the results.

import { mechName } from '../../../custom/mechBuild';
import { AWARD_NAMES, ROLE_NAMES, roundsToWin, standings, type MatchState, type RaceState } from '../../../sim/index';
import type { Game } from '../../game/game';
import { factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import { LOGO } from '../keyArt';
import { art, type Menus } from '../menus';
import { DEV_TOOLS } from '../../devTools';
import { SELECT, confirmDialog } from './common';
import { teamLooks, type TeamLook } from '../sides';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/** A race's time column: the winner's time, the others' gaps to it, or why there is none. */
function timeOf(race: RaceState, x: RaceState['mechs'][number]): string {
  if (x.retired) return 'Retired';
  if (x.finishTime > 1e6) return 'Flagged';
  const winner = race.mechs.find((o) => o.place === 1);
  if (winner && x !== winner && winner.finishTime < 1e6) return `+${(x.finishTime - winner.finishTime).toFixed(2)}`;
  return fmtTime(x.finishTime - 4);
}

/** Colour a row for its team (or a Sprint's pilot): its colour and emblem. */
function sideStyle(el: HTMLElement, t: TeamLook): HTMLElement {
  el.style.setProperty('--tc', t.css);
  el.style.setProperty('--te', `url(${t.emblem})`);
  return el;
}

/**
 * A Sprint's results: who won the race (and the Sprint, once decided),
 * your finish, the race's order, and over several races the standings.
 */
function sprintResults(g: Game, race: RaceState, match: MatchState | null, box: HTMLElement): void {
  const looks = teamLooks(race, g.factions);
  const youId = g.resultsLocal;
  const me = youId >= 0 ? race.mechs[youId] : null;
  const pilot = (team: number) => race.mechs.find((x) => x.team === team);
  const round = match && match.rounds.length ? match.rounds[match.rounds.length - 1] : null;
  const raceWinner = round ? round.winner : (race.mechs.find((x) => x.place === 1)?.team ?? 0);
  const several = !!match && (match.cfg.mode === 'wins' || (match.cfg.races ?? 1) > 1);
  const over = !match || match.winner >= 0;
  const emblem = (team: number) => {
    const el = h('i.emb');
    el.style.backgroundImage = `url(${looks[team].emblem})`;
    return el;
  };
  const named = (team: number, verb: string) => (me && me.team === team ? `You ${verb}` : `${pilot(team)?.name ?? '?'} ${verb}s`);
  if (several && over && match) box.append(h('div.headline', emblem(match.winner), `${named(match.winner, 'win')} the Sprint`));
  else if (several && match) box.append(h('div.headline', emblem(raceWinner), `${named(raceWinner, 'take')} race ${round ? round.round : 1}`));
  else box.append(h('div.headline', emblem(raceWinner), `${named(raceWinner, 'win')}`));
  const lines: string[] = [];
  if (me) {
    lines.push(me.retired ? 'You were knocked out and scored nothing.' : `You finished ${ORD[me.place - 1]} for ${me.points} point${me.points === 1 ? '' : 's'}.`);
  }
  if (several && match) {
    const order = standings(match);
    const left = match.cfg.mode === 'wins' ? `First to ${match.cfg.wins} wins (at most ${match.cfg.races} races)` : `${match.cfg.races} races, most points`;
    lines.push(over ? `${left}: decided after ${match.rounds.length}.` : `${left}: race ${match.rounds.length + 1} next. Whoever leads starts at the back.`);
    box.append(h('div.subline', lines.join(' ')));
    const stand = h('div.sprintstand', h('div.sh', h('span', ''), h('span', ''), h('span', 'Standings'), h('span.num', 'Wins'), h('span.num', 'Points')));
    order.forEach((team, i) => {
      const x = pilot(team);
      if (!x) return;
      const row = h('div.sr' + (me && me.team === team ? '.me' : ''), h('span.pos', String(i + 1)), h('span.flag'), h('span.who', x.name), h('span.num', String(match.wins[team] ?? 0)), h('span.num.pts', String(match.totals[team] ?? 0)));
      stand.append(sideStyle(row, looks[team]));
    });
    box.append(stand);
  } else box.append(h('div.subline', lines.join(' ')));
  const table = h<'table'>('table');
  const head = h<'tr'>('tr');
  for (const [label, num] of [['', false], ['', false], ['', false], ['Pilot', false], ['Mech', false], ['Time', true], ['Damage dealt', true], ['Knockouts', true], ['Points', true]] as const) {
    const th = h<'th'>('th' + (num ? '.num' : ''), label);
    if (head.children.length === 2) th.className = 'face';
    head.append(th);
  }
  table.append(head);
  for (const x of [...race.mechs].sort((a, b) => a.place - b.place)) {
    const t = looks[x.team];
    const tr = h<'tr'>('tr' + (me && x.id === me.id ? '.me' : '') + (x.retired ? '.out' : ''));
    const faceEl = h('i');
    faceEl.style.backgroundImage = `url(${faceUrl(t.faction, x.role, x.portrait)})`;
    tr.append(
      h<'td'>('td.flag'),
      h<'td'>('td', String(x.place)),
      h<'td'>('td.face', faceEl),
      h<'td'>('td', x.name + (me && x.id === me.id ? ' (you)' : '')),
      h<'td'>('td', `${mechName(x, t.livery.models[x.role])}, ${t.name}`),
      h<'td'>('td.num', timeOf(race, x)),
      h<'td'>('td.num', String(Math.round(x.dmgDealt))),
      h<'td'>('td.num', String(x.kos)),
      h<'td'>('td.num.pts', h('span', String(x.points))),
    );
    table.append(sideStyle(tr, t));
  }
  table.classList.add('sprint');
  box.append(table);
}

export function registerRace(m: Menus, g: Game): void {
  m.register('pause', {
    render(m) {
      const col = h('div.col');
      const list = h('div.list');
      const online = g.mode === 'online';
      m.button(list, 'Resume', () => g.resume(), { key: 'resume' });
      if (!online) m.button(list, 'Restart this race', () => g.restart(), { key: 'restart' });
      // Tools for working on the game, not player settings (see devTools.ts).
      if (DEV_TOOLS) {
        m.button(list, online ? 'Tuning (camera and look)' : 'Tuning', () => g.openTuning(), { key: 'tuning' });
        const lookLabel = h('span.look-label', `Look: ${g.lookOn() ? '80s anime' : 'plain'}`);
        m.button(list, lookLabel, () => {
          lookLabel.textContent = `Look: ${g.toggleLook() ? '80s anime' : 'plain'}`;
        }, { key: 'look' });
      }
      m.button(list, 'Controls', () => m.push('controls'), { key: 'controls' });
      m.button(list, 'Video', () => m.push('video'), { key: 'video' });
      if (online) {
        const gp = !!g.online.lobby?.gp;
        m.button(list, gp ? 'Leave the Grand Prix' : 'Leave match', () => confirmDialog(m, gp ? 'Leave the Grand Prix?' : 'Leave the match?', gp ? 'Your squad carries on without you, and a computer pilot takes your frame.' : 'Your seat goes to a computer pilot for the rest of this match.', 'Leave', () => g.leaveMatch()), { key: 'leave' });
        // A Grand Prix match plays to its end.
        if (g.online.lobby?.host === g.online.pid && !gp) m.button(list, 'End match for everyone', () => confirmDialog(m, 'End the match?', 'Everyone goes back to the room.', 'End match', () => g.online.sendRoom('endMatch')), { key: 'end' });
      } else {
        m.button(list, g.mode === 'gp' ? 'Back to the briefing' : 'Back to setup', () => g.toSetup(), { key: 'setup' });
        m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
      }
      const card = h('div.ec-pause', h('div.ec-kick', 'Paused'), art(LOGO.url, 'img', 'Zenith Grand Prix'));
      col.append(card, h('h1', 'Paused'), online ? h('p', 'The race carries on: your computer pilot is flying until you resume.') : '', list);
      m.root.append(h('div.shade'), m.panes(col), m.footer(SELECT, { pad: 'B', keys: 'Esc', label: 'Resume', press: 'back' }));
    },
    press(_m, key) {
      if (key === 'pause') {
        g.resume();
        return true;
      }
      return false;
    },
    back: () => g.resume(),
  });

  m.register('results', {
    horizontal: true,
    render(m) {
      const race = g.resultsRace;
      if (!race) return;
      const local = Math.max(0, g.resultsLocal);
      const me = race.mechs[local];
      const match = g.match;
      const box = h('div.results');
      if (race.sprint) {
        sprintResults(g, race, match, box);
        resultButtons(m, g, box, !match || match.winner >= 0, !match || (match.cfg.mode === 'races' && (match.cfg.races ?? 1) <= 1), true);
        m.root.append(h('div.shade.full'), m.panes(box));
        return;
      }
      const round = match && match.rounds.length ? match.rounds[match.rounds.length - 1] : null;
      const pts = round ? round.points : [0, 0];
      if (!round) for (const mm of race.mechs) pts[mm.team] += mm.points;
      const mine = pts[me.team];
      const theirs = pts[1 - me.team];
      const factions = g.factions;
      const looks = teamLooks(race, factions);
      const sides = looks.map((t) => t.livery);
      const names = sides.map(factionName);
      m.root.style.setProperty('--team0', sides[0].css);
      m.root.style.setProperty('--team1', sides[1].css);
      const emblem = (team: number) => {
        const el = h('i.emb');
        el.style.backgroundImage = `url(${emblemUrl(factions[team])})`;
        return el;
      };
      const single = !match || (match.cfg.mode === 'series' && match.cfg.bestOf === 1);
      const over = !match || match.winner >= 0;
      const roundWinner = round ? round.winner : mine >= theirs ? me.team : 1 - me.team;
      const myTeam = names[me.team];
      if (match && !single && over) {
        const won = match.winner === me.team;
        const tally = match.cfg.mode === 'series' ? `${match.wins[me.team]}–${match.wins[1 - me.team]}` : `${match.totals[me.team]}–${match.totals[1 - me.team]}`;
        box.append(h('div.headline', emblem(me.team), `${myTeam} ${won ? 'win' : 'lose'} the match `, h('span.pts', tally)));
      } else if (single) {
        box.append(h('div.headline', emblem(me.team), `${myTeam} ${roundWinner === me.team ? 'win' : 'lose'} `, h('span.pts', `${mine}–${theirs}`)));
      } else {
        box.append(h('div.headline', emblem(roundWinner), `${names[roundWinner]} take round ${round ? round.round : 1} `, h('span.pts', `${pts[roundWinner]}–${pts[1 - roundWinner]}`)));
      }
      const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
      const fromSupport = me.support > 0 ? `, ${me.support} of them from support` : '';
      const lines: string[] = [];
      if (g.resultsLocal >= 0) {
        lines.push(
          me.retired
            ? `You were knocked out${me.points > 0 ? `, but still scored ${me.points}${fromSupport}` : ' and scored nothing'}.`
            : `You finished ${ord[me.place - 1]} for ${me.points} point${me.points === 1 ? '' : 's'}${fromSupport}.`,
        );
      }
      if (round) {
        const parts = [`Placing ${round.place[me.team]}–${round.place[1 - me.team]}`];
        if (round.ko[0] + round.ko[1] > 0) parts.push(`knockouts ${round.ko[me.team]}–${round.ko[1 - me.team]}`);
        if (round.support[0] + round.support[1] > 0) parts.push(`support ${round.support[me.team]}–${round.support[1 - me.team]}`);
        if (parts.length > 1) lines.push(parts.join(', ') + '.');
        if (round.tied) lines.push(`Level on points, so the round goes to ${names[round.winner]}, who came home first.`);
      }
      box.append(h('div.subline', lines.join(' ')));
      if (match && !single) {
        const strip = h('div.matchstrip');
        if (match.cfg.mode === 'series') {
          const need = roundsToWin(match.cfg);
          for (const team of [me.team, 1 - me.team]) {
            const pips = h('span.pips');
            for (let i = 0; i < need; i++) pips.append(h('i' + (i < match.wins[team] ? '.on' : '')));
            strip.append(h('span.side' + (team ? '.t1' : ''), h('b', names[team]), pips));
          }
          strip.append(h('span.note', over ? `Best of ${match.cfg.bestOf}, decided in ${match.rounds.length}` : `Best of ${match.cfg.bestOf}. Round ${match.rounds.length + 1} next`));
        } else {
          for (const team of [me.team, 1 - me.team]) {
            const fill = h('i');
            fill.style.transform = `scaleX(${Math.min(1, match.totals[team] / match.cfg.target).toFixed(3)})`;
            strip.append(h('span.side' + (team ? '.t1' : ''), h('b', names[team]), h('span.total', String(match.totals[team])), h('div.bar', fill)));
          }
          strip.append(h('span.note', over ? `First to ${match.cfg.target}, after ${match.rounds.length} round${match.rounds.length === 1 ? '' : 's'}` : `First to ${match.cfg.target}. Round ${match.rounds.length + 1} next`));
        }
        box.append(strip);
      }
      const table = h<'table'>('table');
      const head = h<'tr'>('tr');
      for (const [label, num] of [['', false], ['', false], ['', false], ['Pilot', false], ['Frame', false], ['Time', true], ['Damage dealt', true], ['Knockouts', true], ['Support', true], ['Points', true]] as const) {
        const th = h<'th'>('th' + (num ? '.num' : ''), label);
        if (head.children.length === 2) th.className = 'face';
        head.append(th);
      }
      table.append(head);
      const winner = race.mechs.find((x) => x.place === 1);
      const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
      for (const x of [...race.mechs].sort((a, b) => a.place - b.place)) {
        const tr = sideStyle(h<'tr'>('tr' + (x.team ? '.t1' : '') + (x.id === me.id && g.resultsLocal >= 0 ? '.me' : '') + (x.retired ? '.out' : '')), looks[x.team]);
        let time = 'Retired';
        if (!x.retired) {
          if (x.finishTime > 1e6) time = 'Flagged';
          else if (winner && x !== winner && winner.finishTime < 1e6) time = `+${(x.finishTime - winner.finishTime).toFixed(2)}`;
          else time = fmt(x.finishTime - 4);
        }
        const faceEl = h('i');
        faceEl.style.backgroundImage = `url(${faceUrl(factions[x.team], x.role, x.portrait)})`;
        tr.append(
          h<'td'>('td.flag'),
          h<'td'>('td', String(x.place)),
          h<'td'>('td.face', faceEl),
          h<'td'>('td', x.name + (x.id === me.id && g.resultsLocal >= 0 ? ' (you)' : '')),
          h<'td'>('td', `${mechName(x, sides[x.team].models[x.role])}, ${ROLE_NAMES[x.role].toLowerCase()}`),
          h<'td'>('td.num', time),
          h<'td'>('td.num', String(Math.round(x.dmgDealt))),
          h<'td'>('td.num', String(x.kos)),
          h<'td'>('td.num', x.support > 0 ? String(x.support) : '–'),
          h<'td'>('td.num.pts', h('span', String(x.points))),
        );
        table.append(tr);
      }
      box.append(table);
      const supporters = race.mechs.filter((x) => x.support > 0).sort((a, b) => (a.team === me.team ? 0 : 1) - (b.team === me.team ? 0 : 1) || b.support - a.support);
      if (supporters.length > 0) {
        const sup = h('div.supportlist');
        for (const x of supporters) {
          const chips = h('span.chips');
          AWARD_NAMES.forEach((name, kind) => {
            if (x.awardPts[kind] > 0) chips.append(h('span.chip', `${name} `, h('b', String(x.awardPts[kind]))));
          });
          const capped = x.support >= race.rules.supportCap ? h('span.cap', 'max') : '';
          sup.append(h('div.row' + (x.team ? '.t1' : '') + (x.id === me.id ? '.me' : ''), h('span.who', x.name, h('small', ROLE_NAMES[x.role])), chips, h('span.total', `+${x.support}`), capped));
        }
        box.append(h('div.suphead', 'Support points'), sup);
      }
      resultButtons(m, g, box, over, single);
      m.root.append(h('div.shade.full'), m.panes(box));
    },
    back() {},
  });
}

/** What to do next, under the results: on to the next race or match, or back. */
function resultButtons(m: Menus, g: Game, box: HTMLElement, over: boolean, single: boolean, sprint = false): void {
  const list = h('div.list');
  const next = sprint ? 'race' : 'round';
  if (g.mode === 'online') {
    const v = g.online.lobby;
    const done = v?.continued.includes(g.online.pid);
    const racers = v ? v.players.filter((p) => p.side >= 0 && p.connected && !p.nextRound).length : 0;
    const n = v?.continued.length ?? 0;
    const final = v?.phase === 'final';
    const t = Math.max(0, v?.timer ?? 0);
    const gp = !!v?.gp;
    const note = final ? (gp ? `The standings in ${t}` : `Back to the lobby in ${t}`) : `Next ${next} in ${t}: ${n} of ${racers} ready`;
    m.button(list, done ? (final ? 'Waiting…' : `Ready for the next ${next}`) : final ? (gp ? 'The standings' : 'Back to the room') : 'Continue', () => g.online.sendRoom('continue', { at: v?.phase }), { key: 'next', go: !done, note });
    m.button(list, gp ? 'Leave the Grand Prix' : 'Leave room', () => g.confirmLeaveRoom(), { key: 'leave' });
  } else if (g.mode === 'gp') {
    m.button(list, over ? 'Continue' : 'Next round', () => g.next(), { key: 'next', go: true });
    m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
  } else {
    m.button(list, over ? (single ? 'Race again' : sprint ? 'New Sprint' : 'New match') : sprint ? 'Next race' : 'Next round', () => g.next(), { key: 'next', go: true });
    m.button(list, 'Change setup', () => g.toSetup(), { key: 'setup' });
    m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
  }
  box.append(list);
}
