#!/usr/bin/env python3
"""Package optimized Barcelona runtime assets into the repository's CI format."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
# A 6 MiB base64 part decodes to this many bytes (a multiple of three).
RAW_PART_BYTES = 6 * 1024 * 1024 * 3 // 4
LARGE_BINARIES = {"t06.bin", "t09.bin"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_base64(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64encode(data) + b"\n")


def package(tiles: Path, gameplay: Path) -> dict[str, int]:
    tiles = tiles.resolve()
    gameplay = gameplay.resolve()
    manifest_path = tiles / "tiles.json"
    surface_json = gameplay / "surface.json"
    surface_bin = gameplay / "surface.bin"
    for required in (manifest_path, surface_json, surface_bin):
        if not required.is_file() or required.stat().st_size == 0:
            raise SystemExit(f"Required runtime input missing or empty: {required}")

    manifest = json.loads(manifest_path.read_text())
    if len(manifest.get("tiles", [])) != 13:
        raise SystemExit("Expected base plus 12 Barcelona tiles in tiles.json")
    for tile in manifest["tiles"]:
        for rel in [tile["file"], *tile.get("tex", [])]:
            if not (tiles / rel).is_file():
                raise SystemExit(f"Manifest asset is missing: {rel}")

    entries: list[tuple[str, Path]] = []
    entries.extend((f"assets/barcelona/{p.relative_to(tiles).as_posix()}", p)
                   for p in sorted(tiles.rglob("*")) if p.is_file())
    entries.extend((f"track_barcelona/{p.name}", p)
                   for p in (surface_json, surface_bin))

    local_assets = REPO / "source/game/public/assets/barcelona"
    local_track = REPO / "source/game/public/track_barcelona"
    public_assets = REPO / "public/assets/barcelona"
    public_track = REPO / "public/track_barcelona"
    for path in (local_assets, local_track, public_assets, public_track):
        if path.exists():
            shutil.rmtree(path)
    local_assets.mkdir(parents=True)
    local_track.mkdir(parents=True)

    parts_dir = REPO / "parts"
    parts_dir.mkdir(exist_ok=True)
    for stale in parts_dir.glob("assets__barcelona__*.part*"):
        stale.unlink()

    checksums: list[tuple[str, str]] = []
    total_bytes = 0
    part_count = 0
    for rel, source in entries:
        data = source.read_bytes()
        total_bytes += len(data)
        if rel.startswith("assets/"):
            local_dest = local_assets / rel.removeprefix("assets/barcelona/")
            encoded_dest = public_assets / rel.removeprefix("assets/barcelona/")
        else:
            local_dest = local_track / Path(rel).name
            encoded_dest = public_track / Path(rel).name
        local_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, local_dest)
        checksums.append((sha256(source), f"public/{rel}"))

        if rel.startswith("assets/") and Path(rel).name in LARGE_BINARIES:
            stem = Path(rel).name
            for index, start in enumerate(range(0, len(data), RAW_PART_BYTES)):
                chunk = data[start:start + RAW_PART_BYTES]
                part_path = parts_dir / f"assets__barcelona__{stem}.part{index:02d}"
                write_base64(part_path, chunk)
                part_count += 1
            continue
        write_base64(encoded_dest, data)

    checksums_path = REPO / "SHA256SUMS"
    old_lines = checksums_path.read_text().splitlines()
    keep = [line for line in old_lines
            if "  public/assets/barcelona/" not in line
            and "  public/track_barcelona/" not in line]
    keep.extend(f"{digest}  {path}" for digest, path in sorted(checksums))
    checksums_path.write_text("\n".join(keep) + "\n")

    # Verify that the base64 representation and split reconstruction are lossless.
    for rel, source in entries:
        data = source.read_bytes()
        if rel.startswith("assets/") and Path(rel).name in LARGE_BINARIES:
            stem = Path(rel).name
            encoded_parts = sorted(parts_dir.glob(f"assets__barcelona__{stem}.part*"))
            restored = b"".join(base64.b64decode(p.read_bytes()) for p in encoded_parts)
        else:
            encoded_path = public_assets / rel.removeprefix("assets/barcelona/") if rel.startswith("assets/") else public_track / Path(rel).name
            restored = base64.b64decode(encoded_path.read_bytes())
        if restored != data:
            raise SystemExit(f"Base64 round-trip failed for {rel}")

    return {"files": len(entries), "raw_bytes": total_bytes, "split_parts": part_count}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tiles", required=True, type=Path, help="build_track_tiles output directory")
    parser.add_argument("--gameplay", required=True, type=Path, help="Barcelona gameplay bake output directory")
    args = parser.parse_args()
    stats = package(args.tiles, args.gameplay)
    print(f"Packaged {stats['files']} runtime files ({stats['raw_bytes']} raw bytes; "
          f"{stats['split_parts']} Base64 parts for large binaries).")
    print("Updated local runtime assets, public Base64 assets, parts/, and SHA256SUMS.")


if __name__ == "__main__":
    main()
