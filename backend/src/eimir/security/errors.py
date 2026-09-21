"""Encryption failures.

Messages are fixed strings. They must never contain payload content, object
content, key material, or a ciphertext fragment: these exceptions travel into
logs and error reports.
"""

from __future__ import annotations


class EncryptionError(Exception):
    """Base class for every application-controlled encryption failure."""


class EncryptionConfigurationError(EncryptionError):
    """Key material or mode is missing or invalid. The operation fails closed."""


class DecryptionError(EncryptionError):
    """Ciphertext could not be authenticated or decrypted."""


class PlaintextRejectedError(EncryptionError):
    """Plaintext was found where the active policy requires ciphertext."""
