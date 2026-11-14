-- Recherche dans les livres (2026-11-14) : l'app peut demander à l'assistant de chercher dans les livres, le
-- corpus et les articles d'ARPRIM avant de répondre (interrupteur « Chercher dans les livres »).
-- On garde, pour chaque échange, si la recherche était demandée et les extraits trouvés : c'est ce qui permet
-- de comprendre une bonne ou une mauvaise réponse, et de préparer les données de lecture de la version suivante.
--
-- À exécuter une fois dans Supabase (SQL Editor). Sans ces colonnes, /api/chat enregistre quand même l'échange,
-- sans la recherche.

alter table public.conversations_llm
  add column if not exists chercher boolean not null default false,
  add column if not exists sources jsonb;

comment on column public.conversations_llm.chercher is
  'Vrai si l''app a demandé de chercher dans les livres pour cet échange.';
comment on column public.conversations_llm.sources is
  'Extraits trouvés et donnés au modèle : [{source, texte}] (null si aucun).';
