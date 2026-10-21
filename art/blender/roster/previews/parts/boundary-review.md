# Part boundary review — 2026-10-21

Reviewed the 15 updated designs in front, back and three-quarter rear views,
with one flat colour for each customization slot. The final set contains 45
900 × 1200 PNGs and inventories for 4,197 export-eligible source pieces. Every inventory has
`strict_tags: true`; no fallback classifications were used for these final pictures.
Blender version: **5.2.2 LTS** (build `d13f752e3b9c`).

Open [the review gallery and colour legend](index.html). Each gallery card links
to its full-size pictures and exact source-piece inventory. These are renders
of the saved tagged production scenes; the renderer opens them read-only and
never saves review colours, cameras or pose adjustments into source assets.

All designs contain all eleven slots, including a backpack. No source piece
required a slot outside the specified joint/part table. Paired shoulder caps,
upper-arm shells, waist/hip connections, hands/weapons, knees/calf jets and
skates were checked across the three views. Near-plane chest objects were also
isolated in contrasting colours for attachment review. After the 34 recorded
overrides were applied, the eight changed designs were inspected again.

## Boundary pieces deliberately retained

These near-plane pieces already belong to the part chosen by the rule. They
are documented here to distinguish an intentional judgment from a missed edge case.

| Design | Source pieces | Retained part | Visual reason |
| --- | --- | --- | --- |
| Razor | `chest / razor / chest / P / 080` | chest | Raised rear guard frames the integrated head/neck and continues the chest shell, above the separate exhaust pack. |
| Razor | `chest / razor / chest / S / 082`, `083`, `084` | chest | Small rear chest fittings run below the neck guard, partly behind the separate pack housing. |
| Stinger | `chest / stinger / chest / P / 078` | chest | The raised guard directly frames the back of the helmet; it is above the pack. |
| Maul | `chest / maul / chest / P / 096` | chest | The tall hood is part of the chest/head recess, distinct from the lower rear pack. |
| Sobek | `chest / sobek / chest / P / 185`; `F / 186`, `F / 187`, `F / 189`, `F / 190` on the same chest prefix | chest | Collar and four small neck fittings are seated under the crocodile head, behind the neck and in front of the pack. |
| Anubis | `shL / anubis / shL / T / 041`, `shR / anubis / shR / T / 067` | armL / armR | Gold bands low on the upper arms stay with the arms, unlike the separate cap stripes overridden below. |
| Horus | `shL / horus / shL / S / 059`, `T / 060`; `shR / horus / shR / S / 104`, `T / 105` | armL / armR | Upper-arm inserts and low trim bands belong to the long arm shell, not the feathered shoulder cap. |
| Razor | `shL / razor / shL / P / 026`, `shR / razor / shR / P / 054` | armL / armR | Narrow long plates below the joint sit on the upper arms; the stepped plates above remain shoulders. |
| Seraph | `shL / seraph / shL / S / 033`, `shR / seraph / shR / S / 068` | armL / armR | Long upper-arm inserts sit below the layered pauldrons; crest, trim and all pauldron layers already classify as shoulders. |
| Longbow | `shL / longbow / shL / S / 036`, `shR / longbow / shR / S / 078` | armL / armR | Upper-arm inserts stay with the arms; all layered cap plates already remain shoulders. |
| Kamaitachi, Fujin, Raijin | `shL / Tempest / upper arm jade plate`, `shR / Tempest / upper arm jade plate` in each design | armL / armR | Long jade plates are below the separate shoulder shields/turbine cap, on the upper-arm shell. |
| Rampart, Stinger, Maul | Shoulder caps, inset stripes and spikes near the split | shoulders | The existing rule keeps each complete cap together; no isolated arm-coloured trim remains on these caps. |
| All designs | Shoulder bearings at the joint and internal upper-arm shafts | armL / armR | These are the arm pivots and internal arm structure, not removable shoulder armour. |

## Applied overrides

The authoritative rebuild decisions are in
[part-overrides.json](../../part-overrides.json). Each row below identifies one
exact stable source name and reproduces its reason. The source ID is also in
that design's `*-pieces.json` inventory.

| Design | Stable source piece | Part | Reason |
| --- | --- | --- | --- |
| Sunhawk | `B / Backpack main shell` | backpack | Rear power-pack housing carries the nozzles and wing mounts; its shallow centre lies in front of the chest split plane. |
| Sunhawk | `B / Backpack porcelain rail` | backpack | Porcelain border is fixed to the rear power-pack housing, not the chest collar. |
| Sunhawk | `B / Backpack porcelain rail.001` | backpack | Mirrored porcelain border is fixed to the rear power-pack housing, not the chest collar. |
| Razor | `chest / razor / chest / F / 085` | backpack | The rear rectangular housing carries the paired exhausts and sits behind the chest shell; it is the backpack body. |
| Anubis | `shL / anubis / shL / T / 043` | shoulders | The gold stripe wraps the shoulder cap between its upper and lower armour; it is not a band around the upper arm. |
| Anubis | `shR / anubis / shR / T / 069` | shoulders | The gold stripe wraps the shoulder cap between its upper and lower armour; it is not a band around the upper arm. |
| Anubis | `chest / anubis / chest / F / 088` | backpack | The rear rectangular housing carries the paired exhausts and sits behind the chest shell; it is the backpack body. |
| Anubis | `chest / anubis / chest / T / 089` | backpack | The horizontal cap is fixed to the top of the rear exhaust housing, so it travels with the backpack. |
| Horus | `shL / horus / shL / T / 062` | shoulders | The gold stripe wraps the shoulder cap between its upper and lower armour; it is not a band around the upper arm. |
| Horus | `shR / horus / shR / T / 107` | shoulders | The gold stripe wraps the shoulder cap between its upper and lower armour; it is not a band around the upper arm. |
| Seraph | `chest / seraph / chest / F / 100` | backpack | The rear rectangular housing carries the paired exhausts and sits behind the chest shell; it is the backpack body. |
| Seraph | `chest / seraph / chest / T / 101` | backpack | The horizontal cap is fixed to the top of the rear exhaust housing, so it travels with the backpack. |
| Seraph | `chest / seraph / chest / K / 104` | backpack | The round rear bearing seats the wing/crescent root beside the pack, so it belongs with the backpack assembly. |
| Seraph | `chest / seraph / chest / K / 107` | backpack | The round rear bearing seats the wing/crescent root beside the pack, so it belongs with the backpack assembly. |
| Kamaitachi | `chest / kamaitachi / chest / F / 107` | backpack | The rear rectangular housing carries the paired exhausts and sits behind the chest shell; it is the backpack body. |
| Kamaitachi | `chest / kamaitachi / chest / S / 108` | backpack | The horizontal cap is fixed to the top of the rear exhaust housing, so it travels with the backpack. |
| Kamaitachi | `chest / kamaitachi / chest / K / 111` | backpack | The round rear bearing seats the wing/crescent root beside the pack, so it belongs with the backpack assembly. |
| Kamaitachi | `chest / kamaitachi / chest / K / 114` | backpack | The round rear bearing seats the wing/crescent root beside the pack, so it belongs with the backpack assembly. |
| Kamaitachi | `shL / Tempest / shoulder gold shield` | shoulders | The broad gold-edged shield covers the shoulder cap above the separate long upper-arm plate. |
| Kamaitachi | `shL / Tempest / shoulder storm field` | shoulders | The inset green field is fixed inside the shoulder shield and must travel with it. |
| Kamaitachi | `shL / Tempest / centred shoulder bolt` | shoulders | The lightning emblem is seated on the shoulder shield, not on the upper-arm shell. |
| Kamaitachi | `shR / Tempest / shoulder gold shield` | shoulders | The broad gold-edged shield covers the shoulder cap above the separate long upper-arm plate. |
| Kamaitachi | `shR / Tempest / shoulder storm field` | shoulders | The inset green field is fixed inside the shoulder shield and must travel with it. |
| Kamaitachi | `shR / Tempest / centred shoulder bolt` | shoulders | The lightning emblem is seated on the shoulder shield, not on the upper-arm shell. |
| Fujin | `shL / Fujin / rounded shoulder turbine armor` | shoulders | The rounded cap is the inner housing of the shoulder turbine; the outer drum and vanes already belong to shoulders. |
| Fujin | `shL / Fujin / shoulder lightning` | shoulders | The lightning mark is fixed to the front of the rounded shoulder turbine housing. |
| Fujin | `shR / Fujin / rounded shoulder turbine armor` | shoulders | The rounded cap is the inner housing of the shoulder turbine; the outer drum and vanes already belong to shoulders. |
| Fujin | `shR / Fujin / shoulder lightning` | shoulders | The lightning mark is fixed to the front of the rounded shoulder turbine housing. |
| Raijin | `shL / Tempest / shoulder gold shield` | shoulders | The broad gold-edged shield covers the shoulder cap above the separate long upper-arm plate. |
| Raijin | `shL / Tempest / shoulder storm field` | shoulders | The inset green field is fixed inside the shoulder shield and must travel with it. |
| Raijin | `shL / Tempest / centred shoulder bolt` | shoulders | The lightning emblem is seated on the shoulder shield, not on the upper-arm shell. |
| Raijin | `shR / Tempest / shoulder gold shield` | shoulders | The broad gold-edged shield covers the shoulder cap above the separate long upper-arm plate. |
| Raijin | `shR / Tempest / shoulder storm field` | shoulders | The inset green field is fixed inside the shoulder shield and must travel with it. |
| Raijin | `shR / Tempest / centred shoulder bolt` | shoulders | The lightning emblem is seated on the shoulder shield, not on the upper-arm shell. |

## Reproduce the pictures

From the checkout root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python art/blender/roster/review_parts.py -- --all
```

Use `--model anubis` (or another design ID) to review a single rebuilt design.
The optional `--allow-untagged` flag is for an initial rule audit only; omit it
for final review. A missing or invalid source tag fails the normal renderer.
The palette is recorded in [palette.json](palette.json).
