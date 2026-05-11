#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
BACKUP_TIME=${BACKUP_TIME:-03:30}
SERVICE_NAME=${SERVICE_NAME:-red-flower-garden-backup}
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root so the systemd timer can be installed." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/deploy/backup-sqlite.sh" ]; then
  echo "Backup script not found: $APP_DIR/deploy/backup-sqlite.sh" >&2
  exit 1
fi

cat > "$SYSTEMD_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Red Flower Garden SQLite backup
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
Environment=APP_DIR=$APP_DIR
Environment=BACKUP_REASON=daily
ExecStart=/usr/bin/env bash $APP_DIR/deploy/backup-sqlite.sh
EOF

cat > "$SYSTEMD_DIR/$SERVICE_NAME.timer" <<EOF
[Unit]
Description=Run Red Flower Garden SQLite backup daily

[Timer]
OnCalendar=*-*-* $BACKUP_TIME:00
Persistent=true
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME.timer"
systemctl list-timers "$SERVICE_NAME.timer" --no-pager
