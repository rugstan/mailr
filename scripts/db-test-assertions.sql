-- MailboxOS migration & security test suite.
-- Runs after all migrations on the mocked-Supabase database. Any failure aborts.
\set ON_ERROR_STOP on

begin;

-- ── Fixtures (as superuser, mimicking service-role writes) ───────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'staff@test.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'counter@test.dev');

do $$
declare
  loc uuid;
  alice uuid; bob uuid;
  box_a uuid; box_b uuid;
  rec_a uuid; rec_b uuid;
  plan_lite uuid;
begin
  select id into loc from locations limit 1;

  insert into customers (location_id, auth_user_id, full_name, email, status)
  values (loc, '00000000-0000-0000-0000-00000000000a', 'Alice Test', 'alice@test.dev', 'active')
  returning id into alice;
  insert into customers (location_id, auth_user_id, full_name, email, status)
  values (loc, '00000000-0000-0000-0000-00000000000b', 'Bob Test', 'bob@test.dev', 'active')
  returning id into bob;

  insert into staff_users (location_id, auth_user_id, full_name, role)
  values (loc, '00000000-0000-0000-0000-00000000000c', 'Sam Scanner', 'scan_operator');
  insert into staff_users (location_id, auth_user_id, full_name, role)
  values (loc, '00000000-0000-0000-0000-00000000000d', 'Cory Counter', 'counter');

  select id into box_a from mailboxes where status = 'available' and type = 'digital' order by pmb_number limit 1;
  update mailboxes set customer_id = alice, status = 'active' where id = box_a;
  select id into box_b from mailboxes where status = 'available' and type = 'digital' order by pmb_number limit 1;
  update mailboxes set customer_id = bob, status = 'active' where id = box_b;

  insert into recipients (customer_id, mailbox_id, full_name, status, id_verified_at)
  values (alice, box_a, 'Alice Test', 'verified', now()) returning id into rec_a;
  insert into recipients (customer_id, mailbox_id, full_name, status)
  values (bob, box_b, 'Bob Test', 'pending_id') returning id into rec_b;

  select id into plan_lite from plans where tier = 'digital_lite' limit 1;
  insert into subscriptions (customer_id, plan_id, mailbox_id, status, quota_usage)
  values (alice, plan_lite, box_a, 'active', '{}');
end $$;

-- ── T1: compliance — check-in blocked for unverified recipient ──────────────
do $$
declare
  loc uuid; box_b uuid; rec_b uuid;
begin
  select location_id, mb.id, r.id into loc, box_b, rec_b
  from mailboxes mb join recipients r on r.mailbox_id = mb.id
  where r.status = 'pending_id' limit 1;
  begin
    insert into mail_items (location_id, mailbox_id, recipient_id)
    values (loc, box_b, rec_b);
    raise exception 'T1 FAILED: unverified recipient was checked in';
  exception when others then
    if sqlerrm not like 'COMPLIANCE:%' then raise; end if;
  end;
  raise notice 'T1 PASS: unverified recipient blocked';
end $$;

-- ── T2: compliance — verified recipient checks in fine ───────────────────────
do $$
declare
  loc uuid; box_a uuid; rec_a uuid; item uuid;
begin
  select mb.location_id, mb.id, r.id into loc, box_a, rec_a
  from mailboxes mb join recipients r on r.mailbox_id = mb.id
  where r.status = 'verified' limit 1;
  insert into mail_items (location_id, mailbox_id, recipient_id, barcode)
  values (loc, box_a, rec_a, 'MB-TEST-000001') returning id into item;
  raise notice 'T2 PASS: verified recipient checked in (%)', item;
end $$;

-- ── T3: compliance — open without consent is impossible ─────────────────────
do $$
declare item uuid;
begin
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  begin
    insert into mail_events (mail_item_id, event_type, actor_type)
    values (item, 'opened', 'staff');
    raise exception 'T3 FAILED: opened without consent_source';
  exception when others then
    if sqlerrm not like 'COMPLIANCE:%' then raise; end if;
  end;
  -- bogus consent id must also fail
  begin
    insert into mail_events (mail_item_id, event_type, actor_type, consent_source)
    values (item, 'opened', 'staff', jsonb_build_object('type','action_request','id', gen_random_uuid()));
    raise exception 'T3 FAILED: opened with bogus consent id';
  exception when others then
    if sqlerrm not like 'COMPLIANCE:%' then raise; end if;
  end;
  raise notice 'T3 PASS: open without valid consent blocked';
end $$;

-- ── T4: compliance — open WITH a valid action_request succeeds ──────────────
do $$
declare item uuid; alice uuid; req uuid;
begin
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  select id into alice from customers where email = 'alice@test.dev';
  insert into action_requests (mail_item_id, customer_id, action, status)
  values (item, alice, 'open_scan', 'requested') returning id into req;
  insert into mail_events (mail_item_id, event_type, actor_type, consent_source)
  values (item, 'opened', 'staff', jsonb_build_object('type','action_request','id', req));
  raise notice 'T4 PASS: consented open allowed';
end $$;

-- ── T5: state machine — illegal transitions throw ────────────────────────────
do $$
declare item uuid;
begin
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  begin
    update mail_items set status = 'forwarded' where id = item; -- received → forwarded
    raise exception 'T5 FAILED: illegal transition allowed';
  exception when others then
    if sqlerrm not like 'ILLEGAL TRANSITION:%' then raise; end if;
  end;
  update mail_items set status = 'checked_in' where id = item; -- legal
  raise notice 'T5 PASS: state machine enforced';
end $$;

-- ── T6: RLS — Alice cannot see Bob's data ────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  select count(*) into n from customers;
  if n <> 1 then raise exception 'T6 FAILED: customer sees % customer rows', n; end if;
  select count(*) into n from customers where email = 'bob@test.dev';
  if n <> 0 then raise exception 'T6 FAILED: Alice can read Bob'; end if;
  select count(*) into n from mailboxes;
  if n <> 1 then raise exception 'T6 FAILED: Alice sees % mailboxes', n; end if;
end $$;
reset role;

-- ── T7: RLS — customers cannot write mail_items or self-verify recipients ───
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$
declare loc uuid; box uuid; n int;
begin
  select mb.location_id, mb.id into loc, box from mailboxes mb limit 1; -- own box (RLS)
  begin
    insert into mail_items (location_id, mailbox_id) values (loc, box);
    raise exception 'T7 FAILED: customer inserted a mail item';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm not like '%policy%' then raise; end if;
  end;
  -- self-inserted recipients must start pending_id
  begin
    insert into recipients (customer_id, mailbox_id, full_name, status)
    select c.id, box, 'Sneaky Verified', 'verified' from customers c;
    raise exception 'T7 FAILED: customer self-verified a recipient';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm not like '%policy%' then raise; end if;
  end;
  -- customers cannot UPDATE their recipient status (no policy row for them)
  update recipients set status = 'verified' where full_name = 'Bob Test';
  select count(*) into n from recipients where full_name = 'Bob Test' and status = 'verified';
  if n <> 0 then raise exception 'T7 FAILED: customer updated recipient status'; end if;
end $$;
reset role;

-- ── T8: RLS — mail_events are append-only for API roles ─────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
do $$
begin
  begin
    update mail_events set event_type = 'tampered';
    raise exception 'T8 FAILED: mail_events update allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from mail_events;
    raise exception 'T8 FAILED: mail_events delete allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── T9: RLS — counter role cannot record opened/scanned, scan_operator can ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d"}';
do $$
declare item uuid; req uuid; inserted boolean := true;
begin
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  select id into req from action_requests where mail_item_id = item limit 1;
  begin
    insert into mail_events (mail_item_id, event_type, actor_type, consent_source)
    values (item, 'opened', 'staff', jsonb_build_object('type','action_request','id', req));
    inserted := true;
  exception
    when insufficient_privilege then inserted := false;
    when others then
      if sqlerrm like '%policy%' then inserted := false; else raise; end if;
  end;
  if inserted then raise exception 'T9 FAILED: counter recorded an opened event'; end if;
  -- counter CAN record a pickup event
  insert into mail_events (mail_item_id, event_type, actor_type)
  values (item, 'pickup_note', 'staff');
end $$;
reset role;

-- ── T10: suspension restricts mail actions ───────────────────────────────────
do $$
declare alice uuid; item uuid;
begin
  select id into alice from customers where email = 'alice@test.dev';
  update customers set status = 'suspended' where id = alice;
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  begin
    insert into action_requests (mail_item_id, customer_id, action) values (item, alice, 'forward');
    raise exception 'T10 FAILED: suspended customer created an action request';
  exception when others then
    if sqlerrm not like 'SERVICE SUSPENDED%' then raise; end if;
  end;
  begin
    insert into pickup_logs (mail_item_id, verified_id_type, staff_id)
    select item, 'drivers_license', id from staff_users limit 1;
    raise exception 'T10 FAILED: suspended customer mail released';
  exception when others then
    if sqlerrm not like 'PAYMENT REQUIRED%' then raise; end if;
  end;
  update customers set status = 'active' where id = alice;
  raise notice 'T10 PASS: suspension restricts actions and pickups';
end $$;

-- ── T11: scan quota overage billing ──────────────────────────────────────────
do $$
declare
  item uuid; alice uuid; sub uuid; n int;
begin
  select id into item from mail_items where barcode = 'MB-TEST-000001';
  select id into alice from customers where email = 'alice@test.dev';
  select id into sub from subscriptions where customer_id = alice;
  -- Lite plan quota is 5; pretend 5 scans already used
  update subscriptions set quota_usage = '{"open_scans": 5}' where id = sub;
  insert into mail_events (mail_item_id, event_type, actor_type) values (item, 'scanned', 'staff');
  select count(*) into n from usage_records
    where customer_id = alice and type = 'scan_overage';
  if n <> 1 then raise exception 'T11 FAILED: expected 1 scan_overage record, got %', n; end if;
  select (quota_usage->>'open_scans')::int into n from subscriptions where id = sub;
  if n <> 6 then raise exception 'T11 FAILED: quota_usage not incremented (%)', n; end if;
  raise notice 'T11 PASS: overage metered';
end $$;

-- ── T12: atomic mailbox assignment ───────────────────────────────────────────
do $$
declare alice uuid; loc uuid; mb mailboxes;
begin
  select id, location_id into alice, loc from customers where email = 'alice@test.dev';
  mb := assign_mailbox(loc, alice, 'physical', 'm');
  if mb.attrs->>'size' is distinct from 'm' or mb.status <> 'active' then
    raise exception 'T12 FAILED: physical assignment wrong: %', mb;
  end if;
  raise notice 'T12 PASS: mailbox % assigned', mb.pmb_number;
end $$;

-- ── T13: anon sees only the public surface ───────────────────────────────────
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from plans where active;
  if n < 1 then raise exception 'T13 FAILED: anon cannot read plan catalog'; end if;
  begin
    select count(*) into n from customers;
    raise exception 'T13 FAILED: anon can read customers';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from mail_items;
    raise exception 'T13 FAILED: anon can read mail_items';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
\echo 'ALL DB TESTS PASSED'
