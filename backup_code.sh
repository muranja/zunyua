#!/bin/bash

# Lightweight Code-Only Backup Script
# Creates a zip with ONLY source code files — no logs, no deps, no archives

PROJECT_DIR="/home/vin/projects/munyua"
BACKUP_NAME="munyua_code_$(date +'%Y%m%d_%H%M%S').zip"
OUTPUT_PATH="${PROJECT_DIR}/${BACKUP_NAME}"

cd "${PROJECT_DIR}" || exit

echo "Creating code-only backup: ${BACKUP_NAME}..."

# Include ONLY code and essential config files by extension
find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/coverage/*" \
    -not -name "*.zip" \
    -not -name "*.tar" \
    -not -name "*.tar.gz" \
    -not -name "*.rar" \
    -not -name "*.log" \
    -not -name "*.txt" \
    -not -name "*.pub" \
    -not -name "desktop.ini" \
    -not -name ".DS_Store" \
    -not -name "Thumbs.db" \
    -not -name "package-lock.json" \
    \( \
        -name "*.js" -o \
        -name "*.jsx" -o \
        -name "*.ts" -o \
        -name "*.tsx" -o \
        -name "*.html" -o \
        -name "*.css" -o \
        -name "*.json" -o \
        -name "*.sql" -o \
        -name "*.sh" -o \
        -name "*.rsc" -o \
        -name "*.md" -o \
        -name "*.conf" -o \
        -name "*.toml" -o \
        -name "*.svg" -o \
        -name "*.env.example" -o \
        -name "*.env.production" -o \
        -name "*.gitignore" -o \
        -name "vite.config.*" -o \
        -name "tailwind.config.*" -o \
        -name "postcss.config.*" -o \
        -name "tsconfig.*" -o \
        -name "ecosystem.config.*" \
    \) \
    -type f \
    | zip "${OUTPUT_PATH}" -@

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Backup created: ${OUTPUT_PATH}"
    echo "📦 Size: $(du -h "${OUTPUT_PATH}" | cut -f1)"
    echo "📄 Files: $(unzip -l "${OUTPUT_PATH}" | tail -1)"
else
    echo "❌ Backup failed."
    exit 1
fi
