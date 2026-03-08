#!/bin/bash
# =====================================================
# TurboNet Database Restore Script
# Restores from a backup file
# =====================================================

# Configuration
DB_USER="turbonet"
DB_PASS="TurboNet2024!"
DB_NAME="turbonet"
BACKUP_DIR="/home/aspenhorgan254/backups"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "🔍 Available backups:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null
    echo ""
    echo "Usage: ./restore.sh <backup_file.sql.gz>"
    echo "Example: ./restore.sh turbonet_2024-12-29_02-00-00.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if file exists (full path or in backup dir)
if [ -f "$BACKUP_FILE" ]; then
    RESTORE_FILE="$BACKUP_FILE"
elif [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    RESTORE_FILE="$BACKUP_DIR/$BACKUP_FILE"
else
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  WARNING: This will OVERWRITE all data in '$DB_NAME' database!"
echo "   Restoring from: $RESTORE_FILE"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "📦 Restoring database..."

# Decompress and restore
if [[ "$RESTORE_FILE" == *.gz ]]; then
    gunzip -c "$RESTORE_FILE" | mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME"
else
    mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$RESTORE_FILE"
fi

if [ $? -eq 0 ]; then
    echo "✅ Database restored successfully!"
    echo "$(date): Restored from $RESTORE_FILE" >> "$BACKUP_DIR/backup.log"
else
    echo "❌ Restore failed!"
    exit 1
fi
