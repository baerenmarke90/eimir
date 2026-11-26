# Go-live recovery: media mirror, standby host and database history

**Status:** operator concept and runbook, decisions by the Product Owner on 2026-11-26;
nothing in it has been executed yet
**Instance:** app.eimir.de, Arcane project `eimir-test` (Cloud profile, Git Sync channel,
[Private Test Channel](../PRIVATE-TEST-CHANNEL.md)) and its database project `eimir-test-db`
**Related:** [Cloud/Managed topology](../m6/CLOUD-MANAGED-TOPOLOGY.md) sections 3.3 and 3.5,
[Operations and recovery](../m6/OPERATIONS-RECOVERY.md) section 6,
[Encryption at rest](../ENCRYPTION-AT-REST.md) section 10,
[Cloud Account-deletion authority](../m6/CLOUD-MANAGED-ACCOUNT-DELETION-AUTHORITY.md),
ServerAdmin monitoring (umbrella issue #2314)

## 0. When

This is set up **after the Pro version has been rolled out**
([Decision 0019](../decisions/0019-repository-split-and-cutover.md),
[cut-over runbook](../CUTOVER-RUNBOOK.md)) and before the public go-live. The Pro version
runs on app.eimir.de, and the go-live keeps the current data of that instance. Until this
runbook is done, app.eimir.de has no backup.

Run the inventory in section 4 again right before starting: the cut-over may change
container, volume or network names. Every placeholder in capitals (`POSTGRES_CONTAINER`,
`PRIMARY_WG_IP`, ...) is replaced with the value that inventory shows.

## 1. Decisions

| Topic | Decision (2026-11-26) |
|---|---|
| Media storage | S3-compatible object storage from go-live (`EIMIR_MEDIA_STORE=s3`). The existing media of app.eimir.de moves from the volume into the bucket once (section 5). Storage grows with use. |
| S3 providers | **Primary: Hetzner Object Storage** (Hetzner Online GmbH, Germany; about EUR 6.49/month including 1 TB storage and 1 TB egress, then about EUR 6.50/TB). **Mirror and history: IONOS Object Storage** (IONOS SE, Germany; about EUR 7/TB-month, inbound traffic free, first 2 TB egress per month free). Two independent German companies without a US parent, both reachable with rclone and SigV4. Prices excl. VAT as published in November 2026. Hetzner buckets live in one location; 2026 incident reports concentrated on FSN1, so NBG1 or HEL1 is preferred. Neither provider documents path-style addressing explicitly, so the smoke test in section 5.1 decides; Scaleway (path-style documented) is the fallback mirror. netcup offers no production object storage. |
| Media protection | A 1:1 mirror bucket at a **second provider** (section 6). rclone syncs every 15 minutes, deletions included. No version history; a delete guard stops a run that would delete unusually much. On a provider outage the app is switched to the mirror. |
| Host protection | A second netcup VPS as **warm standby** (section 7): same Docker/Arcane/proxy setup, application containers stopped, PostgreSQL as a live streaming replica over WireGuard, deletion journal copied every 5 minutes. On a host outage the standby takes over through a DNS change. |
| Database history | 14 days, because a live replica copies a damaging update instantly (section 8): nightly `pg_dump` plus one before every update, encrypted with restic into a history bucket at the mirror provider. |
| Tools | rclone `rclone/rclone:1.75.1` (MIT), restic `restic/restic:0.19.1` (BSD-2-Clause), WireGuard (kernel module of the host), PostgreSQL 17 built-in streaming replication. All container tools run with `docker run`; nothing is built. |
| Alerting | Uptime Kuma push monitors for the mirror, the replica lag and the database history (section 9); a status file for ServerAdmin `backup_status`. |

### Why no application-level backup engine

[Operations and recovery](../m6/OPERATIONS-RECOVERY.md) section 6 assigns bucket durability
and backup to the operator and provider and forbids a second application-level S3 backup
engine. rclone, restic and PostgreSQL replication are the provider-neutral operator tools
that fill this role. `scripts/self_hosted_recovery.py` is not used: it supports only the
Self-Hosted profile with a local media volume, and this instance runs the Cloud profile.

### Why switching to the mirror works (verified in code)

- The database stores only the relative storage key of each object
  (`spaces/<space>/attachments/<attachment>/original`). Endpoint, bucket and keys come only
  from `EIMIR_S3_ENDPOINT`, `EIMIR_S3_BUCKET`, `EIMIR_S3_REGION` and the access keys
  (`backend/src/eimir/media/__init__.py`, `config.py`).
- Media encryption binds each object to its storage key, not to the bucket
  (`backend/src/eimir/media/encrypted.py`). A byte-identical copy under the same key in
  another bucket decrypts with the same application keys.
- With encryption `required` (mandatory in Cloud Production) the store offers no presigned
  upload or read URL; every media byte goes through the API. Browsers never talk to the
  bucket, so the buckets need no CORS rules and no public access.
- The S3 client signs with AWS SigV4 and path-style addresses
  (`https://endpoint/bucket/key`, `backend/src/eimir/media/s3.py`). Both providers must
  support that.
- The local media store writes each object at exactly its storage key below the media
  root (`backend/src/eimir/media/local.py`). Moving the existing volume into a bucket is
  therefore a plain copy of already encrypted files.
- The S3 adapter spools uploads to a private temporary file and reads with bounded range
  requests (`S3MediaStore.put` / `open`), so it does not hold whole objects in memory.
  Uploads use the API's temporary file system (`EIMIR_API_TMPFS_SIZE`, default 1 GB);
  check that size against the largest allowed video before go-live.

This runbook replaces the earlier Hetzner staging preflight (closed PR #1596, issue #1595).
Its acceptance items are covered here: the smoke test in section 5.1 checks path-style
access, `verify-media` and `audit-raw` in section 5.4 check the encrypted application path
against the real bucket, and the pre-go-live drill in section 10 checks restore and
switching.

### Failure cases and what switches

| What fails | What happens | Data loss at most |
|---|---|---|
| App host (VPS) | standby VPS takes over: promote the replica, start the app, change DNS (section 11) | seconds of database writes, minutes of deletion-journal entries (see 7.6) |
| Primary S3 provider | app switches to the mirror bucket (section 12) | media uploaded in the last 15 minutes |
| Damaging update or operator mistake in the database | restore from the database history (section 13) | everything since the chosen dump |
| Accidental mass deletion in the primary bucket | delete guard stops the mirror run; the mirror still holds the objects (section 6) | none, if noticed before the guard is overridden |

## 2. What is stored where

| Unit | Primary | Copy |
|---|---|---|
| Media (encrypted at rest) | primary bucket | mirror bucket, second provider |
| PostgreSQL | `eimir-test-db` on the app host | live replica on the standby VPS; 14-day dump history in the history bucket |
| Deletion journal | `eimir-test_cloud_deletion_journal_data` on the app host | standby VPS every 5 minutes; nightly in the history bucket |
| Arcane environment of `eimir-test` and `eimir-test-db`, encryption keys and all older key ids, `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`, S3 keys of both providers, restic password, replication password, WireGuard keys, registry token | Arcane / host files | **only** the Product Owner's password manager plus one offline copy; the standby gets the values it needs from there |
| Proxy configuration, TLS certificates, `/.well-known/assetlinks.json` | app host proxy | copied to the standby proxy (section 7.7) |

The application keys never go into a bucket, and the bucket keys never go into the
database history. A copy of the data is usable only together with the application keys.

## 3. What only the Product Owner can do

Claude has no access to any server, provider account, Arcane, DNS or Uptime Kuma, and never
needs a password or key. The Product Owner:

- creates the accounts and buckets at both S3 providers and the access keys (section 5.1,
  6.1);
- orders the second netcup VPS and changes DNS (sections 7, 11);
- runs every command on the hosts and pastes the output back when asked;
- creates the Kuma push monitors (section 9);
- keeps the password manager entries and the offline copy (section 2).

## 4. Inventory (read-only)

On the **app host**, in an SSH session. Nothing here changes anything.

1. Containers, images and their projects:

   ```bash
   docker ps --format '{{.Names}}  {{.Image}}  {{.Label "com.docker.compose.project"}}'
   ```

   Note `POSTGRES_CONTAINER` (project `eimir-test-db`), the `cloud-api` container
   (`API_CONTAINER`) and the proxy container.

2. Volumes and networks:

   ```bash
   docker volume ls --format '{{.Name}}' | grep -i eimir
   ```

   ```bash
   docker network ls --format '{{.Name}}' | grep -i -e eimir -e proxy
   ```

3. Volumes of the database container (note `POSTGRES_VOLUME`, the one mounted at
   `/var/lib/postgresql/data`):

   ```bash
   docker inspect --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{println}}{{end}}' POSTGRES_CONTAINER
   ```

4. Sizes:

   ```bash
   docker exec POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT pg_size_pretty(pg_database_size(current_database()))"'
   ```

   ```bash
   sudo du -sh /var/lib/docker/volumes/eimir-test_cloud_media_data/_data
   ```

5. Media store settings the API runs with (shows no secrets):

   ```bash
   docker exec API_CONTAINER sh -c 'echo "store=$EIMIR_MEDIA_STORE encryption=$EIMIR_ENCRYPTION_AT_REST"'
   ```

   Expected today: `store=local encryption=required`.

6. Journal file owner and mode:

   ```bash
   sudo ls -ln /var/lib/docker/volumes/eimir-test_cloud_deletion_journal_data/_data
   ```

7. Where DNS for `eimir.de` is managed and whether the outgoing mail server
   (`EIMIR_SMTP_HOST`) runs on the same host (see section 13).

Paste the output of steps 1 to 6 back; the placeholders are filled from it.

## 5. Move the media into the primary bucket (once)

### 5.1 Primary bucket

At Hetzner (Cloud Console): create a **separate Hetzner project** `eimir-production-storage`
that holds nothing but this bucket. Hetzner S3 keys can by default access **every bucket in
their project**, so the project boundary is what keeps the key away from any other bucket.
In it, create a **private** bucket `eimir-production-media` in NBG1 or HEL1 with public
access off and **versioning off** (old versions would outlive deletions and conflict with
the deletion contract). Bucket names are unique across all Hetzner customers.

| Location | `EIMIR_S3_REGION` | `EIMIR_S3_ENDPOINT` |
|---|---|---|
| Nuremberg | `nbg1` | `https://nbg1.your-objectstorage.com` |
| Helsinki | `hel1` | `https://hel1.your-objectstorage.com` |
| Falkenstein | `fsn1` | `https://fsn1.your-objectstorage.com` |

Create one S3 key pair in that project for the application. Store endpoint, region, bucket
name and both key parts in the password manager. Hetzner documents that some bucket
settings take up to 15 minutes to apply; wait before the smoke test. Hetzner bills every
object as at least 64 KB, which makes many small thumbnails slightly more expensive than
their size suggests.

### 5.2 rclone configuration on the app host

```bash
sudo install -d -m 0700 /opt/eimir-ops
```

```bash
sudo touch /opt/eimir-ops/rclone.conf && sudo chmod 0600 /opt/eimir-ops/rclone.conf && sudo nano /opt/eimir-ops/rclone.conf
```

Paste and fill in (the key values come from the password manager; never paste them into a
chat):

```ini
[primary]
type = s3
provider = Other
endpoint = PRIMARY_ENDPOINT
region = PRIMARY_REGION
access_key_id = PRIMARY_ACCESS_KEY_ID
secret_access_key = PRIMARY_SECRET_ACCESS_KEY
force_path_style = true
no_check_bucket = true
```

**Smoke test of path-style access** (the app requires it). Write, read, list and delete
one harmless test object; every command must succeed:

```bash
echo eimir-smoke-test | sudo docker run --rm -i -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro rclone/rclone:1.75.1 rcat primary:eimir-production-media/smoke-test.txt
```

```bash
sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro rclone/rclone:1.75.1 cat primary:eimir-production-media/smoke-test.txt
```

```bash
sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro rclone/rclone:1.75.1 ls primary:eimir-production-media
```

```bash
sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro rclone/rclone:1.75.1 deletefile primary:eimir-production-media/smoke-test.txt
```

Run the same four commands against the mirror bucket in section 6.1 (replace `primary:` by
`mirror:` and the bucket name). If a provider fails them, stop and choose the fallback
before any data is copied.

### 5.3 First copy while the app runs

```bash
sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro -v eimir-test_cloud_media_data:/media:ro rclone/rclone:1.75.1 copy /media primary:eimir-production-media --exclude '.eimir-tmp-*' --checksum --progress
```

### 5.4 Maintenance window: final copy and switch

1. In Arcane, stop the `eimir-test` project (all application containers).
2. Copy what changed since 5.3:

   ```bash
   sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro -v eimir-test_cloud_media_data:/media:ro rclone/rclone:1.75.1 copy /media primary:eimir-production-media --exclude '.eimir-tmp-*' --checksum
   ```

3. Prove both sides are identical (must report `0 differences found`):

   ```bash
   sudo docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro -v eimir-test_cloud_media_data:/media:ro rclone/rclone:1.75.1 check /media primary:eimir-production-media --exclude '.eimir-tmp-*' --one-way
   ```

4. In Arcane, add these environment values to `eimir-test` (append, do not replace the
   environment):

   ```text
   EIMIR_MEDIA_STORE=s3
   EIMIR_S3_ENDPOINT=PRIMARY_ENDPOINT
   EIMIR_S3_REGION=PRIMARY_REGION
   EIMIR_S3_BUCKET=eimir-production-media
   EIMIR_S3_ACCESS_KEY_ID=...
   EIMIR_S3_SECRET_ACCESS_KEY=...
   ```

5. Deploy `eimir-test` in Arcane and wait until it is healthy.
6. Authenticate every referenced object end to end against the bucket (prints counts only):

   ```bash
   docker exec API_CONTAINER python -m eimir.security verify-media
   ```

   ```bash
   docker exec API_CONTAINER python -m eimir.security audit-raw --media-sample 0
   ```

   Both must end without an error. Then open a few photos and one video in the app.

7. Keep the old volume unchanged for 30 days as fallback (switching back = remove the six
   values and redeploy). Delete it only after the mirror and a drill have succeeded.

## 6. Mirror bucket at the second provider

### 6.1 Mirror bucket and keys

At IONOS (Data Center Designer, Object Storage, region Frankfurt or Berlin): create a
private bucket `eimir-production-media-mirror` and one for the history,
`eimir-production-history`, both with public access off. Bucket names are global at some
providers; if a name is taken, add a short suffix and use it everywhere below. Create:

- a key for the mirror job: read, write, delete, list on `eimir-production-media-mirror`;
- a key for the history job: read, write, delete, list on `eimir-production-history`;
- at Hetzner, a **second** key pair in `eimir-production-storage` for the mirror job's
  source side. A Hetzner key is not read-only by itself; restrict it with a bucket policy
  that allows this key only `s3:GetObject` and `s3:ListBucket` on `eimir-production-media`
  (Hetzner documentation: buckets and objects, bucket policies). Until that policy is in
  place and tested (a delete with this key must fail), the mirror job can in principle
  delete in the primary bucket. rclone `sync` only ever writes to its destination, so the
  policy is a second barrier, not the only one.

Store all of them in the password manager. Add to `/opt/eimir-ops/rclone.conf` with
`sudo nano /opt/eimir-ops/rclone.conf`:

```ini
[source]
type = s3
provider = Other
endpoint = PRIMARY_ENDPOINT
region = PRIMARY_REGION
access_key_id = PRIMARY_READ_ONLY_ACCESS_KEY_ID
secret_access_key = PRIMARY_READ_ONLY_SECRET_ACCESS_KEY
force_path_style = true
no_check_bucket = true

[mirror]
type = s3
provider = Other
endpoint = MIRROR_ENDPOINT
region = MIRROR_REGION
access_key_id = MIRROR_ACCESS_KEY_ID
secret_access_key = MIRROR_SECRET_ACCESS_KEY
force_path_style = true
no_check_bucket = true
```

### 6.2 The mirror job

```bash
sudo tee /opt/eimir-ops/mirror.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
# Mirrors the primary media bucket 1:1 into the mirror bucket at the second provider.
set -Eeuo pipefail
# shellcheck source=/dev/null
. /opt/eimir-ops/ops.env
report() {
  if [ -n "${KUMA_MIRROR_URL:-}" ]; then
    curl -fsS -m 20 --retry 3 -o /dev/null "${KUMA_MIRROR_URL}?status=$1&msg=$2&ping=" || true
  fi
}
trap 'report down "mirror-failed-at-line-$LINENO"' ERR
docker run --rm -v /opt/eimir-ops/rclone.conf:/config/rclone/rclone.conf:ro "$RCLONE_IMAGE" \
  sync source:eimir-production-media mirror:eimir-production-media-mirror \
  --checksum --max-delete "$MIRROR_MAX_DELETE" --retries 3 --low-level-retries 10 --stats-one-line -v
install -d -m 0755 /var/lib/eimir-ops/status
date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/eimir-ops/status/mirror-last-success.tmp
mv /var/lib/eimir-ops/status/mirror-last-success.tmp /var/lib/eimir-ops/status/mirror-last-success
report up ok
EOF
```

```bash
sudo tee /opt/eimir-ops/ops.env > /dev/null <<'EOF'
RCLONE_IMAGE=rclone/rclone:1.75.1
RESTIC_IMAGE=restic/restic:0.19.1
POSTGRES_CONTAINER=POSTGRES_CONTAINER
JOURNAL_VOLUME=eimir-test_cloud_deletion_journal_data
MIRROR_MAX_DELETE=200
STANDBY_WG_IP=STANDBY_WG_IP
KUMA_MIRROR_URL=
KUMA_REPLICA_URL=
KUMA_HISTORY_URL=
EOF
```

```bash
sudo chmod 0600 /opt/eimir-ops/ops.env && sudo chmod 0700 /opt/eimir-ops/mirror.sh
```

First run by hand (copies everything once):

```bash
sudo /opt/eimir-ops/mirror.sh && echo MIRROR-OK
```

**Delete guard:** `--max-delete 200` stops a run that would delete more than 200 objects
and reports `down` to Kuma. If that happens, check in the app and in ServerAdmin whether
the deletions are real (for example a large Space deletion). Only then raise
`MIRROR_MAX_DELETE` in `/opt/eimir-ops/ops.env` for one manual run of `mirror.sh` and set
it back to `200` afterwards.

### 6.3 Timers

One helper creates the systemd service and timer for every job in this runbook:

```bash
sudo tee /opt/eimir-ops/install-timer.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
# Usage: install-timer.sh <job> <OnCalendar>; runs /opt/eimir-ops/<job>.sh on that schedule.
set -Eeuo pipefail
name="$1"
calendar="$2"
test -x "/opt/eimir-ops/$name.sh"
cat > "/etc/systemd/system/eimir-$name.service" <<UNIT
[Unit]
Description=eimir. operations job $name
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/eimir-ops/$name.sh
Nice=10
UNIT
cat > "/etc/systemd/system/eimir-$name.timer" <<UNIT
[Unit]
Description=eimir. operations job $name schedule

[Timer]
OnCalendar=$calendar
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now "eimir-$name.timer"
EOF
```

```bash
sudo chmod 0700 /opt/eimir-ops/install-timer.sh
```

The mirror every 15 minutes:

```bash
sudo /opt/eimir-ops/install-timer.sh mirror '*:0/15'
```

Check all timers at any time with `systemctl list-timers 'eimir-*'`, and a job's log with
`journalctl -u eimir-mirror.service --since today --no-pager`. Undo for one job:
`sudo systemctl disable --now eimir-mirror.timer`.

## 7. Standby VPS

### 7.1 Order and harden

Order a second netcup VPS with at least the CPU, RAM and disk of the app host, in another
netcup location if one is offered. Install the same Linux distribution, Docker and Arcane
the same way as on the app host. Harden it like eimir-runner-01: key-only SSH, no root
login, ufw with only `22/tcp` open, unattended security upgrades. Docker publishes ports
past ufw, so the standby publishes no container port except the proxy's 80/443.

### 7.2 WireGuard tunnel between both hosts

On **both** hosts:

```bash
sudo apt-get install -y wireguard
```

```bash
sudo sh -c 'umask 077; wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key'
```

```bash
sudo cat /etc/wireguard/public.key
```

The public keys are not secret; note each host's public key. On the **app host** (tunnel
address `10.88.0.1`):

```bash
sudo tee /etc/wireguard/wg0.conf > /dev/null <<'EOF'
[Interface]
Address = 10.88.0.1/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/private.key

[Peer]
PublicKey = STANDBY_PUBLIC_KEY
AllowedIPs = 10.88.0.2/32
Endpoint = STANDBY_PUBLIC_IP:51820
PersistentKeepalive = 25
EOF
```

On the **standby** (tunnel address `10.88.0.2`), the same with `Address = 10.88.0.2/24`,
`PublicKey = APP_HOST_PUBLIC_KEY`, `AllowedIPs = 10.88.0.1/32` and
`Endpoint = APP_HOST_PUBLIC_IP:51820`.

On **both** hosts, allow only the other host and start the tunnel:

```bash
sudo ufw allow from OTHER_HOST_PUBLIC_IP to any port 51820 proto udp
```

```bash
sudo systemctl enable --now wg-quick@wg0
```

Test from the app host (must answer):

```bash
ping -c 3 10.88.0.2
```

On the **app host**, make Docker start only after the tunnel. Otherwise, after a reboot,
the database container could not bind its tunnel port (section 7.3) and would not start:

```bash
sudo install -d /etc/systemd/system/docker.service.d && printf '[Unit]\nAfter=wg-quick@wg0.service\nWants=wg-quick@wg0.service\n' | sudo tee /etc/systemd/system/docker.service.d/10-wireguard.conf > /dev/null && sudo systemctl daemon-reload
```

### 7.3 Make the app-host database reachable for replication only

1. Create the replication role. Generate its password on the host and store it in the
   password manager:

   ```bash
   openssl rand -base64 32
   ```

   ```bash
   docker exec -it POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```

   In the `psql` prompt (type the password yourself where it says so):

   ```sql
   CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'PASTE-THE-REPLICATION-PASSWORD';
   SELECT pg_create_physical_replication_slot('standby1');
   ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
   SELECT pg_reload_conf();
   \q
   ```

   `max_slot_wal_keep_size` keeps a long standby outage from filling the app host's disk.

2. Allow the standby in `pg_hba.conf`:

   ```bash
   docker exec POSTGRES_CONTAINER sh -c 'echo "host replication replicator 10.88.0.2/32 scram-sha-256" >> "$PGDATA/pg_hba.conf"' && docker exec POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf()"'
   ```

3. In Arcane, open the `eimir-test-db` project and add a port binding to its PostgreSQL
   service that listens **only** on the tunnel address:

   ```yaml
   ports:
     - "10.88.0.1:5432:5432"
   ```

   Redeploy `eimir-test-db` (the database restarts; the app reconnects within seconds).
   Never bind `0.0.0.0` or the public IP.

### 7.4 Seed and start the replica on the standby

1. In Arcane on the standby, create the project `eimir-test-db` with the **same** Compose
   file as on the app host, but **without** the `10.88.0.1` port binding of section 7.3
   (that address does not exist on the standby), and without starting it. Create its data
   volume empty:

   ```bash
   docker volume create POSTGRES_VOLUME
   ```

2. Copy the database over the tunnel (asks for the replication password; type it yourself):

   ```bash
   docker run --rm -it --network host -v POSTGRES_VOLUME:/var/lib/postgresql/data postgres:17-alpine pg_basebackup -h 10.88.0.1 -p 5432 -U replicator -D /var/lib/postgresql/data -S standby1 -X stream -R -P
   ```

   `-R` makes the copy start as a read-only replica that follows the app host.

3. Start `eimir-test-db` on the standby in Arcane. Check on the **app host** (one row,
   `state = streaming`):

   ```bash
   docker exec POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication"'
   ```

### 7.5 Application project on the standby (stopped)

1. Create the external volumes the channel expects:

   ```bash
   docker volume create eimir-test_cloud_media_data && docker volume create eimir-test_cloud_deletion_journal_data
   ```

2. Create the networks the channel expects, as shown by the inventory (section 4 step 2),
   for example:

   ```bash
   docker network create eimir-test-data && docker network create mailcow-proxy
   ```

3. In Arcane, create the `eimir-test` project with Git Sync on `deploy/eimir-test`, the same
   registry token and the full environment from the password manager (S3 values of the
   primary bucket). **Turn automatic sync and deployment off and do not deploy.** Two running
   application instances against one bucket would corrupt state.

### 7.6 Deletion journal to the standby every 5 minutes

The journal is append-only and protected by a hash chain. On startup the API validates it
and replays every tombstone (`backend/src/eimir/identity/deletion_self_service.py`), so a
copy that is a few minutes behind starts cleanly. The entries of those last minutes are
already applied in the replicated database; they would be missing only if an older database
dump were later restored on the standby. That residual risk is accepted with a 5-minute
interval.

On the standby, create a receiving user and directory:

```bash
sudo adduser --system --group --home /srv/eimir-sync --shell /bin/sh eimirsync && sudo install -d -o eimirsync -g eimirsync -m 0700 /srv/eimir-sync/journal /srv/eimir-sync/.ssh
```

On the app host, create the key and show the public part:

```bash
sudo ssh-keygen -t ed25519 -N "" -C eimir-journal-sync -f /opt/eimir-ops/journal-sync && sudo cat /opt/eimir-ops/journal-sync.pub
```

On the standby, allow that key only from the tunnel (replace `PUBLIC_KEY_LINE` with the
printed line):

```bash
echo 'from="10.88.0.1",restrict PUBLIC_KEY_LINE' | sudo tee /srv/eimir-sync/.ssh/authorized_keys > /dev/null && sudo chown eimirsync:eimirsync /srv/eimir-sync/.ssh/authorized_keys && sudo chmod 0600 /srv/eimir-sync/.ssh/authorized_keys
```

On the app host, the sync job (`--append-verify` only ever appends and verifies the whole
file, which matches an append-only journal):

```bash
sudo tee /opt/eimir-ops/journal-sync.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
# Copies the append-only Account-deletion journal to the standby over WireGuard.
set -Eeuo pipefail
# shellcheck source=/dev/null
. /opt/eimir-ops/ops.env
rsync -a --append-verify \
  -e "ssh -i /opt/eimir-ops/journal-sync -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  "/var/lib/docker/volumes/$JOURNAL_VOLUME/_data/" "eimirsync@$STANDBY_WG_IP:/srv/eimir-sync/journal/"
EOF
```

```bash
sudo chmod 0700 /opt/eimir-ops/journal-sync.sh && sudo apt-get install -y rsync && sudo /opt/eimir-ops/journal-sync.sh && echo JOURNAL-SYNC-OK
```

`rsync` must also be installed on the standby (`sudo apt-get install -y rsync`). Every 5
minutes:

```bash
sudo /opt/eimir-ops/install-timer.sh journal-sync '*:0/5'
```

### 7.7 Proxy, certificates and App Links on the standby

Run the same reverse proxy as on the app host, on the same proxy network, with the same
host entries for `app.eimir.de` and the same `/.well-known/assetlinks.json` response
([cut-over runbook](../CUTOVER-RUNBOOK.md), App Links row). Without that file, mailed
sign-in links no longer open in the Android app after a switch. Copy the proxy's
configuration and certificate data once, and again after every proxy change. Section 4's
inventory decides the exact paths.

### 7.8 DNS

At the DNS provider, set the TTL of the `app.eimir.de` record to 300 seconds, so a switch
reaches clients within about 5 minutes.

## 8. Database history (14 days)

1. Create the restic password and store it in the password manager:

   ```bash
   sudo sh -c 'umask 077; head -c 32 /dev/urandom | base64 > /opt/eimir-ops/restic-password'
   ```

2. Store the history key in a private file (`sudo nano /opt/eimir-ops/history.env`, then
   `sudo chmod 0600 /opt/eimir-ops/history.env`):

   ```text
   RESTIC_REPOSITORY=s3:MIRROR_ENDPOINT/eimir-production-history
   AWS_ACCESS_KEY_ID=HISTORY_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY=HISTORY_SECRET_ACCESS_KEY
   AWS_DEFAULT_REGION=MIRROR_REGION
   ```

3. The restic wrapper (the job and every manual command use it):

   ```bash
   sudo tee /opt/eimir-ops/history-restic.sh > /dev/null <<'EOF'
   #!/usr/bin/env bash
   # Runs restic in its official container against the 14-day history repository.
   set -Eeuo pipefail
   # shellcheck source=/dev/null
   . /opt/eimir-ops/ops.env
   install -d -m 0700 /var/lib/eimir-ops/staging /var/lib/eimir-ops/restore
   exec docker run --rm --hostname eimir-ops --env-file /opt/eimir-ops/history.env \
     -e RESTIC_PASSWORD_FILE=/run/restic/password \
     -v /opt/eimir-ops/restic-password:/run/restic/password:ro \
     -v /var/lib/eimir-ops/staging:/backup/db:ro \
     -v "$JOURNAL_VOLUME":/backup/journal:ro \
     -v /var/lib/eimir-ops/restore:/restore \
     "$RESTIC_IMAGE" "$@"
   EOF
   ```

4. The history job:

   ```bash
   sudo tee /opt/eimir-ops/history.sh > /dev/null <<'EOF'
   #!/usr/bin/env bash
   # Encrypted database dump and deletion journal into the 14-day history.
   # Usage: history.sh [tag]   (default tag: nightly; use pre-update before every update)
   set -Eeuo pipefail
   umask 077
   # shellcheck source=/dev/null
   . /opt/eimir-ops/ops.env
   TAG="${1:-nightly}"
   RESTIC=/opt/eimir-ops/history-restic.sh
   STAGING=/var/lib/eimir-ops/staging
   report() {
     if [ -n "${KUMA_HISTORY_URL:-}" ] && [ "$TAG" = nightly ]; then
       curl -fsS -m 20 --retry 3 -o /dev/null "${KUMA_HISTORY_URL}?status=$1&msg=$2&ping=" || true
     fi
   }
   trap 'report down "history-failed-at-line-$LINENO"' ERR
   trap 'rm -rf "$STAGING"' EXIT
   rm -rf "$STAGING"
   install -d -m 0700 "$STAGING"
   docker exec "$POSTGRES_CONTAINER" sh -c 'exec pg_dump --format=custom --no-owner --no-privileges --exclude-table-data=public.once_messages --exclude-table-data=public.once_devices --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' > "$STAGING/eimir.dump"
   test -s "$STAGING/eimir.dump"
   "$RESTIC" backup --host eimir-ops --tag "$TAG" --quiet /backup/db /backup/journal
   "$RESTIC" forget --host eimir-ops --keep-within 14d --prune --quiet
   if [ "$TAG" = nightly ] && [ "$(date +%u)" = 7 ]; then
     "$RESTIC" check --read-data-subset=10%
   fi
   install -d -m 0755 /var/lib/eimir-ops/status
   date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/eimir-ops/status/history-last-success.tmp
   mv /var/lib/eimir-ops/status/history-last-success.tmp /var/lib/eimir-ops/status/history-last-success
   report up "ok-$TAG"
   EOF
   ```

   ```bash
   sudo chmod 0700 /opt/eimir-ops/history-restic.sh /opt/eimir-ops/history.sh
   ```

5. Initialise the repository and run the first history by hand:

   ```bash
   sudo /opt/eimir-ops/history-restic.sh init
   ```

   ```bash
   sudo /opt/eimir-ops/history.sh && echo HISTORY-OK
   ```

   ```bash
   sudo /opt/eimir-ops/history-restic.sh snapshots
   ```

6. Nightly at 03:30:

   ```bash
   sudo /opt/eimir-ops/install-timer.sh history '*-*-* 03:30:00'
   ```

7. **Before every update** of `eimir-test` (Pro release, Git Sync commit with migrations):

   ```bash
   sudo /opt/eimir-ops/history.sh pre-update && echo PRE-UPDATE-OK
   ```

`--keep-within 14d` keeps every snapshot of the last 14 days and deletes older ones. The
privacy policy draft's `BACKUP_RETENTION` (`legal/de/privacy-policy.md`) can then name 14
days. The media mirror keeps no history: an object deleted in the app disappears from the
mirror with the next run.

## 9. Alerting and the ServerAdmin signal

Create three **Push** monitors in Uptime Kuma, Retries `0`; copy each push URL only up to
the `?` into `/opt/eimir-ops/ops.env` (`sudo nano /opt/eimir-ops/ops.env`):

| Monitor | Heartbeat interval | Variable |
|---|---|---|
| `eimir media mirror` | 3600 s | `KUMA_MIRROR_URL` |
| `eimir database replica` | 900 s | `KUMA_REPLICA_URL` |
| `eimir database history` | 90000 s (25 h) | `KUMA_HISTORY_URL` |

The replica check runs every 5 minutes on the app host and pushes `up` only while the
standby streams with less than 5 minutes lag:

```bash
sudo tee /opt/eimir-ops/replica-check.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
# Pushes to Kuma while the standby replica streams with less than five minutes lag.
set -Eeuo pipefail
# shellcheck source=/dev/null
. /opt/eimir-ops/ops.env
healthy=$(docker exec "$POSTGRES_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM pg_stat_replication WHERE state = '"'"'streaming'"'"' AND coalesce(replay_lag, interval '"'"'0'"'"') < interval '"'"'5 minutes'"'"'"')
if [ "$healthy" -ge 1 ] && [ -n "${KUMA_REPLICA_URL:-}" ]; then
  curl -fsS -m 20 --retry 3 -o /dev/null "${KUMA_REPLICA_URL}?status=up&msg=streaming&ping=" || true
fi
EOF
```

```bash
sudo chmod 0700 /opt/eimir-ops/replica-check.sh && sudo /opt/eimir-ops/install-timer.sh replica-check '*:0/5'
```

No push means Kuma alerts after 15 minutes. Because this check runs on the app host, it
also alerts when the app host itself is gone.

**ServerAdmin `backup_status`:** the jobs write their last success time to
`/var/lib/eimir-ops/status/mirror-last-success` and `history-last-success` (one UTC
timestamp each, mode `0644`, no secrets). A failed run leaves the previous file. This is the
interface for ServerAdmin monitoring part 2 (#2314): the API reads the directory through a
read-only mount and derives `backup_status` and a stale alert from the age. That mount and
the alert are code work in that part.

## 10. Drills

**Before go-live, once, with downtime allowed:** a full host switch (section 11) to the
standby and back, and a switch to the mirror bucket (section 12) and back. Record the time
each step took.

**Monthly (about 30 minutes):** restore the newest history dump into a throwaway database
without network and compare counts with the running instance. On the app host:

1. Restore the newest dump:

   ```bash
   sudo /opt/eimir-ops/history-restic.sh restore latest --host eimir-ops --include /backup/db --target /restore
   ```

2. Start a throwaway PostgreSQL without network (its password protects nothing):

   ```bash
   sudo docker run -d --name eimir-restore-drill --network none -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill-only -e POSTGRES_DB=drill -v /var/lib/eimir-ops/restore/backup/db:/dump:ro postgres:17-alpine
   ```

3. Repeat until it prints `accepting connections`:

   ```bash
   sudo docker exec eimir-restore-drill pg_isready -U drill -d drill
   ```

4. Restore:

   ```bash
   sudo docker exec eimir-restore-drill pg_restore --single-transaction --no-owner --no-privileges -U drill -d drill /dump/eimir.dump && echo RESTORE-OK
   ```

5. Count in the drill database and in the running database (the running numbers may be a
   little higher, never lower without a known reason):

   ```bash
   sudo docker exec eimir-restore-drill psql -U drill -d drill -c "SELECT (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM spaces) AS spaces, (SELECT count(*) FROM memories) AS memories, (SELECT count(*) FROM attachments WHERE status = 'READY') AS media"
   ```

   ```bash
   sudo docker exec POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM accounts) AS accounts, (SELECT count(*) FROM spaces) AS spaces, (SELECT count(*) FROM memories) AS memories, (SELECT count(*) FROM attachments WHERE status = '"'"'READY'"'"') AS media"'
   ```

6. Clean up:

   ```bash
   sudo docker rm -f eimir-restore-drill && sudo rm -rf /var/lib/eimir-ops/restore/backup
   ```

Record date and numbers in a private note. A failed step means the history is not usable:
investigate before the next night.

**Quarterly:** start a one-off backend container of the running image against the restored
drill database and the **mirror** bucket with a read-only mirror key and the application keys
from the password manager, and run `python -m eimir.security verify-payloads` and
`verify-media`. This proves that the history, the mirror and the keys together restore the
instance. Until it has run once, key recovery is unproven
([Encryption at rest](../ENCRYPTION-AT-REST.md) section 10).

## 11. Switch to the standby (app host down)

1. If the app host still answers: stop `eimir-test` there in Arcane, so it cannot keep
   writing.
2. Promote the replica on the standby:

   ```bash
   docker exec STANDBY_POSTGRES_CONTAINER sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_promote()"'
   ```

3. Put the newest journal copy into the standby's journal volume with the owner and mode
   the inventory (section 4 step 6) showed:

   ```bash
   sudo install -o JOURNAL_UID -g JOURNAL_GID -m JOURNAL_MODE /srv/eimir-sync/journal/account-deletions.journal /var/lib/docker/volumes/eimir-test_cloud_deletion_journal_data/_data/
   ```

4. Deploy `eimir-test` on the standby in Arcane and wait until it is healthy.
5. Change the `app.eimir.de` DNS record to the standby's public IP.
6. Check `https://app.eimir.de/api/v1/health/ready`, sign in with a test account, open a
   photo. Kuma's uptime check turns green again.
7. Set up the mirror and history jobs on the standby (sections 6.1 to 6.3 and 8, with the
   standby's database container as `POSTGRES_CONTAINER`, values from the password manager)
   until the old host is rebuilt.

The old app host never starts `eimir-test` again in this state. It is rebuilt as the new
standby (sections 7.3 to 7.6 in the other direction) before switching back.

## 12. Switch to the mirror bucket (primary S3 provider down)

1. Stop the mirror timer, so it cannot try to sync from the broken source:
   `sudo systemctl stop eimir-mirror.timer`.
2. In Arcane, change `EIMIR_S3_ENDPOINT`, `EIMIR_S3_REGION`, `EIMIR_S3_BUCKET`
   (`eimir-production-media-mirror`) and both access-key values of `eimir-test` to a
   read-write key for the mirror bucket. Redeploy.
3. Check readiness and open a photo.
4. Media uploaded in the last 15 minutes before the outage is missing. When the primary
   provider is back, copy those objects back with `rclone copy` from the old primary into
   the mirror (no `sync`), then decide whether the mirror stays the primary and a new mirror
   is set up at a third place.

## 13. Restore the database from the history (damaging update)

Use this only for a database that an update or a mistake damaged. The replica follows the
app host, so it holds the same damage and is not a way back.

1. In Arcane, stop `eimir-test` (leave `eimir-test-db` running).
2. List the snapshots and choose the last good one (`pre-update` before the faulty update):

   ```bash
   sudo /opt/eimir-ops/history-restic.sh snapshots
   ```

   ```bash
   sudo /opt/eimir-ops/history-restic.sh restore SNAPSHOT_ID --include /backup/db --target /restore
   ```

3. Replace the database with that dump. This deletes the current database content; the
   replica follows automatically:

   ```bash
   docker exec POSTGRES_CONTAINER sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```

   ```bash
   sudo cat /var/lib/eimir-ops/restore/backup/db/eimir.dump | docker exec -i POSTGRES_CONTAINER sh -c 'pg_restore --single-transaction --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' && echo RESTORE-OK
   ```

4. **Keep the live deletion journal volume as it is.** Never restore the journal from the
   history. Deploying `eimir-test` runs the migration first, and the API replays every
   journal entry before it serves traffic
   ([Cloud Account-deletion authority](../m6/CLOUD-MANAGED-ACCOUNT-DELETION-AUTHORITY.md)
   section 4), so Accounts deleted after the dump stay deleted.
5. Deploy `eimir-test` in Arcane, check readiness, sign in with a test account.
6. Media uploaded after the dump stays in the bucket without a reference (harmless). Media
   deleted after the dump is gone from both buckets and shows as missing.

## 14. Open points

- Whether outgoing mail (`EIMIR_SMTP_HOST`) runs on the app host. If it does, sign-in mails
  stop with the host, also after a switch to the standby. Mail is not covered here.
- The quarterly key drill and the proxy copy paths are fixed after the first run together
  with Claude.
- Nothing in this runbook has run against the real hosts and providers yet. The pre-go-live
  drill (section 10) is the acceptance test of the whole runbook.
- The ServerAdmin mount of `/var/lib/eimir-ops/status` and the stale alert belong to
  ServerAdmin part 2 (#2314).
