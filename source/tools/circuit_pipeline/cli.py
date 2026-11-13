#!/usr/bin/env python3
"""Reusable, cache-aware GLB preparation pipeline for circuit assets.

This runner never changes the source file. Blender import/export is a non-destructive
round trip; optional spatial tiling delegates to the repository's existing builder.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from typing import Any, Iterator

HERE = Path(__file__).resolve().parent
SOURCE_ROOT = HERE.parents[1]
REPO_ROOT = SOURCE_ROOT.parent
TOOLS_ROOT = SOURCE_ROOT / "tools"
BLENDER_WORKER = HERE / "blender_worker.py"
TILE_BUILDER = TOOLS_ROOT / "build_track_tiles.mjs"
PIPELINE_VERSION = "1.0.0"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_sha256(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def blender_stage_key(source_hash: str, worker_hash: str, blender_version: str, config: dict[str, Any], inspect_only: bool) -> str:
    return stable_sha256({
        "source_sha256": source_hash,
        "worker_sha256": worker_hash,
        "blender_version": blender_version,
        "blender_options": config.get("blender", {}),
        "inspect_only": inspect_only,
    })


def tile_stage_key(scene_hash: str, builder_hash: str, config: dict[str, Any]) -> str:
    tiles = config.get("tiles", {})
    return stable_sha256({
        "scene_sha256": scene_hash,
        "builder_sha256": builder_hash,
        "tile_options": {
            "count": tiles.get("count", 12),
            "color_quality": tiles.get("color_quality", 92),
            "normal_quality": tiles.get("normal_quality", 95),
            "material_alpha_modes": tiles.get("material_alpha_modes", {}),
        },
    })


def validate_glb(path: Path) -> dict[str, Any]:
    """Validate the GLB 2 container header and embedded JSON chunk."""
    size = path.stat().st_size
    if size < 20:
        raise ValueError(f"GLB trop petit: {path} ({size} octets)")
    with path.open("rb") as stream:
        magic, version, declared_length = struct.unpack("<4sII", stream.read(12))
        if magic != b"glTF":
            raise ValueError(f"Signature GLB incorrecte: {path}")
        if version != 2:
            raise ValueError(f"Version GLB attendue 2, reçue {version}: {path}")
        if declared_length != size:
            raise ValueError(f"Longueur GLB déclarée {declared_length} != taille réelle {size}: {path}")
        offset = 12
        json_doc: dict[str, Any] | None = None
        while offset + 8 <= size:
            chunk_length, chunk_type = struct.unpack("<II", stream.read(8))
            offset += 8
            if chunk_length > size - offset:
                raise ValueError(f"Chunk GLB tronqué: {path}")
            data = stream.read(chunk_length)
            offset += chunk_length
            if chunk_type == 0x4E4F534A:
                try:
                    json_doc = json.loads(data.decode("utf-8").rstrip(" \x00"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise ValueError(f"Chunk JSON GLB invalide: {path}: {exc}") from exc
                break
        if json_doc is None:
            raise ValueError(f"Chunk JSON absent du GLB: {path}")
        asset_version = json_doc.get("asset", {}).get("version")
        if asset_version != "2.0":
            raise ValueError(f"asset.version attendu 2.0, reçu {asset_version!r}: {path}")
    return {"valid": True, "version": version, "asset_version": asset_version, "size_bytes": size}


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Impossible de lire la configuration {path}: {exc}") from exc
    if config.get("schema_version") != 1:
        raise ValueError("schema_version doit être 1")
    circuit = config.get("circuit")
    if not isinstance(circuit, dict):
        raise ValueError("circuit doit être un objet")
    circuit_id = circuit.get("id")
    if not isinstance(circuit_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", circuit_id):
        raise ValueError("circuit.id doit être en minuscules et n’utiliser que a-z, 0-9 et tirets")
    if not isinstance(circuit.get("display_name"), str) or not circuit["display_name"].strip():
        raise ValueError("circuit.display_name est obligatoire")
    blender = config.setdefault("blender", {})
    if not isinstance(blender.get("export_roundtrip", True), bool):
        raise ValueError("blender.export_roundtrip doit être booléen")
    tiles = config.setdefault("tiles", {})
    for key, default in (("count", 12), ("color_quality", 92), ("normal_quality", 95)):
        value = tiles.get(key, default)
        if not isinstance(value, int):
            raise ValueError(f"tiles.{key} doit être entier")
        if key == "count" and not (1 <= value <= 128):
            raise ValueError("tiles.count doit être entre 1 et 128")
        if key != "count" and not (1 <= value <= 100):
            raise ValueError(f"tiles.{key} doit être entre 1 et 100")
    modes = tiles.get("material_alpha_modes", {})
    if not isinstance(modes, dict) or any(v not in {"OPAQUE", "MASK", "BLEND"} for v in modes.values()):
        raise ValueError("tiles.material_alpha_modes doit associer chaque matériau à OPAQUE, MASK ou BLEND")
    return config


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def output_hashes(root: Path, relative_paths: list[str]) -> dict[str, str]:
    return {rel: sha256_file(root / rel) for rel in relative_paths if (root / rel).is_file()}


def stage_cache_valid(root: Path, stage: dict[str, Any] | None, expected_key: str) -> bool:
    if not isinstance(stage, dict) or stage.get("status") != "passed" or stage.get("key") != expected_key:
        return False
    outputs = stage.get("outputs")
    if not isinstance(outputs, dict) or not outputs:
        return False
    base = root.resolve()
    for rel, expected_hash in outputs.items():
        candidate = (root / PurePosixPath(rel)).resolve()
        try:
            candidate.relative_to(base)
        except ValueError:
            return False
        if not candidate.is_file() or sha256_file(candidate) != expected_hash:
            return False
    return True


def blender_version(blender: str) -> str:
    result = subprocess.run([blender, "--version"], check=True, text=True, capture_output=True)
    first = (result.stdout or result.stderr).splitlines()[0].strip()
    return first


def run_blender(blender: str, source: Path, scene_out: Path, report_out: Path, log_out: Path, export_roundtrip: bool, timeout: int) -> dict[str, Any]:
    command = [
        blender, "--background", "--factory-startup", "--python-exit-code", "1",
        "--python", str(BLENDER_WORKER), "--", "--source", str(source),
        "--report", str(report_out),
    ]
    if export_roundtrip:
        command.extend(["--output", str(scene_out)])
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        log_out.write_text((exc.stdout or "") + "\n[TIMEOUT]\n" + (exc.stderr or ""), encoding="utf-8", errors="replace")
        raise RuntimeError(f"Blender a dépassé le délai de {timeout}s; voir {log_out}") from exc
    log_out.write_text(result.stdout + "\n--- STDERR ---\n" + result.stderr, encoding="utf-8", errors="replace")
    if result.returncode:
        tail = (result.stdout + "\n" + result.stderr)[-5000:]
        raise RuntimeError(f"Blender a échoué ({result.returncode}); voir {log_out}.\n{tail}")
    if not report_out.is_file():
        raise RuntimeError(f"Blender n’a pas écrit son rapport: {report_out}")
    return json.loads(report_out.read_text(encoding="utf-8"))


@contextlib.contextmanager
def tool_node_modules() -> Iterator[None]:
    """Make game dependencies visible to existing tools, then remove our temporary symlink."""
    probe = subprocess.run(
        ["node", "--input-type=module", "-e", "import.meta.resolve('@gltf-transform/core')"],
        cwd=TOOLS_ROOT, text=True, capture_output=True,
    )
    if probe.returncode == 0:
        yield
        return
    link = TOOLS_ROOT / "node_modules"
    if link.exists() or link.is_symlink():
        raise RuntimeError(f"Les dépendances Node ne sont pas résolues et {link} existe déjà; ne pas le remplacer.")
    game_modules = SOURCE_ROOT / "game" / "node_modules"
    if not game_modules.is_dir():
        raise RuntimeError("Dépendances Node absentes. Installez-les une fois avec `npm ci --prefix source/game`.")
    link.symlink_to(game_modules, target_is_directory=True)
    try:
        yield
    finally:
        if link.is_symlink():
            link.unlink()


def run_tile_builder(node: str, scene: Path, tiles_dir: Path, config: dict[str, Any], output_dir: Path, log_path: Path, timeout: int) -> None:
    tile = config.get("tiles", {})
    rules = {"materialAlphaModes": tile.get("material_alpha_modes", {})}
    rules_file: Path | None = None
    command = [node, str(TILE_BUILDER), str(scene), str(tiles_dir), str(tile.get("count", 12)), str(tile.get("color_quality", 92)), str(tile.get("normal_quality", 95))]
    if rules["materialAlphaModes"]:
        rules_file = output_dir / ".pipeline-material-rules.json"
        rules_file.write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        command.append(str(rules_file))
    try:
        with tool_node_modules():
            result = subprocess.run(command, cwd=TOOLS_ROOT, text=True, capture_output=True, timeout=timeout)
        log_path.write_text(result.stdout + "\n--- STDERR ---\n" + result.stderr, encoding="utf-8", errors="replace")
        if result.returncode:
            raise RuntimeError(f"Le constructeur de tuiles a échoué ({result.returncode}); voir {log_path}.\n{(result.stdout + result.stderr)[-5000:]}")
    finally:
        if rules_file and rules_file.exists():
            rules_file.unlink()


def collect_tree_files(root: Path, folder: Path) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in folder.rglob("*") if p.is_file())


def atomic_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def execute(args: argparse.Namespace) -> dict[str, Any]:
    config_path = Path(args.config).resolve()
    source = Path(args.source).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not source.is_file():
        raise ValueError(f"Fichier source absent: {source}")
    config = load_config(config_path)
    circuit = config["circuit"]
    output_dir.mkdir(parents=True, exist_ok=True)
    scene_out = output_dir / f"{circuit['id']}.roundtrip.glb"
    worker_report = output_dir / "blender-report.json"
    manifest_path = output_dir / "manifest.json"
    log_path = output_dir / "blender.log"
    inspect_only = args.inspect_only or not config.get("blender", {}).get("export_roundtrip", True)
    tiles_enabled = bool(args.build_tiles or config.get("tiles", {}).get("enabled", False))
    if tiles_enabled and inspect_only:
        raise ValueError("Le tuilage exige blender.export_roundtrip=true et une sortie GLB.")
    if source == scene_out.resolve():
        raise ValueError("La source ne peut pas être écrasée par l’export.")
    blender = args.blender or os.environ.get("BLENDER_BIN") or shutil.which("blender")
    if not blender:
        raise ValueError("Blender introuvable; utilisez --blender ou définissez BLENDER_BIN.")
    version = blender_version(blender)
    source_hash = sha256_file(source)
    config_hash = sha256_file(config_path)
    worker_hash = sha256_file(BLENDER_WORKER)
    builder_hash = sha256_file(TILE_BUILDER) if tiles_enabled else None
    prior = read_json(manifest_path, {})
    stages = dict(prior.get("stages", {})) if isinstance(prior, dict) else {}

    b_key = blender_stage_key(source_hash, worker_hash, version, config, inspect_only)
    b_record = stages.get("blender_import_export")
    b_cache = not args.force and stage_cache_valid(output_dir, b_record, b_key)
    if b_cache:
        report = read_json(output_dir / "blender-report.json", {})
        print("CACHE HIT: Blender import/export")
    else:
        report = run_blender(
            blender, source, scene_out, worker_report, log_path,
            export_roundtrip=not inspect_only, timeout=args.timeout,
        )
        paths = ["blender-report.json"] + ([scene_out.name] if not inspect_only else [])
        outputs = output_hashes(output_dir, paths)
        if len(outputs) != len(paths):
            raise RuntimeError("Sortie Blender manquante après un retour réussi.")
        if not inspect_only:
            validate_glb(scene_out)
        b_record = {"status": "passed", "key": b_key, "outputs": outputs}
        stages["blender_import_export"] = b_record

    tile_record: dict[str, Any] | None = None
    tile_cache = False
    tiles_dir = output_dir / "tiles"
    if tiles_enabled:
        scene_hash = sha256_file(scene_out)
        t_key = tile_stage_key(scene_hash, builder_hash or "", config)
        tile_record = stages.get("spatial_tiles")
        tile_cache = not args.force and stage_cache_valid(output_dir, tile_record, t_key)
        if tile_cache:
            print("CACHE HIT: tuiles spatiales")
        else:
            node = shutil.which("node")
            if not node:
                raise ValueError("Node.js introuvable pour exécuter build_track_tiles.mjs.")
            run_tile_builder(node, scene_out, tiles_dir, config, output_dir, output_dir / "tiles.log", args.timeout)
            files = collect_tree_files(output_dir, tiles_dir)
            outputs = output_hashes(output_dir, files)
            if not outputs:
                raise RuntimeError("Le constructeur n’a produit aucun fichier de tuile.")
            tile_record = {"status": "passed", "key": t_key, "outputs": outputs}
            stages["spatial_tiles"] = tile_record

    source_validation = validate_glb(source)
    output_validation = validate_glb(scene_out) if not inspect_only else None
    applied = ["headless_glb_import", "scene_inventory", "sha256_manifest"]
    if not inspect_only:
        applied.append("non_destructive_glb_roundtrip_export")
    if tiles_enabled:
        applied.append("spatial_tiling_webp_meshopt")
    manifest = {
        "schema_version": 1,
        "pipeline_version": PIPELINE_VERSION,
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "circuit": {"id": circuit["id"], "display_name": circuit["display_name"]},
        "source_files": [{"path": str(source), "size_bytes": source.stat().st_size, "sha256": source_hash}],
        "imported_assets": {
            "mesh_objects": report.get("mesh_objects"),
            "vertices": report.get("vertices"),
            "triangles": report.get("triangles"),
            "materials": report.get("materials"),
            "images": report.get("images"),
            "bounds_m": report.get("bounds_m"),
            "warnings": report.get("warnings", []),
        },
        "scripts_executed": [
            {"path": str(BLENDER_WORKER.relative_to(REPO_ROOT)), "sha256": worker_hash},
        ] + ([{"path": str(TILE_BUILDER.relative_to(REPO_ROOT)), "sha256": builder_hash}] if tiles_enabled else []),
        "enhancements_applied": applied,
        "asset_versions": {"blender": version, "pipeline": PIPELINE_VERSION},
        "sha256": {
            "source": source_hash,
            "config": config_hash,
            "blender_worker": worker_hash,
            "roundtrip_glb": sha256_file(scene_out) if not inspect_only else None,
            "tile_builder": builder_hash,
        },
        "stages": stages,
        "test_results": {
            "source_glb_container": source_validation,
            "blender_import": {"status": "passed", "mesh_objects": report.get("mesh_objects"), "triangles": report.get("triangles")},
            "roundtrip_glb_container": output_validation,
            "tiles": {"status": "passed" if tile_cache or (tiles_enabled and tile_record) else "not_run"},
            "visual_validation": "not_performed",
            "gameplay_validation": "not_performed",
        },
        "publication_status": "not_published",
    }
    atomic_json(manifest_path, manifest)
    return {
        "status": "passed",
        "circuit_id": circuit["id"],
        "cache": {"blender_import_export": b_cache, "spatial_tiles": tile_cache if tiles_enabled else None},
        "manifest": str(manifest_path),
        "scene": str(scene_out) if not inspect_only else None,
        "tiles_dir": str(tiles_dir) if tiles_enabled else None,
        "mesh_objects": report.get("mesh_objects"),
        "triangles": report.get("triangles"),
        "publication_status": "not_published",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pipeline Blender headless déterministe pour assets de circuits.")
    parser.add_argument("--config", required=True, help="Fichier JSON de configuration du circuit")
    parser.add_argument("--source", required=True, help="Fichier source GLB (conservé en lecture seule)")
    parser.add_argument("--output-dir", required=True, help="Dossier de sortie/cache géré par ce pipeline")
    parser.add_argument("--blender", help="Binaire Blender; sinon BLENDER_BIN ou PATH")
    parser.add_argument("--inspect-only", action="store_true", help="Importer et inventorier sans réexporter")
    parser.add_argument("--build-tiles", action="store_true", help="Exécuter l’outil existant build_track_tiles.mjs")
    parser.add_argument("--force", action="store_true", help="Ignorer le cache et reconstruire les étapes sélectionnées")
    parser.add_argument("--timeout", type=int, default=7200, help="Délai maximal par étape, en secondes")
    return parser


def main() -> int:
    try:
        result = execute(build_parser().parse_args())
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as exc:  # CLI boundary: show a useful error without a traceback by default.
        print(f"ERREUR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
