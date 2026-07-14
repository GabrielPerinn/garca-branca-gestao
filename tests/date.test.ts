import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCivilDate, getCivilDate, shiftCivilDate } from '../src/lib/date';

const RURAL_TIME_ZONE = 'America/Porto_Velho';

test('getCivilDate respeita a virada do dia no fuso rural', () => {
  const oneSecondBeforeMidnight = new Date('2026-07-11T03:59:59.000Z');
  const midnight = new Date('2026-07-11T04:00:00.000Z');

  assert.equal(getCivilDate(oneSecondBeforeMidnight, RURAL_TIME_ZONE), '2026-07-10');
  assert.equal(getCivilDate(midnight, RURAL_TIME_ZONE), '2026-07-11');
});

test('shiftCivilDate atravessa meses, anos e ano bissexto sem depender do fuso', () => {
  assert.equal(shiftCivilDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftCivilDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftCivilDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftCivilDate('2026-12-31', 1), '2027-01-01');
});

test('formatCivilDate formata a data civil sem deslocar o dia', () => {
  assert.equal(formatCivilDate('2026-07-10'), '10/07/2026');
  assert.equal(formatCivilDate('2026-07-10T23:59:59-04:00'), '10/07/2026');
  assert.equal(formatCivilDate(''), '—');
});
