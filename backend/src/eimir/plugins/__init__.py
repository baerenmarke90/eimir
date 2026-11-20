"""The Pro plugin seam (Decision 0017).

Core reaches Premium-only server code through this package only: the contract
(``contract``), the loader that resolves the allow-listed plugins (``loader``)
and the Core-owned lifecycle manifest of every plugin table (``manifest``).
Core never imports a plugin package; a plugin may import any Core module.
"""
