"""The eimir. Pro plugin distribution (Decision 0017, Phase 2, #2182).

Pro code imports any Core module; Core never imports ``eimir_pro``. The Pro
modules move here from the ``eimir`` distribution one cluster at a time; the
plugin object and its entry point follow last.
"""
