#!/usr/bin/env python3
"""Live integration smoke test against the hosted Supabase project.
Seeds a demo customer/mailbox/recipients and asserts the compliance trigger
blocks check-in for an unverified recipient. Uses the service role key
(bypasses RLS) — the DB triggers still fire for service_role by design."""
import json, os, sys, urllib.request, urllib.error

BASE = "https://qgzukvhjhsboqoidngnt.supabase.co"
SVC = os.environ["SVC"]
H = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}

def req(method, path, body=None, prefer="return=representation"):
    headers = dict(H)
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

# 1. location
_, loc = req("GET", "/rest/v1/locations?select=id&slug=eq.postalannex-main", None, None)
location_id = loc[0]["id"]
print(f"location_id = {location_id}")

# 2. demo customer
st, cust = req("POST", "/rest/v1/customers",
    {"location_id": location_id, "full_name": "Jane Demo", "email": "jane@demo.test", "status": "active"})
customer_id = cust[0]["id"]
print(f"customer    = {customer_id} (HTTP {st})")

# 3. assign a digital mailbox (service-role RPC)
st, mb = req("POST", "/rest/v1/rpc/assign_mailbox",
    {"p_location": location_id, "p_customer": customer_id, "p_type": "digital"})
mailbox_id = mb["id"] if isinstance(mb, dict) else mb[0]["id"]
pmb = mb["pmb_number"] if isinstance(mb, dict) else mb[0]["pmb_number"]
print(f"mailbox     = PMB {pmb} (HTTP {st})")

# 4. subscription on Digital Plus (drives admin MRR)
_, plan = req("GET", "/rest/v1/plans?select=id&tier=eq.digital_plus", None, None)
req("POST", "/rest/v1/subscriptions",
    {"customer_id": customer_id, "plan_id": plan[0]["id"], "mailbox_id": mailbox_id,
     "status": "active", "quota_usage": {}}, "return=minimal")

# 5. two recipients: one verified, one not
st, rv = req("POST", "/rest/v1/recipients",
    {"customer_id": customer_id, "mailbox_id": mailbox_id, "full_name": "Jane Demo",
     "status": "verified", "id_verified_at": "2026-06-12T00:00:00Z"})
verified_id = rv[0]["id"]
st, ru = req("POST", "/rest/v1/recipients",
    {"customer_id": customer_id, "mailbox_id": mailbox_id, "full_name": "Bob Unverified",
     "status": "pending_id"})
unverified_id = ru[0]["id"]
print(f"recipients  = verified {verified_id[:8]} / unverified {unverified_id[:8]}")

print("\n── COMPLIANCE TRIGGER (live DB) ──")
# 6a. check-in for UNVERIFIED recipient → must be blocked by trigger
st, res = req("POST", "/rest/v1/mail_items",
    {"location_id": location_id, "mailbox_id": mailbox_id, "recipient_id": unverified_id,
     "kind": "letter", "sender_name": "IRS"})
blocked = st >= 400 and "COMPLIANCE" in json.dumps(res)
print(f"unverified check-in → HTTP {st} :: {'BLOCKED ✓' if blocked else 'NOT BLOCKED ✗ ' + json.dumps(res)}")

# 6b. check-in for VERIFIED recipient → must succeed
st, res = req("POST", "/rest/v1/mail_items",
    {"location_id": location_id, "mailbox_id": mailbox_id, "recipient_id": verified_id,
     "kind": "letter", "sender_name": "Pacific Gas & Electric", "category": "bill"})
ok = st < 300
print(f"verified check-in   → HTTP {st} :: {'ACCEPTED ✓' if ok else 'FAILED ✗ ' + json.dumps(res)}")

# 7. open-without-consent on the accepted item → must be blocked
if ok:
    item_id = res[0]["id"]
    st, res = req("POST", "/rest/v1/mail_events",
        {"mail_item_id": item_id, "event_type": "opened", "actor_type": "staff"})
    cblock = st >= 400 and "COMPLIANCE" in json.dumps(res)
    print(f"open w/o consent    → HTTP {st} :: {'BLOCKED ✓' if cblock else 'NOT BLOCKED ✗ ' + json.dumps(res)}")

print("\nLIVE SMOKE COMPLETE")
