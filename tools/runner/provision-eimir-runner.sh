#!/usr/bin/env bash
set -euo pipefail

# Run from cloud-init inside a freshly booted Actions guest.
if [[ $EUID != 0 || $(hostname -s) != eimir-actions-probe ]] || ! mountpoint -q /srv/eimir-runner-toolcache; then
    printf 'Provisioning requires root in the isolated Actions guest with its toolcache mounted.\n' >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
    ca-certificates curl docker.io docker-buildx docker-compose-v2 git iproute2 jq libicu74 \
    python3 sudo unzip build-essential nasm autoconf automake libtool pkg-config ffmpeg \
    fonts-liberation fonts-noto-color-emoji libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
    libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxkbcommon0 libxrandr2 xvfb

if ! id actions-runner >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash actions-runner
fi
usermod --append --groups docker actions-runner
install -d -m 0755 -o actions-runner -g actions-runner /srv/eimir-runner-toolcache/tools
systemctl start docker

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# The Ubuntu Noble package predates the release workflow's attestation CLI.
gh_version=2.105.0
gh_digest=79e7ab5db738c48777b696e374f8b428f0647debfb424f44d2f426370407fe2f
gh_source=gh_${gh_version}_linux_amd64
gh_cache=/srv/eimir-runner-toolcache/bootstrap
install -d -m 0700 -o root -g root "$gh_cache"
gh_archive=$gh_cache/$gh_source.tar.gz
if ! printf '%s  %s\n' "$gh_digest" "$gh_archive" | sha256sum --check --status; then
    curl -fsSL --proto '=https' --retry 2 --max-time 120 \
        "https://github.com/cli/cli/releases/download/v${gh_version}/${gh_source}.tar.gz" -o "$work/gh.tar.gz"
    printf '%s  %s\n' "$gh_digest" "$work/gh.tar.gz" | sha256sum --check --status
    install -m 0400 "$work/gh.tar.gz" "$gh_archive"
fi
tar -xOzf "$gh_archive" "$gh_source/bin/gh" > "$work/gh"
install -m 0755 "$work/gh" /usr/local/bin/gh
/usr/local/bin/gh attestation trusted-root --help >/dev/null

cat > "$work/sudoers" <<'EOF'
actions-runner ALL=(root) NOPASSWD: /usr/bin/apt-get update, /usr/bin/apt-get install -y --no-install-recommends nasm autoconf automake libtool pkg-config ffmpeg
EOF
visudo -cf "$work/sudoers"
install -m 0440 -o root -g root "$work/sudoers" /etc/sudoers.d/eimir-actions-runner
