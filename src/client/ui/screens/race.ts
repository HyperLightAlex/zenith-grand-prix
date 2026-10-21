// Over the race: pause (offline it stops the race; online the race runs on
// and your seat's computer pilot flies until you resume) and the results.

import { AWARD_NAMES, ROLE_NAMES, roundsToWin } from '../../../sim/index';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import { LOGO } from '../keyArt';
import { art, type Menus } from '../menus';
import { DEV_TOOLS } from '../../devTools';
import { SELECT, confirmDialog } from './common';

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
      const round = match && match.rounds.length ? match.rounds[match.rounds.length - 1] : null;
      const pts = round ? round.points : [0, 0];
      if (!round) for (const mm of race.mechs) pts[mm.team] += mm.points;
      const mine = pts[me.team];
      const theirs = pts[1 - me.team];
      const factions = g.factions;
      const sides = factions.map((f) => LIVERIES[f] ?? LIVERIES[0]);
      const names = sides.map(factionName);
      m.root.style.setProperty('--team0', sides[0].css);
      m.root.style.setProperty('--team1', sides[1].css);
      const box = h('div.results');
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
        const tr = h<'tr'>('tr' + (x.team ? '.t1' : '') + (x.id === me.id && g.resultsLocal >= 0 ? '.me' : '') + (x.retired ? '.out' : ''));
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
          h<'td'>('td', `${sides[x.team].models[x.role]}, ${ROLE_NAMES[x.role].toLowerCase()}`),
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
      const list = h('div.list');
      if (g.mode === 'online') {
        const v = g.online.lobby;
        const done = v?.continued.includes(g.online.pid);
        const racers = v ? v.players.filter((p) => p.side >= 0 && p.connected && !p.nextRound).length : 0;
        const n = v?.continued.length ?? 0;
        const final = v?.phase === 'final';
        const t = Math.max(0, v?.timer ?? 0);
        const gp = !!v?.gp;
        const note = final ? (gp ? `The standings in ${t}` : `Back to the lobby in ${t}`) : `Next round in ${t}: ${n} of ${racers} ready`;
        m.button(list, done ? (final ? 'Waiting…' : 'Ready for the next round') : final ? (gp ? 'The standings' : 'Back to the room') : 'Continue', () => g.online.sendRoom('continue', { at: v?.phase }), { key: 'next', go: !done, note });
        m.button(list, gp ? 'Leave the Grand Prix' : 'Leave room', () => g.confirmLeaveRoom(), { key: 'leave' });
      } else if (g.mode === 'gp') {
        m.button(list, over ? 'Continue' : 'Next round', () => g.next(), { key: 'next', go: true });
        m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
      } else {
        m.button(list, over ? (single ? 'Race again' : 'New match') : 'Next round', () => g.next(), { key: 'next', go: true });
        m.button(list, 'Change setup', () => g.toSetup(), { key: 'setup' });
        m.button(list, 'Quit to title', () => g.showTitle(), { key: 'quit' });
      }
      box.append(list);
      m.root.append(h('div.shade.full'), m.panes(box));
    },
    back() {},
  });
}
