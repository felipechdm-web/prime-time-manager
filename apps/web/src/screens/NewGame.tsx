// Tela de "Contratação" (seção 4): as cinco escolhas da partida + entrevista com o dono.

import { useEffect, useMemo, useState } from 'react';
import { ERAS, ERA_ORDER, REAL_STATIONS } from '@engine/catalog/eras.ts';
import { FICTIONAL_STATIONS } from '@engine/catalog/names.ts';
import { SCENARIOS } from '@engine/setup.ts';
import { firstMondayOfYear } from '@engine/time.ts';
import type { Background, Difficulty, EraId, ScenarioId, Universe } from '@engine/types.ts';
import type { MestreOutput } from '@game/types.ts';
import { backendSync } from '../lib/backend.ts';
import { go } from '../lib/router.ts';
import { queryClient } from '../lib/queries.ts';
import { useUI } from '../lib/ui.ts';
import { Button, Field, inputClass } from '../components/ui.tsx';
import { SceneView } from '../components/SceneView.tsx';

const BACKGROUNDS: { id: Background; label: string; bonus: string; penalty: string; onlyNow?: boolean }[] = [
  { id: 'jornalista', label: 'Ex-jornalista', bonus: 'Credibilidade com o Jornalismo; menos crise de imagem', penalty: 'Desconfiança do Comercial' },
  { id: 'publicitario', label: 'Ex-publicitário', bonus: 'Negocia cotas e tabela com +10% de preço', penalty: 'Artistas o veem como "homem do dinheiro"' },
  { id: 'produtor_auditorio', label: 'Ex-produtor de auditório', bonus: 'Programas populares rendem mais', penalty: 'Crítica mais dura' },
  { id: 'herdeiro', label: 'Herdeiro da família dona', bonus: 'Mais paciência da presidência', penalty: 'Equipe cética; menos lealdade inicial' },
  { id: 'streaming', label: 'Executivo de streaming', bonus: 'Domina dados e multiplataforma (pesquisa mais precisa)', penalty: 'Pouca intimidade com a TV aberta', onlyNow: true },
];

const DIFFS: { id: Difficulty; label: string; text: string }[] = [
  { id: 'estagiario', label: 'Estagiário', text: 'Previsões precisas, concorrentes passivos, orçamento folgado.' },
  { id: 'diretor', label: 'Diretor', text: 'Padrão: ruído realista e concorrentes reativos.' },
  { id: 'lenda', label: 'Lenda da TV', text: 'Ruído alto, concorrentes agressivos, presidente impaciente, mais crises.' },
];

const COLORS = ['#facc15', '#f43f5e', '#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];

function Choice({ selected, onClick, title, children, disabled }: { selected: boolean; onClick: () => void; title: string; children?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-theme border p-3 text-left transition disabled:opacity-40 ${selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2 hover:border-muted'}`}
    >
      <div className="font-bold">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </button>
  );
}

function readCarry(): { reputation: number; careerStations: string[]; name?: string; background?: Background; pronoun?: 'o' | 'a' | 'e' } | null {
  try {
    const raw = sessionStorage.getItem('ptm.carry');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function NewGame() {
  const toast = useUI((s) => s.toast);
  const [carry] = useState(readCarry);
  const [step, setStep] = useState(0);
  const [universe, setUniverse] = useState<Universe>('real');
  const [era, setEra] = useState<EraId>('90s');
  const [year, setYear] = useState<number>(1994);
  const [stationMode, setStationMode] = useState<'fictional' | 'real'>('fictional');
  const [realKey, setRealKey] = useState<string>('');
  const [stationName, setStationName] = useState('TV Horizonte');
  const [color, setColor] = useState(COLORS[0]);
  const [scenario, setScenario] = useState<ScenarioId>('emissora_crise');
  const [difficulty, setDifficulty] = useState<Difficulty>('diretor');
  const [name, setName] = useState(carry?.name ?? '');
  const [pronoun, setPronoun] = useState<'o' | 'a' | 'e'>(carry?.pronoun ?? 'o');
  const [background, setBackground] = useState<Background>(carry?.background && carry.background !== 'streaming' ? carry.background : 'jornalista');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ gameId: string; interview: MestreOutput } | null>(null);

  // cada etapa começa do topo (no celular, a anterior podia ter sido rolada até o fim)
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById('root')?.scrollTo({ top: 0 });
  }, [step, created]);
  document.documentElement.dataset.era = era;

  const startDate = firstMondayOfYear(year);
  const realStations = useMemo(() => REAL_STATIONS[era].filter((d) => (!d.from || d.from <= startDate) && (!d.until || d.until > startDate)), [era, startDate]);
  const realChosen = universe === 'real' && stationMode === 'real' && realKey;
  const allowedScenarios: ScenarioId[] = universe === 'real' ? ['emissora_crise', 'rede_nova', 'canal_pago'] : ['lider_ameacada', 'vice_ambiciosa', 'emissora_crise', 'rede_nova', 'canal_pago'];

  const steps = ['Universo', 'Era', 'Emissora', 'Cenário', 'Dificuldade', 'Você'];

  const canNext = () => {
    if (step === 2 && universe === 'real' && stationMode === 'real' && !realKey) return false;
    if (step === 2 && stationMode === 'fictional' && !stationName.trim()) return false;
    if (step === 5 && !name.trim()) return false;
    return true;
  };

  const next = () => {
    if (step === 2 && realChosen) setStep(4);
    else setStep((s) => Math.min(5, s + 1));
  };
  const back = () => {
    if (step === 0) go('/');
    else if (step === 4 && realChosen) setStep(2);
    else setStep((s) => s - 1);
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await backendSync().call<{ gameId: string; interview: MestreOutput }>('create-game', {
        universe,
        era,
        startYear: year,
        scenario: realChosen ? 'vice_ambiciosa' : scenario,
        difficulty,
        player: { name: name.trim(), background, pronoun },
        station: realChosen ? { mode: 'real', realKey } : { mode: 'fictional', name: stationName.trim(), color },
        carry: carry ? { reputation: carry.reputation, careerStations: carry.careerStations } : undefined,
      });
      try {
        sessionStorage.removeItem('ptm.carry');
      } catch {
        // ignora
      }
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      setCreated(res);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center p-4">
        <h1 className="mb-1 text-2xl font-black">A entrevista</h1>
        <p className="mb-4 text-sm text-muted">Sala da presidência. Primeiro dia no cargo.</p>
        <div className="card p-4">
          <SceneView scene={created.interview} />
        </div>
        <Button variant="primary" size="lg" className="mt-4" onClick={() => go(`g/${created.gameId}/boletim`)}>Assumir a cadeira</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-2xl px-4 pb-28 pt-6 safe-top">
      <h1 className="text-2xl font-black">Contratação</h1>
      <p className="text-sm text-muted">Cinco escolhas e uma entrevista. Elas não mudam depois do início (exceto a dificuldade).</p>
      {carry && (
        <p className="mt-2 rounded-theme bg-surface-2 p-3 text-sm">
          Nova emissora, mesma carreira: reputação {carry.reputation}/100{carry.careerStations.length ? ` · passou por ${carry.careerStations.join(', ')}` : ''}.
        </p>
      )}
      <ol className="mt-4 flex gap-1" aria-label="Etapas">
        {steps.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-3'}`} title={s} />
        ))}
      </ol>
      <h2 className="mb-3 mt-5 text-lg font-bold">{step + 1}. {steps[step]}</h2>

      {step === 0 && (
        <div className="space-y-2">
          <Choice selected={universe === 'real'} onClick={() => setUniverse('real')} title="Brasil real">
            Concorrentes reais da época (Globo, SBT, Record, Band, Manchete, RedeTV!, Cultura conforme a década). Você comanda uma emissora fictícia ou assume uma real. Todo personagem que fala é fictício.
          </Choice>
          <Choice selected={universe === 'fictional'} onClick={() => { setUniverse('fictional'); setStationMode('fictional'); }} title="Brasil fictício">
            Emissoras, programas, artistas e anunciantes inventados, com a mesma mecânica do mercado brasileiro.
          </Choice>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {ERA_ORDER.map((id) => {
            const e = ERAS[id];
            return (
              <Choice key={id} selected={era === id} onClick={() => { setEra(id); setYear(e.playableYears[Math.min(4, e.playableYears.length - 1)]); if (id !== 'now' && background === 'streaming') setBackground('jornalista'); setRealKey(''); }} title={`${e.name} — ${e.tagline}`}>
                {e.summary.split('. ').slice(0, 2).join('. ')}.
              </Choice>
            );
          })}
          <Field label="Ano inicial">
            <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {ERAS[era].playableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {universe === 'real' && (
            <div className="space-y-2">
              <Choice selected={stationMode === 'fictional'} onClick={() => setStationMode('fictional')} title="Uma emissora fictícia nova ou em crise (recomendado)">
                Você entra como 5ª ou 6ª força e disputa contra as emissoras reais da época.
              </Choice>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">ou assuma uma emissora real</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {realStations.map((s) => (
                  <Choice key={s.key} selected={stationMode === 'real' && realKey === s.key} onClick={() => { setStationMode('real'); setRealKey(s.key); }} title={s.name}>
                    <span className="text-xs">{s.fact}</span>
                  </Choice>
                ))}
              </div>
            </div>
          )}
          {stationMode === 'fictional' && (
            <div className="card space-y-3 p-4">
              <Field label="Nome da sua emissora">
                <input className={inputClass} value={stationName} maxLength={30} onChange={(e) => setStationName(e.target.value)} />
              </Field>
              {universe === 'fictional' && (
                <p className="text-xs text-muted">Concorrentes sorteados entre: {FICTIONAL_STATIONS.slice(0, 6).map((s) => s.name).join(', ')}...</p>
              )}
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Cor da marca</span>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`cor ${c}`} onClick={() => setColor(c)} className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-surface ${color === c ? 'ring-2 ring-text' : ''}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          {allowedScenarios.map((id) => {
            const s = SCENARIOS[id];
            const disabled = id === 'canal_pago' && era === '80s';
            return (
              <Choice key={id} selected={scenario === id} disabled={disabled} onClick={() => setScenario(id)} title={`${s.name} · ${s.difficulty}`}>
                {s.situation}{disabled ? ' (não existe TV paga nos anos 80)' : ''}
              </Choice>
            );
          })}
          {universe === 'real' && <p className="text-xs text-muted">No Brasil real, para começar como líder ou vice, volte e assuma uma emissora real.</p>}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          {realChosen && (
            <div className="mb-2 rounded-theme bg-surface-2 p-3 text-sm text-muted">
              Você vai assumir a <b className="text-text">{realStations.find((s) => s.key === realKey)?.name}</b>. O cenário é definido pela posição dela na época.
            </div>
          )}
          {DIFFS.map((d) => (
            <Choice key={d.id} selected={difficulty === d.id} onClick={() => setDifficulty(d.id)} title={d.label}>{d.text}</Choice>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <Field label="Seu nome">
            <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Como os personagens vão te chamar" />
          </Field>
          <Field label="Tratamento">
            <select className={inputClass} value={pronoun} onChange={(e) => setPronoun(e.target.value as 'o' | 'a' | 'e')}>
              <option value="o">Diretor</option>
              <option value="a">Diretora</option>
              <option value="e">Diretore</option>
            </select>
          </Field>
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Origem profissional</span>
            {BACKGROUNDS.filter((b) => !b.onlyNow || era === 'now').map((b) => (
              <Choice key={b.id} selected={background === b.id} onClick={() => setBackground(b.id)} title={b.label}>
                <span className="text-good">+ {b.bonus}</span>
                <br />
                <span className="text-bad">− {b.penalty}</span>
              </Choice>
            ))}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button onClick={back}>{step === 0 ? 'Cancelar' : 'Voltar'}</Button>
          {step < 5 ? (
            <Button variant="primary" className="flex-1" disabled={!canNext()} onClick={next}>Continuar</Button>
          ) : (
            <Button variant="primary" className="flex-1" disabled={!canNext()} busy={busy} onClick={create}>Ir para a entrevista</Button>
          )}
        </div>
      </div>
    </div>
  );
}
