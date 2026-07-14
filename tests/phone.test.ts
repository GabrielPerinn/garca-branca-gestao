import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePhone, phoneIdentityVariants, phonesAreEquivalent } from '../src/lib/phone'

test('normaliza telefone sem preservar pontuação', () => {
  assert.equal(normalizePhone('+55 (48) 98456-0474'), '5548984560474')
})

test('reconhece o formato brasileiro do WhatsApp sem o nono dígito', () => {
  assert.equal(phonesAreEquivalent('5548984560474', '554884560474'), true)
  assert.deepEqual(
    [...phoneIdentityVariants('5548984560474')].sort(),
    ['554884560474', '5548984560474'],
  )
})

test('não aproxima números estrangeiros ou brasileiros diferentes', () => {
  assert.equal(phonesAreEquivalent('15556374392', '15556374393'), false)
  assert.equal(phonesAreEquivalent('5548984560474', '5548984560475'), false)
})

test('rejeita valores curtos ou sem telefone válido', () => {
  assert.equal(phoneIdentityVariants('123').size, 0)
  assert.equal(phonesAreEquivalent('', '5548984560474'), false)
})
