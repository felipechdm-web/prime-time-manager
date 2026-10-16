// Ajuda: como jogar, regras principais, eras e glossário.

import { ERAS, ERA_ORDER, rulesFor } from '@engine/catalog/eras.ts';
import { GLOSSARY } from '@game/fallbackScenes.ts';
import type { GameState } from '@engine/types.ts';
import { go } from '../lib/router.ts';
import { Button, Card } from '../components/ui.tsx';

export function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 safe-top">
      <Button variant="ghost" size="sm" onClick={() => go('/')}>← Voltar</Button>
      <div className="mt-3"><HelpContent /></div>
    </div>
  );
}

export function HelpContent({ state }: { state?: GameState }) {
  const era = state ? ERAS[state.meta.era] : null;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-black">Como jogar</h1>
      <p className="text-muted">Você é Diretor(a) de Programação: decide o que vai ao ar, em que dia, em que horário e por quanto tempo — e responde por cada ponto. O motor calcula os números; o Mestre transforma tudo em bastidor.</p>

      <Card title="O ciclo da semana">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li><b>Boletim</b> de segunda, 8h: audiência da semana por faixa e por praça, manchetes e movimentos dos rivais.</li>
          <li><b>Caixa de entrada</b>: pedidos, ameaças, propostas. Assuntos com ⚡ pedem decisão; os vermelhos travam o "Colocar no ar".</li>
          <li><b>Reuniões</b>: até 3 por semana, com 20 pontos de agenda (curta 2, longa 4, ligação 1, visita 3, evento 3). Ignorar pedidos custa humor e confiança.</li>
          <li><b>Grade</b>: arraste do acervo (PC) ou toque no horário (celular). Use "Simular faixa" para uma prévia com margem de erro.</li>
          <li><b>Colocar no ar</b>: dia a dia (com Sala de Controle nos momentos ao vivo), semana inteira ou temporada.</li>
          <li>Fechamentos de mês, trimestre e ano: metas, reajuste de tabela, avaliação e, se der errado, demissão.</li>
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="O que mexe na audiência">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li><b>Qualidade e apelo</b> do programa, e a afinidade com quem está vendo naquele horário.</li>
            <li><b>Encaixe do gênero na faixa</b>: novela no nobre, infantil de manhã, auditório no domingo à tarde.</li>
            <li><b>Hábito</b>: o mesmo horário por semanas seguidas (até 8). Mudar zera.</li>
            <li><b>Herança</b>: parte do público do programa anterior fica. Gêneros parecidos em sequência seguram mais.</li>
            <li><b>Buzz</b> (chamadas, imprensa) sobe; <b>fadiga</b> (desgaste, reprises) derruba.</li>
            <li><b>Concorrência</b>: o público escolhe entre todas as emissoras e as outras telas. Contraprogramar pega quem não gosta do líder.</li>
            <li>Um pouco de <b>sorte</b> diária, maior nas eras modernas.</li>
          </ul>
        </Card>
        <Card title="Dinheiro">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Cada hora tem 12 minutos de intervalo (até 15). Preço do 30s = custo por ponto da faixa × seus pontos × qualidade do público × marca.</li>
            <li>A ocupação depende do preço, da época do ano e da sua reputação no mercado. O Comercial pede desconto quando a audiência cai.</li>
            <li>Cotas pagam bem mas exigem entrega mínima de pontos. Merchandising rende, mas irrita a crítica.</li>
            <li>Arrendar faixas dá receita fixa, mas a faixa sai do seu controle.</li>
            <li>Respeite a verba de programação. Margem acima da meta libera verba extra no ano seguinte.</li>
          </ul>
        </Card>
      </div>

      <Card title="Regras que travam ou punem">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Faixa vazia, programa encerrado na grade, cota vendida sem programa e decisões obrigatórias pendentes bloqueiam o "Colocar no ar".</li>
          <li>Telejornal principal e janelas locais das afiliadas são protegidos (🔒).</li>
          <li>Horário eleitoral (anos de eleição) entra por cima da grade às 13h e 20h30, de segunda a sábado.</li>
          {(era ? rulesFor(era.id) : rulesFor('now')).filter((r) => r.key === 'rating_hours').map((r) => <li key={r.key}>{r.text}</li>)}
        </ul>
      </Card>

      <Card title="As eras">
        <div className="space-y-2 text-sm">
          {ERA_ORDER.map((id) => (
            <details key={id} open={era?.id === id}>
              <summary className="cursor-pointer font-semibold">{ERAS[id].name} — {ERAS[id].tagline}</summary>
              <p className="mt-1 text-muted">{ERAS[id].summary}</p>
              <p className="mt-1 text-xs text-muted">{ERAS[id].currencyNote}</p>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Modo nuvem x modo demonstração">
        <p className="text-sm text-muted">No <b>modo nuvem</b> o estado oficial fica no Supabase, o motor roda nas Edge Functions e o Mestre (Claude) escreve boletins, reuniões e eventos. No <b>modo demonstração</b> o mesmo motor roda no navegador, sem IA (textos padrão) e com os dados guardados só neste aparelho. O jogo nunca trava por causa da IA: se ela falhar ou a verba acabar, entram os textos padrão.</p>
      </Card>

      <Card title="Glossário da TV">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {Object.entries(GLOSSARY).map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold capitalize">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
