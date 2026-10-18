// Edge Function tender-resolve (seção 19.7): abre os envelopes das concorrências esportivas com prazo vencido e anuncia o resultado. A lógica fica em _shared/game/negotiationHandlers.ts e _shared/game/tenderResolve.ts.
import { serve } from '../_shared/server/http.ts';
import { tenderResolveHandler } from '../_shared/game/negotiationHandlers.ts';

serve(tenderResolveHandler);
