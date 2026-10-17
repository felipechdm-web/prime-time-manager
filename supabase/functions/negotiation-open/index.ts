// Edge Function negotiation-open (seção 19.7): abre a reunião com o representante. A lógica fica em _shared/game/negotiationHandlers.ts.
import { serve } from '../_shared/server/http.ts';
import { negotiationOpenHandler } from '../_shared/game/negotiationHandlers.ts';

serve(negotiationOpenHandler);
