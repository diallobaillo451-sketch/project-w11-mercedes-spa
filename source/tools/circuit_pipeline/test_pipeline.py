import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli


class PipelineTests(unittest.TestCase):
    def make_glb(self, path: Path, declared_length_delta: int = 0) -> None:
        payload = json.dumps({"asset": {"version": "2.0"}}).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        total = 12 + 8 + len(payload) + declared_length_delta
        path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(payload), 0x4E4F534A) + payload)

    def test_glb_container_is_valid(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "valid.glb"
            self.make_glb(path)
            result = cli.validate_glb(path)
            self.assertTrue(result["valid"])
            self.assertEqual(result["asset_version"], "2.0")

    def test_glb_rejects_wrong_declared_length(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "invalid.glb"
            self.make_glb(path, declared_length_delta=4)
            with self.assertRaises(ValueError):
                cli.validate_glb(path)

    def test_hash_is_stable_for_mapping_key_order(self):
        self.assertEqual(cli.stable_sha256({"a": 1, "b": 2}), cli.stable_sha256({"b": 2, "a": 1}))

    def test_tile_config_change_does_not_invalidate_blender_export(self):
        base = {"blender": {"export_roundtrip": True}, "tiles": {"count": 12, "color_quality": 92}}
        changed_tiles = {"blender": {"export_roundtrip": True}, "tiles": {"count": 16, "color_quality": 92}}
        blender_key = cli.blender_stage_key("src", "worker", "Blender 5.3.0", base, False)
        blender_key_changed = cli.blender_stage_key("src", "worker", "Blender 5.3.0", changed_tiles, False)
        tile_key = cli.tile_stage_key("scene", "builder", base)
        tile_key_changed = cli.tile_stage_key("scene", "builder", changed_tiles)
        self.assertEqual(blender_key, blender_key_changed)
        self.assertNotEqual(tile_key, tile_key_changed)

    def test_lod_options_invalidate_only_lod_stage(self):
        base = {"tiles": {"count": 12}, "lod": {"ratio": 0.35, "error": 0.01}}
        changed = {"tiles": {"count": 12}, "lod": {"ratio": 0.25, "error": 0.01}}
        self.assertEqual(cli.tile_stage_key("scene", "builder", base), cli.tile_stage_key("scene", "builder", changed))
        self.assertNotEqual(cli.lod_stage_key("tiles", "lod-builder", base), cli.lod_stage_key("tiles", "lod-builder", changed))

    def test_cache_requires_matching_output_hash(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output = root / "scene.glb"
            output.write_bytes(b"asset")
            record = {"status": "passed", "key": "key-1", "outputs": {"scene.glb": cli.sha256_file(output)}}
            self.assertTrue(cli.stage_cache_valid(root, record, "key-1"))
            output.write_bytes(b"changed")
            self.assertFalse(cli.stage_cache_valid(root, record, "key-1"))

    def test_cache_rejects_path_escape(self):
        record = {"status": "passed", "key": "key-1", "outputs": {"../outside": "abc"}}
        self.assertFalse(cli.stage_cache_valid(Path("/tmp/pipeline"), record, "key-1"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
