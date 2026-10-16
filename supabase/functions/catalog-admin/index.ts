// Edge Function catalog-admin (seção 19.7). A lógica fica em _shared/game/catalogAdmin.ts.
import { serve } from '../_shared/server/http.ts';
import { catalogAdminHandler } from '../_shared/game/catalogAdmin.ts';

serve(catalogAdminHandler);
