// Validação da saída do Mestre sem dependências (usada no modo demo).
// No servidor (Deno), a validação é feita com Zod em _shared/server/zod.ts — mesmo contrato.

import type { MestreOutput, Validator } from './types.ts';

const SCENES = ['boletim', 'mensagem', 'reuniao', 'evento', 'ao_vivo', 'esporte', 'avaliacao', 'livre'];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export const validateMestrePlain: Validator = (obj: unknown) => {
  if (!isObj(obj)) return { ok: false, error: 'resposta não é objeto' };
  if (typeof obj.scene_type !== 'string' || !SCENES.includes(obj.scene_type)) return { ok: false, error: 'scene_type inválido' };
  if (!Array.isArray(obj.narrative) || !obj.narrative.every((n) => isObj(n) && typeof n.speaker === 'string' && typeof n.text === 'string')) {
    return { ok: false, error: 'narrative inválido' };
  }
  const headlines = Array.isArray(obj.headlines) ? obj.headlines.filter((h) => typeof h === 'string') : [];
  const choices = Array.isArray(obj.choices) ? obj.choices.filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.label === 'string') : [];
  let action: MestreOutput['player_action'] = null;
  if (isObj(obj.player_action) && typeof obj.player_action.type === 'string') {
    action = {
      type: obj.player_action.type,
      params_json: typeof obj.player_action.params_json === 'string' ? obj.player_action.params_json : JSON.stringify(obj.player_action.params ?? {}),
      summary: typeof obj.player_action.summary === 'string' ? obj.player_action.summary : '',
    };
  }
  const proposals = Array.isArray(obj.proposals)
    ? obj.proposals.filter((p) => isObj(p) && typeof p.tag === 'string' && typeof p.target === 'string').map((p) => {
      const q = p as Record<string, unknown>;
      return { tag: String(q.tag), target: String(q.target), value: Number(q.value) || 0, reason: String(q.reason ?? '') };
    })
    : [];
  const memory = Array.isArray(obj.memory_notes)
    ? obj.memory_notes.filter((m) => isObj(m) && typeof m.npc_id === 'string' && typeof m.fact === 'string').map((m) => {
      const q = m as Record<string, unknown>;
      return { npc_id: String(q.npc_id), fact: String(q.fact), weight: Number(q.weight) || 1 };
    })
    : [];
  return {
    ok: true,
    value: {
      scene_type: obj.scene_type as MestreOutput['scene_type'],
      narrative: (obj.narrative as { speaker: string; text: string }[]).map((n) => ({ speaker: n.speaker, text: n.text })),
      headlines: headlines as string[],
      choices: choices as { id: string; label: string }[],
      player_action: action,
      proposals,
      memory_notes: memory,
    },
  };
};

// extrai o primeiro objeto JSON de um texto (tolerante a cercas de código)
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(t.slice(s, e + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
