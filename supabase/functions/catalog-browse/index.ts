// Edge Function catalog-browse (seção 19.7): vitrine do Mercado de Direitos. A lógica fica em _shared/game/negotiationHandlers.ts.
import { serve } from '../_shared/server/http.ts';
import { catalogBrowseHandler } from '../_shared/game/negotiationHandlers.ts';

serve(catalogBrowseHandler);
