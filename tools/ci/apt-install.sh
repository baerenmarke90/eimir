#!/usr/bin/env bash
#
# Install distribution packages on a hosted runner without hanging on its resolver.
#
#   tools/ci/apt-install.sh <package>...
#
# Hosted ubuntu-26.04 runners intermittently fail to resolve the Ubuntu mirrors
# while other names keep resolving. A plain `apt-get update` then ignores the
# missing indexes and the following install stalls for minutes per package until
# the job timeout cancels it, which hides the cause. This helper checks the
# mirrors first, restarts the local resolver when they do not resolve, bounds
# every apt network operation and fails with one explicit error instead.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: tools/ci/apt-install.sh <package>..." >&2
  exit 2
fi

attempts="${APT_INSTALL_ATTEMPTS:-5}"
pause="${APT_INSTALL_PAUSE_SECONDS:-15}"

# The mirror list is the runner's own source of truth; fall back to the archive.
mirror_hosts() {
  {
    if [ -r /etc/apt/apt-mirrors.txt ]; then
      awk '{print $1}' /etc/apt/apt-mirrors.txt
    fi
    echo "http://archive.ubuntu.com/ubuntu/"
  } | sed -E 's#^[a-z+]+://([^/:]+).*#\1#' | sort -u
}

mirrors_resolve() {
  local host
  for host in $(mirror_hosts); do
    if ! getent ahosts "$host" >/dev/null 2>&1; then
      echo "Cannot resolve $host" >&2
      return 1
    fi
  done
}

apt_get() {
  sudo apt-get \
    -o Acquire::Retries=3 \
    -o Acquire::http::Timeout=30 \
    -o Acquire::https::Timeout=30 \
    -o DPkg::Lock::Timeout=120 \
    "$@"
}

for attempt in $(seq 1 "$attempts"); do
  if mirrors_resolve; then
    # --error-on=any turns silently ignored index failures into a retry.
    if apt_get update --error-on=any && apt_get install -y --no-install-recommends "$@"; then
      exit 0
    fi
    echo "::warning::apt failed on attempt $attempt of $attempts"
  else
    echo "::warning::Ubuntu mirrors did not resolve on attempt $attempt of $attempts"
    resolvectl status 2>/dev/null | sed -n '1,25p' || true
    # A fresh resolver state is the least invasive remedy; upstream DNS is unchanged.
    sudo systemctl restart systemd-resolved 2>/dev/null || true
    sudo resolvectl flush-caches 2>/dev/null || true
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    sleep "$pause"
  fi
done

echo "::error::Could not install $* after $attempts attempts; the runner cannot reach or resolve its Ubuntu mirrors." >&2
exit 1
