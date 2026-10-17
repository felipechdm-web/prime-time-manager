// Gera o SQL de cada lote do catálogo real (para o SQL Editor) e os CSV (para o Editor de Catálogo ou o Excel),
// além do arquivo de ajustes do lote 1. Para se algum item não passar nas regras do catálogo.
//   node scripts/gen-catalog-seed.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildLote1, buildLote1Ajustes, buildLote2a, buildLote2b, buildLote3, buildLote4, buildLote5 } from '../supabase/seeds/build.ts';

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

// lote 2, sub-lote B: filmes, pacotes de filmes e formatos
const lote2b = buildLote2b();
if (lote2b.problems.length) {
  console.error(`O sub-lote 2b tem ${lote2b.problems.length} problema(s):\n- ${lote2b.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote2b.sql', lote2b.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote2b', { recursive: true });
for (const [table, csv] of Object.entries(lote2b.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote2b/${table}.csv`, csv!, 'utf8');
console.log('Sub-lote 2b gerado:', lote2b.counts);

// lote 3: grades de janeiro de 2026 e correções do lote 1
const lote3 = buildLote3();
if (lote3.problems.length) {
  console.error(`O lote 3 tem ${lote3.problems.length} problema(s):\n- ${lote3.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote3.sql', lote3.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote3', { recursive: true });
for (const [table, csv] of Object.entries(lote3.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote3/${table}.csv`, csv!, 'utf8');
console.log('Lote 3 gerado:', lote3.counts);

// lote 4: clubes das Séries A e B de 2026 e torcida por praça
const lote4 = buildLote4();
if (lote4.problems.length) {
  console.error(`O lote 4 tem ${lote4.problems.length} problema(s):\n- ${lote4.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote4.sql', lote4.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote4', { recursive: true });
for (const [table, csv] of Object.entries(lote4.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote4/${table}.csv`, csv!, 'utf8');
console.log('Lote 4 gerado:', lote4.counts);

// lote 5 (Fase 6.4): esporte — players, competições de 2026, direitos na largada e clássicos
const lote5 = buildLote5();
if (lote5.problems.length) {
  console.error(`O lote 5 tem ${lote5.problems.length} problema(s):\n- ${lote5.problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('supabase/seeds/catalogo_2026_lote5_esporte.sql', lote5.sql, 'utf8');
mkdirSync('supabase/seeds/catalogo_2026_lote5_esporte', { recursive: true });
for (const [table, csv] of Object.entries(lote5.csv)) writeFileSync(`supabase/seeds/catalogo_2026_lote5_esporte/${table}.csv`, csv!, 'utf8');
console.log('Lote 5 (esporte) gerado:', lote5.counts);
