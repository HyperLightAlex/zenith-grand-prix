// The Grand Prix online: a squad's cup or season against computer pilots.
// The setup (the leader picks the event), and the room as the event moves
// through it: the round's briefing (ready up), the standings once the
// round's results are in, and the award. Nothing here is saved: it is
// played in one sitting.

import { ROLE, type Role } from '../../../sim/index';
import { CUPS, GP_DIFFICULTY, eventName, finalPlace, medalFor, playedRounds, roundComplete, yourRoundNumber, type GpEvent, type GpKind } from '../../../gp/grandPrix';
import type { LobbyView } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { TRACK_BLURBS, type Menus, type Prompt } from '../menus';
import { BACK, CHANGE, SELECT } from './common';
import { awardLines, circuitName, emblem, fixtureLine, gpTable } from './grandPrix';
import { face } from './online';

const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];
const SHORT = ['FW', 'MF', 'DF'];
const HANGAR = { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' as const };
const LEAVE = { pad: 'B', keys: 'Esc', label: 'Leave', press: 'back' as const };

/** Why the squad's Grand Prix cannot be started from here, or null if it can. */
export function gpBlocked(g: Game): string | null {
  const o = g.online;
  if ((o.squadView?.members.length ?? 1) < 2) return 'Needs a squad of 2 or 3: invite a friend to race it with you';
  if (!o.leading) return "Your squad's leader starts the Grand Prix";
  return null;
}

export function registerOnlineGp(m: Menus, g: Game): void {
  m.register('online-gp', {
    render(m) {
      const o = g.online;
      const faction = o.squadView?.faction ?? g.loadout.team;
      const diff = g.gpDifficulty();
      const blocked = gpBlocked(g);
      const col = h('div.col.gp');
      const list = h('div.list');
      m.button(list, CUPS[0].name, () => void g.createGpRoom('cup'), { key: 'cup', go: !blocked, locked: blocked, note: 'Three races, one per circuit, against a different faction each time' });
      m.button(list, 'Zenith Cup season', () => void g.createGpRoom('season'), { key: 'season', locked: blocked, note: 'Five matchdays: every other faction once, best of 3, and a day off' });
      m.choice(list, 'Difficulty', GP_DIFFICULTY[diff], (dir) => g.setGpDifficulty((diff + dir + 3) % 3), { key: 'difficulty' });
      col.append(
        h('div.context', 'Online · Grand Prix'),
        h('h1', 'Grand Prix'),
        h('p', `Your squad races for ${factionName(LIVERIES[faction])} against the other four factions, every rival a computer pilot, with a computer teammate in any frame nobody flies. Played in one sitting: online results aren't kept.`),
      );
      if (g.onlineStatus) col.append(h('p.status', g.onlineStatus));
      col.append(list);
      m.root.append(h('div.shade'), m.panes(col), m.footer(SELECT, CHANGE, HANGAR, BACK));
    },
    press(m, key) {
      if (key === 'y') {
        g.openOnlineHangar();
        return true;
      }
      return false;
    },
  });
}

function versus(ev: GpEvent, rival: number): HTMLElement {
  return h('div.versus', emblem(ev.faction), h('span', factionName(LIVERIES[ev.faction])), h('b', 'vs'), h('span', factionName(LIVERIES[rival])), emblem(rival));
}

/** The room's screen when the room is a squad's Grand Prix. */
export function renderGpRoom(m: Menus, g: Game, v: LobbyView): void {
  const o = g.online;
  const ev = v.gp!;
  const me = v.players.find((p) => p.pid === o.pid);
  const cup = ev.kind === 'cup';
  const context = `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]} · ${factionName(LIVERIES[ev.faction])} · online`;
  const col = h('div.col.briefing');
  const list = h('div.list');
  const r = ev.rounds[Math.min(ev.current, ev.rounds.length - 1)];
  let side: HTMLElement;
  const footer: Prompt[] = [SELECT, LEAVE];

  if (v.phase === 'lobby' || v.phase === 'countdown') {
    // The round's briefing: who you race and where, your squad's frames, ready up.
    footer.splice(1, 0, HANGAR);
    col.append(h('div.context', context), h('h1', `Round ${yourRoundNumber(ev)} of ${playedRounds(ev)}`));
    if (r.you) col.append(versus(ev, r.you.b), h('p', `${circuitName(r.circuit)}. ${cup ? 'A single race.' : 'Best of 3.'} ${TRACK_BLURBS[r.circuit] ?? ''}`));
    const waiting = v.players.filter((p) => p.side === 0 && p.connected && !p.ready).length;
    const status = v.phase === 'countdown' ? `Starting in ${Math.max(0, v.timer)}` : me && !me.ready ? 'Ready up to start' : waiting ? `Waiting for ${waiting} to ready up` : 'Starting…';
    col.append(h('p.status', status));
    // Your squad's three frames: who has locked each in, who has picked it,
    // or the computer teammate who flies it. Pick a row to fly that frame.
    const seats = h('div.seats');
    const caller = v.sides[0].caller;
    for (const role of ROLES) {
      const here = v.players.filter((p) => p.side === 0 && p.role === role);
      const locked = here.find((p) => p.ready);
      const mine = here.some((p) => p.pid === o.pid);
      const clash = here.length > 1 && !locked;
      const badges = h('span.badges');
      for (const p of here) if (caller === p.pid) badges.append(h('span.badge.caller', 'Shot caller'));
      if (mine) badges.append(h('span.badge.you', 'You'));
      const status = locked ? (here.length > 1 ? `Locked in by ${locked.callsign}` : 'Locked in') : clash ? 'Same frame' : here.length ? (here[0].connected ? 'Picking' : 'Reconnecting') : '';
      const row = h(
        'div.seat' + (mine ? '.mine' : '') + (here.length ? '' : '.cpu') + (clash ? '.clash' : ''),
        h('span.role', SHORT[role]),
        face(ev.faction, role, (locked ?? here[0])?.portrait ?? -1),
        h('span.who', h('b', here.length ? here.map((p) => p.callsign).join(', ') : LIVERIES[ev.faction].pilots[role]), badges, h('small', `${LIVERIES[ev.faction].models[role]}${here.length ? '' : ', computer teammate'}`)),
        h('span.state' + (locked ? '.ready' : ''), status),
      );
      m.addItem(seats, row, () => {
        if (mine) return m.toast(me?.ready ? 'Your frame, locked in' : 'Your pick: Ready locks it in');
        if (me?.ready) return m.toast("You're locked in: press Not ready to change your frame");
        o.sendRoom('pick', { role });
      }, undefined, { key: `seat-0-${role}` });
    }
    col.append(seats);
    if (me && me.side === 0) {
      const taken = !me.ready ? v.players.find((p) => p.side === 0 && p.role === me.role && p.ready && p.pid !== me.pid) : undefined;
      m.button(list, me.ready ? 'Not ready' : 'Ready', () => o.sendRoom('ready', { ready: !me.ready }), {
        key: 'ready',
        go: !me.ready && !taken,
        note: me.ready ? 'Your frame is locked in' : taken ? undefined : 'Locks in your frame',
        locked: taken ? `${taken.callsign} has locked in the ${LIVERIES[ev.faction].models[me.role]}: pick another frame` : null,
      });
      const everyone = v.players.filter((p) => p.side >= 0 && p.connected);
      if (v.host === o.pid && v.phase === 'lobby' && everyone.length > 0 && everyone.every((p) => p.ready)) m.button(list, 'Start now', () => o.sendRoom('start'), { key: 'start', go: true });
      // Two of you and a computer teammate: one of you gives it its orders.
      if (v.players.filter((p) => p.side === 0).length === 2) {
        if (caller === o.pid) m.button(list, 'Pass shot calling', () => o.sendRoom('caller', { action: 'pass' }), { key: 'caller', note: 'You give the computer teammate its orders' });
        else if (v.callerAsks[0] === o.pid) m.button(list, 'Cancel ask', () => o.sendRoom('caller', { action: 'cancel' }), { key: 'caller', note: 'Waiting for an answer' });
        else m.button(list, 'Ask for shot calling', () => o.sendRoom('caller', { action: 'ask' }), { key: 'caller', note: `${v.players.find((p) => p.pid === caller)?.callsign ?? 'Your teammate'} gives the computer teammate its orders` });
      }
    }
    side = h('div.panel.standings', h('h2', ev.current > 0 ? `Standings after ${cup ? 'round' : 'matchday'} ${ev.current}` : 'Standings'), gpTable(ev, ev.current - 1));
  } else if (v.phase === 'standings') {
    // After the squad's match (or a matchday off): the round's results and the table.
    const ready = roundComplete(ev, ev.current);
    const last = ev.current >= ev.rounds.length - 1;
    col.className = 'col standings-screen';
    col.append(h('div.context', context), h('h1', r.you ? (cup ? `After round ${ev.current + 1}` : `After matchday ${ev.current + 1}`) : `Matchday ${ev.current + 1}`));
    if (!r.you) col.append(h('p', 'Your squad sits this one out. The other four race; their results go on the table.'));
    const fx = h('div.fixtures');
    for (const f of r.you ? [r.you, ...r.others] : r.others) fx.append(fixtureLine(f, ev));
    col.append(fx);
    const racers = v.players.filter((p) => p.side >= 0 && p.connected);
    const done = v.continued.includes(o.pid);
    const next = last ? 'The final standings' : 'The next round';
    col.append(h('p.status', ready ? `${next} in ${Math.max(0, v.timer)}: ${v.continued.length} of ${racers.length} ready` : 'Waiting for the other races…'));
    m.button(list, done ? 'Waiting for your squad…' : ready ? (last ? 'Final standings' : 'Continue') : 'Waiting for the other races…', () => (ready && !done ? o.sendRoom('continue', { at: 'standings' }) : m.toast(ready ? 'Waiting for the rest of your squad' : 'The other races are still running')), { key: 'go', go: ready && !done });
    side = h('div.panel.standings', h('h2', 'Standings'), gpTable(ev, ev.current));
  } else if (v.phase === 'award') {
    const place = finalPlace(ev);
    col.className = 'col gp-award';
    col.append(h('div.context', `${eventName(ev)} · online`), ...awardLines(ev, place, cup ? medalFor(place) : null));
    m.button(list, 'Back to Online', () => g.leaveRoom(), { key: 'done', go: true, note: 'Online results are not kept' });
    side = h('div.panel.standings', h('h2', 'Final standings'), gpTable(ev, ev.rounds.length - 1));
  } else {
    // The match is under way (you are here between rounds, or arrived mid-match).
    col.append(h('div.context', context), h('h1', `Round ${yourRoundNumber(ev)} of ${playedRounds(ev)}`));
    if (r.you) col.append(versus(ev, r.you.b));
    col.append(h('p', me?.nextRound ? 'Your squad is racing: you join from the next round.' : 'Back in a moment.'));
    side = h('div.panel.standings', h('h2', 'Standings'), gpTable(ev, ev.current - 1));
  }
  if (v.phase !== 'award') m.button(list, 'Leave the Grand Prix', () => g.confirmLeaveRoom(), { key: 'leave' });
  col.append(list);
  m.root.append(h('div.shade.full'), m.panes(col, side), m.footer(...footer));
}
