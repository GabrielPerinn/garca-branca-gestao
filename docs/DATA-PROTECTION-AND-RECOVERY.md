# Proteção e recuperação dos dados

## Objetivo

O sistema usa proteção em camadas. Nenhuma delas, isoladamente, é tratada como
garantia absoluta:

1. tabelas operacionais críticas bloqueiam exclusão física e usam `status = 'deleted'`;
2. o Garça Twin preserva histórico imutável e encadeado por SHA-256;
3. uma verificação diária recalcula a cadeia e procura quantidades negativas ou ações travadas;
4. o backup lógico inclui banco, usuários do Auth e metadados do Storage;
5. os objetos reais do Storage são copiados separadamente;
6. o pacote é criptografado antes de sair do executor;
7. cada backup é restaurado em uma instância descartável e todas as contagens são comparadas;
8. somente depois do ensaio a evidência imutável é registrada no banco de produção.

Meta operacional atual: RPO máximo de 24 horas e RTO de até 2 horas. Ativar PITR
reduz o RPO, mas é um recurso pago do Supabase e não substitui a cópia externa.

## Chaves e localização

- chave pública versionada: `scripts/backup/garca-backup-public.pem`;
- chave privada local: `~/.garca-branca/recovery/backup-private-key.pem`;
- backups manuais locais: `~/.garca-branca/backups/`;
- backups automáticos: artifacts criptografados do workflow `Encrypted Database Backup`, com 90 dias de retenção.

A chave privada precisa de uma segunda cópia em mídia externa segura ou cofre de
senhas que aceite anexos. Sem essa chave o pacote externo é propositalmente
irrecuperável. Nunca coloque a chave privada no repositório, Vercel, Supabase ou
no mesmo artifact do backup.

## Backup manual

```bash
npm run backup:database
```

O comando falha se a cópia de dados ou a cópia do Storage não for concluída. O
arquivo público `manifest-public.json` não contém dados da fazenda nem segredos.

## Descriptografar e verificar

```bash
npm run backup:decrypt -- \
  ~/.garca-branca/backups/garca-branca-AAAAMMDDTHHMMSSZ \
  ~/.garca-branca/recovery/backup-private-key.pem \
  ./restored-backup
```

O comando valida o checksum do pacote e de todos os arquivos internos antes de
entregar o conteúdo.

## Ensaio de restauração

O comando abaixo apaga e recria somente o banco Supabase local. Nunca aponta
para produção:

```bash
GARCA_ALLOW_LOCAL_RESET=1 npm run backup:restore-drill -- ./restored-backup
```

Ele recria o schema pelas migrations, restaura os dados com triggers suspensos,
compara a quantidade de linhas de cada tabela e executa a verificação de
integridade. Qualquer divergência termina o processo com falha.

## Recuperação de incidente

1. Interromper temporariamente WhatsApp, crons e alterações no sistema.
2. Registrar o horário aproximado e o tipo do incidente; não apagar o projeto atual.
3. Escolher a cópia verificada imediatamente anterior ao incidente.
4. Restaurar primeiro em projeto Supabase novo ou instância local descartável.
5. Conferir usuários, fazendas, rebanho, financeiro, tarefas e objetos do Storage.
6. Somente depois da conferência promover a base recuperada e trocar as credenciais da aplicação.
7. Executar `run_data_integrity_check('post_recovery', true)` e registrar o resultado.

Uma restauração sobre produção causa indisponibilidade e nunca deve ser iniciada
apenas para “testar”. Os ensaios existem justamente para validar sem esse risco.

## Alarmes

`/api/cron/data-protection` roda diariamente. Ele cria um alerta operacional se:

- não existir backup externo verificado nas últimas 36 horas;
- a cadeia do Garça Twin não conferir;
- houver quantidade negativa de gado ou estoque;
- uma ação da IA permanecer travada em processamento por mais de 20 minutos.

O endpoint `/api/health` expõe `data_protection` sem revelar nomes, valores ou
conteúdo do backup.
