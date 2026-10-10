// Debug aid: follow both forwards through a race.
import { ATTACKS, DT, MERIDIAN, PHASE, ROLE, TACTIC_NAMES, buildTrack, createRace, stepRace, type SeatConfig } from '../src/sim/index';
const track = buildTrack(MERIDIAN);
const seats: SeatConfig[] = [];
const names = [['Kite', 'Lark', 'Atlas'], ['Shrike', 'Moth', 'Golem']];
for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) for (let team = 0; team < 2; team++) seats.push({ team, role, human: false, name: names[team][role], skill: 0.6 });
const race = createRace(track, { seed: Number(process.argv[2] ?? 1), seats });
const dmg: Record<string, number> = {};
while (race.phase !== PHASE.FINISHED) {
  stepRace(race, track, []);
  for (const e of race.events) {
    if (e.type === 'hit' && race.mechs[e.victim].role === ROLE.FW) {
      const k = `${race.mechs[e.victim].name}<-${race.mechs[e.attacker].name}:${ATTACKS[e.attack].key}@L${race.lapPhase}`;
      dmg[k] = (dmg[k] ?? 0) + e.damage;
    }
    if (e.type === 'ko') console.log(`${(race.tick * DT).toFixed(0)}s KO ${race.mechs[e.mech].name} by ${race.mechs[e.by]?.name}`);
    if (e.type === 'tactic') console.log(`${(race.tick * DT).toFixed(0)}s team ${e.team} ${TACTIC_NAMES[e.tactic]}`);
  }
  if (race.tick % 300 === 0 && race.lapPhase >= 2) {
    const row = race.mechs.filter((m) => m.role === ROLE.FW).map((m) => `${m.name} hp${m.hp.toFixed(0)} drv${m.drive.toFixed(0)} ${m.mode ? 'BATTLE>' + race.mechs[m.target].name : 'speed'} intent${m.ai.intent} hunters[${race.mechs.filter((o) => o.target === m.id && o.team !== m.team).map((o) => o.name).join(',')}] v${m.speed.toFixed(0)} P${m.place}`);
    console.log(`${(race.tick * DT).toFixed(0)}s  ${row.join('  |  ')}`);
  }
}
console.log(Object.entries(dmg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join('\n'));
