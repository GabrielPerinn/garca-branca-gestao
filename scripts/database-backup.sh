#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.local && -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

BACKUP_ID="garca-branca-$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_ROOT="${GARCA_BACKUP_OUTPUT_DIR:-$HOME/.garca-branca/backups}"
STAGING_ROOT="${GARCA_BACKUP_STAGING_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/garca-backup.XXXXXX")}"
PAYLOAD="$STAGING_ROOT/payload"
OUTPUT="$OUTPUT_ROOT/$BACKUP_ID"
PUBLIC_KEY="${GARCA_BACKUP_PUBLIC_KEY:-$ROOT_DIR/scripts/backup/garca-backup-public.pem}"
KEEP_STAGING="${GARCA_KEEP_BACKUP_STAGING:-0}"

cleanup() {
  rm -f "$STAGING_ROOT/archive-passphrase"
  if [[ "$KEEP_STAGING" != "1" ]]; then rm -rf "$STAGING_ROOT"; fi
}
trap cleanup EXIT
umask 077
mkdir -p "$PAYLOAD/database" "$PAYLOAD/recovery-source" "$OUTPUT"

dump_args=()
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  dump_args=(--db-url "$SUPABASE_DB_URL")
elif [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  dump_args=(--linked --password "$SUPABASE_DB_PASSWORD")
else
  dump_args=(--linked)
fi

echo "Criando cópia lógica do banco..."
npx supabase db dump "${dump_args[@]}" --file "$PAYLOAD/database/roles.sql" --role-only
if [[ -z "${SUPABASE_DB_URL:-}" && -z "${SUPABASE_DB_PASSWORD:-}" && "$(uname -s)" == "Darwin" ]]; then
  # On IPv6-only direct database endpoints the CLI's local IPv4 fallback can
  # stall specifically on schema export. The versioned migrations below are
  # the tested schema recovery source in this local/manual mode.
  rm -f "$PAYLOAD/database/schema.sql"
  echo "Schema reconstruível pelas migrações versionadas (modo local sem senha do banco)."
  credential_script="$STAGING_ROOT/temporary-credentials.sh"
  npx supabase db dump --linked --data-only --dry-run > "$credential_script"
  temporary_user="$(sed -n 's/^export PGUSER="\(.*\)"/\1/p' "$credential_script")"
  temporary_password="$(sed -n 's/^export PGPASSWORD="\(.*\)"/\1/p' "$credential_script")"
  project_ref="$(tr -d '\n' < supabase/.temp/project-ref)"
  pooler_host="$(sed -E 's#^postgresql://[^@]+@([^:/]+).*#\1#' supabase/.temp/pooler-url)"
  docker run --rm \
    -e PGHOST="$pooler_host" -e PGPORT=5432 -e PGUSER="$temporary_user.$project_ref" \
    -e PGPASSWORD="$temporary_password" -e PGDATABASE=postgres \
    public.ecr.aws/supabase/postgres:17.6.1.127 \
    pg_dump --data-only --quote-all-identifiers --role postgres \
    --exclude-schema 'information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor' \
    --exclude-table auth.schema_migrations --exclude-table storage.migrations \
    --exclude-table supabase_functions.migrations --schema '*' \
    > "$PAYLOAD/database/data.sql"
  rm -f "$credential_script"
elif ! npx supabase db dump "${dump_args[@]}" --file "$PAYLOAD/database/schema.sql" || [[ ! -s "$PAYLOAD/database/schema.sql" ]]; then
  rm -f "$PAYLOAD/database/schema.sql"
  echo "O schema remoto não foi exportado; as migrações versionadas serão a fonte de reconstrução."
fi
if [[ ! -s "$PAYLOAD/database/data.sql" ]]; then
  npx supabase db dump "${dump_args[@]}" --file "$PAYLOAD/database/data.sql" --use-copy --data-only
fi
[[ -s "$PAYLOAD/database/data.sql" ]] || { echo "A cópia de dados ficou vazia; backup cancelado." >&2; exit 1; }

cp -R supabase/migrations "$PAYLOAD/recovery-source/migrations"
cp supabase/config.toml package.json package-lock.json "$PAYLOAD/recovery-source/"

echo "Copiando arquivos do Storage..."
npx tsx scripts/export-storage.ts --output "$PAYLOAD/storage"

awk '
  /^COPY / { table=$2; count=0; copying=1; next }
  copying && /^\\\.$/ { print table "\t" count; copying=0; next }
  copying { count++ }
' "$PAYLOAD/database/data.sql" > "$PAYLOAD/database/table-counts.tsv"

(
  cd "$PAYLOAD"
  find . -type f ! -name checksums.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > checksums.sha256
)

DATABASE_BYTES="$(wc -c < "$PAYLOAD/database/data.sql" | tr -d ' ')"
STORAGE_BYTES="$(node -e "const m=require(process.argv[1]); process.stdout.write(String(m.total_bytes))" "$PAYLOAD/storage/storage-manifest.json")"
ARCHIVE="$STAGING_ROOT/$BACKUP_ID.tar.gz"
tar -C "$PAYLOAD" -czf "$ARCHIVE" .
openssl rand -hex 32 > "$STAGING_ROOT/archive-passphrase"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 \
  -in "$ARCHIVE" -out "$OUTPUT/$BACKUP_ID.tar.gz.enc" \
  -pass file:"$STAGING_ROOT/archive-passphrase"
openssl pkeyutl -encrypt -pubin -inkey "$PUBLIC_KEY" \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in "$STAGING_ROOT/archive-passphrase" -out "$OUTPUT/$BACKUP_ID.key.enc"

ENCRYPTED_SHA="$(shasum -a 256 "$OUTPUT/$BACKUP_ID.tar.gz.enc" | awk '{print $1}')"
ENCRYPTED_BYTES="$(wc -c < "$OUTPUT/$BACKUP_ID.tar.gz.enc" | tr -d ' ')"
RETAINED_UNTIL="$(node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+90); console.log(d.toISOString())")"
cat > "$OUTPUT/manifest-public.json" <<JSON
{
  "version": 1,
  "backup_id": "$BACKUP_ID",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "retained_until": "$RETAINED_UNTIL",
  "database_bytes": $DATABASE_BYTES,
  "storage_bytes": $STORAGE_BYTES,
  "encrypted_bytes": $ENCRYPTED_BYTES,
  "encrypted_sha256": "$ENCRYPTED_SHA",
  "restore_drill": false,
  "encryption": "AES-256-CBC/PBKDF2 + RSA-3072-OAEP-SHA256"
}
JSON
printf '%s  %s\n' "$ENCRYPTED_SHA" "$BACKUP_ID.tar.gz.enc" > "$OUTPUT/encrypted.sha256"
rm -f "$ARCHIVE"
echo "Backup criptografado concluído: $OUTPUT"
