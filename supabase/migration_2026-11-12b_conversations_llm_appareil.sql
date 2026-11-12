-- Complément du 2026-11-12 : la table conversations_llm a été créée avec la
-- première version de la migration (utilisateur obligatoire, pas de colonne
-- appareil). L'app HaalPulaar n'a pas de compte : chaque échange porte
-- l'empreinte de l'appareil. À exécuter une fois (SQL Editor → Run). Sans
-- effet si la table est déjà à jour.

alter table public.conversations_llm add column if not exists appareil text;
alter table public.conversations_llm alter column utilisateur drop not null;
-- La table était vide quand ce complément a été écrit : la contrainte passe.
alter table public.conversations_llm alter column appareil set not null;
create index if not exists conversations_llm_appareil
  on public.conversations_llm (appareil);
