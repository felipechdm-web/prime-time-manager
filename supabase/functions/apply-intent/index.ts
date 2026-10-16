// Edge Function apply-intent (seção 19.1). A lógica fica em _shared/game/handlers.ts.
import { serve } from '../_shared/server/http.ts';
import { applyIntentHandler } from '../_shared/game/handlers.ts';

serve(applyIntentHandler);
