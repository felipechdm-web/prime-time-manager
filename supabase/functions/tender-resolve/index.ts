// Edge Function tender-resolve (seção 19.7): concorrências fechadas; só estrutura até a Fase 6.4. A lógica fica em _shared/game/negotiationHandlers.ts.
import { serve } from '../_shared/server/http.ts';
import { tenderResolveHandler } from '../_shared/game/negotiationHandlers.ts';

serve(tenderResolveHandler);
