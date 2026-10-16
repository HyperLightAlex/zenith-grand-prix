// Online: the hub (your squad in the hangar's bays, rooms by code) and the
// room's lobby (two teams of three seats, the host's settings, ready marks).

import { ROLE, ROLE_NAMES, TRACKS, type Role } from '../../../sim/index';
import { MATCH_FORMATS, SKILL_NAMES, type LobbyPlayer, type LobbyView } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, pilotUrl } from '../factionArt';
import type { Menus } from '../menus';
import { BACK, SELECT, confirmDialog, type DialogData } from './common';

const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];
const SHORT = ['FW', 'MF', 'DF'];

function face(f: number, role: Role, cpu = false): HTMLElement {
  const el = h('i.face' + (cpu ? '.cpu' : ''));
  if (!cpu) el.style.backgroundImage = `url(${pilotUrl(f, role)})`;
  return el;
}

function emblem(f: number): HTMLElement {
  const el = h('i.emb');
  el.style.backgroundImage = `url(${emblemUrl(f)})`;
  return el;
}

/** The invite: the code large enough to read out, and the link to copy. */
export function inviteDialog(m: Menus, g: Game, kind: 'room' | 'squad', code: string): void {
  const link = g.online.link(kind, code);
  const text = h(
    'div.invite',
    h('div.code', code),
    h('p', kind === 'room' ? 'Friends enter this code under Online, Join room, or open the link.' : 'Friends enter this code under Online, Join a squad, or open the link.'),
    h('div.link', link),
  );
  m.push<DialogData>('dialog', {
    title: kind === 'room' ? 'Invite to this room' : 'Invite to your squad',
    text,
    options: [
      {
        label: 'Copy link',
        go: true,
        run: () => {
          void navigator.clipboard?.writeText(link).then(
            () => m.toast('Link copied'),
            () => m.toast('Copying is blocked here: read out the code instead'),
          );
        },
      },
      { label: 'Close', run: () => m.pop() },
    ],
  });
}

export function registerOnline(m: Menus, g: Game): void {
  m.register('online', {
    render(m) {
      const o = g.online;
      const col = h('div.col.online');
      const list = h('div.list');
      col.append(h('div.context', 'Online'), h('h1', 'Online'));
      if (!o.available) {
        col.append(h('p', 'Online play needs the game opened from its server, not this saved copy. Open it from the address you were given.'));
        m.root.append(h('div.shade'), col, m.footer(BACK));
        return;
      }
      if (g.onlineStatus) col.append(h('p.status', g.onlineStatus));
      // The squad: your bays.
      const sq = o.squadView;
      const lead = o.leading;
      const bays = h('div.bays');
      const members = sq?.members ?? [];
      const faction = sq ? sq.faction : g.loadout.team;
      for (let i = 0; i < 3; i++) {
        const mem = members[i];
        if (!mem && i === 0 && !sq) {
          bays.append(h('div.bay-card.me', h('span.tag', 'Bay 1'), face(faction, g.loadout.role), h('b', g.callsign || 'You'), h('small', `${LIVERIES[faction].models[g.loadout.role]}, ${ROLE_NAMES[g.loadout.role].toLowerCase()}`)));
          continue;
        }
        if (!mem) {
          bays.append(h('div.bay-card.empty', h('span.tag', `Bay ${i + 1}`), h('b', 'Free'), h('small', 'Invite a friend to your squad')));
          continue;
        }
        const me = mem.pid === o.squadPid;
        const tags = [mem.pid === sq?.leader ? 'Leader' : '', me ? 'You' : '', mem.connected ? '' : 'Reconnecting'].filter(Boolean).join(' · ');
        bays.append(h('div.bay-card' + (me ? '.me' : ''), h('span.tag', `Bay ${i + 1}`), face(faction, mem.role), h('b', mem.callsign), h('small', `${LIVERIES[faction].models[mem.role]}, ${ROLE_NAMES[mem.role].toLowerCase()}`), tags ? h('em', tags) : ''));
      }
      const clash = members.length > 1 && new Set(members.map((x) => x.role)).size !== members.length;
      const follow = !lead ? "Your squad's leader takes the squad into rooms" : null;
      m.button(list, 'Create room', () => void g.createRoom(), { key: 'create', go: true, locked: follow });
      m.button(list, 'Join room', () => g.askRoomCode(), { key: 'join', locked: follow });
      m.button(list, 'Invite to squad', () => void g.inviteToSquad(), { key: 'invite' });
      m.button(list, 'Join a squad', () => g.askSquadCode(), { key: 'joinsquad' });
      if (clash && lead) m.button(list, 'Sort frames', () => o.sendSquad('sortFrames'), { key: 'sort', note: 'Two of you fly the same frame' });
      if (sq && members.length > 1) m.button(list, 'Leave squad', () => void g.leaveSquad(), { key: 'leavesquad' });
      m.button(list, `Callsign: ${g.callsign || '(none)'}`, () => g.askCallsign(() => m.refresh()), { key: 'callsign' });
      col.append(list);
      if (clash) col.append(h('div.match-blurb', lead ? 'Two of you fly the same frame: Sort frames gives everyone a different one, keeping first choices where it can.' : 'Two of you fly the same frame: change yours in the hangar, or your leader can sort them.'));
      const panel = h('div.panel.squad', h('h2', sq && members.length > 1 ? `Your squad · ${factionName(LIVERIES[faction])}` : 'Your squad'), bays);
      if (sq) panel.append(h('div.match-blurb', `Squad code ${sq.code}. ${lead ? 'You lead: you pick the faction and take everyone into rooms.' : 'Your leader picks the faction and takes everyone into rooms.'}`));
      m.root.append(h('div.shade'), col, panel, m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, BACK));
    },
    press(m, key) {
      if (key === 'y') {
        g.openOnlineHangar();
        return true;
      }
      return false;
    },
    back: () => g.leaveOnline(),
  });

  m.register('room', {
    initialFocus: 'ready',
    render(m) {
      const o = g.online;
      const v = o.lobby;
      if (!v) {
        m.root.append(h('div.shade'), h('div.col', h('h1', 'Room'), h('p', g.onlineStatus || 'Joining…')), m.footer(BACK));
        return;
      }
      const me = v.players.find((p) => p.pid === o.pid);
      const byPid = new Map(v.players.map((p) => [p.pid, p] as [string, LobbyPlayer]));
      const host = v.host === o.pid;
      const inMatch = v.phase === 'race' || v.phase === 'results' || v.phase === 'final';
      const top = h('div.roombar', h('b', `Room ${v.code}`), h('span', phaseText(v, me)), h('span', `Host: ${byPid.get(v.host ?? '')?.callsign ?? '–'}`));
      const sides = h('div.sides');
      const list = h('div.list.actions');
      // Team by team in the highlight order: the team's name (its faction:
      // its captain or the host changes it), then its seats.
      for (let side = 0; side < 2; side++) {
        const s = v.sides[side];
        const colEl = h('div.side' + (side ? '.t1' : ''));
        sides.append(colEl);
        const captain = byPid.get(s.captain ?? '');
        const mayPick = host || s.captain === o.pid;
        const why = inMatch ? 'Factions change between matches' : mayPick ? null : captain ? `${captain.callsign}, this team's captain, or the host picks its faction` : "The host picks this team's faction";
        const step = (dir: number) => {
          const n = LIVERIES.length;
          let f = (s.faction + dir + n) % n;
          if (f === v.sides[1 - side].faction) f = (f + dir + n) % n;
          o.sendRoom('faction', { faction: f, side });
        };
        const head = h(
          'div.side-head' + (why ? '' : '.pick'),
          emblem(s.faction),
          h('b', h('i.arrow', '‹'), factionName(LIVERIES[s.faction]), h('i.arrow', '›')),
          h('span', captain ? `Captain: ${captain.callsign}` : 'Computer pilots'),
        );
        m.addItem(colEl, head, () => step(1), (dir) => step(dir), { key: `faction-${side}`, locked: why });
        const seats = h('div.seats');
        colEl.append(seats);
        for (const role of ROLES) {
          const who = byPid.get(s.seats[role] ?? '');
          const mine = !!who && who.pid === o.pid;
          const status = who ? statusOf(v, who) : s.held[role] ? 'Held for a squad' : '';
          const badges = h('span.badges');
          if (who && v.host === who.pid) badges.append(h('span.badge', 'Host'));
          if (who && s.caller === who.pid) badges.append(h('span.badge.caller', 'Shot caller'));
          if (mine) badges.append(h('span.badge.you', 'You'));
          const row = h(
            'div.seat' + (mine ? '.mine' : '') + (who ? '' : '.cpu'),
            h('span.role', SHORT[role]),
            face(s.faction, role, !who),
            h('span.who', h('b', who ? who.callsign : 'Computer'), badges, h('small', who ? `${who.ping ? who.ping + ' ms' : ''}` : SKILL_NAMES[v.settings.skill])),
            h('span.state' + (who?.ready ? '.ready' : ''), status),
          );
          m.addItem(seats, row, () => {
            if (mine) return m.toast('Your seat');
            const swap = () => {
              if (inMatch) return m.toast('Seats change between matches');
              o.sendRoom('seat', { side, role });
              if (who) m.toast(`Asked ${who.callsign} to swap`);
            };
            // The host can also remove someone from the room.
            if (who && host) {
              m.push<DialogData>('dialog', {
                title: who.callsign,
                options: [
                  { label: 'Ask to swap seats', go: true, run: () => (m.pop(), swap()) },
                  { label: `Remove ${who.callsign} from the room`, run: () => (m.pop(), confirmDialog(m, `Remove ${who.callsign}?`, 'They cannot come back to this room.', 'Remove', () => o.sendRoom('kick', { pid: who.pid }))) },
                  { label: 'Cancel', run: () => m.pop() },
                ],
              });
              return;
            }
            swap();
          }, () => m.focus(`seat-${1 - side}-${role}`), { key: `seat-${side}-${role}` });
        }
      }
      // The settings: the host changes them, everyone sees them.
      const settings = h('div.list.settings');
      const lockSet = host ? null : 'Only the host changes the settings';
      const ti = Math.max(0, TRACKS.findIndex((t) => t.id === v.settings.track));
      m.choice(settings, 'Circuit', TRACKS[ti].name, (dir) => o.sendRoom('settings', { track: TRACKS[(ti + dir + TRACKS.length) % TRACKS.length].id }), { key: 'track', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      m.choice(settings, 'Format', MATCH_FORMATS[v.settings.match]?.label ?? '', (dir) => o.sendRoom('settings', { match: (v.settings.match + dir + MATCH_FORMATS.length) % MATCH_FORMATS.length }), { key: 'match', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      m.choice(settings, 'Computer pilots', SKILL_NAMES[v.settings.skill], (dir) => o.sendRoom('settings', { skill: (v.settings.skill + dir + 3) % 3 }), { key: 'skill', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      // Actions.
      if (!inMatch && me && me.side >= 0) {
        m.button(list, me.ready ? 'Not ready' : 'Ready', () => o.sendRoom('ready', { ready: !me.ready }), { key: 'ready', go: !me.ready });
        const everyone = v.players.filter((p) => p.side >= 0 && p.connected);
        if (host && everyone.length > 0 && everyone.every((p) => p.ready)) m.button(list, 'Start now', () => o.sendRoom('start'), { key: 'start', go: true });
        const mySide = v.sides[me.side];
        const people = v.players.filter((p) => p.side === me.side);
        if (people.length === 2) {
          if (mySide.caller === o.pid) {
            m.button(list, 'Pass shot calling', () => o.sendRoom('caller', { action: 'pass' }), { key: 'caller', note: 'You give the computer pilot its orders' });
          } else if (v.callerAsks[me.side] === o.pid) {
            m.button(list, 'Cancel ask', () => o.sendRoom('caller', { action: 'cancel' }), { key: 'caller', note: 'Waiting for an answer' });
          } else {
            m.button(list, 'Ask for shot calling', () => o.sendRoom('caller', { action: 'ask' }), { key: 'caller', note: `${byPid.get(mySide.caller ?? '')?.callsign ?? 'Your teammate'} gives the computer pilot its orders` });
          }
        }
      }
      m.button(list, 'Invite', () => inviteDialog(m, g, 'room', v.code), { key: 'invite' });
      if (host && inMatch) m.button(list, 'End match for everyone', () => confirmDialog(m, 'End the match?', 'Everyone goes back to the lobby.', 'End match', () => o.sendRoom('endMatch')), { key: 'end' });
      m.button(list, 'Leave room', () => g.confirmLeaveRoom(), { key: 'leave' });
      const panel = h('div.panel.settings-panel', h('h2', host ? 'Room settings: yours to change' : 'Room settings, changed by the host'), settings);
      const extra: HTMLElement[] = [];
      if (inMatch) {
        const mt = v.match;
        const score = mt ? (mt.cfg.mode === 'series' ? `${mt.wins[0]}–${mt.wins[1]}` : `${mt.totals[0]}–${mt.totals[1]}`) : '';
        extra.push(h('div.matchcard', h('b', `Match under way${mt ? `: round ${mt.rounds.length + (v.phase === 'race' ? 1 : 0)}` : ''}`), h('span', `${factionName(LIVERIES[v.sides[0].faction])} ${score} ${factionName(LIVERIES[v.sides[1].faction])}`), h('small', me?.nextRound ? 'You race from the next round.' : 'Back in a moment.')));
      }
      if (!inMatch) extra.push(h('div.room-hint', `Pick an empty seat to move into it, on either team, or a player's seat to ask them to swap.${host ? " As host you set both teams' factions: pick a team's name." : me && me.side >= 0 && v.sides[me.side].captain === o.pid ? " As your team's captain you set its faction: pick its name." : ''}`));
      const col = h('div.room', top, sides, ...extra, h('div.bottom', panel, h('div.panel.actions-panel', list)));
      m.root.append(h('div.shade.full'), col, m.footer(SELECT, { pad: 'X', keys: 'X', label: 'Seats', press: 'x' }, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, { pad: 'B', keys: 'Esc', label: 'Leave', press: 'back' }));
    },
    press(m, key) {
      const o = g.online;
      const v = o.lobby;
      const me = v?.players.find((p) => p.pid === o.pid);
      if (key === 'x' && me && me.side >= 0) {
        m.focus(`seat-${me.side}-${me.role}`);
        return true;
      }
      if (key === 'y') {
        g.openRoomHangar();
        return true;
      }
      if ((key === 'lb' || key === 'rb') && me) {
        const k = m.selectedKey;
        const mm = /^seat-(\d)-(\d)$/.exec(k);
        if (mm) m.focus(`seat-${1 - Number(mm[1])}-${mm[2]}`);
        else m.focus(`seat-${key === 'lb' ? 0 : 1}-0`);
        return true;
      }
      return false;
    },
    back: () => g.confirmLeaveRoom(),
  });
}

function statusOf(v: LobbyView, p: LobbyPlayer): string {
  if (!p.connected) return 'Reconnecting';
  if (p.nextRound) return 'Next round';
  if (v.phase === 'race' && p.autopilot) return 'Paused';
  if (v.phase === 'results' || v.phase === 'final') return v.continued.includes(p.pid) ? 'Continued' : '';
  if (v.phase === 'race') return 'Racing';
  return p.ready ? 'Ready' : 'Not ready';
}

function phaseText(v: LobbyView, me: LobbyPlayer | undefined): string {
  switch (v.phase) {
    case 'countdown':
      return `Starting in ${Math.max(0, v.timer)}`;
    case 'race':
      return 'Race under way';
    case 'results':
      return `Next round in ${Math.max(0, v.timer)}`;
    case 'final':
      return `Back to the lobby in ${Math.max(0, v.timer)}`;
    default: {
      const waiting = v.players.filter((p) => p.side >= 0 && p.connected && !p.ready).length;
      if (me && !me.ready) return 'Ready up to start';
      return waiting ? `Waiting for ${waiting} to ready up` : 'Starting…';
    }
  }
}
