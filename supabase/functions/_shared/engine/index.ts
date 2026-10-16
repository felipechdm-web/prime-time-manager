// Ponto de entrada do motor (puro, sem I/O): usado pelas Edge Functions e pelo navegador.

export * from './types.ts';
export * from './time.ts';
export * from './money.ts';
export { ERAS, ERA_ORDER, ERA_RULES, REAL_STATIONS, eraForYear, rulesFor } from './catalog/eras.ts';
export type { EraDef, EraParams, EraRule, RealStationDef } from './catalog/eras.ts';
export { GENRES, GENRE_LIST, PLAYABLE_GENRES, genreAvailable, genreFit } from './catalog/genres.ts';
export type { GenreDef } from './catalog/genres.ts';
export { MARKETS, SEGMENTS, SEGMENT_LABELS, MARKET_WEIGHTS } from './catalog/markets.ts';
export { ARCHETYPES } from './catalog/archetypes.ts';
export { FIXED_NPCS, ROLE_LABELS, TALENT_ARCHETYPES } from './catalog/npcs.ts';
export { EVENT_TEMPLATES, EVENT_BY_ID, ARCS } from './catalog/events.ts';
export { ADVERTISERS, COLUMNS, FICTIONAL_STATIONS, PLAYER_DEFAULT_STATION } from './catalog/names.ts';
export { SCENARIOS, ratingAllowed, maxRatingAt } from './setup.ts';
export type { NewGameInput } from './setup.ts';
export { newGame } from './newGame.ts';
export { simulate, newOutputs, weekNumberLabel } from './sim.ts';
export type { SimOutputs, RatingSlotRow } from './sim.ts';
export { applyIntent } from './intents.ts';
export type { Intent, IntentResult } from './intents.ts';
export { validateSchedule } from './validate.ts';
export type { Issue, Validation } from './validate.ts';
export { resolveEvent, openEvents, blockingEvents, describeEffects, applyEffects } from './eventsEngine.ts';
export { liveProjection, computeLiveMoments, LIVE_OPTIONS, applyLiveDecisionToValue, minuteCurve } from './live.ts';
export type { LiveSeries } from './live.ts';
export { previewDay } from './preview.ts';
export type { PreviewResult } from './preview.ts';
export { explainProgram, FACTOR_LABELS } from './explain.ts';
export type { Explanation } from './explain.ts';
export { computeKpis, scoreBreakdown, KPI_WEIGHTS } from './kpis.ts';
export { DEV_STAGES } from './market.ts';
export { slotLabelFor } from './report.ts';
export { boletimFallback, evaluationFallback, liveFallback, competitorsSummary } from './narrative.ts';
export { audienceQuality, cppFor, projectedWeekCost, airingCost } from './commercial.ts';
export { programAirings, slotArray, blocksFromSlots, placeBlock, cloneWeek, habitKeyFor } from './schedule.ts';
export {
  playerStation, stationById, getProgram, npcById, npcByRole, politicalCapital, activeStations, rivals, talentStrength,
} from './state.ts';
