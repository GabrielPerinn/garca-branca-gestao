type DatabaseError = {
  code?: string
  message?: string
}

export function databaseErrorMessage(error: DatabaseError, fallback: string): string {
  switch (error.code) {
    case '23503':
      return 'Este registro possui vínculos e não pode ser alterado dessa forma.'
    case '23505':
      return 'Já existe um registro com essas informações.'
    case '23514':
      return error.message || 'A operação viola uma regra de negócio.'
    case '22P02':
    case '22003':
    case '22007':
    case '22023':
      return error.message || 'Os dados informados são inválidos.'
    case 'P0002':
      return error.message || 'O registro não foi encontrado.'
    case '40001':
      return error.message || 'Os dados foram atualizados em outro lugar. Recarregue a página e tente novamente.'
    default:
      return fallback
  }
}
