#!/usr/bin/env bash
set -euo pipefail

# Run from cloud-init inside an isolated Actions guest.
#   image  bake packages, the runner account and tools into the reusable runner image
#   job    per-job setup on a guest started from that image (toolcache mounted)
#   (none) both phases in one fresh guest; fallback when no runner image exists
phase=${1:-all}
if [[ $EUID != 0 || $(hostname -s) != eimir-actions-probe || ! $phase =~ ^(all|image|job)$ ]]; then
    printf 'Provisioning requires root in the isolated Actions guest: %s [image|job]\n' "$0" >&2
    exit 1
fi
if [[ $phase != image ]] && ! mountpoint -q /srv/eimir-runner-toolcache; then
    printf 'Job provisioning requires the mounted toolcache.\n' >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

provision_image() {
    apt-get update -qq
    if [[ $phase == image ]]; then
        # The weekly image rebuild picks up security updates of the base image.
        apt-get upgrade -y -qq -o Dpkg::Options::=--force-confold
    fi
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

    # The Ubuntu Noble package predates the release workflow's attestation CLI.
    local gh_version=2.105.0
    local gh_digest=79e7ab5db738c48777b696e374f8b428f0647debfb424f44d2f426370407fe2f
    local gh_source=gh_${gh_version}_linux_amd64
    local gh_archive=$work/gh.tar.gz
    if mountpoint -q /srv/eimir-runner-toolcache; then
        local gh_cache=/srv/eimir-runner-toolcache/bootstrap
        install -d -m 0700 -o root -g root "$gh_cache"
        gh_archive=$gh_cache/$gh_source.tar.gz
    fi
    if ! printf '%s  %s\n' "$gh_digest" "$gh_archive" | sha256sum --check --status; then
        curl -fsSL --proto '=https' --retry 2 --max-time 120 \
            "https://github.com/cli/cli/releases/download/v${gh_version}/${gh_source}.tar.gz" -o "$work/gh.download"
        printf '%s  %s\n' "$gh_digest" "$work/gh.download" | sha256sum --check --status
        install -m 0400 "$work/gh.download" "$gh_archive"
    fi
    tar -xOzf "$gh_archive" "$gh_source/bin/gh" > "$work/gh"
    install -m 0755 "$work/gh" /usr/local/bin/gh
    /usr/local/bin/gh attestation trusted-root --help >/dev/null

    cat > "$work/sudoers" <<'EOF'
actions-runner ALL=(root) NOPASSWD: /usr/bin/apt-get update, /usr/bin/apt-get install -y --no-install-recommends nasm autoconf automake libtool pkg-config ffmpeg
EOF
    visudo -cf "$work/sudoers"
    install -m 0440 -o root -g root "$work/sudoers" /etc/sudoers.d/eimir-actions-runner
}

provision_job() {
    local tools=/srv/eimir-runner-toolcache/tools
    install -d -m 0755 -o actions-runner -g actions-runner "$tools"
    # A rebuilt image may assign the runner account another UID. Keep the
    # persistent toolcache writable without walking it on every job.
    if [[ -n $(find "$tools" -mindepth 1 -maxdepth 1 ! -user actions-runner -print -quit) ]]; then
        chown -R actions-runner:actions-runner "$tools"
    fi
    systemctl start docker
}

case $phase in
    image) provision_image ;;
    job) provision_job ;;
    all) provision_image; provision_job ;;
esac
