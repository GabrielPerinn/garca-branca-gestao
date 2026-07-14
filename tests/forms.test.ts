import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import {
  dateString,
  nonNegativeInteger,
  nonNegativeNumber,
  optionalDateString,
  optionalInteger,
  optionalNonNegativeNumber,
  optionalText,
  parseFormData,
  parseRecordId,
  positiveInteger,
  positiveNumber,
  requiredText,
} from '../src/lib/validation/forms';

test('schemas de texto normalizam espaços e respeitam obrigatoriedade e limite', () => {
  const required = requiredText('Nome', 10);
  const optional = optionalText('Observação', 10);

  assert.equal(required.parse('  Fazenda  '), 'Fazenda');
  assert.equal(required.safeParse('   ').success, false);
  assert.equal(required.safeParse('12345678901').success, false);
  assert.equal(optional.parse('   '), undefined);
  assert.equal(optional.parse('  Campo  '), 'Campo');
  assert.equal(optional.safeParse('12345678901').success, false);
});

test('schemas numéricos rejeitam valores inválidos, infinitos e negativos', () => {
  const positive = positiveNumber('Valor');
  const nonNegative = nonNegativeNumber('Quantidade');
  const optionalNonNegative = optionalNonNegativeNumber('Custo');

  assert.equal(positive.parse('12.5'), 12.5);
  assert.equal(positive.safeParse('abc').success, false);
  assert.equal(positive.safeParse('Infinity').success, false);
  assert.equal(positive.safeParse('0').success, false);
  assert.equal(positive.safeParse('-1').success, false);

  assert.equal(nonNegative.parse('0'), 0);
  assert.equal(nonNegative.safeParse('-0.01').success, false);
  assert.equal(optionalNonNegative.parse('  '), undefined);
  assert.equal(optionalNonNegative.safeParse('-2').success, false);
});

test('schemas inteiros rejeitam frações, negativos e valores fora da faixa', () => {
  assert.equal(positiveInteger('Cabeças').parse('3'), 3);
  assert.equal(positiveInteger('Cabeças').safeParse('3.5').success, false);
  assert.equal(nonNegativeInteger('Estoque').parse('0'), 0);
  assert.equal(nonNegativeInteger('Estoque').safeParse('-1').success, false);

  const paymentDay = optionalInteger('Dia do pagamento', 1, 31);
  assert.equal(paymentDay.parse(''), undefined);
  assert.equal(paymentDay.parse('15'), 15);
  assert.equal(paymentDay.safeParse('0').success, false);
  assert.equal(paymentDay.safeParse('32').success, false);
});

test('schemas de data rejeitam datas civis impossíveis', () => {
  const requiredDate = dateString('Data');
  const optionalDate = optionalDateString('Data opcional');

  assert.equal(requiredDate.parse('2024-02-29'), '2024-02-29');
  assert.equal(requiredDate.safeParse('2026-02-29').success, false);
  assert.equal(requiredDate.safeParse('2026-04-31').success, false);
  assert.equal(requiredDate.safeParse('2026-13-01').success, false);
  assert.equal(requiredDate.safeParse('10/07/2026').success, false);

  assert.equal(optionalDate.parse('  '), undefined);
  assert.equal(optionalDate.parse('2026-07-10'), '2026-07-10');
  assert.equal(optionalDate.safeParse('2026-02-30').success, false);
});

test('parseRecordId aceita UUID válido e rejeita identificadores arbitrários', () => {
  const validId = '123e4567-e89b-42d3-a456-426614174000';

  assert.equal(parseRecordId(validId), validId);
  assert.throws(() => parseRecordId('123'), /Registro inválido/);
  assert.throws(() => parseRecordId('00000000-0000-0000-0000-000000000000'), /Registro inválido/);
});

test('parseFormData aplica normalização e retorna a primeira mensagem útil', () => {
  const schema = z.object({
    name: requiredText('Nome'),
    amount: positiveNumber('Valor'),
  });
  const validForm = new FormData();
  validForm.set('name', '  Insumo  ');
  validForm.set('amount', '25.75');

  assert.deepEqual(parseFormData(schema, validForm), {
    name: 'Insumo',
    amount: 25.75,
  });

  const invalidForm = new FormData();
  invalidForm.set('name', '');
  invalidForm.set('amount', '-1');

  assert.throws(() => parseFormData(schema, invalidForm), /Nome é obrigatório/);
});
