#!/usr/bin/env bash
set -euo pipefail

BUNDLE="${1:-}"
PRIVATE_KEY="${2:-$HOME/.garca-branca/recovery/backup-private-key.pem}"
DESTINATION="${3:-./restored-backup}"
[[ -d "$BUNDLE" && -f "$PRIVATE_KEY" ]] || { echo "Use: $0 <bundle> [chave-privada] [destino]" >&2; exit 1; }
ENC_FILE="$(find "$BUNDLE" -maxdepth 1 -name '*.tar.gz.enc' -print -quit)"
KEY_FILE="$(find "$BUNDLE" -maxdepth 1 -name '*.key.enc' -print -quit)"
[[ -n "$ENC_FILE" && -n "$KEY_FILE" ]] || { echo "Bundle incompleto." >&2; exit 1; }

umask 077
WORK="$(mktemp -d "${TMPDIR:-/tmp}/garca-restore.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
openssl pkeyutl -decrypt -inkey "$PRIVATE_KEY" \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in "$KEY_FILE" -out "$WORK/passphrase"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
  -in "$ENC_FILE" -out "$WORK/backup.tar.gz" -pass file:"$WORK/passphrase"
mkdir -p "$DESTINATION"
tar -C "$DESTINATION" -xzf "$WORK/backup.tar.gz"
(cd "$DESTINATION" && shasum -a 256 -c checksums.sha256 >/dev/null)
echo "Backup descriptografado e verificado em: $DESTINATION"
