"""Network identity for the anonymous passkey abuse key."""

from eimir.auth.passkey_abuse import network_key


def test_ipv4_remains_separate_per_client() -> None:
    assert network_key("198.51.100.10") == "ipv4:198.51.100.10"
    assert network_key("198.51.100.10") != network_key("198.51.100.11")


def test_ipv6_is_normalized_to_64_bit_network() -> None:
    assert network_key("2001:db8:1234:5678::1") == network_key("2001:db8:1234:5678::ffff")
    assert network_key("2001:db8:1234:5678::1") != network_key("2001:db8:1234:5679::1")


def test_ipv4_mapped_ipv6_is_treated_like_ipv4() -> None:
    assert network_key("::ffff:198.51.100.10") == network_key("198.51.100.10")


def test_non_ip_peer_remains_bound_to_identifier() -> None:
    assert network_key("TestClient") == "peer:testclient"
