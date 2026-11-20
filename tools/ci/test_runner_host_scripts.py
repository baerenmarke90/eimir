"""Contract checks for the eimir-dev runner host scripts (#2115)."""

from __future__ import annotations

import pathlib
import subprocess
import unittest

RUNNER = pathlib.Path(__file__).resolve().parents[2] / "tools" / "runner"
LAUNCHER = RUNNER / "eimir-actions-guest-probe"
PROVISION = RUNNER / "provision-eimir-runner.sh"


class RunnerHostScriptTest(unittest.TestCase):
    def test_scripts_parse(self) -> None:
        for script in (LAUNCHER, PROVISION):
            with self.subTest(script=script.name):
                subprocess.run(["bash", "-n", str(script)], check=True)

    def test_nightly_guests_use_the_prepared_image_and_four_cpus(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        nightly = text.index("if [[ $mode == jit-nightly ]]; then\n    cpus=4")
        self.assertIn("runner_image=$state/noble-eimir-runner.qcow2", text)
        self.assertIn('if [[ $mode == jit-nightly && -f $runner_image ]]; then\n    backing=$runner_image', text)
        self.assertIn('qemu-img create -q -f qcow2 -F qcow2 -b "$backing"', text)
        self.assertIn('-smp "$cpus"', text)
        self.assertIn('CPUQuota=$((cpus * 100))%', text)
        self.assertGreater(nightly, text.index("cpus=2"))

    def test_every_guest_is_a_new_cloud_init_instance(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        self.assertIn("instance-id: eimir-actions-%s", text)
        self.assertIn('cloud-localds "$job/seed.img" "$job/cloud-config.yml" "$job/meta-data"', text)

    def test_image_guest_does_not_receive_runner_credentials(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        # Only runner and jit guests read a token or open the registration channel.
        self.assertIn("elif [[ $mode == jit* ]]; then\n    IFS= read -r runner_token", text)
        self.assertIn('if [[ $mode == runner || $mode == jit* ]]; then\n    install -d -o "$account"', text)

    def test_provisioning_phases(self) -> None:
        text = PROVISION.read_text(encoding="utf-8")
        self.assertIn("phase=${1:-all}", text)
        for phase in ("image) provision_image ;;", "job) provision_job ;;", "all) provision_image; provision_job ;;"):
            self.assertIn(phase, text)
        # Job guests from the image still require the mounted toolcache.
        self.assertIn("if [[ $phase != image ]] && ! mountpoint -q /srv/eimir-runner-toolcache; then", text)


if __name__ == "__main__":
    unittest.main()
