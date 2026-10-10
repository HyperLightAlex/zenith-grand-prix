// Runs whole races with AI in every seat and prints what happened.
// This is the same simulation the game uses, so it doubles as a balance tool
// and as proof that the race logic runs without a browser.
//
//   npm run sim                 one race, verbose
//   npm run sim -- 40           40 races, summary only
//   npm run sim -- 1 7          one race with seed 7
import {
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
  stepRace,
  type RaceConfig,
  type SeatConfig,
} from '../src/sim/index';

const count = Number(process.argv[2] ?? 1);
const seed0 = Number(process.argv[3] ?? 1);
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
const dmgByAttack: Record<string, number> = {};
const hpEnd = [0, 0, 0], placeSum = [0, 0, 0];
const dealtByRole = [0, 0, 0], takenByRole = [0, 0, 0];
const dmgByPhase = [0, 0, 0, 0];
const koTimes: number[] = [];
let engagedTicks = 0, activeTicks = 0, blockedHits = 0, cleanHits = 0;
const totals = { races: 0, wins: [0, 0], draws: 0, kos: 0, time: 0, koByRole: [0, 0, 0], winnerRole: [0, 0, 0], pts: [0, 0], maxSpeed: 0, wallHits: 0, dnfTimeouts: 0 };
const t0 = Date.now();
let ticksRun = 0;

for (let r = 0; r < count; r++) {
  const cfg: RaceConfig = { seed: seed0 + r * 7919, seats: seats(0.6, 0.6) };
  const race = createRace(track, cfg);
  const lapStart: number[] = race.mechs.map(() => 0);
  let lastPrint = 0;
  while (race.phase !== PHASE.FINISHED && race.tick < 60 * 60 * 10) {
    stepRace(race, track, []);
    ticksRun++;
    for (const m of race.mechs) {
      totals.maxSpeed = Math.max(totals.maxSpeed, m.speed);
      if (!m.retired && !m.finished && race.lapPhase === 2) { activeTicks++; if (m.mode === 1 && race.mechs[m.target].team !== m.team) engagedTicks++; }
    }
    for (const e of race.events) {
      if (e.type === 'hit') { const k = ATTACKS[e.attack].key; dmgByAttack[k] = (dmgByAttack[k] ?? 0) + e.damage; dmgByPhase[race.lapPhase] += e.damage; if (e.blocked) blockedHits++; else cleanHits++; }
      if (e.type === 'splat') { dmgByAttack.splat = (dmgByAttack.splat ?? 0) + e.damage; dmgByPhase[race.lapPhase] += e.damage; }
      if (e.type === 'ko') koTimes.push(race.tick * DT);
    }
    for (const e of race.events) {
      const t = race.tick * DT;
      if (e.type === 'wall') totals.wallHits++;
      if (!verbose) continue;
      const n = (id: number) => (id < 0 ? '-' : `${race.mechs[id].name}(${ROLE_KEYS[race.mechs[id].role]}${race.mechs[id].team})`);
      if (e.type === 'lapPhase') console.log(`${fmt(t)}  === LAP PHASE ${e.lap} ===`);
      else if (e.type === 'lap' || e.type === 'finish') {
        const id = e.mech;
        console.log(`${fmt(t)}  ${n(id)} ${e.type === 'finish' ? `FINISH P${e.place}` : `starts lap ${e.lap}`}  lap time ${(t - lapStart[id]).toFixed(1)}s  hp ${race.mechs[id].hp.toFixed(0)} drive ${race.mechs[id].drive.toFixed(0)}`);
        lapStart[id] = t;
      } else if (e.type === 'ko') console.log(`${fmt(t)}  KO ${n(e.mech)} by ${n(e.by)}`);
      else if (e.type === 'tactic') console.log(`${fmt(t)}  team ${e.team} tactic ${TACTIC_NAMES[e.tactic]}${e.mark >= 0 ? ' on ' + n(e.mark) : ''}`);
      else if (e.type === 'guardBreak') console.log(`${fmt(t)}  guard break on ${n(e.mech)}`);
      else if (e.type === 'parry') console.log(`${fmt(t)}  parry by ${n(e.mech)}`);
      else if (e.type === 'splat') console.log(`${fmt(t)}  wall splat ${n(e.mech)} -${e.damage.toFixed(0)}`);
      else if (e.type === 'launch') console.log(`${fmt(t)}  perfect launch ${n(e.mech)}`);
    }
    if (verbose && race.tick - lastPrint >= 600) {
      lastPrint = race.tick;
      const row = [...race.mechs].sort((a, b) => a.place - b.place).map((m) => `${m.name}${m.retired ? '✗' : ''} s${m.s.toFixed(0)} v${(m.speed * MPH_PER_UNIT).toFixed(0)} hp${m.hp.toFixed(0)}${m.mode ? '⚔' + race.mechs[m.target]?.name : ''}`);
      console.log(`${fmt(race.tick * DT)}  ${row.join(' | ')}`);
    }
  }
  const pts = [0, 0];
  for (const m of race.mechs) pts[m.team] += m.points;
  totals.races++;
  totals.pts[0] += pts[0];
  totals.pts[1] += pts[1];
  if (pts[0] > pts[1]) totals.wins[0]++;
  else if (pts[1] > pts[0]) totals.wins[1]++;
  else totals.draws++;
  totals.time += race.tick * DT;
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
      console.log(`  P${m.place} ${m.name.padEnd(7)} ${ROLE_KEYS[m.role]} team ${m.team}  ${m.retired ? 'RETIRED ' : m.finishTime < 1e6 ? fmt(m.finishTime) : 'flagged '}  pts ${String(m.points).padStart(2)}  dealt ${m.dmgDealt.toFixed(0).padStart(5)}  taken ${m.dmgTaken.toFixed(0).padStart(5)} / ${CLASSES[m.role].maxHp}  KOs ${m.kos}`);
    }
    console.log(`  Team 0 ${pts[0]} — ${pts[1]} Team 1`);
  }
}
const ms = Date.now() - t0;
console.log(`\n${totals.races} race(s): team0 wins ${totals.wins[0]}, team1 wins ${totals.wins[1]}, draws ${totals.draws}; avg points ${(totals.pts[0] / totals.races).toFixed(1)} / ${(totals.pts[1] / totals.races).toFixed(1)}`);
console.log(`avg race ${fmt(totals.time / totals.races)}; KOs per race ${(totals.kos / totals.races).toFixed(2)} (FW ${totals.koByRole[0]}, MF ${totals.koByRole[1]}, DF ${totals.koByRole[2]}); winners by role FW ${totals.winnerRole[0]} MF ${totals.winnerRole[1]} DF ${totals.winnerRole[2]}`);
console.log(`top speed ${(totals.maxSpeed * MPH_PER_UNIT).toFixed(0)} mph; wall hits per race ${(totals.wallHits / totals.races).toFixed(1)}; races ended by the flag ${totals.dnfTimeouts}`);
console.log(`damage per race: lap2 ${(dmgByPhase[2] / totals.races).toFixed(0)}, lap3 ${(dmgByPhase[3] / totals.races).toFixed(0)}; by attack ${Object.entries(dmgByAttack).map(([k, v]) => `${k} ${(v / totals.races).toFixed(0)}`).join(', ')}`);
console.log(`per mech per race: dealt FW ${(dealtByRole[0] / totals.races / 2).toFixed(0)} MF ${(dealtByRole[1] / totals.races / 2).toFixed(0)} DF ${(dealtByRole[2] / totals.races / 2).toFixed(0)}; taken FW ${(takenByRole[0] / totals.races / 2).toFixed(0)} MF ${(takenByRole[1] / totals.races / 2).toFixed(0)} DF ${(takenByRole[2] / totals.races / 2).toFixed(0)}`);
console.log(`avg armour left FW ${(hpEnd[0] / totals.races / 2 * 100).toFixed(0)}% MF ${(hpEnd[1] / totals.races / 2 * 100).toFixed(0)}% DF ${(hpEnd[2] / totals.races / 2 * 100).toFixed(0)}%; avg place FW ${(placeSum[0] / totals.races / 2).toFixed(2)} MF ${(placeSum[1] / totals.races / 2).toFixed(2)} DF ${(placeSum[2] / totals.races / 2).toFixed(2)}`);
console.log(`lap-2 time spent locked on an enemy: ${((engagedTicks / Math.max(1, activeTicks)) * 100).toFixed(0)}%; hits clean ${cleanHits} blocked ${blockedHits}; KO times (s): ${koTimes.slice(0, 30).map((t) => t.toFixed(0)).join(' ')}`);
console.log(`simulated ${ticksRun} ticks in ${ms} ms (${(ticksRun / 60 / (ms / 1000)).toFixed(0)}x real time)`);
