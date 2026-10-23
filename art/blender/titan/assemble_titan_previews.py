#!/usr/bin/env python3
"""Assemble Titan Phase 1 review pictures from Blender renders and G1/G2/G3.

Requires Pillow. Run with a Python installation that provides it:
  python3 art/blender/titan/assemble_titan_previews.py --root /path/to/igpx

This only crops, pads and uniformly resizes existing pictures. It never
changes model geometry, retouches reference silhouettes, or stretches images.
G1 crops retain the sheet's native vertical scale and original y coordinates.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("Pillow is required; run this script with a Python that provides PIL.") from exc


BG = "#E4E6EC"
INK = "#29313F"
MUTED = "#626D7E"
LABEL_BG = "#F7F8FA"
DIVIDER = "#C8CDD7"
HEADER = 58


@dataclass(frozen=True)
class View:
    slug: str
    title: str
    sheet: str
    crop: tuple[int, int, int, int]
    panel: tuple[int, int]
    section: str
    paste_x: int = 0


# Bounds reviewed against the original 1536 x 1024 sheets. G1's anatomical
# centers are x=215,591,935,1323; paste offsets center these at panel x=256.
# Preserve source y=0..1024: helmet crown approximately 201, soles 918.
# G2 keeps complete cells so horns, collars and all halo struts remain visible.
# G3 deliberately keeps shared x bounds for both sword views; the tiny adjacent
# shoulder/guard intrusions are present in the source and are not retouched.
VIEWS = (
    View("front", "Front", "g1", (8, 0, 414, 1024), (512, 1024), "body", 49),
    View("three-quarter", "Three-quarter", "g1", (414, 0, 786, 1024), (512, 1024), "body", 79),
    View("side", "Side", "g1", (786, 0, 1091, 1024), (512, 1024), "body", 107),
    View("back", "Back", "g1", (1100, 0, 1529, 1024), (512, 1024), "body", 33),
    View("head-front", "Head and collar · front", "g2", (0, 0, 768, 512), (768, 512), "head"),
    View("head-side", "Head and collar · side", "g2", (768, 0, 1536, 512), (768, 512), "head"),
    View("head-above", "Head and collar · above", "g2", (0, 512, 768, 1024), (768, 512), "head"),
    View("halo", "Halo · face-on", "g2", (768, 512, 1536, 1024), (768, 512), "head"),
    View("right-arm", "Right arm · palm up", "g3", (8, 92, 1528, 540), (1520, 448), "arm"),
    View("sword-flat", "Sword · flat", "g3", (8, 514, 1528, 798), (1520, 284), "arm"),
    View("sword-edge", "Sword · edge-on", "g3", (8, 822, 1528, 912), (1520, 90), "arm"),
)
SHEETS = {
    "g1": "art/model-sheets/model-g1-titan.png",
    "g2": "art/model-sheets/model-g2-titan-head.png",
    "g3": "art/model-sheets/model-g3-titan-arm.png",
}


def rgb(image: Image.Image) -> Image.Image:
    """Composite any transparency against the documented review background."""
    if image.mode == "RGBA" or "transparency" in image.info:
        result = Image.new("RGBA", image.size, BG)
        result.alpha_composite(image.convert("RGBA"))
        return result.convert("RGB")
    return image.convert("RGB")


def contain(image: Image.Image, panel: tuple[int, int]) -> tuple[Image.Image, dict]:
    """Show the entire render; use one scale factor and no content auto-crop."""
    scale = min(panel[0] / image.width, panel[1] / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    fitted = image if size == image.size else image.resize(size, Image.Resampling.LANCZOS)
    offset = ((panel[0] - size[0]) // 2, (panel[1] - size[1]) // 2)
    result = Image.new("RGB", panel, BG)
    result.paste(fitted, offset)
    return result, {"sourceSize": list(image.size), "scale": scale, "displaySize": list(size), "offset": list(offset)}


def font(size: int) -> ImageFont.ImageFont:
    # Pillow's bundled default avoids depending on a user-installed typeface.
    return ImageFont.load_default(size=size)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def link(path: Path, output: Path) -> str:
    return html.escape(Path(os.path.relpath(path, output)).as_posix(), quote=True)


def card(view: View, output: Path, root: Path) -> str:
    width, height = view.panel[0] * 2, view.panel[1] + HEADER
    caption = "Native G1 page scale · crown ≈ 201 / soles 918" if view.sheet == "g1" else "Whole reference view and whole render · proportions preserved"
    return f'''<figure id="{view.slug}" class="comparison">
  <figcaption><h3>{html.escape(view.title)}</h3><span>{caption}</span></figcaption>
  <a class="image-link" href="{view.slug}.png" title="Open full-size {html.escape(view.title, quote=True)} comparison">
    <img src="{view.slug}.png" width="{width}" height="{height}" alt="{html.escape(view.title, quote=True)}: {view.sheet.upper()} reference on the left, Blender blockout on the right" loading="lazy">
  </a>
  <div class="view-links"><a href="raw/{view.slug}.png">Raw render</a><a href="references/{view.slug}.png">Reference crop</a><a href="{link(root / SHEETS[view.sheet], output)}">Full {view.sheet.upper()} sheet</a></div>
</figure>'''


def make_index(root: Path, output: Path, warnings: list[str]) -> str:
    titan = root / "art/blender/titan"
    source_files = [
        ("Production scene", titan / "titan-production.blend"),
        ("Blockout GLB", root / "src/client/render/titan/assets/titan-blockout.glb"),
        ("Joint positions", titan / "joints.json"),
        ("Measurements and triangle counts", titan / "blockout-report.json"),
        ("Independent validation", titan / "validation-report.json"),
        ("Pose/contact validation", titan / "pose-report.json"),
        ("Brief and production notes", titan / "README.txt"),
        ("Crop and assembly record", output / "comparison-manifest.json"),
        *[(path.name, path) for path in sorted(titan.glob("*.py"))],
        *[(f"{key.upper()} source sheet", root / path) for key, path in SHEETS.items()],
    ]
    sources = "\n".join(f'<li><a href="{link(path, output)}">{html.escape(label)}</a></li>' for label, path in source_files)
    nav = "".join(f'<a href="#{view.slug}">{html.escape(view.title.replace("Head and collar · ", "Head "))}</a>' for view in VIEWS)
    sections = []
    for key, title, description in (
        ("body", "01 · Standing proportions", "Four orthographic views at G1’s page height. Reference pixels keep their original vertical coordinates; body renders are shown at their native 512 × 1024 size."),
        ("head", "02 · Head, collar and halo", "Complete G2 cells preserve the horns, collar and halo supports. The mounted halo follows G1; its close-up is isolated for shape review."),
        ("arm", "03 · Arm and sword", "G3’s palm-up hand is the authority for finger construction. Both sword reference crops keep identical horizontal bounds and scale."),
    ):
        cards = "\n".join(card(view, output, root) for view in VIEWS if view.section == key)
        sections.append(f'<section><div class="section-heading"><h2>{title}</h2><p>{description}</p></div><div class="cards {key}">{cards}</div></section>')
    pose_cards = ''.join(f'<figure><figcaption><h3>Extreme pose · {v}</h3><span>Frame contact check only; production file remains standing.</span></figcaption><a href="raw/pose-{v}.png"><img src="raw/pose-{v}.png" alt="Titan articulation check, {v}" loading="lazy"></a></figure>' for v in ('front','side'))
    if (output / 'raw/pose-front.png').exists():
        sections.append('<section><div class="section-heading"><h2>04 · Rig range checks</h2><p>Shoulders 90°, elbows 120°, knees 60°, wrists 45° and all finger knuckles 90°. The internal frame stays connected; armour collision clearance is not certified by this check.</p></div><div class="cards">'+pose_cards+'</div></section>')
    warning_html = ""
    if warnings:
        items = "".join(f"<li>{html.escape(item)}</li>" for item in warnings)
        warning_html = f'<aside class="notes"><h2>Render framing notes</h2><ul>{items}</ul></aside>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titan · Phase 1 blockout review</title>
<style>
:root{{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#28313e;background:#f4f5f7;color-scheme:light;line-height:1.5}}
*{{box-sizing:border-box}}body{{margin:0}}main{{max-width:1480px;margin:auto;padding:42px 30px 64px}}a{{color:#315a80;text-underline-offset:3px}}a:hover{{color:#172c40}}header{{padding:0 0 26px;border-bottom:1px solid #d8dce3}}.eyebrow{{margin:0 0 9px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#766236}}h1{{font-size:clamp(28px,4vw,44px);letter-spacing:-.035em;line-height:1.12;margin:0 0 15px}}header p{{max-width:850px;color:#5c6676;margin:0}}.legend{{display:flex;gap:20px;margin-top:18px;font-size:13px}}.legend b{{color:#29313f}}nav{{display:flex;gap:8px;flex-wrap:wrap;padding:20px 0}}nav a{{font-size:12px;padding:6px 10px;background:white;border:1px solid #dce0e7;border-radius:4px;text-decoration:none}}section{{margin-top:28px}}.section-heading{{display:flex;align-items:baseline;gap:24px;margin:0 0 15px}}h2{{font-size:20px;letter-spacing:-.02em;margin:0}}.section-heading p{{font-size:13px;color:#626d7e;max-width:850px;margin:0}}.cards{{display:grid;gap:24px;grid-template-columns:repeat(2,minmax(0,1fr))}}.cards.arm{{grid-template-columns:minmax(0,1fr)}}figure{{margin:0;background:#fff;border:1px solid #d5dae2;border-radius:6px;overflow:hidden;scroll-margin-top:18px}}figcaption{{padding:14px 16px 12px;border-bottom:1px solid #e4e7ed}}h3{{font-size:16px;font-weight:650;margin:0 0 3px}}figcaption span{{display:block;font-size:11px;color:#697485}}.image-link{{display:block;background:#e4e6ec}}img{{display:block;width:100%;height:auto}}.view-links{{display:flex;gap:18px;flex-wrap:wrap;padding:10px 16px;font-size:12px;border-top:1px solid #e4e7ed}}.notes{{margin:26px 0 0;padding:18px 22px;background:#eceef2;border:1px solid #d9dee7;border-radius:5px;font-size:13px;color:#536072}}.notes h2{{font-size:15px}}.notes p{{margin:8px 0 0}}.sources{{margin-top:34px;padding-top:24px;border-top:1px solid #d8dce3}}.sources ul{{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:9px 22px;font-size:13px}}footer{{font-size:12px;color:#697485;margin-top:24px}}@media(max-width:850px){{main{{padding:28px 14px 40px}}.cards{{grid-template-columns:minmax(0,1fr)}}.section-heading{{display:block}}.section-heading p{{margin-top:8px}}.legend{{display:block}}}}@media print{{main{{max-width:none;padding:0}}nav{{display:none}}.cards{{display:block}}figure{{break-inside:avoid;margin:0 0 18px}}.view-links{{display:none}}}}
</style></head><body><main>
<header><p class="eyebrow">Zenith GP / Titan’s Rest / Phase 1 · Step 1</p><h1>Standing Titan — blockout review</h1><p>Review the large forms, proportions and articulation before refinement. All 11 comparisons place the model sheet on the left and the Blender blockout on the right. Open any image to inspect it at full resolution.</p><div class="legend"><span><b>Reference</b> · approved G1 / G2 / G3 drawings</span><span><b>Blockout</b> · flat materials, orthographic renders</span></div></header>
<nav aria-label="Comparison views">{nav}</nav>
{''.join(sections)}
<aside class="notes"><h2>How to read these comparisons</h2><p>Standing views preserve the source sheet’s page scale, with no vertical crop or resizing. Detail views retain each complete source crop; render fitting is uniform and never stretches either axis. G3’s shoulder silhouette and sword guard overlap slightly between rows, so a small neighboring fragment remains in those reference crops. No reference shapes have been erased or redrawn. This is an intact standing blockout, before the wreck pose, road fitting or damage pass.</p></aside>
{warning_html}
<section class="sources"><h2>Source files and measurements</h2><ul>{sources}</ul></section>
<footer>Generated by assemble_titan_previews.py from the saved renders and original model sheets. Crop coordinates, input hashes and display transforms are recorded in comparison-manifest.json.</footer>
</main></body></html>'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="Repository checkout containing art/blender/titan")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    output = root / "art/blender/titan/previews"
    raw = output / "raw"
    inputs = [root / path for path in SHEETS.values()] + [raw / f"{view.slug}.png" for view in VIEWS]
    missing = [str(path) for path in inputs if not path.is_file()]
    if missing:
        raise SystemExit("Missing required review inputs:\n" + "\n".join(missing))
    sheets = {key: rgb(Image.open(root / path)) for key, path in SHEETS.items()}
    for key, sheet in sheets.items():
        if sheet.size != (1536, 1024):
            raise SystemExit(f"{key.upper()} must retain its native 1536x1024 pixels; found {sheet.size}")
    renders = {view.slug: rgb(Image.open(raw / f"{view.slug}.png")) for view in VIEWS}
    for view in VIEWS:
        if view.section == "body" and renders[view.slug].size != view.panel:
            raise SystemExit(f"{view.slug}: body render must be 512x1024 to preserve page scale; found {renders[view.slug].size}")

    (output / "references").mkdir(parents=True, exist_ok=True)
    record = {"format": 1, "background": BG, "bodyCamera": {"orthographicScale": 1856.346, "targetZ": 736.8, "helmetCrownPixelY": 201, "groundPixelY": 918}, "references": {key: {"path": path, "sha256": digest(root / path)} for key, path in SHEETS.items()}, "views": []}
    warnings: list[str] = []
    for view in VIEWS:
        crop = sheets[view.sheet].crop(view.crop)
        crop.save(output / "references" / f"{view.slug}.png")
        reference = Image.new("RGB", view.panel, BG)
        reference.paste(crop, (view.paste_x, 0))
        blockout, transform = contain(renders[view.slug], view.panel)
        if view.section != "body" and renders[view.slug].size != view.panel:
            warnings.append(f"{view.title}: raw {renders[view.slug].width} × {renders[view.slug].height} render fitted uniformly into {view.panel[0]} × {view.panel[1]}; full framing is retained.")
        comparison = Image.new("RGB", (view.panel[0] * 2, view.panel[1] + HEADER), BG)
        comparison.paste(reference, (0, HEADER))
        comparison.paste(blockout, (view.panel[0], HEADER))
        draw = ImageDraw.Draw(comparison)
        draw.rectangle((0, 0, comparison.width, HEADER - 1), fill=LABEL_BG)
        for x, label, source in ((0, "Reference", view.sheet.upper()), (view.panel[0], "Blockout", "Phase 1 / Step 1")):
            draw.text((x + 18, 12), label, font=font(19), fill=INK)
            draw.text((x + 18, 35), source, font=font(11), fill=MUTED)
        draw.line((view.panel[0], 0, view.panel[0], comparison.height), fill=DIVIDER, width=1)
        comparison.save(output / f"{view.slug}.png")
        record["views"].append({"id": view.slug, "title": view.title, "sheet": view.sheet, "referenceCrop": list(view.crop), "referencePaste": [view.paste_x, 0], "panel": list(view.panel), "rawRender": f"raw/{view.slug}.png", "rawSha256": digest(raw / f"{view.slug}.png"), "renderDisplay": transform, "comparison": f"{view.slug}.png"})
    record["framingNotes"] = warnings
    (output / "comparison-manifest.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    (output / "index.html").write_text(make_index(root, output, warnings), encoding="utf-8")
    print(f"Assembled {len(VIEWS)} comparisons and index: {output / 'index.html'}")
    for warning in warnings:
        print(f"Framing: {warning}")


if __name__ == "__main__":
    main()
