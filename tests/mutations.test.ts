import assert from 'node:assert/strict'
import test from 'node:test'

import { databaseErrorMessage } from '../src/lib/data/database-errors'

test('erros conhecidos do banco viram mensagens operacionais úteis', () => {
  assert.match(databaseErrorMessage({ code: '23503' }, 'Falha'), /possui vínculos/)
  assert.match(databaseErrorMessage({ code: '23505' }, 'Falha'), /Já existe/)
  assert.equal(
    databaseErrorMessage({ code: '23514', message: 'Saldo insuficiente.' }, 'Falha'),
    'Saldo insuficiente.',
  )
})

test('erros internos desconhecidos não vazam detalhes do banco', () => {
  assert.equal(
    databaseErrorMessage({ code: 'XX000', message: 'internal relation secret_name' }, 'Operação indisponível.'),
    'Operação indisponível.',
  )
})
