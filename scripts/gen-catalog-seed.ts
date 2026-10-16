// Gera o SQL de cada lote do catálogo real (para o SQL Editor) e os CSV (para o Editor de Catálogo ou o Excel),
// além do arquivo de ajustes do lote 1. Para se algum item não passar nas regras do catálogo.
//   node scripts/gen-catalog-seed.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildLote1, buildLote1Ajustes, buildLote2a } from '../supabase/seeds/build.ts';

const built = buildLote1();
if (built.problems.length) {
  console.error(`O lote tem ${built.problems.length} problema(s):\n- ${built.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote1.sql', built.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote1', { recursive: true });
for (const [table, csv] of Object.entries(built.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote1/${table}.csv`, csv!, 'utf8');
console.log('Lote gerado:', built.counts);

// ajustes de 17/10/2026 para um banco que já tem o lote 1 (grade do SBT em janeiro, 4 novelas, The Voice no SBT)
const ajustes = buildLote1Ajustes();
if (ajustes.problems.length) {
  console.error(`Os ajustes têm problema(s):\n- ${ajustes.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote1_ajustes.sql', ajustes.sql, 'utf8');
console.log('Ajustes gerados.');

// lote 2, sub-lote A: novelas, séries, desenhos e documentários
const lote2a = buildLote2a();
if (lote2a.problems.length) {
  console.error(`O sub-lote 2a tem ${lote2a.problems.length} problema(s):\n- ${lote2a.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote2a.sql', lote2a.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote2a', { recursive: true });
for (const [table, csv] of Object.entries(lote2a.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote2a/${table}.csv`, csv!, 'utf8');
console.log('Sub-lote 2a gerado:', lote2a.counts);
