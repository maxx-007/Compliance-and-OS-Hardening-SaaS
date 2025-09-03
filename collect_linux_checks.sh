#!/usr/bin/env bash
# collect_linux_checks.sh - collector for Linux (outputs JSON)
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
host=$(hostname -f 2>/dev/null || hostname)
has_cmd() { command -v "$1" >/dev/null 2>&1; }

minlen=null
if [ -f /etc/security/pwquality.conf ]; then
  minlen=$(grep -E '^minlen' /etc/security/pwquality.conf | awk -F= '{print $2}' | tr -d ' ')
fi

auditd_running=false
if has_cmd auditctl; then auditd_running=true; fi

firewall="unknown"
if has_cmd ufw; then firewall=$(ufw status | head -n1 | sed 's/Status: //')
elif systemctl is-active firewalld >/dev/null 2>&1; then firewall="active"
else firewall="disabled"; fi

patch_age_days=null
if has_cmd apt; then
  if [ -f /var/lib/apt/periodic/update-success-stamp ]; then
    last=$(stat -c %Y /var/lib/apt/periodic/update-success-stamp)
    patch_age_days=$(( ( $(date +%s) - last ) / 86400 ))
  fi
fi

ports=""
if has_cmd ss; then ports=$(ss -tuln | awk 'NR>1 {print $5}' | sed -E 's/.*:([0-9]+)$/'\''\1\''/ | sort -u | grep -E '^[0-9]+' || true); fi

enc="unknown"
if has_cmd lsblk && has_cmd cryptsetup; then
  if lsblk -o NAME,FSTYPE | grep -E 'crypto_LUKS' >/dev/null 2>&1; then enc="yes"; else enc="no"; fi
fi

printf '{\n  "asset_id":"%s",\n  "os":"linux",\n  "timestamp":"%s",\n  "checks":[\n' "$host" "$timestamp"
printf '    {"id":"PWD_MINLEN","value":%s},\n' "${minlen:-null}"
printf '    {"id":"AUDITD_RUNNING","value":%s},\n' "$auditd_running"
printf '    {"id":"FIREWALL_STATUS","value":"%s"},\n' "$firewall"
printf '    {"id":"PATCH_AGE_DAYS","value":%s},\n' "${patch_age_days:-null}"
printf '    {"id":"OPEN_PORTS","value":"%s"},\n' "$(echo $ports | tr '\n' ',')"
printf '    {"id":"DISK_ENCRYPTED","value":"%s"}\n' "$enc"
printf '  ]\n}\n'
