// Edge Function negotiation-turn (seção 19.7): uma rodada: a IA lê a proposta, o motor decide, a IA dá voz. A lógica fica em _shared/game/negotiationHandlers.ts.
import { serve } from '../_shared/server/http.ts';
import { negotiationTurnHandler } from '../_shared/game/negotiationHandlers.ts';

serve(negotiationTurnHandler);
