# Add CNAME Record for www.crestfield.app
## Complete the DNS Setup

Your A record for `crestfield.app` is correct! ✅
Now you need to add a CNAME record for `www.crestfield.app`.

---

## 🎯 What You Need to Do

Since you have both `crestfield.app` and `www.crestfield.app` in Vercel, you need:

1. ✅ **A Record** for `crestfield.app` (already done - `216.198.79.1`)
2. ⚠️ **CNAME Record** for `www.crestfield.app` (needs to be added)

---

## 📝 Step 1: Check What Vercel Needs for www

1. Go to your Vercel dashboard
2. Click on the **"www.crestfield.app"** domain (the one showing "Invalid Configuration")
3. Click the **"DNS Records"** tab
4. Look for what DNS record it needs - it should show a CNAME record

**Expected CNAME record:**
- Type: CNAME
- Name: www
- Value: `cname.vercel-dns.com` (or similar - use what Vercel shows)

---

## 📝 Step 2: Add CNAME Record in GoDaddy

1. **Go back to GoDaddy DNS settings**
   - [dcc.godaddy.com](https://dcc.godaddy.com) → `crestfield.app` → DNS tab

2. **Add CNAME Record**
   - Click **"Add"** button
   - Select **Type**: `CNAME`
   - Enter **Name**: `www` (just "www", without quotes, without the domain)
   - Enter **Value/Data**: `cname.vercel-dns.com` (or whatever Vercel showed you)
   - Leave TTL as default
   - Click **"Save"**

3. **Verify in GoDaddy**
   - You should now see:
     - ✅ One A record: Name = "@", Value = `216.198.79.1`
     - ✅ One CNAME record: Name = "www", Value = `cname.vercel-dns.com`

---

## ⏳ Step 3: Wait and Refresh

1. **Wait 5-10 minutes** for DNS to propagate
2. **Go back to Vercel**
3. **Click "Refresh"** button next to both domains:
   - `crestfield.app`
   - `www.crestfield.app`
4. **Status should change** from "Invalid Configuration" to "Valid" ✅

---

## 🔍 What Your Final DNS Should Look Like

In GoDaddy, you should have:

| Type | Name | Data/Value | TTL |
|------|------|------------|-----|
| A | @ | 216.198.79.1 | 600 seconds |
| CNAME | www | cname.vercel-dns.com | (default) |
| NS | @ | ns47.domaincontrol.com. | (can't edit) |
| NS | @ | ns48.domaincontrol.com. | (can't edit) |
| SOA | @ | ... | (can't edit) |

---

## ⚠️ Important Notes

1. **CNAME for www**: The www subdomain MUST use a CNAME record, not an A record
2. **DNS Propagation**: Can take 5-30 minutes, sometimes up to 24 hours
3. **Both domains**: Both `crestfield.app` and `www.crestfield.app` need to show "Valid" in Vercel
4. **Redirect**: Your `crestfield.app` is set to redirect to `www.crestfield.app`, so both need to work

---

## 🆘 Troubleshooting

### If Vercel still shows "Invalid Configuration" after adding CNAME:

1. **Double-check the CNAME value** - it must match exactly what Vercel shows
2. **Verify in GoDaddy** - make sure the CNAME record was saved
3. **Wait longer** - DNS can be slow, try waiting 30 minutes
4. **Click Refresh** in Vercel multiple times
5. **Check DNS propagation** using [whatsmydns.net](https://www.whatsmydns.net) - search for "www.crestfield.app" and select "CNAME"

### If you're not sure what CNAME value to use:

- Click on `www.crestfield.app` in Vercel
- Go to the "DNS Records" tab
- Copy the exact value shown there
- Use that exact value in GoDaddy

---

## ✅ Final Checklist

- [ ] A record for "@" with value `216.198.79.1` ✅ (already done)
- [ ] CNAME record for "www" with value from Vercel
- [ ] Saved changes in GoDaddy
- [ ] Waited 5-10 minutes
- [ ] Clicked "Refresh" in Vercel for both domains
- [ ] Both domains show "Valid Configuration" ✅

---

**Once both domains show "Valid" in Vercel, you're all set!** 🎉

Your site will be accessible at:
- `https://crestfield.app` (redirects to www)
- `https://www.crestfield.app` (main site)
