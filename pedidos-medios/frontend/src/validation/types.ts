/**
 * Tipos base para validación de datos según revisión 3.0.
 */

export type CategoriaCodigo = 'D' | 'C' | 'G' | 'R' | 'P' | 'M' | 'S' | 'W';

export interface FormularioValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
}
