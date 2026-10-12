// Runs whole races with AI in every seat and prints what happened.
// This is the same simulation the game uses, so it doubles as a balance tool
// and as proof that the race logic runs without a browser.
//
//   npm run sim                 one race, verbose
//   npm run sim -- 40           40 races, summary only
//   npm run sim -- 1 7          one race with seed 7
//   npm run sim -- 100 1 tow3=0.12 koPoints=4     override any rule
import {
  ABILITIES,
  ATTACKS,
  CLASSES,
  DT,
  MERIDIAN,
  MPH_PER_UNIT,
  PHASE,
  ROLE,
  ROLE_KEYS,
  TACTIC_NAMES,
  buildTrack,
  createRace,
  hpFraction,
  scoreRound,
  stepRace,
  type RaceConfig,
  type Rules,
  type SeatConfig,
} from '../src/sim/index';

const count = Number(process.argv[2] ?? 1);
const seed0 = Number(process.argv[3] ?? 1);
const rules: Partial<Rules> = {};
let skills = [0.6, 0.6];
for (const arg of process.argv.slice(4)) {
  const [k, v] = arg.split('=');
  if (k === 'skill') skills = v.split(',').map(Number);
  else (rules as Record<string, number>)[k] = Number(v);
}
const verbose = count === 1;
const track = buildTrack(MERIDIAN);

function seats(skillA: number, skillB: number): SeatConfig[] {
  const names = [['Kite', 'Lark', 'Atlas'], ['Shrike', 'Moth', 'Golem']];
  const out: SeatConfig[] = [];
  for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) {
    for (let team = 0; team < 2; team++) {
      out.push({ team, role, human: false, name: names[team][role], skill: team === 0 ? skillA : skillB });
    }
  }
  return out;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '-');
const dmgByAttack: Record<string, number> = {};
const hpEnd = [0, 0, 0], placeSum = [0, 0, 0];
const dealtByRole = [0, 0, 0], takenByRole = [0, 0, 0];
const dmgByPhase = [0, 0, 0, 0];
const koTimes: number[] = [];
let engagedTicks = 0, activeTicks = 0, blockedHits = 0, cleanHits = 0;
const totals = { races: 0, wins: [0, 0], draws: 0, kos: 0, time: 0, koByRole: [0, 0, 0], winnerRole: [0, 0, 0], pts: [0, 0], maxSpeed: 0, wallHits: 0, dnfTimeouts: 0 };
// New-rule statistics.
const lapSplit: number[][] = [[], [], []];
const cellsAtLap2: number[][] = [[], [], []];
const driveAtLap2: number[][] = [[], [], []];
const abilityUses = ABILITIES.map(() => 0);
let leadChanges3 = 0, lap3LeaderWon = 0, lap3Races = 0;
let chasers = 0, chasersGained = 0, hurtChasers = 0, hurtChasersGained = 0, hurtChasersWon = 0;
let firstTeamLost = 0, tiedRounds = 0, passes3 = 0;
const duel = { n: 0, held: 0, bins: [[0, 0], [0, 0], [0, 0]], hurtBehind: 0, hurtBehindWon: 0 };
let lap2Speed = 0, lap2Ticks = 0, lockSpeed = 0, lockTicks = 0, gatesTaken = 0;
let chargedHits = 0, chargedDamage = 0, ringOuts = 0, ringOutsCredited = 0, parries = 0;
const t0 = Date.now();
let ticksRun = 0;

for (let r = 0; r < count; r++) {
  const cfg: RaceConfig = { seed: seed0 + r * 7919, seats: seats(skills[0], skills[1] ?? skills[0]), rules, gridFlip: r % 2 === 1 };
  const race = createRace(track, cfg);
  const lapStart: number[] = race.mechs.map(() => 0);
  let lastPrint = 0;
  let phaseStart = 0;
  let leader3 = -1, leaderAt3 = -1;
  let placeAt3: number[] | null = null;
  let hpAt3: number[] = [];
  let sAt3: number[] = [];
  let lastPlaces: number[] = race.mechs.map((m) => m.place);
  while (race.phase !== PHASE.FINISHED && race.tick < 60 * 60 * 10) {
    stepRace(race, track, []);
    ticksRun++;
    for (const m of race.mechs) {
      totals.maxSpeed = Math.max(totals.maxSpeed, m.speed);
      if (!m.retired && !m.finished && race.lapPhase === 2) {
        activeTicks++;
        lap2Speed += m.vs; lap2Ticks++;
        if (m.mode === 1 && race.mechs[m.target].team !== m.team) { engagedTicks++; lockSpeed += m.vs; lockTicks++; }
      }
    }
    for (const e of race.events) {
      if (e.type === 'hit') { const k = ATTACKS[e.attack].key; dmgByAttack[k] = (dmgByAttack[k] ?? 0) + e.damage; dmgByPhase[race.lapPhase] += e.damage; if (e.blocked) blockedHits++; else cleanHits++; if (e.charged) { chargedHits++; chargedDamage += e.damage; } }
      if (e.type === 'splat') { dmgByAttack.splat = (dmgByAttack.splat ?? 0) + e.damage; dmgByPhase[race.lapPhase] += e.damage; ringOuts++; if (e.by >= 0) ringOutsCredited++; }
      if (e.type === 'parry') parries++;
      if (e.type === 'ko') koTimes.push(race.tick * DT);
      if (e.type === 'ability') abilityUses[e.ability]++;
      if (e.type === 'gate') gatesTaken++;
      if (e.type === 'lapPhase') {
        const t = race.tick * DT;
        lapSplit[e.lap - 2].push(t - phaseStart);
        phaseStart = t;
        if (e.lap === 2) for (const m of race.mechs) { cellsAtLap2[m.role].push(m.cells); driveAtLap2[m.role].push(m.drive); }
        if (e.lap === 3) {
          placeAt3 = race.mechs.map((m) => m.place);
          hpAt3 = race.mechs.map((m) => hpFraction(m));
          sAt3 = race.mechs.map((m) => (m.retired ? NaN : m.s));
          leaderAt3 = race.mechs.find((m) => m.place === 1)!.id;
          leader3 = leaderAt3;
        }
      }
    }
    if (race.lapPhase === 3 && race.phase === PHASE.RACING) {
      const p1 = race.mechs.find((m) => m.place === 1)!;
      if (p1.id !== leader3 && !p1.finished) { leadChanges3++; leader3 = p1.id; }
      for (const m of race.mechs) if (!m.retired && m.place < lastPlaces[m.id]) passes3++;
    }
    lastPlaces = race.mechs.map((m) => m.place);
    for (const e of race.events) {
      const t = race.tick * DT;
      if (e.type === 'wall') totals.wallHits++;
      if (!verbose) continue;
      const n = (id: number) => (id < 0 ? '-' : `${race.mechs[id].name}(${ROLE_KEYS[race.mechs[id].role]}${race.mechs[id].team})`);
      if (e.type === 'lapPhase') console.log(`${fmt(t)}  === LAP PHASE ${e.lap} ===`);
      else if (e.type === 'lap' || e.type === 'finish') {
        const id = e.mech;
        console.log(`${fmt(t)}  ${n(id)} ${e.type === 'finish' ? `FINISH P${e.place}` : `starts lap ${e.lap}`}  lap time ${(t - lapStart[id]).toFixed(1)}s  hp ${race.mechs[id].hp.toFixed(0)} drive ${race.mechs[id].drive.toFixed(0)} cells ${race.mechs[id].cells}`);
        lapStart[id] = t;
      } else if (e.type === 'ko') console.log(`${fmt(t)}  KO ${n(e.mech)} by ${n(e.by)}`);
      else if (e.type === 'tactic') console.log(`${fmt(t)}  team ${e.team} tactic ${TACTIC_NAMES[e.tactic]}${e.mark >= 0 ? ' on ' + n(e.mark) : ''}`);
      else if (e.type === 'guardBreak') console.log(`${fmt(t)}  guard break on ${n(e.mech)}`);
      else if (e.type === 'parry') console.log(`${fmt(t)}  parry by ${n(e.mech)}`);
      else if (e.type === 'splat') console.log(`${fmt(t)}  ring-out ${n(e.mech)} by ${n(e.by)} -${e.damage.toFixed(0)}`);
      else if (e.type === 'launch') console.log(`${fmt(t)}  perfect launch ${n(e.mech)}`);
      else if (e.type === 'ability') console.log(`${fmt(t)}  ${ABILITIES[e.ability].name} by ${n(e.mech)}  (P${race.mechs[e.mech].place}, ${(race.mechs[e.mech].speed * MPH_PER_UNIT).toFixed(0)} mph)`);
      else if (e.type === 'snared') console.log(`${fmt(t)}  ${n(e.mech)} snared by ${n(e.by)}`);
      else if (e.type === 'gate') console.log(`${fmt(t)}  gate ${e.gate + 1} ${n(e.mech)} -> ${e.cells} cells`);
    }
    if (verbose && race.tick - lastPrint >= 600) {
      lastPrint = race.tick;
      const row = [...race.mechs].sort((a, b) => a.place - b.place).map((m) => `${m.name}${m.retired ? '✗' : ''} s${m.s.toFixed(0)} v${(m.speed * MPH_PER_UNIT).toFixed(0)} hp${m.hp.toFixed(0)}${m.mode ? '⚔' + race.mechs[m.target]?.name : ''}`);
      console.log(`${fmt(race.tick * DT)}  ${row.join(' | ')}`);
    }
  }
  const round = scoreRound(race);
  const pts = round.points;
  totals.races++;
  totals.pts[0] += pts[0];
  totals.pts[1] += pts[1];
  if (pts[0] > pts[1]) totals.wins[0]++;
  else if (pts[1] > pts[0]) totals.wins[1]++;
  else totals.draws++;
  if (round.tied) tiedRounds++;
  else if (round.winner !== round.first) firstTeamLost++;
  totals.time += race.tick * DT;
  if (placeAt3) {
    lap3Races++;
    if (race.mechs[leaderAt3].place === 1) lap3LeaderWon++;
    // Forward against forward: does the one ahead at the start of the speed lap stay ahead?
    const fws = race.mechs.filter((m) => m.role === ROLE.FW && !Number.isNaN(sAt3[m.id]));
    if (fws.length === 2) {
      const [front, back] = sAt3[fws[0].id] >= sAt3[fws[1].id] ? fws : [fws[1], fws[0]];
      const gap = sAt3[front.id] - sAt3[back.id];
      const held = front.place < back.place;
      const bin = gap < 40 ? 0 : gap < 120 ? 1 : 2;
      duel.n++; duel.bins[bin][0]++;
      if (held) { duel.held++; duel.bins[bin][1]++; }
      if (hpAt3[back.id] < hpAt3[front.id] - 0.1) { duel.hurtBehind++; if (!held) duel.hurtBehindWon++; }
    }
    for (const m of race.mechs) {
      if (m.role !== ROLE.FW || placeAt3[m.id] === 1) continue;
      // A forward that started the speed lap behind somebody.
      chasers++;
      const gained = !m.retired && m.place < placeAt3[m.id];
      if (gained) chasersGained++;
      if (hpAt3[m.id] < 0.75) {
        hurtChasers++;
        if (gained) hurtChasersGained++;
        if (!m.retired && m.place === 1) hurtChasersWon++;
      }
    }
  }
  for (const m of race.mechs) {
    if (m.retired) {
      totals.kos++;
      totals.koByRole[m.role]++;
    }
    if (m.place === 1) totals.winnerRole[m.role]++;
    hpEnd[m.role] += m.hp / CLASSES[m.role].maxHp;
    placeSum[m.role] += m.place;
    dealtByRole[m.role] += m.dmgDealt;
    takenByRole[m.role] += m.dmgTaken;
  }
  if (race.mechs.some((m) => !m.retired && m.finishTime > 1e6)) totals.dnfTimeouts++;
  if (verbose) {
    console.log('\nRESULT');
    for (const m of [...race.mechs].sort((a, b) => a.place - b.place)) {
      console.log(`  P${m.place} ${m.name.padEnd(7)} ${ROLE_KEYS[m.role]} team ${m.team}  ${m.retired ? 'RETIRED ' : m.finishTime < 1e6 ? fmt(m.finishTime) : 'flagged '}  pts ${String(m.points).padStart(2)}  dealt ${m.dmgDealt.toFixed(0).padStart(5)}  taken ${m.dmgTaken.toFixed(0).padStart(5)} / ${CLASSES[m.role].maxHp}  KOs ${m.kos}  cells left ${m.cells}`);
    }
    console.log(`  Team 0 ${pts[0]} — ${pts[1]} Team 1   (placing ${round.place[0]}-${round.place[1]}, knockouts ${round.ko[0]}-${round.ko[1]})`);
  }
}
const ms = Date.now() - t0;
const N = totals.races;
console.log(`\n${N} race(s): team0 wins ${totals.wins[0]}, team1 wins ${totals.wins[1]}, level on points ${totals.draws}; avg points ${(totals.pts[0] / N).toFixed(1)} / ${(totals.pts[1] / N).toFixed(1)}`);
console.log(`avg race ${fmt(totals.time / N)}; lap 1 ${avg(lapSplit[0]).toFixed(1)}s, lap 2 ${avg(lapSplit[1]).toFixed(1)}s; KOs per race ${(totals.kos / N).toFixed(2)} (FW ${totals.koByRole[0]}, MF ${totals.koByRole[1]}, DF ${totals.koByRole[2]}); winners by role FW ${totals.winnerRole[0]} MF ${totals.winnerRole[1]} DF ${totals.winnerRole[2]}`);
console.log(`top speed ${(totals.maxSpeed * MPH_PER_UNIT).toFixed(0)} mph; wall hits per race ${(totals.wallHits / N).toFixed(1)}; races ended by the flag ${totals.dnfTimeouts}`);
console.log(`damage per race: lap2 ${(dmgByPhase[2] / N).toFixed(0)}, lap3 ${(dmgByPhase[3] / N).toFixed(0)}; by attack ${Object.entries(dmgByAttack).map(([k, v]) => `${k} ${(v / N).toFixed(0)}`).join(', ')}`);
console.log(`per mech per race: dealt FW ${(dealtByRole[0] / N / 2).toFixed(0)} MF ${(dealtByRole[1] / N / 2).toFixed(0)} DF ${(dealtByRole[2] / N / 2).toFixed(0)}; taken FW ${(takenByRole[0] / N / 2).toFixed(0)} MF ${(takenByRole[1] / N / 2).toFixed(0)} DF ${(takenByRole[2] / N / 2).toFixed(0)}`);
console.log(`avg armour left FW ${(hpEnd[0] / N / 2 * 100).toFixed(0)}% MF ${(hpEnd[1] / N / 2 * 100).toFixed(0)}% DF ${(hpEnd[2] / N / 2 * 100).toFixed(0)}%; avg place FW ${(placeSum[0] / N / 2).toFixed(2)} MF ${(placeSum[1] / N / 2).toFixed(2)} DF ${(placeSum[2] / N / 2).toFixed(2)}`);
console.log(`lap-2 time spent locked on an enemy: ${pct(engagedTicks, activeTicks)}; hits clean ${cleanHits} blocked ${blockedHits}; KO times (s): ${koTimes.slice(0, 30).map((t) => t.toFixed(0)).join(' ')}`);
console.log(`entering lap 2: cells FW ${avg(cellsAtLap2[0]).toFixed(2)} MF ${avg(cellsAtLap2[1]).toFixed(2)} DF ${avg(cellsAtLap2[2]).toFixed(2)}; Drive FW ${avg(driveAtLap2[0]).toFixed(0)} MF ${avg(driveAtLap2[1]).toFixed(0)} DF ${avg(driveAtLap2[2]).toFixed(0)}`);
console.log(`battle lap pace: all ${(lap2Speed / Math.max(1, lap2Ticks) * MPH_PER_UNIT).toFixed(0)} mph, while locked on ${(lockSpeed / Math.max(1, lockTicks) * MPH_PER_UNIT).toFixed(0)} mph; gates threaded per mech ${(gatesTaken / N / 6).toFixed(2)}`);
console.log(`momentum strikes per race ${(chargedHits / N).toFixed(2)} (${(chargedDamage / Math.max(1, chargedHits)).toFixed(0)} damage each); ring-outs per race ${(ringOuts / N).toFixed(2)} (credited ${pct(ringOutsCredited, ringOuts)}); parries per race ${(parries / N).toFixed(2)}`);
console.log(`abilities per race: ${ABILITIES.map((a, i) => `${a.name} ${(abilityUses[i] / N).toFixed(2)}`).join(', ')}`);
console.log(`speed lap: leader at its start won ${pct(lap3LeaderWon, lap3Races)}; lead changes per race ${(leadChanges3 / Math.max(1, lap3Races)).toFixed(2)}; places gained per race ${(passes3 / Math.max(1, lap3Races)).toFixed(1)}`);
console.log(`forwards starting the speed lap behind someone: ${chasers}, gained a place ${pct(chasersGained, chasers)}; of those under 75% armour: ${hurtChasers}, gained ${pct(hurtChasersGained, hurtChasers)}, won ${pct(hurtChasersWon, hurtChasers)}`);
console.log(`forward duels (both running at the start of the speed lap): ${duel.n}; the one ahead stayed ahead ${pct(duel.held, duel.n)} (gap under 40u: ${pct(duel.bins[0][1], duel.bins[0][0])} of ${duel.bins[0][0]}, 40-120u: ${pct(duel.bins[1][1], duel.bins[1][0])} of ${duel.bins[1][0]}, over 120u: ${pct(duel.bins[2][1], duel.bins[2][0])} of ${duel.bins[2][0]}); behind AND more damaged: ${duel.hurtBehind}, still came through ${pct(duel.hurtBehindWon, duel.hurtBehind)}`);
console.log(`rounds where the first finisher's team lost ${pct(firstTeamLost, N)}, level on points ${pct(tiedRounds, N)}`);
console.log(`simulated ${ticksRun} ticks in ${ms} ms (${(ticksRun / 60 / (ms / 1000)).toFixed(0)}x real time)`);
