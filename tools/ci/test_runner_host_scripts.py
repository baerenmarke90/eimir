"""Contract checks for the eimir-dev runner host scripts (#2115)."""

from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import threading
import unittest
from unittest import mock

from test_nightly_runner_routing import NIGHTLY_TIMEOUTS

RUNNER = pathlib.Path(__file__).resolve().parents[2] / "tools" / "runner"
LAUNCHER = RUNNER / "eimir-actions-guest-probe"
PROVISION = RUNNER / "provision-eimir-runner.sh"
DISPATCH = RUNNER / "eimir-actions-dispatch"
INSTALL = RUNNER / "install-host.sh"
MEASURE = RUNNER / "measure-guests.sh"


def load_dispatcher():
    sys.dont_write_bytecode = True
    loader = importlib.machinery.SourceFileLoader("eimir_actions_dispatch", str(DISPATCH))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def launcher_setting(text: str, block: str, name: str) -> int:
    body = text.split(block, 1)[1].split("\nfi\n", 1)[0]
    return int(re.search(rf"^\s+{name}=(\d+)$", body, re.MULTILINE).group(1))


class RunnerHostScriptTest(unittest.TestCase):
    def test_scripts_parse(self) -> None:
        for script in (LAUNCHER, PROVISION, INSTALL, MEASURE):
            with self.subTest(script=script.name):
                subprocess.run(["bash", "-n", str(script)], check=True)
        compile(DISPATCH.read_text(encoding="utf-8"), str(DISPATCH), "exec")

    def test_nightly_guests_use_the_prepared_image_and_five_cpus(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        nightly = "if [[ $mode == jit-nightly ]]; then\n"
        self.assertEqual(launcher_setting(text, nightly, "cpus"), 5)
        self.assertEqual(launcher_setting(text, nightly, "memory_mib"), 7168)
        self.assertIn("runner_image=$state/noble-eimir-runner.qcow2", text)
        self.assertIn('if [[ $mode == jit-nightly && -f $runner_image ]]; then\n    backing=$runner_image', text)
        self.assertIn('qemu-img create -q -f qcow2 -F qcow2 -b "$backing"', text)
        self.assertIn('-smp "$cpus"', text)
        self.assertIn('CPUQuota=$((cpus * 100))%', text)
        self.assertGreater(text.index(nightly + "    #"), text.index("cpus=2"))

    def test_nightly_guests_fit_the_host(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        nightly = "if [[ $mode == jit-nightly ]]; then\n"
        memory = launcher_setting(text, nightly, "memory_mib")
        cpus = launcher_setting(text, nightly, "cpus")
        slots = len(load_dispatcher().GUEST_SLOTS)
        # eimir-dev has six vCPUs and about 8900 MiB available. Every running guest
        # uses its RAM plus about 300 MiB of QEMU overhead, and the last guest to
        # start must still pass the memory_mib + 1024 start check.
        self.assertIn('min_kib="$(( (memory_mib + 1024) * 1024 ))"', text)
        host_available_mib = 8900
        self.assertGreaterEqual(host_available_mib - (slots - 1) * (memory + 300), memory + 1024)
        self.assertLessEqual(slots * cpus, 5, "leave one vCPU for the host")

    def test_guest_runtime_covers_the_longest_nightly_job(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        runtime = launcher_setting(text, "if [[ $mode == jit-nightly ]]; then\n", "runtime_seconds")
        longest_guest_limit = max(guest for guest, _hosted in NIGHTLY_TIMEOUTS.values())
        boot_and_registration = 15 * 60
        self.assertGreaterEqual(runtime, longest_guest_limit * 60 + boot_and_registration)
        self.assertIn('-p "RuntimeMaxSec=$runtime_seconds"', text)

    def test_each_slot_owns_its_account_lock_unit_table_and_toolcache(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        self.assertIn("! ${3:-1} =~ ^[12]$", text)
        self.assertIn("slot=${3:-1}", text)
        self.assertIn('if [[ $slot != 1 ]]; then\n    account=eimir-actions-vm$slot', text)
        self.assertIn("table=eimir_actions_slot$slot", text)
        self.assertIn("unit=eimir-actions-network-probe-slot$slot.service", text)
        self.assertIn('exec 9>"$state/slot$slot.lock"\nflock -n 9', text)
        self.assertIn("toolcache=$state/nightly-toolcache-slot$slot.ext4", text)
        self.assertIn('meta skuid "$account" jump guest_egress', text)
        self.assertNotIn("probe.lock", text)
        self.assertNotIn("eimir_actions_probe", text)

    def test_image_builds_wait_for_both_slots(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        self.assertIn(
            'exec 8>"$state/launcher.lock"\nif [[ $mode == image ]]; then\n    flock -n -x 8\n'
            "else\n    flock -n -s 8\nfi", text)
        self.assertLess(text.index("flock -n -s 8"), text.index('exec 9>"$state/slot$slot.lock"'))

    def test_idle_nightly_runner_frees_its_slot(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        self.assertIn("for _ in $(seq 90); do", text)
        self.assertIn("if pgrep -x Runner.Worker >/dev/null; then exit 0; fi", text)
        self.assertIn("pkill -TERM -x Runner.Listener", text)
        self.assertIn("if [[ -e /run/eimir-runner-idle ]]; then\n                  result=0", text)

    def test_guest_meter_reports_steal_and_pressure(self) -> None:
        text = LAUNCHER.read_text(encoding="utf-8")
        for field in ("guest_peak_ram_bytes", "guest_cpu_steal_percent",
                      "guest_memory_stall_some_seconds", "guest_memory_stall_full_seconds",
                      "guest_cpu_stall_some_seconds"):
            self.assertIn(field, text)

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

    def test_installer_never_disturbs_a_running_guest(self) -> None:
        text = INSTALL.read_text(encoding="utf-8")
        locks = text.index("flock -n -x 7 || ! flock -n -x 8")
        self.assertLess(locks, text.index("systemctl stop eimir-actions-dispatch.service"))
        self.assertIn('exec 7>"$state/probe.lock" 8>"$state/launcher.lock"', text)
        self.assertIn("pgrep -f qemu-system-x86_64", text)

    def test_installer_pins_validation_to_the_installed_commit_only(self) -> None:
        text = INSTALL.read_text(encoding="utf-8")
        self.assertIn('sed -i "s/^EIMIR_NIGHTLY_VALIDATION_SHA=.*/EIMIR_NIGHTLY_VALIDATION_SHA=$commit/" "$env_file"', text)
        self.assertIn("commit != rollback && ! $commit =~ ^[0-9a-f]{40}$", text)
        # Enabling main nightly or test-channel jobs remains a separate owner decision.
        self.assertNotIn("EIMIR_NIGHTLY_MAIN_ENABLED", text)
        self.assertNotIn("EIMIR_TEST_CHANNEL_MAIN_ENABLED", text)
        for file in ("eimir-actions-guest-probe", "eimir-actions-dispatch", "measure-guests.sh"):
            self.assertIn(file, text)

    def test_measure_script_is_read_only(self) -> None:
        text = MEASURE.read_text(encoding="utf-8")
        for mutation in ("systemctl stop", "systemctl start", "nft ", "rm ", "kill ", "> /sys", ">/sys"):
            self.assertNotIn(mutation, text)


class FakeTokens:
    def get(self) -> str:
        return "token"


class DispatcherSlotTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_dispatcher()
        self.release = threading.Event()
        self.started: list[tuple[int, int]] = []
        self.blocked_seen: list[set[int]] = []
        self.queue = [101, 102, 103]
        self.now = 0.0

    def select(self, _token, blocked):
        self.blocked_seen.append(set(blocked))
        for job_id in self.queue:
            if job_id not in blocked:
                return job_id, ["eimir-kvm-nightly", "eimir-run-1-1"], {"GITHUB_RUN_ID": "1"}, True
        return None

    def launch(self, _tokens, _labels, job_id, _identity, _provision, slot):
        self.started.append((job_id, slot))
        self.release.wait(5)

    def dispatcher(self, launch=None, slots=(1, 2)):
        return self.module.Dispatcher(FakeTokens(), self.select, launch or self.launch, slots=slots,
                                      clock=lambda: self.now)

    def test_single_slot_runs_one_guest_at_a_time(self) -> None:
        dispatcher = self.dispatcher(slots=(1,))
        self.assertEqual(dispatcher.poll_once(), (101, 1))
        self.assertIsNone(dispatcher.poll_once())
        self.release.set()
        dispatcher.join(5)
        self.assertEqual(self.started, [(101, 1)])

    def test_two_queued_jobs_run_in_both_slots_and_a_third_waits(self) -> None:
        dispatcher = self.dispatcher()
        self.assertEqual(dispatcher.poll_once(), (101, 1))
        self.assertEqual(dispatcher.poll_once(), (102, 2))
        polls = len(self.blocked_seen)
        self.assertIsNone(dispatcher.poll_once())
        self.assertEqual(len(self.blocked_seen), polls, "no job lookup while both slots are busy")
        self.assertEqual(self.blocked_seen[1], {101})
        self.release.set()
        dispatcher.join(5)
        self.assertEqual(dispatcher.free_slots(), [1, 2])
        self.assertEqual(sorted(self.started), [(101, 1), (102, 2)])

    def test_failed_launch_frees_the_slot_and_cools_the_job_down(self) -> None:
        def fail(*_args):
            raise subprocess.CalledProcessError(1, "launcher")

        dispatcher = self.dispatcher(fail)
        with mock.patch("builtins.print"):
            self.assertEqual(dispatcher.poll_once(), (101, 1))
            dispatcher.join(5)
        self.assertEqual(dispatcher.free_slots(), [1, 2])
        self.queue = [101]
        self.assertIsNone(dispatcher.poll_once())
        self.assertIn(101, self.blocked_seen[-1])
        self.now = self.module.LAUNCH_COOLDOWN_SECONDS + 1
        self.release.set()
        self.assertEqual(dispatcher.poll_once(), (101, 1))
        dispatcher.join(5)

    def test_run_guest_passes_the_slot_and_admitted_identity(self) -> None:
        calls = []

        def api(path, _token, *, method="GET", payload=None):
            calls.append((method, path))
            if path.endswith("generate-jitconfig"):
                return {"runner": {"id": 7}, "encoded_jit_config": "c" * 24}
            return None

        identity = {"GITHUB_RUN_ID": "1", "GITHUB_SHA": "a" * 40}
        with mock.patch.object(self.module, "api", api), \
                mock.patch.object(self.module.subprocess, "run") as run, mock.patch("builtins.print"):
            self.module.run_guest(FakeTokens(), ["eimir-kvm-nightly"], 5, identity, True, 2)
        argv = run.call_args.args[0]
        self.assertEqual(argv, [self.module.GUEST_LAUNCHER, "jit-nightly", self.module.GUEST_IMAGE, "2"])
        self.assertEqual(run.call_args.kwargs["input"], "c" * 24 + "\n" + json.dumps(identity) + "\n")
        self.assertEqual(calls[-1], ("DELETE", "/repos/baerenmarke90/eimir/actions/runners/7"))

    def test_branch_validation_admits_only_the_pinned_commit(self) -> None:
        pinned = "b" * 40

        def api_for(sha):
            def api(path, _token, **_kwargs):
                if "/actions/runs?status=queued" in path:
                    return {"workflow_runs": [{
                        "id": 9, "run_attempt": 1, "path": ".github/workflows/web-browser-qa.yml",
                        "head_repository": {"full_name": "baerenmarke90/eimir"},
                        "head_branch": "ci/eimir-nightly-self-hosted", "head_sha": sha,
                        "event": "workflow_dispatch"}]}
                if "/actions/runs?status=in_progress" in path:
                    return {"workflow_runs": []}
                return {"jobs": [{"id": 11, "name": "Full regression 1/4", "status": "queued",
                                  "labels": ["eimir-kvm-nightly", "eimir-run-9-1"]}]}
            return api

        def select(sha, blocked=frozenset()):
            with mock.patch.object(self.module, "api", api_for(sha)):
                return self.module.queued_job("t", "eimir-kvm-smoke", set(), set(blocked), "eimir-kvm-pr",
                                              None, pinned, False, False)

        job = select(pinned)
        self.assertEqual(job[0], 11)
        self.assertEqual(job[2]["GITHUB_SHA"], pinned)
        self.assertEqual(job[2]["GITHUB_WORKFLOW_REF"],
                         "baerenmarke90/eimir/.github/workflows/web-browser-qa.yml@refs/heads/ci/eimir-nightly-self-hosted")
        self.assertIsNone(select("c" * 40))
        self.assertIsNone(select(pinned, {11}))


if __name__ == "__main__":
    unittest.main()
