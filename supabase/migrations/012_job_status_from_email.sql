-- Application status from recruiting emails. The Gmail script sends recruiting emails to the job-scout function
-- (action "status"), which decides what each says (passed to a stage, or rejected), finds the application,
-- moves its status forward and logs it here with the previous values, so any change can be undone.

create table public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  -- Gmail message id: each email is handled once
  message_id text not null unique,
  received_at timestamptz not null,
  sender text not null,
  subject text not null,
  kind text not null check (kind in ('hr_interview', 'test', 'user_interview', 'medical_checkup', 'offer', 'rejected')),
  -- the words that decided it ("regret to inform", "tahap asesmen")
  evidence text,
  guessed_company text,
  guessed_position text,
  job_id uuid references public.job_applications(id) on delete set null,
  match_note text,
  -- updated: status changed; already: it was there or further; skipped: rejected/accepted already, or you changed it later by hand;
  -- unmatched: no application found; undone / added: what you did about it
  outcome text not null check (outcome in ('updated', 'already', 'skipped', 'unmatched', 'undone', 'added')),
  prev_status text,
  prev_status_changed_at timestamptz,
  prev_max_stage smallint,
  prev_auto_ghosted boolean,
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);
create index job_status_events_received_idx on public.job_status_events (received_at desc);

alter table public.job_status_events enable row level security;
revoke all on public.job_status_events from anon, authenticated;

-- What the dashboard shows: changes and unmatched emails from the last 30 days you haven't dismissed
create or replace function public.get_job_updates(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  return jsonb_build_object(
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', e.id, 'received_at', e.received_at, 'sender', e.sender, 'subject', e.subject, 'kind', e.kind,
          'evidence', e.evidence, 'guessed_company', e.guessed_company, 'guessed_position', e.guessed_position,
          'job_id', e.job_id, 'outcome', e.outcome, 'prev_status', e.prev_status,
          'company', j.company, 'position', j.position, 'status', j.status)
        order by e.received_at desc)
      from public.job_status_events e
      left join public.job_applications j on j.id = e.job_id
      where e.outcome in ('updated', 'unmatched') and not e.dismissed and e.received_at > now() - interval '30 days'), '[]'::jsonb),
    'last_email', (select max(created_at) from public.job_status_events)
  );
end $$;

-- Put the application back as it was before the email changed it (only if nothing else changed it since)
create or replace function public.undo_job_update(p_token text, p_id uuid)
returns public.job_applications language plpgsql security definer set search_path = '' as $$
declare
  e public.job_status_events;
  r public.job_applications;
begin
  perform private.require_session(p_token);
  select * into e from public.job_status_events where id = p_id for update;
  if e.id is null or e.outcome <> 'updated' or e.job_id is null then raise exception 'not_undoable'; end if;
  update public.job_applications set
    status = e.prev_status, status_changed_at = e.prev_status_changed_at, max_stage = e.prev_max_stage,
    auto_ghosted = e.prev_auto_ghosted, updated_at = now()
  where id = e.job_id and (status = e.kind or (status = 'ghosted' and auto_ghosted))
  returning * into r;
  if r.id is null then raise exception 'changed_since'; end if;
  update public.job_status_events set outcome = 'undone', dismissed = true where id = p_id;
  return r;
end $$;

create or replace function public.dismiss_job_update(p_token text, p_id uuid, p_added boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_session(p_token);
  update public.job_status_events
  set dismissed = true, outcome = case when p_added then 'added' else outcome end
  where id = p_id;
end $$;

revoke execute on function public.get_job_updates(text), public.undo_job_update(text, uuid), public.dismiss_job_update(text, uuid, boolean) from public, authenticated;
grant execute on function public.get_job_updates(text), public.undo_job_update(text, uuid), public.dismiss_job_update(text, uuid, boolean) to anon;
