#!/usr/bin/env bash
# Sample host and per-slot guest resources on eimir-dev while Actions guests run (#2115).
# Installed as /usr/local/sbin/eimir-actions-measure-guests by install-host.sh.
# Read-only: it changes no guest, unit or file outside its own output.
#   sudo eimir-actions-measure-guests [interval seconds] | tee ~/eimir-measure.csv
#   eimir-actions-measure-guests summary ~/eimir-measure.csv
set -euo pipefail

state=/var/lib/eimir-actions-vm
# Tests point this at a fake cgroup tree.
cgroup_root=${EIMIR_MEASURE_CGROUP_ROOT:-/sys/fs/cgroup}
slots=(1 2)

if [[ ${1:-} == summary ]]; then
    csv=${2:?Usage: measure-guests.sh summary <csv>}
    # Columns: see the header below. Slot columns repeat per slot from column 5.
    awk -F, -v slots="${#slots[@]}" '
        NR == 1 { next }
        {
            samples++
            if (first == "") first = $1
            last = $1
            steal += $3
            if ($4 < host_min_avail || host_min_avail == "") host_min_avail = $4
            for (s = 0; s < slots; s++) {
                base = 5 + s * 7
                if ($(base) == "active") {
                    active[s]++
                    cpu[s] += $(base + 2)
                    if ($(base + 2) > cpu_max[s]) cpu_max[s] = $(base + 2)
                    if ($(base + 3) > peak[s]) peak[s] = $(base + 3)
                    throttled[s] += $(base + 5)
                    if ($(base + 6) > overlay[s]) overlay[s] = $(base + 6)
                }
            }
            both_active = 1
            for (t = 0; t < slots; t++) if ($(5 + t * 7) != "active") both_active = 0
            if (both_active) both++
        }
        END {
            printf "samples %d, %s .. %s\n", samples, first, last
            printf "host: average steal %.1f %%, lowest MemAvailable %d MiB, both slots busy in %d samples\n", steal / samples, host_min_avail, both
            for (s = 0; s < slots; s++) {
                if (!active[s]) { printf "slot %d: never active\n", s + 1; continue }
                printf "slot %d: active in %d samples, CPU average %.0f %% (max %.0f %%), memory peak %d MiB, CPU throttled %.0f s, overlay max %d MiB\n",
                    s + 1, active[s], cpu[s] / active[s], cpu_max[s], peak[s], throttled[s], overlay[s]
            }
        }' "$csv"
    exit 0
fi

interval=${1:-10}
if [[ $EUID != 0 || ! $interval =~ ^[1-9][0-9]*$ ]]; then
    echo "Usage: sudo $0 [interval seconds] | summary <csv>" >&2
    exit 1
fi

cpu_total() { awk '/^cpu / { total = 0; for (i = 2; i <= 9; i++) total += $i; print total, $9 }' /proc/stat; }
cgroup_value() { # file key -> value of "key value" lines, or 0
    awk -v key="$2" '$1 == key { print $2; found = 1 } END { if (!found) print 0 }' "$1" 2>/dev/null || echo 0
}

header="time,host_cpu_percent,host_steal_percent,host_mem_available_mib"
for slot in "${slots[@]}"; do
    header+=",slot${slot}_state,slot${slot}_mem_current_mib,slot${slot}_cpu_percent,slot${slot}_mem_peak_mib"
    header+=",slot${slot}_throttled_periods,slot${slot}_throttled_seconds,slot${slot}_overlay_mib"
done
echo "$header"

declare -A last_usage last_periods last_throttled
read -r last_total last_steal < <(cpu_total)
last_idle=$(awk '/^cpu / { print $5 + $6 }' /proc/stat)
last_time=$(date +%s.%N)
while true; do
    sleep "$interval"
    now=$(date +%s.%N)
    elapsed=$(awk -v a="$now" -v b="$last_time" 'BEGIN { print a - b }')
    read -r total steal < <(cpu_total)
    idle=$(awk '/^cpu / { print $5 + $6 }' /proc/stat)
    line=$(date -u +%FT%TZ)
    line+=$(awk -v t="$total" -v lt="$last_total" -v s="$steal" -v ls="$last_steal" -v i="$idle" -v li="$last_idle" \
        'BEGIN { d = t - lt; if (d <= 0) d = 1; printf ",%.1f,%.1f", 100 * (d - (i - li)) / d, 100 * (s - ls) / d }')
    line+=,$(( $(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo) / 1024 ))
    for slot in "${slots[@]}"; do
        unit=eimir-actions-network-probe-slot$slot.service
        cg=$cgroup_root/system.slice/$unit
        if [[ -d $cg ]]; then
            usage=$(cgroup_value "$cg/cpu.stat" usage_usec)
            periods=$(cgroup_value "$cg/cpu.stat" nr_throttled)
            throttled=$(cgroup_value "$cg/cpu.stat" throttled_usec)
            account=eimir-actions-vm
            [[ $slot == 1 ]] || account=eimir-actions-vm$slot
            # Allocated overlay size; a missing account or job directory reads as 0.
            overlay=$( { find "$state" -maxdepth 2 -name guest.qcow2 -user "$account" -printf '%b\n' 2>/dev/null || true; } |
                awk '{ sum += $1 } END { printf "%d", sum * 512 / 1048576 }')
            line+=$(awk -v cur="$(cat "$cg/memory.current" 2>/dev/null || echo 0)" \
                -v peak="$(cat "$cg/memory.peak" 2>/dev/null || echo 0)" \
                -v u="$usage" -v lu="${last_usage[$slot]:-$usage}" -v e="$elapsed" \
                -v p="$periods" -v lp="${last_periods[$slot]:-$periods}" \
                -v th="$throttled" -v lth="${last_throttled[$slot]:-$throttled}" -v o="$overlay" \
                'BEGIN { printf ",active,%d,%.0f,%d,%d,%.1f,%d", cur / 1048576, (u - lu) / (e * 10000), peak / 1048576, p - lp, (th - lth) / 1e6, o }')
            last_usage[$slot]=$usage last_periods[$slot]=$periods last_throttled[$slot]=$throttled
        else
            line+=",idle,0,0,0,0,0,0"
            unset 'last_usage[$slot]' 'last_periods[$slot]' 'last_throttled[$slot]'
        fi
    done
    echo "$line"
    last_total=$total last_steal=$steal last_idle=$idle last_time=$now
done
