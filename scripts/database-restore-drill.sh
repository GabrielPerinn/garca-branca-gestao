#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAYLOAD="${1:-}"
[[ -d "$PAYLOAD" && -f "$PAYLOAD/database/data.sql" ]] || { echo "Use: $0 <diretório-payload>" >&2; exit 1; }
[[ "${GARCA_ALLOW_LOCAL_RESET:-0}" == "1" ]] || {
  echo "O ensaio recria apenas o Supabase local. Defina GARCA_ALLOW_LOCAL_RESET=1 para confirmar." >&2
  exit 1
}
cd "$ROOT_DIR"

echo "Verificando checksums internos..."
(cd "$PAYLOAD" && shasum -a 256 -c checksums.sha256 >/dev/null)

echo "Recriando banco descartável pelas migrações..."
npx supabase start >/dev/null
npx supabase db reset >/dev/null
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml | head -1)"
DB_CONTAINER="$(docker ps --filter "label=com.supabase.cli.project=$PROJECT_ID" --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
[[ -n "$DB_CONTAINER" ]] || { echo "Container local do banco não encontrado." >&2; exit 1; }

TABLES="$(cut -f1 "$PAYLOAD/database/table-counts.tsv" | paste -sd, -)"
if [[ -n "$TABLES" ]]; then
  docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "SET session_replication_role = replica; TRUNCATE TABLE $TABLES CASCADE;" >/dev/null
fi
{
  printf '%s\n' 'SET session_replication_role = replica;'
  sed 's/^SET transaction_timeout/-- &/' "$PAYLOAD/database/data.sql" | awk '
    /^COPY / {
      header=$0
      if ((getline first_row) <= 0) { print header; next }
      # Platform schemas can gain columns before the local CLI image does.
      # Empty COPY blocks carry no recoverable information and are safely
      # omitted, avoiding false failures caused only by those version gaps.
      if (first_row == "\\.") next
      print header
      print first_row
      next
    }
    { print }
  '
} | docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres --single-transaction -v ON_ERROR_STOP=1 >/dev/null

echo "Comparando todas as contagens restauradas..."
while IFS=$'\t' read -r table expected; do
  actual="$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -Atqc "SELECT count(*) FROM $table")"
  [[ "$actual" == "$expected" ]] || { echo "Divergência em $table: esperado=$expected restaurado=$actual" >&2; exit 1; }
done < "$PAYLOAD/database/table-counts.tsv"

docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -Atqc \
  "SELECT public.run_data_integrity_check('restore_drill', false) IS NOT NULL" | grep -qx t
echo "Ensaio de restauração concluído sem divergências."
