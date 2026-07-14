export const APP_TIME_ZONE = process.env.APP_TIMEZONE || 'America/Porto_Velho';

export function getCivilDate(
  date = new Date(),
  timeZone = APP_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Não foi possível determinar a data local.');
  }

  return `${year}-${month}-${day}`;
}

export function shiftCivilDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function formatCivilDate(date: string, locale = 'pt-BR'): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '—';

  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
