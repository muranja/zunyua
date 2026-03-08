#!/bin/bash
# =====================================================
# TurboNet MySQL Backup Script
# Automatically backs up the database daily
# =====================================================

# Configuration
DB_USER="turbonet"
DB_PASS="TurboNet2024!"
DB_NAME="turbonet"
BACKUP_DIR="/home/aspenhorgan254/backups"
RETENTION_DAYS=30  # Keep backups for 30 days

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"

# Create backup
echo "📦 Starting backup of $DB_NAME..."
mysqldump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    # Compress the backup
    gzip "$BACKUP_FILE"
    FINAL_FILE="${BACKUP_FILE}.gz"
    SIZE=$(du -h "$FINAL_FILE" | cut -f1)
    
    echo "✅ Backup successful!"
    echo "   File: $FINAL_FILE"
    echo "   Size: $SIZE"
    
    # Log the backup
    echo "$(date): Backup created - ${FINAL_FILE} (${SIZE})" >> "$BACKUP_DIR/backup.log"
else
    echo "❌ Backup failed!"
    echo "$(date): Backup FAILED" >> "$BACKUP_DIR/backup.log"
    exit 1
fi

# Delete old backups (older than RETENTION_DAYS)
echo "🧹 Cleaning old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# Show remaining backups
echo ""
echo "📁 Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5

echo ""
echo "✨ Backup complete!"
