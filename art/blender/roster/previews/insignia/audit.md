# Faction insignia visual audit

Reviewed the saved production scenes with Blender **5.2.2 LTS** (`d13f752e3b9c`). The [gallery](index.html) contains **28 full-model renders** (front and three-quarter for all 14 roster designs) and **12 anchor close-ups**. Sunhawk is outside this modelled-insignia pass.

**Result: 33 source pieces form 12 badges/anchors, matching the faction-insignia table exactly. No spec mismatches or anchor corrections were found.** All 12 anchor centers were obtained by an outward-normal ray intersection with the visible badge surface; no negative-space fallback was used. Each source's recorded `insignia_anchor_method` is retained in its design's JSON inventory.

## Reading the pictures

- Orange: chest insignia. Purple: left-shoulder insignia. Pink: right-shoulder insignia. All other source armour is muted grey.
- Cyan perimeter: the actual square replacement footprint, using the exported width. Its cyan cross marks the center.
- Magenta arrow: outward normal. Green arrow: up projected into the tangent plane.
- The camera views the shoulder close-ups from the corresponding outer side, keeping their actual armour context visible. Raijin's upper shoulder guard can occlude a short portion of the square edge at oblique angles; it does not obscure the bolt, and remains ordinary armour.
- Review guide geometry alone has a **0.018 game-unit outward display lift** to avoid z-fighting. No such lift is present in the exported anchor values or the inventory's square corners. Source geometry is never moved, modified or saved by the renderer.

The renderer reads the saved `insignia_json` anchors and the source mesh tags. It checks anchor/tag agreement and unit, orthogonal normal/up vectors before drawing. Anchors use game joint-local coordinates; the review converts them through the actual production joint transform. The square width is the badge's maximum projected dimension plus a 2% margin, so long, narrow bolts receive a square footprint rather than a narrow rectangle.

## Per-design checks

| Design | Badge source pieces | Anchors | Visual review |
|---|---:|---:|---|
| [Daystar](daystar-anchors.json) | 0 | 0 | No modelled badge. Solstice forms and crests remain grey armour. |
| [Rampart](rampart-anchors.json) | 0 | 0 | No modelled badge. Diamond, chest grille and gold crests remain grey armour. |
| [Razor](razor-anchors.json) | 0 | 0 | No modelled badge. Vanta chevrons and weapon shapes remain grey armour. |
| [Stinger](stinger-anchors.json) | 0 | 0 | No modelled badge. Vanta chest chevrons remain grey armour. |
| [Maul](maul-anchors.json) | 0 | 0 | No modelled badge. Vanta chest and hip chevrons remain grey armour. |
| [Anubis](anubis-anchors.json) | 0 | 0 | No modelled badge. Mirage sun forms, collar and medallion remain grey armour. |
| [Horus](horus-anchors.json) | 0 | 0 | No modelled badge. Mirage disc, collar and medallion remain grey armour. |
| [Sobek](sobek-anchors.json) | 0 | 0 | No modelled badge. Mirage disc, collar and medallion remain grey armour. |
| [Seraph](seraph-anchors.json) | 8 | 1 | Full sword, guard and six feather reliefs highlighted. Square is centered on the heart cuirass, with clear outward/up directions. |
| [Longbow](longbow-anchors.json) | 8 | 1 | Full sword, guard and six feather reliefs highlighted. Square is centered on the lower breastplate; banners and equipment stay untagged. |
| [Paladin](paladin-anchors.json) | 8 | 1 | Full sword, guard and six feather reliefs highlighted. Square is centered on the lower breastplate; shoulder shields and banners stay untagged. |
| [Kamaitachi](kamaitachi-anchors.json) | 3 | 3 | Chest and both shoulder bolts highlighted. Paired shoulder widths/orientation agree. Backing storm fields and greave veins stay untagged. |
| [Fujin](fujin-anchors.json) | 3 | 3 | Chest and both shoulder bolts highlighted. Shoulder anchors follow the rounded turbine fronts with matching left/right tangent tilt. Sash and greave lightning stay untagged. |
| [Raijin](raijin-anchors.json) | 3 | 3 | Chest and both shoulder bolts highlighted. Paired shoulder frames agree. Backing storm fields, greave veins and drum details stay untagged. |

## Replacement anchor values

Game joint-local coordinates, rounded here to six decimals. Each linked JSON retains the exact exported numeric values.

| Design / badge | Joint / part | Center | Outward normal | Up | Width |
|---|---|---|---|---|---:|
| [seraph / chest](seraph-anchors.json) | `chest / chest` | `[0.000000, 0.821972, 0.842284]` | `[0.000000, -0.000858, 1.000000]` | `[0.000000, 1.000000, 0.000858]` | 0.705347 |
| [longbow / chest](longbow-anchors.json) | `chest / chest` | `[0.000014, 0.555635, 0.977883]` | `[0.000228, 0.008121, 0.999967]` | `[-0.000002, 0.999967, -0.008121]` | 0.802160 |
| [paladin / chest](paladin-anchors.json) | `chest / chest` | `[0.000024, 0.558074, 1.219146]` | `[0.000377, 0.021409, 0.999771]` | `[-0.000008, 0.999771, -0.021409]` | 0.842825 |
| [kamaitachi / chest](kamaitachi-anchors.json) | `chest / chest` | `[-0.000032, 0.829414, 0.845612]` | `[-0.001956, -0.015554, 0.999877]` | `[-0.000030, 0.999879, 0.015554]` | 0.887802 |
| [kamaitachi / shoulderL](kamaitachi-anchors.json) | `shL / shoulders` | `[-0.000063, -0.159948, 0.619384]` | `[-0.004014, 0.002320, 0.999989]` | `[0.000009, 0.999997, -0.002320]` | 0.561038 |
| [kamaitachi / shoulderR](kamaitachi-anchors.json) | `shR / shoulders` | `[-0.000063, -0.159948, 0.619384]` | `[-0.004014, 0.002320, 0.999989]` | `[0.000009, 0.999997, -0.002320]` | 0.561038 |
| [fujin / chest](fujin-anchors.json) | `chest / chest` | `[-0.000020, 0.829331, 1.015824]` | `[-0.001348, -0.014900, 0.999888]` | `[-0.000020, 0.999889, 0.014900]` | 0.969480 |
| [fujin / shoulderL](fujin-anchors.json) | `shL / shoulders` | `[0.000000, -0.042869, 0.585462]` | `[0.000000, -0.056674, 0.998393]` | `[0.000000, 0.998393, 0.056674]` | 0.440239 |
| [fujin / shoulderR](fujin-anchors.json) | `shR / shoulders` | `[0.000000, -0.042869, 0.585462]` | `[0.000000, -0.056674, 0.998393]` | `[0.000000, 0.998393, 0.056674]` | 0.440239 |
| [raijin / chest](raijin-anchors.json) | `chest / chest` | `[-0.000014, 0.829734, 1.246079]` | `[-0.001053, -0.004436, 0.999990]` | `[-0.000005, 0.999990, 0.004436]` | 1.060945 |
| [raijin / shoulderL](raijin-anchors.json) | `shL / shoulders` | `[-0.000044, -0.159702, 0.796224]` | `[-0.003639, 0.015618, 0.999871]` | `[0.000057, 0.999878, -0.015618]` | 0.663313 |
| [raijin / shoulderR](raijin-anchors.json) | `shR / shoulders` | `[-0.000044, -0.159702, 0.796224]` | `[-0.003639, 0.015618, 0.999871]` | `[0.000057, 0.999878, -0.015618]` | 0.663313 |

## Exact tagged source identities

These stable authoring identities are selected by [`insignia_tags.py`](../../insignia_tags.py), not by Blender's scene-dependent numeric suffixes. Each source remains on its specified joint and part. Other meshes with similar motifs are not included.

### Seraph

- `chest / Aurora / sigil feather` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [2]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [3]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [4]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [5]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [6]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword guard` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword sigil` → `chest` / `chest`; anchor method: visible badge surface.

### Longbow

- `chest / Aurora / sigil feather` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [2]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [3]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [4]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [5]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [6]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword guard` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword sigil` → `chest` / `chest`; anchor method: visible badge surface.

### Paladin

- `chest / Aurora / sigil feather` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [2]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [3]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [4]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [5]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sigil feather [6]` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword guard` → `chest` / `chest`; anchor method: visible badge surface.
- `chest / Aurora / sword sigil` → `chest` / `chest`; anchor method: visible badge surface.

### Kamaitachi

- `chest / Tempest / centred chest bolt` → `chest` / `chest`; anchor method: visible badge surface.
- `shL / Tempest / centred shoulder bolt` → `shoulderL` / `shoulders`; anchor method: visible badge surface.
- `shR / Tempest / centred shoulder bolt` → `shoulderR` / `shoulders`; anchor method: visible badge surface.

### Fujin

- `chest / Tempest / centred chest bolt` → `chest` / `chest`; anchor method: visible badge surface.
- `shL / Fujin / shoulder lightning` → `shoulderL` / `shoulders`; anchor method: visible badge surface.
- `shR / Fujin / shoulder lightning` → `shoulderR` / `shoulders`; anchor method: visible badge surface.

### Raijin

- `chest / Tempest / centred chest bolt` → `chest` / `chest`; anchor method: visible badge surface.
- `shL / Tempest / centred shoulder bolt` → `shoulderL` / `shoulders`; anchor method: visible badge surface.
- `shR / Tempest / centred shoulder bolt` → `shoulderR` / `shoulders`; anchor method: visible badge surface.

## Reproduce

From the repository root, after rebuilding the production scenes:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python art/blender/roster/review_insignia.py -- --all
```

Use `--model fujin` to inspect one design. The renderer only changes the scene in memory to create review colours, cameras, labels and guides; it never saves a production `.blend` or exports a game asset. All images are direct Blender renders, not generated concept art.

The independent [expanded-triangle and ink comparison](triangle-equivalence.json) proves stock geometry is unchanged at every LOD; this visual audit checks badge scope and replacement placement.
