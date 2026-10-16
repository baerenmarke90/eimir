"""Configurable provider-adapter selection at the composition root."""

from __future__ import annotations

from typing import TypeVar, cast

ProviderT = TypeVar("ProviderT")


class ProviderNotConfiguredError(LookupError):
    """No adapter is registered for the interface and configured name."""


class ProviderRegistry:
    """Map freely configurable names to abstract provider types.

    The domain knows only the interface. Whether an installation registers a
    local, free, or commercial adapter under a name is decided exclusively by
    the composition root.
    """

    def __init__(self) -> None:
        self._providers: dict[tuple[type[object], str], object] = {}

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip().casefold()
        if not normalized:
            raise ValueError("Provider name must not be empty")
        return normalized

    def register(self, interface: type[ProviderT], name: str, provider: ProviderT) -> None:
        if not isinstance(provider, interface):
            raise TypeError(f"Adapter does not implement {interface.__name__}")
        key = (cast(type[object], interface), self._normalize_name(name))
        if key in self._providers:
            raise ValueError(f"Provider already registered: {interface.__name__}/{name}")
        self._providers[key] = provider

    def select(self, interface: type[ProviderT], configured_name: str) -> ProviderT:
        key = (cast(type[object], interface), self._normalize_name(configured_name))
        provider = self._providers.get(key)
        if provider is None:
            raise ProviderNotConfiguredError(
                f"No provider configured for {interface.__name__}/{configured_name}"
            )
        return cast(ProviderT, provider)
