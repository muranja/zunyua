#!/bin/bash
# =====================================================
# Setup Automated Daily Backups
# Run this ONCE on your VM to enable automatic backups
# =====================================================

SCRIPT_DIR="$HOME/turbonet/infra"

echo "🔧 Setting up automated backups..."

# Make scripts executable
chmod +x "$SCRIPT_DIR/backup.sh"
chmod +x "$SCRIPT_DIR/restore.sh"

# Create backup directory
mkdir -p "$HOME/backups"

# Add cron job for daily backup at 2 AM
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 2 * * * $SCRIPT_DIR/backup.sh >> $HOME/backups/cron.log 2>&1") | crontab -

echo "✅ Automated backups configured!"
echo ""
echo "📋 Backup Schedule:"
echo "   Time: 2:00 AM daily"
echo "   Location: ~/backups/"
echo "   Retention: 30 days"
echo ""
echo "📝 Commands:"
echo "   Manual backup:  ~/turbonet/infra/backup.sh"
echo "   Restore:        ~/turbonet/infra/restore.sh <filename>"
echo "   View backups:   ls -lh ~/backups/"
echo "   View cron:      crontab -l"
