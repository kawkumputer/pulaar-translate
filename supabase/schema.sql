-- Schéma de la base des retours utilisateurs de Pulaar-Translate.
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Principe de sécurité : RLS est activé SANS AUCUNE POLICY. Les rôles publics
-- `anon` et `authenticated` n'ont donc strictement aucun droit sur la table,
-- même si leur clé fuitait. Seule la clé `service_role`, qui contourne RLS et
-- ne vit que dans les variables d'environnement Vercel, peut lire et écrire.
-- Cette clé ne doit jamais atteindre le navigateur.

create extension if not exists "pgcrypto";

create table if not exists public.retours (
  id                uuid primary key default gen_random_uuid(),
  cree_le           timestamptz not null default now(),

  -- Ce qui a été soumis au modèle, et ce qu'il a répondu.
  texte_source      text not null,
  direction         text not null check (direction in ('fr → pul', 'pul → fr')),
  traduction_modele text not null,

  -- Le jugement du visiteur. `correction` reste nullable : signaler qu'une
  -- traduction est fausse sans savoir la corriger est déjà un signal utile.
  verdict           text not null check (verdict in ('bonne', 'mauvaise')),
  correction        text,

  -- Le modèle vise le Fuuta Tooro. Une correction juste en Maasina y serait
  -- fausse : sans ce champ, on ne pourrait pas faire la différence.
  dialecte          text,
  contributeur      text,

  -- Quelle version du modèle était jugée. Le champ qu'on oublie et qu'on
  -- regrette : dans six mois, un retour sans version n'est plus interprétable.
  modele            text not null default 'v11',

  -- Empreinte salée de l'IP, jamais l'IP elle-même. Sert uniquement à limiter
  -- le débit et à repérer un envoi massif.
  ip_hachee         text,

  -- Cycle de vie du dépouillement. Rien ne part à l'entraînement avant d'être
  -- passé à 'valide' à la main : une correction venue du web est un candidat,
  -- pas une donnée.
  statut            text not null default 'nouveau'
                    check (statut in ('nouveau', 'valide', 'rejete')),
  note_interne      text
);

-- Tri du dépouillement : les nouveaux d'abord, du plus récent au plus ancien.
create index if not exists retours_tri
  on public.retours (statut, cree_le desc);

-- Limitation de débit : compter les envois récents d'une même empreinte.
create index if not exists retours_debit
  on public.retours (ip_hachee, cree_le desc);

alter table public.retours enable row level security;

-- Aucune policy n'est créée, volontairement. Ne pas en ajouter : ce serait
-- ouvrir la table aux clés publiques.
