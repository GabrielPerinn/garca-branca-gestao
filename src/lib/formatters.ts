const dateFormatter = new Intl.DateTimeFormat("pt-BR");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCivilDate(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly && !value.includes("T")) {
    return formatDateOnly(value);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : dateFormatter.format(parsed);
}

export function formatDateTime(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : dateTimeFormatter.format(parsed);
}

export function formatCurrency(value: number | string | null | undefined, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? currencyFormatter.format(parsed) : fallback;
}

export function formatNumber(
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions,
  fallback = "—",
) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("pt-BR", options).format(parsed) : fallback;
}
import { formatCivilDate as formatDateOnly } from "@/lib/date";
