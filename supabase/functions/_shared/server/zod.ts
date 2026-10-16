// Validação da saída do Mestre com Zod (seção 16.1): mesmo contrato do validador do modo demo.

import { z } from 'npm:zod@4.6.5';
import type { MestreOutput, Validator } from '../game/types.ts';

export const MestreSchema = z.object({
  scene_type: z.enum(['boletim', 'mensagem', 'reuniao', 'evento', 'ao_vivo', 'avaliacao', 'livre']),
  narrative: z.array(z.object({ speaker: z.string().max(80), text: z.string().max(2000) })).max(20),
  headlines: z.array(z.string().max(300)).max(6),
  choices: z.array(z.object({ id: z.string().max(60), label: z.string().max(200) })).max(8),
  player_action: z.object({ type: z.string().max(40), params_json: z.string().max(2000), summary: z.string().max(300) }).nullable(),
  proposals: z.array(z.object({ tag: z.string().max(40), target: z.string().max(80), value: z.number(), reason: z.string().max(300) })).max(12),
  memory_notes: z.array(z.object({ npc_id: z.string().max(80), fact: z.string().max(400), weight: z.number() })).max(6),
});

export const validateMestreZod: Validator = (obj: unknown) => {
  const r = MestreSchema.safeParse(obj);
  if (r.success) return { ok: true, value: r.data as MestreOutput };
  const first = r.error.issues[0];
  return { ok: false, error: first ? `${first.path.join('.')}: ${first.message}` : 'JSON inválido' };
};
