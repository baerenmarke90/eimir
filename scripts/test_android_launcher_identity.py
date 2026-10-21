import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from android_launcher_identity import ANDROID, ORIGINAL, SHELL, launcher_identity


class LauncherIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        source = Path(__file__).resolve().parents[1] / "android/app/src/main/AndroidManifest.xml"
        self.manifest = ET.fromstring(source.read_text())
        for entry in self.manifest.iter():
            for attribute in ("name", "targetActivity"):
                key = f"{ANDROID}{attribute}"
                if entry.get(key, "").startswith("."):
                    entry.set(key, "de.eimir.app" + entry.get(key, ""))

    def check(self) -> str:
        return launcher_identity(ET.tostring(self.manifest, encoding="unicode"))

    def test_accepts_the_preserved_default_alias(self) -> None:
        self.assertEqual(ORIGINAL, self.check())

    def test_rejects_two_initial_launchers(self) -> None:
        entry = self.manifest.find("application/activity-alias[@android:name='de.eimir.app.icons.sage']",
                                   {"android": ANDROID[1:-1]})
        assert entry is not None
        entry.set(f"{ANDROID}enabled", "true")
        with self.assertRaisesRegex(ValueError, "only initially enabled"):
            self.check()

    def test_rejects_a_missing_or_disabled_shell(self) -> None:
        shell = self.manifest.find(f"application/activity[@{ANDROID}name='{SHELL}']")
        assert shell is not None
        shell.set(f"{ANDROID}enabled", "false")
        with self.assertRaisesRegex(ValueError, "missing or disabled"):
            self.check()

    def test_rejects_an_alias_that_loses_its_target_or_icon(self) -> None:
        original = self.manifest.find(f"application/activity-alias[@{ANDROID}name='{ORIGINAL}']")
        assert original is not None
        original.set(f"{ANDROID}targetActivity", "de.eimir.app.OtherActivity")
        with self.assertRaisesRegex(ValueError, "permanent shell"):
            self.check()


if __name__ == "__main__":
    unittest.main()
