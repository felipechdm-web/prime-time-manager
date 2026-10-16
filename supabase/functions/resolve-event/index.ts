// Edge Function resolve-event (seção 19.1). A lógica fica em _shared/game/handlers.ts.
import { serve } from '../_shared/server/http.ts';
import { resolveEventHandler } from '../_shared/game/handlers.ts';

serve(resolveEventHandler);
