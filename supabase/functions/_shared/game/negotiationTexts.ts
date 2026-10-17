// Falas-modelo do representante (sem IA): usadas no modo demonstração, com o orçamento de IA estourado ou se a
// IA falhar. Os números vêm sempre do motor (contraproposta da rodada).

import type { NegDecision, NegPublic } from '../engine/negotiation.ts';
import { money } from '../engine/money.ts';
import type { EraId, TermSheet } from '../engine/types.ts';
import type { MestreNarrative } from './types.ts';

const BANDS: Record<string, string> = {
  madrugada: 'na madrugada', manha_cedo: 'no começo da manhã', manha: 'de manhã', meio_dia: 'no meio-dia', vespertino: 'à tarde',
  pre_nobre: 'no pré-nobre', nobre: 'no horário nobre', pos_nobre: 'depois do nobre',
};

export function termsText(era: EraId, t: TermSheet): string {
  const parc = t.parcelas === 1 ? 'à vista' : `em ${t.parcelas} parcelas`;
  const anos = t.anos === 1 ? '1 ano' : `${t.anos} anos`;
  return `${money(era, t.valor)} ${parc}, ${anos}, ${t.exibicoes} exibições, ${t.exclusividade === 'exclusivo' ? 'com exclusividade' : 'sem exclusividade'} ${t.plataformas === 'tv_aberta_streaming' ? 'na TV aberta e no streaming' : 'na TV aberta'}, ${BANDS[t.faixa] ?? t.faixa}${t.preferencia_renovacao ? ', com preferência de renovação' : ''}`;
}

const rep = (text: string): MestreNarrative => ({ speaker: 'representante', text });
const nar = (text: string): MestreNarrative => ({ speaker: 'narrador', text });

export function openingLines(era: EraId, pub: NegPublic): MestreNarrative[] {
  const who = pub.representative ? `${pub.representative.nome}, ${pub.representative.cargo} da ${pub.holderName}` : `o representante da ${pub.holderName}`;
  const out = [nar(`Sala de reuniões. Você recebe ${who}.`)];
  if (pub.kind === 'relacionamento') {
    out.push(rep(`Vou ser franco: "${pub.label}" está ${pub.locked}. Não posso vender agora. Mas gosto de conversar com quem pensa no longo prazo.`));
    return out;
  }
  out.push(rep(`Que bom recebê-lo. Para "${pub.label}", nossa proposta de partida é ${termsText(era, pub.onTable!)}.`));
  if (pub.rivalMentions.length) out.push(rep(`E não vou esconder: a ${pub.rivalMentions[0]} também demonstrou interesse.`));
  return out;
}

export function decisionLines(era: EraId, pub: NegPublic, d: NegDecision): MestreNarrative[] {
  const out: MestreNarrative[] = [];
  if (d.bluff === 'descoberto') out.push(rep('Conheço este mercado. Ninguém está oferecendo isso. Não comece a nossa relação assim.'));
  if (d.bluff === 'acreditou') out.push(rep('Se tem mesmo outra emissora na mesa, eu preciso rever a minha posição.'));
  if (d.bluff === 'desconfiou') out.push(rep('Hum. Vou fingir que não ouvi essa.'));
  switch (d.type) {
    case 'aceite':
      out.push(rep('Fechado. Vou pedir ao jurídico para preparar o contrato.'));
      break;
    case 'contraproposta':
      out.push(rep(`Não chego aí. O que consigo é ${termsText(era, d.counter!)}.${d.final ? ' É a minha última oferta.' : ''}`));
      if (d.reasons.includes('rival_mais_alto') && pub.rivalMentions.length) out.push(rep(`A ${pub.rivalMentions[0]} está pagando mais do que isso.`));
      break;
    case 'recusa':
      if (pub.kind === 'relacionamento') out.push(rep(`Entendo o interesse, mas "${pub.label}" está ${pub.locked}. Quando o contrato vencer, vou lembrar desta conversa.`));
      else out.push(rep(`Com todo o respeito, essa proposta nem passa pela minha diretoria.${d.counter ? ` Continuo em ${termsText(era, d.counter)}.` : ''}`));
      break;
    case 'fim':
      out.push(rep(d.reasons.includes('paciencia_esgotada') ? 'Acho que não vamos chegar a um acordo hoje. Obrigado pelo seu tempo.' : 'Chegamos ao limite desta reunião. Quando tiver algo novo, me procure.'));
      out.push(nar('O representante fecha a pasta e se levanta.'));
      break;
  }
  if (d.type !== 'fim' && d.type !== 'aceite' && d.patiencePct <= 34) out.push(nar('Ele olha o relógio pela segunda vez.'));
  return out;
}

export const PAUSE_LINES: MestreNarrative[] = [rep('Tudo bem, pense com calma. Mas o mercado não espera muito.')];
export const LEAVE_LINES: MestreNarrative[] = [rep('Uma pena. A porta continua aberta.'), nar('Você deixa a sala sem acordo.')];
