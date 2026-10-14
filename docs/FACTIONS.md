# Factions

Five factions. A race is still two teams of three, so it is always two
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
faction's colours (Tempest's, until its sheet is painted).

| | Solstice | Vanta | Mirage | Aurora | Tempest |
|---|---|---|---|---|---|
| Who | The heroes | The black team | The desert dynasty | The knights | The storm samurai |
| Colours | White, royal blue, gold | Charcoal, crimson, gunmetal | Sand, rust orange, dark brown; gold trim, amber eyes | Deep violet, pearl, silver; lavender light | Jade green, black lacquer, gold; pale lightning light |
| Team colour | Blue | Red | Orange | Violet | Green |
| Pilots | Kite (f), Lark (m), Atlas (m) | Shrike (f), Moth (m), Golem (f) | Sirocco (m), Ibis (f), Dune (m) | Iris (m), Vesper (f), Bastion (m) | Gale (m), Squall (f), Anvil (f) |
| Swift class (forward) | Sunhawk | Razor | Anubis | Seraph | Kamaitachi |
| Vector class (midfielder) | Daystar | Stinger | Horus | Longbow | Fujin |
| Bulwark class (defender) | Rampart | Maul | Sobek | Paladin | Raijin |

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
  - Horus: a big falcon's head crowned with a sun disc, sitting low on a
    ruff of feathers, its deep hooked beak curving down over the collar;
    folded falcon wings hanging either side of the jet pack like a cloak,
    feather-fringed pauldrons, a cobra of a Snare launcher, a staff of a
    rifle crowned with a sun disc, the falcon's eye lit on its back for the
    Disruptor, taloned feet.
  - Sobek: a great crocodile's head, half as wide as the chest, lying in a
    saddle between the shoulders with its toothed jaws hanging open over the
    collar and the throat lit; pauldrons like temple pylons, gauntlets like
    papyrus columns (the scatter cannon in a toothed housing under the
    right), a scarab's shell for a backpack with a scarab's outspread wings
    either side of it, a pleated kilt, clawed feet.
- **Aurora**: elegant and knightly. Ridged cuirasses (pearl below a silver
  band, violet above), lamed pauldrons, tabards and surcoats, poleyns,
  greaves and pointed sabatons, halos, and the team's sigil (an upright
  sword through a halo, wings behind) where another team would wear a badge.
  - Seraph: a slender duellist; a swept helm with a pearl visor, a lit slit
    and small temple wings, a halo behind it; a rapier along each forearm;
    three long feathered fins a side, fanned either side of the power unit.
  - Longbow: a tall archer; a sallet with a pearl plume rising through a
    floating halo; a crossbow on the left forearm for the Snare launcher; a
    lance-rifle behind a silver vamplate; a split surcoat; two pearl cape
    fins hanging either side of the power unit; a halo on its back for the
    Disruptor.
  - Paladin: a great helm with a crossed, lit visor and a silver crown, a
    great halo behind it; tower shields hung on the shoulders; flared
    vambraces and armoured fists; the scatter cannon in a silver-banded
    housing; two banners on poles either side of the backpack, which swing
    round to stream behind at speed.
- **Tempest**: samurai armour for storm gods. Lacquered jade plate laced in
  lames, black and gold; crested helms with face masks; broad layered
  shoulder plates; skirts of lames; lightning for light.
  - Kamaitachi: a lean wind-blade duellist, a crested helm, curved blades
    along the forearms.
  - Fujin: the wind god; a long matchlock rifle, a chain-weight Snare
    launcher, a war fan on its back for the Disruptor, a billowing wind-sash
    arching over the shoulders.
  - Raijin: the thunder god; a horned helm, great layered shoulder plates,
    a ring of thunder drums round its back.

The poses turn the wing joints (the wings sweep back at speed), so a
design's own wing angle sits on a group inside the joint. Fins that run back
along the body cross each other when they sweep; Mirage's hang down or splay
out so they don't.

## Status

| | Designs | Emblem | Pilots | Hangar lettering |
|---|---|---|---|---|
| Solstice | in the game | painted | painted | painted |
| Vanta | in the game, first pass (`render/mech/vanta/`) | painted | painted | painted |
| Mirage | in the game (`render/mech/mirage/`) | painted | painted | painted |
| Aurora | in the game (`render/mech/aurora/`) | painted (a redo, a sword through a halo, is coming) | painted | painted |
| Tempest | Solstice's for now | stand-in | stand-in | drawn |
