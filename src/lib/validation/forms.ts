import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const isValidCivilDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const requiredText = (label: string, maxLength = 200) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: `${label} é obrigatório.` })
      .min(1, `${label} é obrigatório.`)
      .max(maxLength, `${label} deve ter no máximo ${maxLength} caracteres.`),
  );

export const optionalText = (label: string, maxLength = 2000) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .max(maxLength, `${label} deve ter no máximo ${maxLength} caracteres.`)
      .optional(),
  );

export const positiveNumber = (label: string) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .finite(`${label} deve ser um número válido.`)
      .positive(`${label} deve ser maior que zero.`),
  );

export const nonNegativeNumber = (label: string) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .finite(`${label} deve ser um número válido.`)
      .nonnegative(`${label} não pode ser negativo.`),
  );

export const optionalNonNegativeNumber = (label: string) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .finite(`${label} deve ser um número válido.`)
      .nonnegative(`${label} não pode ser negativo.`)
      .optional(),
  );

export const positiveInteger = (label: string) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .int(`${label} deve ser um número inteiro.`)
      .positive(`${label} deve ser maior que zero.`),
  );

export const nonNegativeInteger = (label: string) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .int(`${label} deve ser um número inteiro.`)
      .nonnegative(`${label} não pode ser negativo.`),
  );

export const optionalInteger = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? undefined : Number(value)),
    z
      .number({ error: `${label} deve ser um número válido.` })
      .int(`${label} deve ser um número inteiro.`)
      .min(min, `${label} deve ser no mínimo ${min}.`)
      .max(max, `${label} deve ser no máximo ${max}.`)
      .optional(),
  );

export const dateString = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: `${label} é obrigatória.` })
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} é inválida.`)
      .refine(isValidCivilDate, `${label} é inválida.`),
  );

export const optionalDateString = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} é inválida.`)
      .refine(isValidCivilDate, `${label} é inválida.`)
      .optional(),
  );

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Identificador inválido.",
  );

export function parseFormData<TSchema extends z.ZodType>(
  schema: TSchema,
  formData: FormData,
): z.output<TSchema> {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Verifique os dados informados.");
  }

  return result.data;
}

export function parseRecordId(value: unknown): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new Error("Registro inválido.");
  return result.data;
}
