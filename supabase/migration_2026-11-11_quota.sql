-- Migration du 2026-11-11 : quota journalier de traductions, et suppression de
-- compte pour l'app mobile.
--
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Sans elle, /api/translate ne peut pas compter : il laisse alors passer les
-- traductions (voir api/_quota.js) mais le journal Vercel signale l'échec.
--
-- Pourquoi un quota : le Space tourne sur ZeroGPU, et chaque appel puise dans
-- le quota GPU du compte Hugging Face. Sans limite, un seul script peut vider
-- la réserve du jour pour tout le monde.
--
-- Trois sortes de clés, toutes comptées par jour UTC :
--   u:<uuid>        compte connecté de l'app (Google ou Apple)
--   d:<empreinte>   appareil de l'app sans compte (invité)
--   ip:<empreinte>  adresse IP salée et hachée (site web, et plafond des invités)
-- On ne stocke jamais l'IP ni l'identifiant brut de l'appareil.

create table if not exists public.usage_quotidien (
  cle  text not null,
  jour date not null,
  nb   int  not null default 0,
  primary key (cle, jour)
);

comment on table public.usage_quotidien is
  'Nombre de traductions par clé (u:, d:, ip:) et par jour UTC. '
  'Lu et écrit uniquement par les fonctions ci-dessous, via la clé service.';

-- Même principe que `retours` : RLS sans aucune policy, donc aucun droit pour
-- les clés publiques. Ne pas en ajouter.
alter table public.usage_quotidien enable row level security;


-- ── Consommer une unité ─────────────────────────────────────────────────────
-- Plusieurs clés d'un coup : un invité est compté sur son appareil ET sur son
-- IP. Tout ou rien : si une seule clé est au plafond, aucune n'est débitée.
--
-- Renvoie le nombre de traductions restantes (le plus petit des restes), ou
-- -i quand la i-ème clé est au plafond (-1 pour la première, -2 pour la
-- deuxième). L'appelant sait ainsi si c'est l'appareil ou l'IP qui bloque.
--
-- L'incrément conditionnel `on conflict … where nb < limite` est atomique :
-- deux requêtes simultanées ne peuvent pas dépasser la limite.
create or replace function public.consommer_quota(p_cles text[], p_limites int[])
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_jour    date := (now() at time zone 'utc')::date;
  v_bloque  int  := 0;  -- la boucle FOR masque ses propres variables : on
                        -- recopie ici l'index de la clé au plafond
  v_nb      int;
  v_restant int;
begin
  if coalesce(array_length(p_cles, 1), 0) = 0
     or array_length(p_cles, 1) <> array_length(p_limites, 1) then
    raise exception 'consommer_quota : clés et limites de tailles différentes';
  end if;

  begin
    for v_i in 1 .. array_length(p_cles, 1) loop
      v_nb := null;
      if p_limites[v_i] >= 1 then
        insert into public.usage_quotidien as u (cle, jour, nb)
        values (p_cles[v_i], v_jour, 1)
        on conflict (cle, jour) do update
          set nb = u.nb + 1
          where u.nb < p_limites[v_i]
        returning u.nb into v_nb;
      end if;

      if v_nb is null then
        v_bloque := v_i;
        -- Annule les incréments déjà faits dans cette boucle (sous-transaction).
        raise exception using errcode = 'P0001', message = 'quota';
      end if;

      v_restant := least(coalesce(v_restant, p_limites[v_i] - v_nb),
                         p_limites[v_i] - v_nb);
    end loop;
  exception when sqlstate 'P0001' then
    return -v_bloque;
  end;

  return v_restant;
end;
$$;


-- ── Rendre une unité ────────────────────────────────────────────────────────
-- Quand le Space échoue (veille, quota GPU épuisé), le visiteur n'a rien reçu :
-- on ne lui compte pas l'essai.
create or replace function public.rendre_quota(p_cles text[])
returns void
language sql
security definer set search_path = public
as $$
  update public.usage_quotidien
     set nb = greatest(nb - 1, 0)
   where cle = any (p_cles)
     and jour = (now() at time zone 'utc')::date;
$$;


-- ── Ménage ──────────────────────────────────────────────────────────────────
-- Les compteurs ne servent que le jour même. À lancer de temps en temps, ou à
-- planifier avec pg_cron :
--     select public.purger_quota();
create or replace function public.purger_quota()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.usage_quotidien
   where jour < (now() at time zone 'utc')::date - 7;
$$;


-- Les fonctions sont exécutables par PUBLIC par défaut dans Postgres. On retire
-- ce droit : seule la clé service (le relais Vercel) doit pouvoir compter.
revoke all on function public.consommer_quota(text[], int[]) from public, anon, authenticated;
revoke all on function public.rendre_quota(text[])           from public, anon, authenticated;
revoke all on function public.purger_quota()                 from public, anon, authenticated;
grant execute on function public.consommer_quota(text[], int[]) to service_role;
grant execute on function public.rendre_quota(text[])           to service_role;
grant execute on function public.purger_quota()                 to service_role;


-- ── Suppression de compte (exigée par Apple, règle 5.1.1(v)) ────────────────
-- Appelée par l'app, connectée, avec la clé publique : auth.uid() désigne
-- l'utilisateur lui-même, personne d'autre ne peut être visé.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  delete from public.usage_quotidien where cle = 'u:' || auth.uid()::text;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
