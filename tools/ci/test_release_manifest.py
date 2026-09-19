#!/usr/bin/env python3
"""Focused tests for #519 immutable release-manifest invariants."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/release_manifest.py"
spec = importlib.util.spec_from_file_location("release_manifest", MODULE_PATH)
assert spec and spec.loader
release_manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_manifest)


class ReleaseManifestTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.artifacts = [
            ("backend-runtime", "backend-runtime.image.tar", ["api", "worker", "migrate"]),
            ("web-runtime", "web-runtime.image.tar", ["web"]),
            ("android-apk", "android/eimir-release-unsigned.apk", ["android-apk"]),
            ("android-aab", "android/eimir-release-unsigned.aab", ["android-aab"]),
        ]
        evidence_artifacts = []
        for artifact_id, relative, roles in self.artifacts:
            artifact = self.root / relative
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes((artifact_id + "-artifact").encode())
            sbom = self.root / "sbom" / f"{artifact_id}.spdx.json"
            sbom.parent.mkdir(parents=True, exist_ok=True)
            sbom.write_text('{"spdxVersion":"SPDX-2.3"}\n', encoding="utf-8")
            evidence_artifacts.append(
                {
                    "id": artifact_id,
                    "roles": roles,
                    "path": relative,
                    "sha256": release_manifest.sha256(artifact),
                    "sbom": sbom.relative_to(self.root).as_posix(),
                    "sbomSha256": release_manifest.sha256(sbom),
                }
            )
        self.evidence = {
            "schemaVersion": 1,
            "sourceRevision": "a" * 40,
            "sbomFormat": "SPDX-2.3 JSON",
            "artifacts": evidence_artifacts,
            "android": {
                "applicationId": "de.sidebyside.app",
                "versionName": "0.1.0",
                "versionCode": 7,
                "signing": "unsigned-evidence-only",
            },
        }
        self.backend_image = "registry.example/eimir-backend@sha256:" + "1" * 64
        self.web_image = "registry.example/eimir-web@sha256:" + "2" * 64

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _previous_manifest(self, *, signing: str = "signed-release") -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "product": {"name": "SideBySide", "version": "0.0.9", "tag": "v0.0.9"},
            "sourceRevision": "b" * 40,
            "artifacts": self.evidence["artifacts"],
            "android": {
                **self.evidence["android"],
                "versionName": "0.0.9",
                "signing": signing,
            },
            "previousKnownGood": None,
            "rollback": {
                "applicationReleaseSelectable": False,
                "databaseRollbackImplied": False,
                "schemaCompatibilityReviewRequired": True,
                "authority": ["#190", "#375"],
            },
        }

    def _release_manifest(
        self,
        *,
        previous: dict[str, object] | None = None,
        signing: str = "signed-release",
    ) -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "product": {"name": "eimir.", "version": "0.1.0", "tag": "v0.1.0"},
            "sourceRevision": "a" * 40,
            "artifacts": self.evidence["artifacts"],
            "android": {**self.evidence["android"], "signing": signing},
            "previousKnownGood": previous,
            "rollback": {
                "applicationReleaseSelectable": previous is not None,
                "databaseRollbackImplied": False,
                "schemaCompatibilityReviewRequired": True,
                "authority": ["#190", "#375"],
            },
        }

    def _cloud_config(self, backend: str | None = None, web: str | None = None) -> dict[str, object]:
        backend = self.backend_image if backend is None else backend
        web = self.web_image if web is None else web
        return {
            "services": {
                "cloud-api": {"image": backend},
                "cloud-worker": {"image": backend},
                "cloud-migrate": {"image": backend},
                "cloud-web": {"image": web},
            }
        }

    def _build_cloud_identity(
        self,
        manifest: dict[str, object],
        *,
        config: dict[str, object] | None = None,
        previous_identity: Path | None = None,
        stem: str = "current",
    ) -> tuple[Path, dict[str, object]]:
        manifest_path = self.root / f"{stem}-manifest.json"
        compose_path = self.root / f"{stem}-compose.json"
        output_path = self.root / f"{stem}-cloud-identity.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        compose_path.write_text(json.dumps(config or self._cloud_config()), encoding="utf-8")
        args = type(
            "Args",
            (),
            {
                "manifest": manifest_path,
                "compose_config": compose_path,
                "previous_deployment_identity": previous_identity,
                "output": output_path,
            },
        )()
        release_manifest.build_cloud_deployment_identity(args)
        return output_path, json.loads(output_path.read_text(encoding="utf-8"))

    def test_valid_evidence_has_one_coherent_release_identity(self) -> None:
        source, artifacts, android = release_manifest.validate_evidence(self.evidence, "0.1.0")
        self.assertEqual(source, "a" * 40)
        self.assertEqual({item["id"] for item in artifacts}, release_manifest.REQUIRED_ARTIFACTS)
        self.assertEqual(android["applicationId"], "de.sidebyside.app")

    def test_mixed_android_version_is_rejected(self) -> None:
        self.evidence["android"]["versionName"] = "0.1.1"
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.validate_evidence(self.evidence, "0.1.0")

    def test_semver_build_metadata_is_rejected_before_publication(self) -> None:
        self.evidence["android"]["versionName"] = "1.2.3+build.7"
        with self.assertRaisesRegex(release_manifest.ManifestError, "build metadata"):
            release_manifest.validate_evidence(self.evidence, "1.2.3+build.7")

    def test_semver_prerelease_without_build_metadata_remains_valid(self) -> None:
        self.evidence["android"]["versionName"] = "1.2.3-rc.1"
        release_manifest.validate_evidence(self.evidence, "1.2.3-rc.1")

    def test_oci_release_tag_accepts_exact_128_character_boundary(self) -> None:
        version = "1.2.3-" + "a" * 121
        self.assertEqual(len(f"v{version}"), 128)
        self.evidence["android"]["versionName"] = version
        release_manifest.validate_evidence(self.evidence, version)

    def test_oci_release_tag_rejects_129_character_boundary(self) -> None:
        version = "1.2.3-" + "a" * 122
        self.assertEqual(len(f"v{version}"), 129)
        self.evidence["android"]["versionName"] = version
        with self.assertRaisesRegex(release_manifest.ManifestError, "too long"):
            release_manifest.validate_evidence(self.evidence, version)

    def test_backend_roles_cannot_split_release_identity(self) -> None:
        self.evidence["artifacts"][0]["roles"] = ["api"]
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.validate_evidence(self.evidence, "0.1.0")

    def test_final_manifest_rejects_unsigned_android(self) -> None:
        manifest = self._release_manifest(signing="unsigned-evidence-only")
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.validate_manifest_shape(manifest, require_signed_android=True)

    def test_verifier_detects_artifact_tampering(self) -> None:
        source, artifacts, android = release_manifest.validate_evidence(self.evidence, "0.1.0")
        manifest = {
            "schemaVersion": 1,
            "product": {"name": "eimir.", "version": "0.1.0", "tag": "v0.1.0"},
            "sourceRevision": source,
            "artifacts": artifacts,
            "android": android,
            "previousKnownGood": None,
            "rollback": {
                "applicationReleaseSelectable": False,
                "databaseRollbackImplied": False,
                "schemaCompatibilityReviewRequired": True,
                "authority": ["#190", "#375"],
            },
        }
        path = self.root / "release-manifest.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        (self.root / "backend-runtime.image.tar").write_bytes(b"tampered")
        args = type("Args", (), {"manifest": path, "artifact_root": self.root, "require_signed_android": False})()
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.verify_manifest(args)

    def test_previous_known_good_comes_from_a_signed_manifest_not_free_form_sha(self) -> None:
        previous = self.root / "previous.json"
        previous.write_text(json.dumps(self._previous_manifest()), encoding="utf-8")
        identity = release_manifest.previous_identity(previous, False)
        self.assertEqual(identity["sourceRevision"], "b" * 40)
        self.assertEqual(identity["tag"], "v0.0.9")

    def test_previous_known_good_rejects_unsigned_candidate_manifest(self) -> None:
        previous = self.root / "unsigned-previous.json"
        previous.write_text(
            json.dumps(self._previous_manifest(signing="unsigned-evidence-only")),
            encoding="utf-8",
        )
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.previous_identity(previous, False)

    def test_cloud_compose_rejects_tag_only_images(self) -> None:
        for tag in ("latest", "main", "v1.0.0", "some-tag"):
            with self.subTest(tag=tag, role="backend"):
                with self.assertRaises(release_manifest.ManifestError):
                    release_manifest.cloud_images_from_compose(
                        self._cloud_config(backend=f"registry.example/backend:{tag}")
                    )
            with self.subTest(tag=tag, role="web"):
                with self.assertRaises(release_manifest.ManifestError):
                    release_manifest.cloud_images_from_compose(
                        self._cloud_config(web=f"registry.example/web:{tag}")
                    )

    def test_cloud_compose_accepts_digest_refs_and_requires_one_backend_identity(self) -> None:
        backend, web = release_manifest.cloud_images_from_compose(self._cloud_config())
        self.assertEqual(backend, self.backend_image)
        self.assertEqual(web, self.web_image)
        mismatched = self._cloud_config()
        mismatched["services"]["cloud-worker"]["image"] = (
            "registry.example/eimir-backend@sha256:" + "3" * 64
        )
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(mismatched)

    def test_cloud_compose_rejects_build_fallback_and_missing_identity(self) -> None:
        built = self._cloud_config()
        built["services"]["cloud-api"]["build"] = {"context": "backend"}
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(built)
        missing = self._cloud_config()
        missing["services"]["cloud-web"].pop("image")
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(missing)

    def test_cloud_deployment_identity_binds_release_and_registry_digests(self) -> None:
        _, identity = self._build_cloud_identity(self._release_manifest())
        release_manifest.validate_cloud_deployment_identity(identity)
        self.assertEqual(identity["images"]["backend"]["reference"], self.backend_image)
        self.assertEqual(identity["images"]["backend"]["digest"], "sha256:" + "1" * 64)
        self.assertEqual(identity["images"]["web"]["digest"], "sha256:" + "2" * 64)
        self.assertEqual(
            set(identity["images"]["backend"]["roles"]),
            release_manifest.BACKEND_ROLES,
        )
        backend_artifact = next(
            item["sha256"] for item in self.evidence["artifacts"] if item["id"] == "backend-runtime"
        )
        self.assertEqual(
            identity["images"]["backend"]["releaseArtifactSha256"], backend_artifact
        )

    def test_cloud_deployment_previous_known_good_requires_exact_prior_digest_identity(self) -> None:
        previous_manifest = self._previous_manifest()
        previous_manifest_path = self.root / "previous-release-manifest.json"
        previous_manifest_path.write_text(json.dumps(previous_manifest), encoding="utf-8")
        previous_cloud_path, previous_cloud = self._build_cloud_identity(
            previous_manifest, stem="previous"
        )
        previous_release = {
            "version": "0.0.9",
            "tag": "v0.0.9",
            "sourceRevision": "b" * 40,
            "manifestSha256": release_manifest.sha256(previous_manifest_path),
        }
        previous_cloud_manifest_path = self.root / "previous-manifest.json"
        previous_cloud_manifest_path.write_text(json.dumps(previous_manifest), encoding="utf-8")
        previous_cloud["release"]["releaseManifestSha256"] = release_manifest.sha256(
            previous_cloud_manifest_path
        )
        previous_cloud_path.write_text(json.dumps(previous_cloud), encoding="utf-8")
        previous_release["manifestSha256"] = previous_cloud["release"]["releaseManifestSha256"]

        _, current = self._build_cloud_identity(
            self._release_manifest(previous=previous_release),
            previous_identity=previous_cloud_path,
        )
        self.assertEqual(
            current["previousKnownGood"]["images"]["backend"]["reference"],
            self.backend_image,
        )

        tampered = json.loads(previous_cloud_path.read_text(encoding="utf-8"))
        tampered["images"]["backend"]["reference"] = (
            "registry.example/eimir-backend@sha256:" + "4" * 64
        )
        tampered["images"]["backend"]["digest"] = "sha256:" + "4" * 64
        tampered_path = self.root / "tampered-previous-cloud.json"
        tampered_path.write_text(json.dumps(tampered), encoding="utf-8")
        bad_previous_release = dict(previous_release)
        bad_previous_release["sourceRevision"] = "c" * 40
        with self.assertRaises(release_manifest.ManifestError):
            self._build_cloud_identity(
                self._release_manifest(previous=bad_previous_release),
                previous_identity=tampered_path,
                stem="mismatch",
            )

    def test_android_api_base_url_validation(self) -> None:
        self.evidence["android"]["apiBaseUrl"] = "https://api.eimir.invalid/"
        _, _, android = release_manifest.validate_evidence(self.evidence, "0.1.0")
        self.assertEqual(android["apiBaseUrl"], "https://api.eimir.invalid")

        invalid_urls = [
            "http://api.eimir.invalid",
            "https://",
            "https://user:pass@api.example.com",
            "https://api.example.com?query=1",
            "https://api.example.com#hash",
            "https://api. example.com",
            "",
            123,
        ]
        for bad_url in invalid_urls:
            with self.subTest(bad_url=bad_url):
                self.evidence["android"]["apiBaseUrl"] = bad_url
                with self.assertRaises(release_manifest.ManifestError):
                    release_manifest.validate_evidence(self.evidence, "0.1.0")

    def test_android_launchable_activity_validation(self) -> None:
        self.evidence["android"]["launchableActivity"] = "de.eimir.app.MainActivity"
        _, _, android = release_manifest.validate_evidence(self.evidence, "0.1.0")
        self.assertEqual(android["launchableActivity"], "de.eimir.app.MainActivity")

        self.evidence["android"]["launchableActivity"] = "de.sidebyside.app.MainActivity"
        with self.assertRaisesRegex(release_manifest.ManifestError, "launchableActivity"):
            release_manifest.validate_evidence(self.evidence, "0.1.0")


if __name__ == "__main__":
    unittest.main()
