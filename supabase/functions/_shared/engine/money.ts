// Conversão de valores internos (R$ de 2026) para valores nominais da era e formatação.

import { ERAS } from './catalog/eras.ts';
import type { EraId } from './types.ts';

export function priceIndex(era: EraId): number {
  return ERAS[era].params.priceIndex;
}

export function nominal(era: EraId, v2026: number): number {
  return v2026 * priceIndex(era);
}

export function to2026(era: EraId, nominalValue: number): number {
  return nominalValue / priceIndex(era);
}

function fmtNumber(v: number, digits: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// formato compacto: R$ 1,2 mi / R$ 850 mil / R$ 3,4 bi
export function formatBRL(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}R$ ${fmtNumber(a / 1e9, 2)} bi`;
  if (a >= 1e6) return `${sign}R$ ${fmtNumber(a / 1e6, a >= 1e8 ? 0 : 1)} mi`;
  if (a >= 1e3) return `${sign}R$ ${fmtNumber(a / 1e3, 0)} mil`;
  return `${sign}R$ ${fmtNumber(a, 0)}`;
}

export function money(era: EraId, v2026: number): string {
  return formatBRL(nominal(era, v2026));
}

export function pts(v: number): string {
  return fmtNumber(v, 1);
}

export function pct(v: number, digits = 1): string {
  return `${fmtNumber(v, digits)}%`;
}
