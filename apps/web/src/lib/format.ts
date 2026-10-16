// Formatação para a interface (moeda da era, pontos, datas).

import { formatBRL, nominal } from '@engine/money.ts';
import type { EraId } from '@engine/types.ts';

export function moneyEra(era: EraId, v2026: number | null | undefined): string {
  if (v2026 === null || v2026 === undefined || !isFinite(v2026)) return '—';
  return formatBRL(nominal(era, v2026));
}

export function fmtPts(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function fmtDelta(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return '';
  const s = Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return v > 0 ? `▲ ${s}` : v < 0 ? `▼ ${s}` : '＝';
}

export function deltaClass(v: number | null | undefined): string {
  if (!v) return 'text-muted';
  return v > 0 ? 'text-good' : 'text-bad';
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('pt-BR');
}
