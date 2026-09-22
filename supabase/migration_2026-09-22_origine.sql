-- Migration du 2026-09-22 : conserver la sortie d'origine du modèle.
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Sans elle, modifier « Sortie du modèle » dans la page de dépouillement
-- échoue : la colonne n'existe pas encore.
--
-- Pourquoi cette colonne : la page permet désormais d'amender les trois textes
-- d'un retour. Or la sortie du modèle est la seule trace de ce que v11 a
-- réellement produit sur cette entrée — c'est le diagnostic qui alimente le lot
-- suivant. La corriger pour l'exporter effacerait la preuve de l'erreur.
--
-- Elle ne se remplit qu'à la PREMIÈRE modification, et reste nulle tant que la
-- sortie n'a pas été touchée : une ligne non modifiée ne duplique donc rien.

alter table public.retours
  add column if not exists traduction_modele_origine text;

comment on column public.retours.traduction_modele_origine is
  'Sortie du modèle avant la première retouche au dépouillement. '
  'Nulle tant que traduction_modele n''a pas été amendée.';
