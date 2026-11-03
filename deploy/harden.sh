#!/usr/bin/env bash
# Anitale server hardening. Run as root on the server:
#   bash deploy/harden.sh audit   -> only shows the current state, changes nothing
#   bash deploy/harden.sh         -> applies everything below (safe to run again)
#
# What it does:
#   1. firewall (ufw): only SSH, web (80/443) and Syncthing sync are open; everything else closed
#   2. anitale.service: restarts itself after a crash, memory cap, hardened sandbox (drop-in file,
#      the original unit file is not touched; auto-reverted if the site does not come back up)
#   3. fail2ban: bans IPs that keep guessing SSH passwords
#   4. journald log size limit + 1 GB swap file if there is none (small server)
#   5. automatic security updates (unattended-upgrades)
# It does NOT touch SSH settings, nginx, the database or backups.
set -u
MODE="${1:-apply}"
SERVICE=anitale
APP_DIR=/var/www/anitale
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()  { printf '  ok: %s\n' "$*"; }
warn(){ printf '  !! %s\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo -i first)."; exit 1; }

ssh_port() {
  local p
  p=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')
  [ -n "$p" ] || p=$(ss -tlnp 2>/dev/null | awk '/sshd/{n=split($4,a,":"); print a[n]; exit}')
  echo "${p:-22}"
}

audit() {
  say "Listening ports (who can be reached)"
  ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | awk '{print "  " $4 "\t" $NF}'
  say "Firewall"; (ufw status 2>/dev/null | head -12) || echo "  ufw not installed"
  say "Service"; systemctl show "$SERVICE" -p Restart -p User -p MemoryMax -p NoNewPrivileges 2>/dev/null | sed 's/^/  /'
  systemctl is-active "$SERVICE" | sed 's/^/  active: /'
  say "SSH"; sshd -T 2>/dev/null | grep -E '^(port|passwordauthentication|permitrootlogin) ' | sed 's/^/  /'
  say "Swap / memory"; free -m | sed 's/^/  /'
  say "fail2ban"; systemctl is-active fail2ban 2>/dev/null | sed 's/^/  /'
  say "Real visitor IP behind the CDN (nginx)"
  if nginx -T 2>/dev/null | grep -qi 'real_ip_header'; then ok "nginx has real_ip_header"; nginx -T 2>/dev/null | grep -i 'real_ip_header' | head -2 | sed 's/^/  /'; else warn "nginx has no real_ip_header: the site sees the CDN IP instead of the visitor (rate limits then count everyone together)"; fi
  say "Disk"; df -h / | sed 's/^/  /'
}

if [ "$MODE" = audit ]; then audit; exit 0; fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- 1. firewall
say "1/5 Firewall"
SSHP=$(ssh_port)
echo "  SSH port detected: $SSHP"
if ! command -v ufw >/dev/null; then apt-get update -qq && apt-get install -y -qq ufw >/dev/null; fi
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSHP"/tcp comment 'ssh' >/dev/null
ufw allow 80/tcp comment 'web' >/dev/null
ufw allow 443/tcp comment 'web tls' >/dev/null
# Syncthing (the database folder is synced): open its sync port only if it is actually running.
if ss -tlnp 2>/dev/null | grep -q ':22000 '; then
  ufw allow 22000 comment 'syncthing sync' >/dev/null
  ufw allow 21027/udp comment 'syncthing discovery' >/dev/null
  ok "Syncthing sync ports allowed (its web panel stays closed)"
fi
# Safety net: if you lose your SSH connection after enabling, the firewall switches itself off in 2 minutes.
( sleep 120; ufw --force disable >/dev/null 2>&1; echo "firewall auto-disabled (no confirmation)" > /tmp/ufw-rollback.txt ) &
ROLLBACK_PID=$!
ufw --force enable >/dev/null
ok "firewall enabled. Open ports: SSH $SSHP, 80, 443"
echo
echo "  Open a SECOND terminal now and check that you can still log in by SSH and that the site opens."
read -r -p "  Still working? Press Enter to keep the firewall (or wait 2 minutes to undo it): " _ANS
kill "$ROLLBACK_PID" 2>/dev/null; ok "firewall confirmed"

# ---------------------------------------------------------------- 2. service
say "2/5 anitale.service (auto-restart + sandbox)"
DROP=/etc/systemd/system/$SERVICE.service.d
mkdir -p "$DROP"
RAM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
MEM_HIGH=$((RAM_MB * 45 / 100)); MEM_MAX=$((RAM_MB * 65 / 100))
echo "  RAM ${RAM_MB} MB -> site memory soft limit ${MEM_HIGH} MB, hard limit ${MEM_MAX} MB"
[ -f "$DROP/hardening.conf" ] && cp "$DROP/hardening.conf" /tmp/hardening.conf.bak
cat > "$DROP/hardening.conf" <<EOF
[Unit]
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=3
# the site gets at most ~65% of RAM before it is restarted instead of freezing the machine
MemoryHigh=${MEM_HIGH}M
MemoryMax=${MEM_MAX}M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
EOF
systemctl daemon-reload
systemctl restart "$SERVICE"
sleep 4
if systemctl is-active --quiet "$SERVICE" && curl -fsS -o /dev/null --max-time 10 http://127.0.0.1:3000/api/anime; then
  ok "site is up with the hardened unit"
else
  warn "site did not come back with the hardened unit, reverting"
  rm -f "$DROP/hardening.conf"; systemctl daemon-reload; systemctl restart "$SERVICE"
  journalctl -u "$SERVICE" -n 15 --no-pager
fi

# ---------------------------------------------------------------- 3. SSH brute-force protection
say "3/5 SSH brute-force protection"
if ! command -v fail2ban-client >/dev/null; then apt-get install -y -qq fail2ban >/dev/null 2>&1 || true; fi
if command -v fail2ban-client >/dev/null; then
  cat > /etc/fail2ban/jail.d/anitale-ssh.local <<EOF
[sshd]
enabled = true
port = $SSHP
maxretry = 5
findtime = 10m
bantime = 1h
EOF
  systemctl enable --now fail2ban >/dev/null 2>&1; systemctl restart fail2ban
  ok "fail2ban: $(systemctl is-active fail2ban)"
else
  # packages cannot be downloaded here (mirror blocked): use the firewall's built-in limiter instead
  ufw limit "$SSHP"/tcp comment 'ssh rate limit' >/dev/null
  ok "fail2ban could not be installed; SSH is rate-limited by the firewall instead (6 connections / 30 s per IP)"
fi

# ---------------------------------------------------------------- 4. logs + swap
say "4/5 Log size + swap"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\nMaxRetentionSec=1month\n' > /etc/systemd/journald.conf.d/anitale.conf
systemctl restart systemd-journald
journalctl --vacuum-size=200M >/dev/null 2>&1
ok "journal limited to 200 MB"
if [ -z "$(swapon --show --noheadings)" ]; then
  if [ "$(df --output=avail -m / | tail -1)" -gt 3000 ]; then
    fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10 >/dev/null; echo 'vm.swappiness=10' > /etc/sysctl.d/99-anitale-swap.conf
    ok "1 GB swap created (npm run build no longer runs out of memory)"
  else warn "not enough free disk for a swap file, skipped"; fi
else ok "swap already exists"; fi
ls /etc/logrotate.d/nginx >/dev/null 2>&1 && ok "nginx logs are already rotated by logrotate" || warn "no logrotate rule for nginx found"

# ---------------------------------------------------------------- 5. updates
say "5/5 Automatic security updates"
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then apt-get install -y -qq unattended-upgrades >/dev/null 2>&1 || true; fi
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then warn "unattended-upgrades is not installed and could not be downloaded (mirror blocked); skipped"; else
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
ok "security updates install automatically"; fi

say "Final state"
audit
echo; echo "Done. If anything looks wrong, send me the output above."
