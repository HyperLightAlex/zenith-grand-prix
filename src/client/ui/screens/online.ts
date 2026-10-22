// Online: the hub (your squad in the hangar's bays, rooms by code) and the
// room's lobby (two teams of three seats, the host's settings, ready marks;
// or set to a Sprint, the six places in one column, every pilot for
// themselves).

import { ROLE, ROLE_NAMES, TRACKS, standings, type Role } from '../../../sim/index';
import { MATCH_FORMATS, PILOT_COLOUR_NAMES, ROOM_SIZE, SKILL_NAMES, SPRINT_FORMATS, portraitColour, type LobbyPlayer, type LobbyView } from '../../../net/protocol';
import { customName } from '../../../custom/mechBuild';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import { MODE_NAMES, SPRINT_TAGLINE, type Menus } from '../menus';
import { colourCss } from '../sides';
import { BACK, SELECT, confirmDialog, type DialogData } from './common';
import { openCustom } from './custom';
import { gpBlocked, renderGpRoom } from './onlineGp';

const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];
const SHORT = ['FW', 'MF', 'DF'];

/** A seat's face: a person's own portrait, or (at -1) the faction's pilot for the seat. */
export function face(f: number, role: Role, portrait = -1): HTMLElement {
  const el = h('i.face');
  el.style.backgroundImage = `url(${faceUrl(f, role, portrait)})`;
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
        m.root.append(h('div.shade'), m.panes(col), m.footer(BACK));
        return;
      }
      if (g.onlineStatus) col.append(h('p.status', g.onlineStatus));
      // The squad: its three positions, each with whoever has it.
      const sq = o.squadView;
      const lead = o.leading;
      const members = sq?.members ?? [];
      const faction = sq ? sq.faction : g.loadout.team;
      const follow = !lead ? "Your squad's leader takes the squad into rooms" : null;
      m.button(list, 'Create room', () => void g.createRoom(), { key: 'create', go: true, locked: follow });
      m.button(list, 'Join room', () => g.askRoomCode(), { key: 'join', locked: follow });
      // Always there; open to a squad of two or three, from its leader.
      const gpWhy = gpBlocked(g);
      m.button(list, 'Grand Prix', () => g.openOnlineGp(), { key: 'gp', locked: gpWhy, hint: gpWhy ?? 'A cup or a season together, against computer pilots' });
      // Invite while there is an open position; join someone else's squad only while on your own.
      if (members.length < 3) m.button(list, 'Invite to squad', () => void g.inviteToSquad(), { key: 'invite' });
      if (members.length <= 1) m.button(list, 'Join a squad', () => g.askSquadCode(), { key: 'joinsquad' });
      if (members.length > 1) m.button(list, 'Leave squad', () => void g.leaveSquad(), { key: 'leavesquad' });
      m.button(list, `Callsign: ${g.callsign || '(none)'}`, () => g.askCallsign(() => m.refresh()), { key: 'callsign' });
      col.append(list);
      // Each of the squad, with the frame they picked. Two of a frame is
      // shown, not refused: Ready sorts it out in a room.
      const bays = h('div.bays');
      const people = sq ? members : [{ pid: '', callsign: g.pilotName, portrait: g.portrait, role: g.loadout.role, connected: true }];
      for (let i = 0; i < 3; i++) {
        const mem = people[i];
        const tag = h('span.tag', `Bay ${i + 1}`);
        if (!mem) {
          bays.append(h('div.bay-card.empty', tag, h('i.face'), h('b', 'Free'), h('small', 'Invite a friend to your squad')));
          continue;
        }
        const me = !sq || mem.pid === o.squadPid;
        const role = me ? g.loadout.role : mem.role;
        const same = people.filter((x) => x !== mem && (x.pid === o.squadPid || !sq ? g.loadout.role : x.role) === role).map((x) => x.callsign);
        const tags = [sq && mem.pid === sq.leader && members.length > 1 ? 'Leader' : '', me ? 'You' : '', mem.connected ? '' : 'Reconnecting'].filter(Boolean).join(' · ');
        bays.append(
          h(
            'div.bay-card' + (me ? '.me' : '') + (same.length ? '.clash' : ''),
            tag,
            face(faction, role, mem.portrait),
            h('b', mem.callsign),
            h('small', `${LIVERIES[faction].models[role]}, ${ROLE_NAMES[role].toLowerCase()}`),
            same.length ? h('em.clash', `Same frame as ${same.join(' and ')}`) : tags ? h('em', tags) : '',
          ),
        );
      }
      const panel = h('div.panel.squad', h('h2', members.length > 1 ? `Your squad · ${factionName(LIVERIES[faction])}` : 'Your squad'), bays);
      if (sq) panel.append(h('div.match-blurb', members.length > 1 ? `Squad code ${sq.code}. Pick your frame in the hangar (Y); in a room, Ready locks it in. ${lead ? 'You lead: you pick the faction and take everyone into rooms.' : 'Your leader picks the faction and takes everyone into rooms.'}` : `Squad code ${sq.code}. Invite friends to fly with you: a squad stays together on one team.`));
      m.root.append(h('div.shade'), m.panes(col, panel), m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, BACK));
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
    // A Grand Prix room moves on by itself: each stage starts on its own button.
    stage() {
      const v = g.online.lobby;
      if (!v?.gp) return null;
      const phase = v.phase === 'countdown' ? 'lobby' : v.phase;
      const focus = phase === 'lobby' ? 'ready' : phase === 'standings' ? 'go' : phase === 'award' ? 'done' : 'leave';
      return { id: `${phase}:${v.gp.current}`, focus };
    },
    render(m) {
      const o = g.online;
      const v = o.lobby;
      if (!v) {
        m.root.append(h('div.shade'), m.panes(h('div.col', h('h1', 'Room'), h('p', g.onlineStatus || 'Joining…'))), m.footer(BACK));
        return;
      }
      if (v.gp) return renderGpRoom(m, g, v);
      if (v.settings.mode === 'sprint') return renderSprintRoom(m, g, v);
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
          h('b', h('i.arr.l', '‹'), factionName(LIVERIES[s.faction]), h('i.arr.r', '›')),
          h('span', captain ? `Captain: ${captain.callsign}` : 'Computer pilots'),
        );
        m.addItem(colEl, head, () => step(1), (dir) => step(dir), { key: `faction-${side}`, locked: why });
        // The team's three frames: who has locked each in, who has picked
        // it, or the computer pilot who flies it. Pick a row to fly that
        // frame (on the other team, it moves you there if it has room).
        const seats = h('div.seats');
        colEl.append(seats);
        const team = v.players.filter((p) => p.side === side);
        const full = side !== me?.side && team.length + s.held >= 3;
        for (const role of ROLES) {
          const here = team.filter((p) => p.role === role);
          const locked = here.find((p) => p.ready);
          const mine = here.some((p) => p.pid === o.pid);
          const clash = here.length > 1 && !locked;
          const names = here.length ? here.map((p) => p.callsign).join(', ') : LIVERIES[s.faction].pilots[role];
          const badges = h('span.badges');
          for (const p of here) {
            if (v.host === p.pid) badges.append(h('span.badge', 'Host'));
            if (s.caller === p.pid) badges.append(h('span.badge.caller', 'Shot caller'));
          }
          if (mine) badges.append(h('span.badge.you', 'You'));
          let status: string;
          if (inMatch) status = here.length ? statusOf(v, here[0]) : '';
          else if (locked) status = here.length > 1 ? `Locked in by ${locked.callsign}` : 'Locked in';
          else if (clash) status = 'Same frame';
          else if (here.length) status = here[0].connected ? 'Picking' : 'Reconnecting';
          else status = '';
          const ping = here.length === 1 && here[0].ping ? `${here[0].ping} ms` : '';
          const row = h(
            'div.seat' + (mine ? '.mine' : '') + (here.length ? '' : '.cpu') + (clash ? '.clash' : ''),
            h('span.role', SHORT[role]),
            face(s.faction, role, (locked ?? here[0])?.portrait ?? -1),
            h('span.who', h('b', names), badges, h('small', `${LIVERIES[s.faction].models[role]}${here.length ? (ping ? `, ${ping}` : '') : `, ${SKILL_NAMES[v.settings.skill]} computer pilot`}`)),
            h('span.state' + (locked ? '.ready' : ''), status),
          );
          const others = here.filter((p) => p.pid !== o.pid);
          m.addItem(seats, row, () => {
            if (inMatch) return m.toast('Frames change between matches');
            const pick = () => {
              if (me?.ready && (side !== me.side || role !== me.role)) return m.toast("You're locked in: press Not ready to change your frame");
              if (side === me?.side) o.sendRoom('pick', { role });
              else if (full) m.toast('That team is full');
              else o.sendRoom('team', { side, role });
            };
            // The host can also remove someone from the room.
            if (host && others.length) {
              m.push<DialogData>('dialog', {
                title: `${SHORT[role]} · ${LIVERIES[s.faction].models[role]}`,
                options: [
                  ...(mine ? [] : [{ label: 'Fly this frame', go: true, run: () => (m.pop(), pick()) }]),
                  ...others.map((p) => ({ label: `Remove ${p.callsign} from the room`, run: () => (m.pop(), confirmDialog(m, `Remove ${p.callsign}?`, 'They cannot come back to this room.', 'Remove', () => o.sendRoom('kick', { pid: p.pid }))) })),
                  { label: 'Cancel', run: () => m.pop() },
                ],
              });
              return;
            }
            if (mine) return m.toast(me?.ready ? 'Your frame, locked in' : 'Your pick: Ready locks it in');
            pick();
          }, () => m.focus(`seat-${1 - side}-${role}`), { key: `seat-${side}-${role}` });
        }
      }
      // The settings: the host changes them, everyone sees them.
      const settings = h('div.list.settings');
      const lockSet = host ? null : 'Only the host changes the settings';
      const ti = Math.max(0, TRACKS.findIndex((t) => t.id === v.settings.track));
      g.circuitAhead(TRACKS[ti].id);
      modeChoice(m, g, v, settings, lockSet ?? (inMatch ? 'Not during a match' : null));
      m.choice(settings, 'Circuit', TRACKS[ti].name, (dir) => o.sendRoom('settings', { track: TRACKS[(ti + dir + TRACKS.length) % TRACKS.length].id }), { key: 'track', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      m.choice(settings, 'Format', MATCH_FORMATS[v.settings.match]?.label ?? '', (dir) => o.sendRoom('settings', { match: (v.settings.match + dir + MATCH_FORMATS.length) % MATCH_FORMATS.length }), { key: 'match', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      m.choice(settings, 'Computer pilots', SKILL_NAMES[v.settings.skill], (dir) => o.sendRoom('settings', { skill: (v.settings.skill + dir + 3) % 3 }), { key: 'skill', locked: lockSet ?? (inMatch ? 'Not during a match' : null) });
      // Actions.
      if (!inMatch && me && me.side >= 0) {
        // Ready locks your frame in, unless a teammate already has.
        const taken = !me.ready ? v.players.find((p) => p.side === me.side && p.role === me.role && p.ready && p.pid !== me.pid) : undefined;
        m.button(list, me.ready ? 'Not ready' : 'Ready', () => o.sendRoom('ready', { ready: !me.ready }), {
          key: 'ready',
          go: !me.ready && !taken,
          note: me.ready ? 'Your frame is locked in' : taken ? undefined : 'Locks in your frame',
          locked: taken ? `${taken.callsign} has locked in the ${LIVERIES[v.sides[me.side].faction].models[me.role]}: pick another frame` : null,
        });
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
      if (!inMatch) extra.push(h('div.room-hint', `Pick a frame on either team to fly it; Ready locks it in, and the first to lock a frame keeps it.${host ? " As host you set both teams' factions: pick a team's name." : me && me.side >= 0 && v.sides[me.side].captain === o.pid ? " As your team's captain you set its faction: pick its name." : ''}`));
      const col = h('div.room', top, sides, ...extra, h('div.bottom', panel, h('div.panel.actions-panel', list)));
      m.root.append(h('div.shade.full'), m.panes(col), m.footer(SELECT, { pad: 'X', keys: 'X', label: 'Your frame', press: 'x' }, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, { pad: 'B', keys: 'Esc', label: 'Leave', press: 'back' }));
    },
    press(m, key) {
      const o = g.online;
      const v = o.lobby;
      const me = v?.players.find((p) => p.pid === o.pid);
      if (v?.settings.mode === 'sprint' && !v.gp) {
        if (key === 'x' && me) m.focus(`pilot-${me.pid}`);
        else if (key === 'y') m.push('pilot');
        else return false;
        return true;
      }
      if (key === 'x' && me && me.side >= 0) {
        m.focus(`seat-${me.side}-${me.role}`);
        return true;
      }
      if (key === 'y') {
        g.openRoomHangar();
        return true;
      }
      if ((key === 'lb' || key === 'rb') && me && !v?.gp) {
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

function statusOf(v: LobbyView, p: LobbyPlayer, sprint = false): string {
  if (!p.connected) return 'Reconnecting';
  if (p.nextRound) return sprint ? 'Next Sprint' : 'Next round';
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
      return `Next ${v.settings.mode === 'sprint' ? 'race' : 'round'} in ${Math.max(0, v.timer)}`;
    case 'final':
      return `Back to the lobby in ${Math.max(0, v.timer)}`;
    default: {
      const waiting = v.players.filter((p) => p.side >= 0 && p.connected && !p.ready).length;
      if (me && !me.ready) return 'Ready up to start';
      return waiting ? `Waiting for ${waiting} to ready up` : 'Starting…';
    }
  }
}

/** The room's mode (team race or Sprint): the host's to change, between matches. */
function modeChoice(m: Menus, g: Game, v: LobbyView, list: HTMLElement, locked: string | null): void {
  const sprint = v.settings.mode === 'sprint';
  m.choice(list, 'Mode', MODE_NAMES[v.settings.mode], () => g.online.sendRoom('settings', { mode: sprint ? 'teams' : 'sprint' }), { key: 'mode', locked });
}

/**
 * A room set to a Sprint: six Forwards, every pilot for themselves. Its six
 * places in one column: each person in their colour, flying their own
 * Forward, and a computer pilot in each place left. No teams, factions or
 * frames to pick; Ready is just ready.
 */
function renderSprintRoom(m: Menus, g: Game, v: LobbyView): void {
  const o = g.online;
  const me = v.players.find((p) => p.pid === o.pid);
  const byPid = new Map(v.players.map((p) => [p.pid, p] as [string, LobbyPlayer]));
  const host = v.host === o.pid;
  const inMatch = v.phase === 'race' || v.phase === 'results' || v.phase === 'final';
  const top = h('div.roombar', h('b', `Room ${v.code}`), h('span', phaseText(v, me)), h('span', `Host: ${byPid.get(v.host ?? '')?.callsign ?? '–'}`));
  const seats = h('div.seats');
  const col = h('div.side.sprint', h('div.side-head', h('b', 'Sprint'), h('span', SPRINT_TAGLINE)), seats);
  const people = v.players.filter((p) => p.side >= 0);
  for (const p of people) {
    const mine = p.pid === o.pid;
    const colour = p.colour >= 0 ? p.colour : portraitColour(p.portrait);
    const badges = h('span.badges');
    if (v.host === p.pid) badges.append(h('span.badge', 'Host'));
    if (mine) badges.append(h('span.badge.you', 'You'));
    const status = inMatch ? statusOf(v, p, true) : p.ready ? 'Ready' : p.connected ? 'Not ready' : 'Reconnecting';
    const ping = p.ping ? `, ${p.ping} ms` : '';
    const mech = mine ? customName(ROLE.FW, g.customMech(ROLE.FW)) : 'Their own Forward';
    const row = h(
      'div.seat' + (mine ? '.mine' : ''),
      h('span.tint'),
      face(0, ROLE.FW, p.portrait),
      h('span.who', h('b', p.callsign), badges, h('small', `${mech}, in ${PILOT_COLOUR_NAMES[colour]?.toLowerCase() ?? 'colour'}${ping}`)),
      h('span.state' + (p.ready && !inMatch ? '.ready' : ''), status),
    );
    row.style.setProperty('--tc', colourCss(colour));
    m.addItem(seats, row, () => {
      if (mine) return m.toast('Everyone flies their own Forward: change yours and your colour with Your pilot');
      if (!host) return;
      confirmDialog(m, `Remove ${p.callsign}?`, 'They cannot come back to this room.', 'Remove', () => o.sendRoom('kick', { pid: p.pid }));
    }, undefined, { key: `pilot-${p.pid}` });
  }
  // The places nobody has: a computer pilot each, from a faction drawn by lot when the Sprint starts.
  for (let i = people.length; i < ROOM_SIZE; i++) {
    const row = h('div.seat.cpu', h('span.tint'), h('i.face'), h('span.who', h('b', 'Computer pilot'), h('small', `A faction's Forward, ${SKILL_NAMES[v.settings.skill]}`)), h('span.state', ''));
    m.addItem(seats, row, () => m.toast('A computer pilot races here unless a friend joins'), undefined, { key: `cpu-${i}` });
  }
  // The settings: the host changes them, everyone sees them.
  const settings = h('div.list.settings');
  const lockSet = host ? null : 'Only the host changes the settings';
  const not = lockSet ?? (inMatch ? 'Not during a match' : null);
  const ti = Math.max(0, TRACKS.findIndex((t) => t.id === v.settings.track));
  g.circuitAhead(TRACKS[ti].id);
  modeChoice(m, g, v, settings, not);
  m.choice(settings, 'Circuit', TRACKS[ti].name, (dir) => o.sendRoom('settings', { track: TRACKS[(ti + dir + TRACKS.length) % TRACKS.length].id }), { key: 'track', locked: not });
  const n = SPRINT_FORMATS.length;
  m.choice(settings, 'Format', SPRINT_FORMATS[v.settings.sprint]?.label ?? '', (dir) => o.sendRoom('settings', { sprint: (v.settings.sprint + dir + n) % n }), { key: 'match', locked: not });
  m.choice(settings, 'Computer pilots', SKILL_NAMES[v.settings.skill], (dir) => o.sendRoom('settings', { skill: (v.settings.skill + dir + 3) % 3 }), { key: 'skill', locked: not });
  // Actions.
  const list = h('div.list.actions');
  if (!inMatch && me && me.side >= 0) {
    m.button(list, me.ready ? 'Not ready' : 'Ready', () => o.sendRoom('ready', { ready: !me.ready }), { key: 'ready', go: !me.ready });
    const everyone = people.filter((p) => p.connected);
    if (host && everyone.length > 0 && everyone.every((p) => p.ready)) m.button(list, 'Start now', () => o.sendRoom('start'), { key: 'start', go: true });
    m.button(list, `Edit ${customName(ROLE.FW, g.customMech(ROLE.FW))}`, () => openCustom(m, g, ROLE.FW, g.loadout.team), { key: 'custom', note: 'Your own Forward' });
  }
  m.button(list, 'Invite', () => inviteDialog(m, g, 'room', v.code), { key: 'invite' });
  if (host && inMatch) m.button(list, 'End match for everyone', () => confirmDialog(m, 'End the match?', 'Everyone goes back to the lobby.', 'End match', () => o.sendRoom('endMatch')), { key: 'end' });
  m.button(list, 'Leave room', () => g.confirmLeaveRoom(), { key: 'leave' });
  const panel = h('div.panel.settings-panel', h('h2', host ? 'Room settings: yours to change' : 'Room settings, changed by the host'), settings);
  const extra: HTMLElement[] = [];
  if (inMatch) {
    const mt = v.match;
    const names = v.sprint ?? [];
    let line = '';
    if (mt && mt.rounds.length) {
      const lead = standings(mt)[0];
      line = mt.cfg.mode === 'wins' ? `${names[lead] ?? '?'} leads, ${mt.wins[lead]} win${mt.wins[lead] === 1 ? '' : 's'}` : `${names[lead] ?? '?'} leads, ${mt.totals[lead]} points`;
    }
    extra.push(h('div.matchcard', h('b', `Sprint under way${mt ? `: race ${mt.rounds.length + (v.phase === 'race' ? 1 : 0)}` : ''}`), h('span', line), h('small', me?.nextRound ? 'You race in the next Sprint.' : 'Back in a moment.')));
  } else {
    extra.push(h('div.room-hint', `Six Forwards, every pilot for themselves: each person in their own Forward and their colour, computer pilots in the rest. ${SPRINT_FORMATS[v.settings.sprint]?.label ?? ''}.`));
  }
  const room = h('div.room', top, h('div.sides.sprint', col), ...extra, h('div.bottom', panel, h('div.panel.actions-panel', list)));
  m.root.append(h('div.shade.full'), m.panes(room), m.footer(SELECT, { pad: 'X', keys: 'X', label: 'Your place', press: 'x' }, { pad: 'Y', keys: 'Y', label: 'Your pilot', press: 'y' }, { pad: 'B', keys: 'Esc', label: 'Leave', press: 'back' }));
}
