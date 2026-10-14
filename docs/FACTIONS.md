# Factions

Four factions. A race is still two teams of three, so it is always two
factions: yours and a rival (picked in the garage, or drawn at random at the
start of each match). Every faction flies the same three frame types with
the same stats; the difference is cosmetic. Each faction has its own colours,
emblem, pilots, hangar and its own design of each frame type, named.

The data is in `LIVERIES` (`src/client/render/palette.ts`): colours, the
shadow colour of each paint, whether the armour is dark (its markings are
then painted light), the pilots' call signs and the models' names. The race
maps its two teams to factions (`Game.factions`); the sim never knows which
factions are racing. Emblems and portraits come from `ui/factionArt.ts`:
painted where they have been painted, otherwise a stand-in drawn in the
faction's colours.

| | Solstice | Vanta | Mirage | Aurora |
|---|---|---|---|---|
| Who | The heroes | The black team | The desert dynasty | The knights |
| Colours | White, royal blue, gold | Charcoal, crimson, gunmetal | Sand, rust orange, dark brown; gold trim, amber eyes | Deep violet, pearl, silver; lavender light |
| Team colour | Blue | Red | Orange | Violet |
| Pilots | Kite, Lark, Atlas | Shrike, Moth, Golem | Asp, Ibis, Sphinx | Iris, Vesper, Bastion |
| Swift class (forward) | Sunhawk | Razor | Anubis | Seraph |
| Vector class (midfielder) | Daystar | Stinger | Horus | Longbow |
| Bulwark class (defender) | Rampart | Maul | Sobek | Paladin |

## Design languages

Every design keeps the frame's skeleton, size, weapon types and hit areas,
so the animations and the balance carry over; what changes is the armour,
the head, the shoulders, the backpack and the weapons' styling.

- **Solstice**: clean aerospace, bird motifs, gold crests. Today's three
  designs.
- **Vanta**: predatory and hunched. Mono-eye visors on a rail, spiked
  shoulders, blade fins, layered angular plates.
  - Razor: a lean, long-armed stalker, its mono-eye head sunk between raised
    shoulder blades, serrated cleaver blades, tail-like rear fins.
  - Stinger: a beak-headed gunner with a long rifle and a drum magazine.
  - Maul: a brute, its head buried in a high collar, spiked knuckle fists,
    the shark-tooth vents.
- **Mirage**: monumental and ceremonial, ancient Egypt. Striped
  pharaoh-headdress crests, animal-god heads, broad jewelled collars across
  the chest, tapering obelisk-like limbs, sun-disc and scarab motifs, banded
  wraps on the limbs. Stately, not rugged.
  - Anubis: a slender jackal-headed runner, its tall ears for antennas,
    sickle-sword blades.
  - Horus: falcon-headed, folded falcon-wing fins, a staff-like rifle crowned
    with a sun disc.
  - Sobek: a crocodile-jawed helm, a scarab-shell backpack, gauntlets like
    temple columns.
- **Aurora**: elegant and knightly. Flowing curved armour, helm visors, halo
  crests, wing-like fins, tabard waist plates.
  - Seraph: a slender duellist, swept helm and halo crest, rapier forearm
    blades, wing-fin thrusters.
  - Longbow: a tall archer carrying a slender lance-rifle, cape-like rear
    fins.
  - Paladin: tower-shield shoulders, a great helm, gauntlet fists.

## Status

| | Designs | Emblem | Pilots | Hangar lettering |
|---|---|---|---|---|
| Solstice | in the game | painted | painted | painted |
| Vanta | Solstice's for now | painted | painted | painted |
| Mirage | Solstice's for now | stand-in | stand-in | drawn |
| Aurora | Solstice's for now | stand-in | stand-in | drawn |
