// Gera supabase/seeds/catalogo_2026_lote1.sql (para o SQL Editor) e os CSV do lote (para o Editor de Catálogo ou o Excel).
// Para se algum item não passar nas regras do catálogo.
//   node scripts/gen-catalog-seed.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildGridFix, buildLote1 } from '../supabase/seeds/build.ts';

const built = buildLote1();
if (built.problems.length) {
  console.error(`O lote tem ${built.problems.length} problema(s):\n- ${built.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote1.sql', built.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote1', { recursive: true });
for (const [table, csv] of Object.entries(built.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote1/${table}.csv`, csv!, 'utf8');
console.log('Lote gerado:', built.counts);

// correção da grade do SBT (17/10/2026): troca a grade pendente pela programação oficial de out/2026
const fix = buildGridFix('sbt');
if (fix.problems.length) {
  console.error(`A correção do SBT tem problema(s):\n- ${fix.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote1_correcao_sbt.sql', fix.sql, 'utf8');
console.log('Correção do SBT gerada.');
