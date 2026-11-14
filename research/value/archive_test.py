import hashlib
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import freeze

ROOT=Path(__file__).resolve().parents[2]


class FrozenArchiveTests(unittest.TestCase):
    def test_archives_contain_exactly_the_frozen_sources(self):
        for version in [1,2]:
            plan=json.loads((ROOT/f"experiments/value-development-v{version}.json").read_text())
            with tarfile.open(ROOT/f"experiments/value-development-v{version}-source.tar.gz") as archive:
                files={m.name:hashlib.sha256(archive.extractfile(m).read()).hexdigest() for m in archive.getmembers() if m.isfile()}
            self.assertEqual(files,plan["files"])

    def test_restore_from_archive_in_a_fresh_checkout(self):
        for version in [1,2]:
            name=f"value-development-v{version}"
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                (root/"experiments").mkdir()
                for suffix in [".json","-source.tar.gz"]:
                    (root/f"experiments/{name}{suffix}").write_bytes((ROOT/f"experiments/{name}{suffix}").read_bytes())
                with patch.object(freeze,"ROOT",root),patch("sys.argv",["freeze.py","--name",name,"--rebuild"]):
                    freeze.freeze()


if __name__=="__main__":unittest.main()
