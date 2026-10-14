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
| Pilots | Kite (f), Lark (m), Atlas (m) | Shrike (f), Moth (m), Golem (f) | Sirocco (m), Ibis (f), Dune (m) | Iris (m), Vesper (f), Bastion (m) |
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
    sickle-sword blades along the forearms, two obelisk fins off the back.
  - Horus: falcon-headed and crowned with a sun disc, folded falcon wings
    hanging down the back like a cloak, feather-fringed pauldrons, a cobra
    of a Snare launcher, a staff of a rifle crowned with a sun disc, the
    falcon's eye lit on its back for the Disruptor, taloned feet.
  - Sobek: crocodile-headed under a sun disc, pauldrons like temple pylons,
    gauntlets like papyrus columns (the scatter cannon in a toothed housing
    under the right), a scarab's shell for a backpack with a scarab's
    outspread wings, a pleated kilt, clawed feet.
- **Aurora**: elegant and knightly. Flowing curved armour, helm visors, halo
  crests, wing-like fins, tabard waist plates.
  - Seraph: a slender duellist, swept helm and halo crest, rapier forearm
    blades, wing-fin thrusters.
  - Longbow: a tall archer carrying a slender lance-rifle, cape-like rear
    fins.
  - Paladin: tower-shield shoulders, a great helm, gauntlet fists.

The poses turn the wing joints (the wings sweep back at speed), so a
design's own wing angle sits on a group inside the joint. Fins that run back
along the body cross each other when they sweep; Mirage's hang down or splay
out so they don't.

## Status

| | Designs | Emblem | Pilots | Hangar lettering |
|---|---|---|---|---|
| Solstice | in the game | painted | painted | painted |
| Vanta | in the game, first pass (`render/mech/vanta/`) | painted | painted | painted |
| Mirage | in the game, first pass (`render/mech/mirage/`) | stand-in | painted | drawn |
| Aurora | Solstice's for now | stand-in | painted | drawn |
