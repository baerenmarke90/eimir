"""Editorial images for the curated date-idea catalog (handoff manifest v1).

``data/images.json`` is the verbatim editorial manifest and ``data/images/``
holds its WebP files. Lookup order follows the manifest: the image for the idea
ID if present, otherwise the image for the idea's category. Every category has
an image, so every idea resolves to exactly one image.

The images are part of the Pro catalog: they are served only through the
capability-gated API, never as public or bundled client assets.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache
from importlib.resources import files
from importlib.resources.abc import Traversable
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from eimir.date_ideas.catalog import (
    IDEA_ID_PATTERN,
    DateIdeaCategory,
    get_catalog,
)

MANIFEST_RESOURCE = "data/images.json"
IMAGE_FILE_PATTERN = r"^images/(eimir-date-\d{3}|category-[a-z_]+)\.webp$"
IMAGE_ID_PATTERN = r"^(eimir-date-\d{3}|category-[a-z_]+)$"

AltText = Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r"\S")]


class _ManifestModel(BaseModel):
    # Unknown keys are tolerated so editorial metadata may grow; the fields the
    # product relies on are strict.
    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)


class LocalizedAlt(_ManifestModel):
    de: AltText
    en: AltText

    def get(self, locale: str) -> str:
        return self.en if locale == "en" else self.de


class ImageEntry(_ManifestModel):
    file: Annotated[str, Field(pattern=IMAGE_FILE_PATTERN)]
    width: Annotated[int, Field(ge=1, le=4000)]
    height: Annotated[int, Field(ge=1, le=4000)]
    alt: LocalizedAlt

    @property
    def image_id(self) -> str:
        return self.file.removeprefix("images/").removesuffix(".webp")


class ImageManifest(_ManifestModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    catalog_version: str = Field(alias="catalogVersion")
    lookup_order: tuple[Literal["ideaId"], Literal["category"]] = Field(alias="lookupOrder")
    images_by_idea_id: dict[str, ImageEntry] = Field(alias="imagesByIdeaId")
    images_by_category: dict[DateIdeaCategory, ImageEntry] = Field(alias="imagesByCategory")

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        for idea_id in self.images_by_idea_id:
            if not re.fullmatch(IDEA_ID_PATTERN, idea_id):
                raise ValueError(f"invalid idea id {idea_id!r}")
        missing = set(DateIdeaCategory) - set(self.images_by_category)
        if missing:
            raise ValueError(f"categories without an image: {sorted(missing)}")
        files = [entry.file for entry in self.entries()]
        if len(set(files)) != len(files):
            raise ValueError("an image file is referenced twice")
        return self

    def entries(self) -> list[ImageEntry]:
        return [*self.images_by_idea_id.values(), *self.images_by_category.values()]


def parse_manifest(raw: str | bytes) -> ImageManifest:
    return ImageManifest.model_validate_json(raw, by_alias=True)


def manifest_problems(manifest: ImageManifest, root: Traversable) -> list[str]:
    """Checks against the catalog and the image files next to the manifest."""
    catalog = get_catalog()
    problems: list[str] = []
    if manifest.catalog_version != catalog.version:
        problems.append(
            f"manifest is for catalog {manifest.catalog_version}, bundled is {catalog.version}"
        )
    known = {idea.id for idea in catalog.data.ideas}
    problems.extend(
        f"image for unknown idea {idea_id}"
        for idea_id in sorted(set(manifest.images_by_idea_id) - known)
    )
    for entry in manifest.entries():
        data = root.joinpath(entry.file)
        if not data.is_file():
            problems.append(f"missing file {entry.file}")
            continue
        head = data.read_bytes()[:12]
        if head[:4] != b"RIFF" or head[8:12] != b"WEBP":
            problems.append(f"{entry.file} is not a WebP image")
    return problems


@dataclass(frozen=True)
class ResolvedImage:
    id: str
    width: int
    height: int
    alt: str


class DateIdeaImages:
    def __init__(self, manifest: ImageManifest, root: Traversable) -> None:
        self.manifest = manifest
        self.root = root
        self._by_id = {entry.image_id: entry for entry in manifest.entries()}

    def for_idea(self, idea_id: str, category: DateIdeaCategory, locale: str) -> ResolvedImage:
        entry = (
            self.manifest.images_by_idea_id.get(idea_id)
            or (self.manifest.images_by_category[category])
        )
        return ResolvedImage(
            id=entry.image_id, width=entry.width, height=entry.height, alt=entry.alt.get(locale)
        )

    def read(self, image_id: str) -> bytes | None:
        entry = self._by_id.get(image_id)
        if entry is None:
            return None
        return self.root.joinpath(entry.file).read_bytes()


def _data_root() -> Traversable:
    return files("eimir.date_ideas").joinpath("data")


@cache
def get_images() -> DateIdeaImages:
    """The bundled manifest, validated against the catalog once per process."""
    root = _data_root()
    manifest = parse_manifest(root.joinpath("images.json").read_bytes())
    problems = manifest_problems(manifest, root)
    if problems:
        raise ValueError("; ".join(problems))
    return DateIdeaImages(manifest, root)
