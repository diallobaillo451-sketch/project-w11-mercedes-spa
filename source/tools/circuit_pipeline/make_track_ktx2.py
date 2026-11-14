#!/usr/bin/env python3
"""Build incremental UASTC KTX2 companions for the WebP textures in track tiles."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - actionable CLI error
    raise SystemExit("Pillow is required: python3 -m pip install Pillow") from exc

SRGB_KEYS = {
    "baseColorTexture", "emissiveTexture", "sheenColorTexture",
    "specularColorTexture", "diffuseTransmissionColorTexture",
}
LINEAR_KEYS = {
    "metallicRoughnessTexture", "normalTexture", "occlusionTexture",
    "clearcoatTexture", "clearcoatRoughnessTexture", "clearcoatNormalTexture",
    "specularTexture", "transmissionTexture", "thicknessTexture",
    "iridescenceTexture", "iridescenceThicknessTexture", "anisotropyTexture",
    "diffuseTransmissionTexture",
}


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def material_texture_indices(material: dict[str, Any]):
    pbr = material.get("pbrMetallicRoughness", {})
    for key in SRGB_KEYS | LINEAR_KEYS:
        info = pbr.get(key) if key in pbr else material.get(key)
        if isinstance(info, dict) and isinstance(info.get("index"), int):
            yield info["index"], key in LINEAR_KEYS
    extensions = material.get("extensions", {})
    if isinstance(extensions, dict):
        for ext in extensions.values():
            if not isinstance(ext, dict):
                continue
            for key, info in ext.items():
                if not isinstance(info, dict) or not isinstance(info.get("index"), int):
                    continue
                if key in SRGB_KEYS:
                    yield info["index"], False
                elif key in LINEAR_KEYS:
                    yield info["index"], True


def texture_color_roles(tiles: Path, manifest: dict[str, Any]) -> dict[str, bool]:
    """Return image URI -> linear flag, preferring linear if an image is shared."""
    roles: dict[str, bool] = {}
    for tile in manifest["tiles"]:
        gltf_path = tiles / tile["file"]
        gltf = json.loads(gltf_path.read_text())
        images = gltf.get("images", [])
        textures = gltf.get("textures", [])
        for material in gltf.get("materials", []):
            for ti, linear in material_texture_indices(material):
                if not 0 <= ti < len(textures):
                    continue
                image_index = textures[ti].get("source")
                if image_index is None:
                    image_index = textures[ti].get("extensions", {}).get("KHR_texture_basisu", {}).get("source")
                if not isinstance(image_index, int) or not 0 <= image_index < len(images):
                    continue
                uri = images[image_index].get("uri")
                if isinstance(uri, str) and uri.startswith("tex/"):
                    roles[uri] = roles.get(uri, False) or linear
    return roles


def resolve_ktx(value: str) -> Path:
    found = shutil.which(value)
    path = Path(found or value).expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"KTX CLI not found: {value}; pass --ktx or set KTX_CLI")
    return path


def build(tiles: Path, ktx: Path, threads: int, force: bool) -> dict[str, int]:
    tiles = tiles.resolve()
    tex_dir = tiles / "tex"
    manifest_path = tiles / "tiles.json"
    if not manifest_path.is_file() or not tex_dir.is_dir():
        raise SystemExit(f"Expected tiles.json and tex/ under {tiles}")
    manifest = json.loads(manifest_path.read_text())
    roles = texture_color_roles(tiles, manifest)
    metadata_path = tex_dir / "ktx2_build.json"
    try:
        metadata = json.loads(metadata_path.read_text())
        previous = metadata.get("textures", {}) if isinstance(metadata, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {}
    env = dict(os.environ)
    lib_dir = ktx.parent.parent / "lib"
    if lib_dir.is_dir():
        env["LD_LIBRARY_PATH"] = str(lib_dir) + (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")

    outputs: dict[str, list[int]] = {}
    records: dict[str, dict[str, Any]] = {}
    converted = skipped = 0
    for webp in sorted(tex_dir.glob("*.webp")):
        with Image.open(webp) as im:
            width, height = im.size
            has_alpha = "A" in im.getbands() or (im.mode == "P" and "transparency" in im.info)
            mode = "RGBA" if has_alpha else "RGB"
            pixel_hash = file_hash(webp)
        if width * height < 16:
            continue
        linear = roles.get(f"tex/{webp.name}", False)
        destination = webp.with_suffix(".ktx2")
        old = previous.get(webp.stem, {})
        if (not force and destination.is_file() and old.get("webp_sha256") == pixel_hash
                and old.get("width") == width and old.get("height") == height
                and old.get("linear") == linear
                and old.get("ktx2_sha256") == file_hash(destination)):
            skipped += 1
        else:
            with tempfile.TemporaryDirectory(prefix="track-ktx2-") as td:
                tmpdir = Path(td)
                png = tmpdir / "input.png"
                tmp_ktx = tmpdir / "output.ktx2"
                with Image.open(webp) as im:
                    im.convert(mode).save(png)
                fmt = "R8G8B8A8_UNORM" if linear else "R8G8B8A8_SRGB"
                tf = "linear" if linear else "srgb"
                command = [str(ktx), "create", "--format", fmt, "--assign-tf", tf,
                           "--encode", "uastc", "--uastc-quality", "2", "--zstd", "19",
                           "--generate-mipmap", "--threads", str(threads), str(png), str(tmp_ktx)]
                subprocess.run(command, check=True, env=env, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE, text=True)
                if not tmp_ktx.is_file() or tmp_ktx.stat().st_size < 64:
                    raise SystemExit(f"KTX did not produce a valid output for {webp.name}")
                os.replace(tmp_ktx, destination)
            converted += 1
        outputs[webp.stem] = [width, height]
        records[webp.stem] = {"webp_sha256": pixel_hash, "width": width, "height": height,
                              "linear": linear, "ktx2_sha256": file_hash(destination)}
        if (converted + skipped) % 10 == 0:
            print(f"KTX2 progress: {converted} rebuilt, {skipped} cached", flush=True)

    (tex_dir / "ktx2.json").write_text(json.dumps(outputs, sort_keys=True, separators=(",", ":")) + "\n")
    metadata_path.write_text(json.dumps({"format": "UASTC+zstd", "textures": records},
                                        sort_keys=True, separators=(",", ":")) + "\n")
    return {"webp": len(outputs), "converted": converted, "cached": skipped,
            "ktx2_bytes": sum((tex_dir / f"{name}.ktx2").stat().st_size for name in outputs)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tiles", required=True, type=Path, help="Directory containing tiles.json and tex/")
    parser.add_argument("--ktx", default=os.environ.get("KTX_CLI", "ktx"), help="KTX-Software 4.4.2+ CLI")
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 1))
    parser.add_argument("--force", action="store_true", help="Rebuild even if source hashes match")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads must be >= 1")
    stats = build(args.tiles, resolve_ktx(args.ktx), args.threads, args.force)
    print(f"KTX2: {stats['webp']} WebP textures; {stats['converted']} rebuilt; "
          f"{stats['cached']} cached; {stats['ktx2_bytes'] / 1e6:.1f} MB KTX2")


if __name__ == "__main__":
    main()
