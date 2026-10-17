// Edge Function negotiation-close (seção 19.7): assina o contrato e põe o título no acervo. A lógica fica em _shared/game/negotiationHandlers.ts.
import { serve } from '../_shared/server/http.ts';
import { negotiationCloseHandler } from '../_shared/game/negotiationHandlers.ts';

serve(negotiationCloseHandler);
