#!/usr/bin/env python3
from __future__ import annotations

import unittest

from pytest_shard import collected_nodeids, select_shard


class PytestShardTest(unittest.TestCase):
    def test_collection_parser_ignores_summary_and_keeps_parameterized_nodeids(self) -> None:
        self.assertEqual(
            collected_nodeids(
                [
                    "tests/integration/test_b.py::test_second[param value]\n",
                    "tests/integration/test_a.py::TestGroup::test_first\n",
                    "2070/2643 tests collected (573 deselected) in 1.23s\n",
                ]
            ),
            [
                "tests/integration/test_a.py::TestGroup::test_first",
                "tests/integration/test_b.py::test_second[param value]",
            ],
        )

    def test_four_shards_partition_every_nodeid_exactly_once(self) -> None:
        nodeids = [f"tests/integration/test_{index // 10}.py::test_{index}" for index in range(2070)]
        shards = [select_shard(nodeids, shard=shard, shard_count=4) for shard in range(1, 5)]

        flattened = [nodeid for selected in shards for nodeid in selected]
        self.assertEqual(sorted(flattened), sorted(nodeids))
        self.assertEqual(len(flattened), len(set(flattened)))
        self.assertLessEqual(max(map(len, shards)) - min(map(len, shards)), 1)

    def test_selection_is_deterministic_independent_of_input_order(self) -> None:
        nodeids = [
            "tests/integration/test_c.py::test_c",
            "tests/integration/test_a.py::test_a",
            "tests/integration/test_b.py::test_b",
        ]
        self.assertEqual(
            select_shard(nodeids, shard=2, shard_count=2),
            select_shard(reversed(nodeids), shard=2, shard_count=2),
        )

    def test_invalid_shard_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            select_shard(["tests/x.py::test_x"], shard=0, shard_count=4)
        with self.assertRaises(ValueError):
            select_shard(["tests/x.py::test_x"], shard=5, shard_count=4)

    def test_empty_collection_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            collected_nodeids(["no tests collected\n"])


if __name__ == "__main__":
    unittest.main()
