# UnifiedPush backend transport (#565)

The server-to-distributor connection uses encrypted Web Push, not a plain HTTPS
POST. The backend accepts compact Web Push subscription JSON through the
authenticated `POST /api/v1/push-endpoints` route with `providerKey` set to
`unifiedpush`. The string in `endpointValue` contains `endpoint`, `keys.p256dh`
and `keys.auth`. The configured provider validates the URL, P-256 public key
and auth secret before storing the registration. The endpoint URL identifies a
registration across key rotation. New registration material uses the existing
application-controlled protected-payload store; the public endpoint row keeps
only a SHA-256 reference. This follows the instance's configured
`EIMIR_ENCRYPTION_AT_REST` mode.

## Enable the sender

Configure all three values for both API and worker processes:

```dotenv
EIMIR_PUSH_VAPID_PRIVATE_KEY=<stable base64url P-256 private scalar>
EIMIR_PUSH_VAPID_SUBJECT=mailto:push@example.org
EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS=["https://push.example.org"]
```

With any value missing, startup rejects the partial configuration. With all
three absent, the production provider registry remains empty and registration
returns `PUSH_TRANSPORT_UNAVAILABLE`. A newly generated VAPID key must be kept
stable across restarts; rotating it requires devices to subscribe again. The
authenticated `GET /api/v1/push-endpoints/unifiedpush-configuration` returns
the provider key and VAPID **public** key for client registration. It never
returns the private key.

Generate one key on an operator-controlled machine with the backend's Python
dependencies installed, then put its output in a secret store:

```bash
python - <<'PY'
import base64
from cryptography.hazmat.primitives.asymmetric import ec

key = ec.generate_private_key(ec.SECP256R1())
raw = key.private_numbers().private_value.to_bytes(32, "big")
print(base64.urlsafe_b64encode(raw).rstrip(b"=").decode())
PY
```

Each allowed origin is an exact HTTPS push-server origin. This first sender
accepts only endpoints at those origins. On every delivery it resolves the
hostname, rejects any non-global IP address, connects to one checked IP and
verifies TLS against the original hostname. It does not follow redirects or
use an HTTP proxy. Operators of private-network push servers need a separately
reviewed egress configuration; adding a private IP here will fail closed.

The sender encrypts a generic `{"type":"wake"}` message with RFC 8291
`aes128gcm`, signs with VAPID, and asks the client to refresh its Notification
Center through the authenticated API. Relationship references, sender names
and content are not placed in the push payload. HTTP 404/410 disables a stale
subscription; transient failures use the existing bounded job retry policy.

This backend slice does not acquire subscriptions on a device, display a native
notification or handle taps. The Capacitor/UnifiedPush client bridge and
device-level acceptance remain separate #565 work. Before allowing a broad
set of arbitrary distributor hosts, add the registration challenge recommended
by the [UnifiedPush security guide](https://unifiedpush.org/developers/intro/).
