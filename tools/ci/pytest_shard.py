#!/usr/bin/env python3
"""Select one deterministic, balanced shard from pytest collection output."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Iterable


def collected_nodeids(lines: Iterable[str]) -> list[str]:
    """Return individual pytest node IDs from ``pytest --collect-only -q`` output."""
    nodeids = [line.strip() for line in lines if "::" in line]
    if not nodeids:
        raise ValueError("No pytest node IDs were found in collection output.")
    if len(nodeids) != len(set(nodeids)):
        raise ValueError("Pytest collection output contains duplicate node IDs.")
    return sorted(nodeids)


def select_shard(nodeids: Iterable[str], *, shard: int, shard_count: int) -> list[str]:
    """Partition node IDs exactly once using stable sorted round-robin assignment."""
    if shard_count < 1:
        raise ValueError("shard_count must be at least 1")
    if shard < 1 or shard > shard_count:
        raise ValueError(f"shard must be between 1 and {shard_count}")

    ordered = sorted(nodeids)
    return [
        nodeid
        for index, nodeid in enumerate(ordered)
        if index % shard_count == shard - 1
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shard", type=int, required=True, help="1-based shard number")
    parser.add_argument("--shard-count", type=int, required=True, help="total number of shards")
    args = parser.parse_args()

    try:
        nodeids = collected_nodeids(sys.stdin)
        selected = select_shard(nodeids, shard=args.shard, shard_count=args.shard_count)
    except ValueError as exc:
        parser.error(str(exc))

    if not selected:
        parser.error("Selected shard is empty.")

    print("\n".join(selected))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
