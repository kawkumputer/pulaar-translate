-- Migration du 2026-11-12 : conversations de l'app de test de l'assistant (LLM).
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Sans elle, /api/chat répond quand même, mais n'enregistre rien et la
-- notation renvoie une erreur.
--
-- Chaque ligne est un échange : le message, l'historique envoyé au modèle, sa
-- réponse, et la note donnée ensuite dans l'app (juste, faux, inventé, pas en
-- pulaar), avec une correction facultative. La correction est écrite par un
-- locuteur : c'est de la matière d'entraînement humaine.
--
-- Le quota du chat utilise la table usage_quotidien et consommer_quota de la
-- migration du 2026-11-11, avec ses propres clés (chat:u:<uuid>).

create table if not exists public.conversations_llm (
  id           uuid primary key,
  cree_le      timestamptz not null default now(),
  utilisateur  uuid not null,
  conversation uuid not null,
  tour         int  not null default 0,
  mode         text not null check (mode in ('conv', 'fr', 'pul')),
  message      text not null,
  historique   jsonb not null default '[]'::jsonb,
  reponse      text not null,
  modele       text not null,
  chaud        boolean not null default false,
  duree_ms     int,
  tokens       int,
  note         text check (note in ('juste', 'faux', 'invente', 'pas_pulaar')),
  correction   text,
  commentaire  text,
  note_le      timestamptz
);

create index if not exists conversations_llm_conversation
  on public.conversations_llm (conversation, tour);
create index if not exists conversations_llm_cree_le
  on public.conversations_llm (cree_le);

comment on table public.conversations_llm is
  'Échanges de l''app de test de l''assistant LLM, avec la note de l''utilisateur. '
  'Écrits uniquement par /api/chat, via la clé service.';

-- Même principe que retours et usage_quotidien : RLS sans aucune policy, donc
-- aucun droit pour les clés publiques. Ne pas en ajouter.
alter table public.conversations_llm enable row level security;
