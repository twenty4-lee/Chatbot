create extension if not exists "pgcrypto";

create table if not exists public.data_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    size bigint,
    mime text,
    storage_path text not null,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.data_entries enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where tablename = 'data_entries'
          and schemaname = 'public'
          and polname = 'data_entries_select_own'
    ) then
        create policy data_entries_select_own
            on public.data_entries
            for select
            using (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where tablename = 'data_entries'
          and schemaname = 'public'
          and polname = 'data_entries_insert_own'
    ) then
        create policy data_entries_insert_own
            on public.data_entries
            for insert
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where tablename = 'data_entries'
          and schemaname = 'public'
          and polname = 'data_entries_delete_own'
    ) then
        create policy data_entries_delete_own
            on public.data_entries
            for delete
            using (auth.uid() = user_id);
    end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit)
select 'Chatbot', 'Chatbot', false, null
where not exists (
    select 1 from storage.buckets where id = 'Chatbot'
);

do $$
begin
    if not exists (
        select 1 from pg_policies
        where tablename = 'objects'
          and schemaname = 'storage'
          and polname = 'storage_chatbot_select'
    ) then
        create policy storage_chatbot_select
            on storage.objects
            for select
            to authenticated
            using (bucket_id = 'Chatbot');
    end if;

    if not exists (
        select 1 from pg_policies
        where tablename = 'objects'
          and schemaname = 'storage'
          and polname = 'storage_chatbot_insert'
    ) then
        create policy storage_chatbot_insert
            on storage.objects
            for insert
            to authenticated
            with check (bucket_id = 'Chatbot');
    end if;

    if not exists (
        select 1 from pg_policies
        where tablename = 'objects'
          and schemaname = 'storage'
          and polname = 'storage_chatbot_delete_own'
    ) then
        create policy storage_chatbot_delete_own
            on storage.objects
            for delete
            to authenticated
            using (bucket_id = 'Chatbot' and owner = auth.uid());
    end if;
end
$$;
