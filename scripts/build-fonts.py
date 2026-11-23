#!/usr/bin/env python3
"""Build the fonts bundled into the plugin (build-time only; never runs in Figma).

Reads the upstream OFL fonts from SRC_DIR (downloaded from github.com/google/fonts
into an empty directory), verifies each file against a pinned SHA-256, turns the
variable fonts into one static instance per weight, subsets everything to Latin,
and writes the result to OUT_DIR as TTF plus a manifest.json.

Requires fonttools >= 4.68.0 (pinned) with brotli only if --woff2 is used.

    python3 -I scripts/build-fonts.py SRC_DIR OUT_DIR
"""
from __future__ import annotations

import hashlib
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

log = logging.getLogger("build-fonts")

# Latin-1, Latin Extended-A, common punctuation/symbols, fi/fl ligatures.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + [0x192, 0x2C6, 0x2DC, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E]
    + [0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2192, 0x2212]
    + [0xFB01, 0xFB02]
)

WEIGHT_NAMES = {
    100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
    600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
}


@dataclass(frozen=True)
class VariableSource:
    family: str
    file: str
    sha256: str
    italic: bool
    weights: tuple[int, ...]
    fixed_axes: dict[str, float]


@dataclass(frozen=True)
class StaticSource:
    family: str
    file: str
    sha256: str


ALL = (100, 200, 300, 400, 500, 600, 700, 800, 900)
VARIABLE = [
    VariableSource("Inter", "inter_Inter[opsz,wght].ttf", "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031", False, ALL, {"opsz": 14}),
    VariableSource("Inter", "inter_Inter-Italic[opsz,wght].ttf", "acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6", True, ALL, {"opsz": 14}),
    VariableSource("Roboto", "roboto_Roboto[wdth,wght].ttf", "d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134", False, ALL, {"wdth": 100}),
    VariableSource("Roboto", "roboto_Roboto-Italic[wdth,wght].ttf", "9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182", True, ALL, {"wdth": 100}),
    VariableSource("Open Sans", "opensans_OpenSans[wdth,wght].ttf", "36643644f318a812aab2d2ed3bb98f8cf0872527f835fe9398d95fe6b9adb878", False, (300, 400, 500, 600, 700, 800), {"wdth": 100}),
    VariableSource("Open Sans", "opensans_OpenSans-Italic[wdth,wght].ttf", "fe269381e992f32e135801740998544d6235061e37c93ec067ad2be3edd5b17b", True, (300, 400, 500, 600, 700, 800), {"wdth": 100}),
]
STATIC = [
    StaticSource("Lato", f, h)
    for f, h in {
        "lato_Lato-Black.ttf": "808c62839c62dbce7de689af7603666fc7f8b81e0df537d8a5212c87580d4337",
        "lato_Lato-BlackItalic.ttf": "3214f75bf96783a571bd25338c867c669e7c5e7c08a227f18a7b63766d6e6cbe",
        "lato_Lato-Bold.ttf": "8a0aace75d33794eece4b28187bfc1df0bbd2888b5d8a56e01788c8d65d16be1",
        "lato_Lato-BoldItalic.ttf": "62c1b7f0d2e74b45960154c3520efc337b553db0961bfdc950d5618334596cc8",
        "lato_Lato-ExtraBold.ttf": "61018de62bdaf90d4ac80b1d53c5c130756c8e9219aea3d2773fc9bd5869af97",
        "lato_Lato-ExtraBoldItalic.ttf": "a42b384b9c37913a61023e3a47c07fead26e776127bbc9e6a0c96fe413089374",
        "lato_Lato-ExtraLight.ttf": "989989b481db5df0827d90c51fd08d024fe7bc4e367046e2584a0d3b0487936d",
        "lato_Lato-ExtraLightItalic.ttf": "fc56526250b9b64ce0908c52350b03e91b84afecb08fd2834a12e57b91abdb31",
        "lato_Lato-Italic.ttf": "e399c44efe1387100531d26c7e4800c5d12251b890d6654a3098c7c679cb1786",
        "lato_Lato-Light.ttf": "cf2a774503baf418d584f49967bd160e1e03f087c13b25602f28024ec7788f08",
        "lato_Lato-LightItalic.ttf": "700e6722fd14a10e7646347a6b14c486d4c364a373ba61c70e0b5ccee7811635",
        "lato_Lato-Medium.ttf": "d3ac182a6833e005745dd75679fbad081c0b12535df4e93ad8ed57817a31a338",
        "lato_Lato-MediumItalic.ttf": "ecbce6cffa42d8a67afeb27a9d6e85d515e81481d4b2cece989e833a48048405",
        "lato_Lato-Regular.ttf": "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
        "lato_Lato-SemiBold.ttf": "71b8b7decbe75a881ed267be539d402bd1e9420b799658aada4e0d1bd5af803c",
        "lato_Lato-SemiBoldItalic.ttf": "5adeb6b334d8fb99ef053bc052b952773d544315e0e1d668a12c0ce8bd51375c",
        "lato_Lato-Thin.ttf": "663c55bfe9a38270fff44da273bf4d792eafc3e7e1201f62c3064cad80c5d5e7",
        "lato_Lato-ThinItalic.ttf": "e5e86e219ce6987b175470d94d57753a387d1860b635da6327a60e8d19a33beb",
    }.items()
]


def read_verified(src_dir: Path, name: str, sha256: str) -> Path:
    """Return the path only if the file's hash matches the pinned value."""
    path = src_dir / name
    if path.resolve().parent != src_dir.resolve():  # no path traversal via names
        raise ValueError(f"unexpected path: {name}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != sha256:
        raise ValueError(f"hash mismatch for {name}: {digest}")
    return path


def subset_font(font: TTFont) -> TTFont:
    opts = subset.Options()
    opts.hinting = False  # hints are useless in PDF and ~30% of the size
    opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]  # keep license/copyright strings (OFL requires them)
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.drop_tables += ["DSIG", "STAT", "meta"]
    subsetter = subset.Subsetter(opts)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    return font


def style_name(weight: int, italic: bool) -> str:
    base = WEIGHT_NAMES[weight]
    if italic:
        return "Italic" if weight == 400 else f"{base} Italic"
    return base


def write(font: TTFont, out_dir: Path, family: str, style: str, manifest: list[dict]) -> None:
    slug = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    out = out_dir / f"{slug}.ttf"
    font.save(out)
    reread = TTFont(out)
    names = reread["name"]
    manifest.append({
        "file": out.name,
        "family": family,
        "style": style,
        "postscriptName": names.getDebugName(6),
        "fsType": reread["OS/2"].fsType,
        "bytes": out.stat().st_size,
        "glyphs": len(reread.getGlyphOrder()),
    })
    log.info("%s %s -> %d bytes", family, style, out.stat().st_size)


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    log.setLevel(logging.INFO)
    if len(argv) != 3:
        print(__doc__)
        return 2
    src_dir, out_dir = Path(argv[1]), Path(argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for var in VARIABLE:
        path = read_verified(src_dir, var.file, var.sha256)
        for weight in var.weights:
            font = TTFont(path)
            limits = {"wght": weight, **var.fixed_axes}
            instancer.instantiateVariableFont(font, limits, inplace=True, updateFontNames=False)
            style = style_name(weight, var.italic)
            set_names(font, var.family, style, weight, var.italic)
            write(subset_font(font), out_dir, var.family, style, manifest)

    for static in STATIC:
        path = read_verified(src_dir, static.file, static.sha256)
        font = TTFont(path)
        style = style_from_file(static.file)
        write(subset_font(font), out_dir, static.family, style, manifest)

    (out_dir / "manifest.json").write_text(json.dumps(sorted(manifest, key=lambda m: (m["family"], m["style"])), indent=1))
    total = sum(m["bytes"] for m in manifest)
    log.info("%d fonts, %.2f MB total", len(manifest), total / 1e6)
    return 0


def style_from_file(name: str) -> str:
    stem = name.rsplit("-", 1)[1].removesuffix(".ttf")
    italic = stem.endswith("Italic") and stem != "Italic"
    if stem == "Italic":
        return "Italic"
    weight = stem.removesuffix("Italic")
    return f"{weight} Italic" if italic else weight


def set_names(font: TTFont, family: str, style: str, weight: int, italic: bool) -> None:
    """Static naming: RIBBI styles use ID1/ID2, others fold the style into ID1 (ID16/17 hold the real pair)."""
    name = font["name"]
    ribbi = style in ("Regular", "Bold", "Italic", "Bold Italic")
    ps = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    full = f"{family} {style}"
    name.setName(family if ribbi else f"{family} {style}", 1, 3, 1, 0x409)
    name.setName(style if ribbi else ("Italic" if italic else "Regular"), 2, 3, 1, 0x409)
    name.setName(f"{ps};static", 3, 3, 1, 0x409)
    name.setName(full, 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    if not ribbi:
        name.setName(family, 16, 3, 1, 0x409)
        name.setName(style, 17, 3, 1, 0x409)
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    # fsSelection: bit0 italic, bit5 bold, bit6 regular
    sel = os2.fsSelection & ~((1 << 0) | (1 << 5) | (1 << 6))
    if italic:
        sel |= 1 << 0
    if weight == 700:
        sel |= 1 << 5
    if style == "Regular":
        sel |= 1 << 6
    os2.fsSelection = sel
    font["head"].macStyle = (1 if weight == 700 else 0) | (2 if italic else 0)
    if "fvar" in font:  # instancer removes it; guard anyway
        del font["fvar"]


if __name__ == "__main__":
    sys.exit(main(sys.argv))
