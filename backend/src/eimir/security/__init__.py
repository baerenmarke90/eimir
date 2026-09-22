"""Application-controlled encryption at rest (issue #797).

This package is the one place that knows about key material. Two formats sit on
top of the same key contract:

- ``payload_envelope``: JSON envelope for ``ProtectedPayload`` columns;
- ``eimir.media.encrypted``: chunked binary format for media objects.

This is encryption at rest under keys the server operator controls. It is NOT
end-to-end encryption: the running application holds the key-encryption keys and
can read every protected value. See ``docs/ENCRYPTION-AT-REST.md``.
"""
