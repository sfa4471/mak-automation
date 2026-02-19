# SendGrid Domain Authentication – GoDaddy (crestfield.app)

Add these DNS records in GoDaddy so SendGrid can send email from `@crestfield.app`.

---

## Step 1: Open DNS in GoDaddy

1. Go to [dcc.godaddy.com](https://dcc.godaddy.com) and log in.
2. Find **crestfield.app** and click it (or ⋯ → **Manage DNS**).
3. Open the **DNS** tab (DNS Management / DNS Records).

---

## Step 2: Add the 4 records

Click **Add** (or **Add Record**) and add each record below.  
In GoDaddy, **Name** is often just the subdomain part; it may add `.crestfield.app` for you.

### Record 1 – CNAME (link subdomain)

| Field   | Value |
|--------|--------|
| **Type** | CNAME |
| **Name** | `em8994` |
| **Value** | `u59938811.wl062.sendgrid.net` |
| **TTL** | 600 (or default) |

Save.

---

### Record 2 – CNAME (DKIM 1)

| Field   | Value |
|--------|--------|
| **Type** | CNAME |
| **Name** | `s1._domainkey` |
| **Value** | `s1.domainkey.u59938811.wl062.sendgrid.net` |
| **TTL** | 600 (or default) |

Save.

---

### Record 3 – CNAME (DKIM 2)

| Field   | Value |
|--------|--------|
| **Type** | CNAME |
| **Name** | `s2._domainkey` |
| **Value** | `s2.domainkey.u59938811.wl062.sendgrid.net` |
| **TTL** | 600 (or default) |

Save.

---

### Record 4 – TXT (DMARC)

| Field   | Value |
|--------|--------|
| **Type** | TXT |
| **Name** | `_dmarc` |
| **Value** | `v=DMARC1; p=none;` |
| **TTL** | 600 (or default) |

Save.

---

## Step 3: Verify in SendGrid

1. Wait 5–30 minutes for DNS to update (sometimes up to 24 hours).
2. In SendGrid, go to **Settings** → **Sender Authentication** → **Domain Authentication**.
3. Click **Verify** (or **Next** and then Verify) for crestfield.app.
4. When all records are found, the domain shows as **Verified**.

---

## Notes

- **Name in GoDaddy**: If it asks for “Host” or “Name”, use exactly: `em8994`, `s1._domainkey`, `s2._domainkey`, `_dmarc`. Do not add `.crestfield.app` if GoDaddy adds it automatically.
- **Don’t remove** your existing A record for `@` (e.g. for Vercel) or other records. Only add these four.
- After verification, set `SENDGRID_FROM_EMAIL` to something like `noreply@crestfield.app` in `.env.local` (see `SENDGRID_SETUP_WHAT_YOU_NEED.md`).
