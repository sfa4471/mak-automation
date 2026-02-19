# GoDaddy DNS Setup for crestfield.app
## Quick Step-by-Step Guide Based on Your Vercel Dashboard

Based on what I see in your Vercel dashboard, here's exactly what you need to do:

---

## 🎯 What You Need to Do

Your Vercel dashboard shows:
- ❌ **Remove 2 conflicting A records** from GoDaddy
- ✅ **Add 1 new A record** with the value Vercel provided

---

## 📝 Step-by-Step Instructions

### Step 1: Log in to GoDaddy

1. Go to [dcc.godaddy.com](https://dcc.godaddy.com)
2. Log in with your GoDaddy account
3. You should see your domains listed

### Step 2: Open DNS Management for crestfield.app

1. Find `crestfield.app` in your domain list
2. Click on the domain name (or click the three dots ⋯ and select "Manage DNS")
3. Click on the **"DNS"** tab (or "DNS Management")

### Step 3: Check Existing A Records

**First, let's see what A records you currently have:**

1. Look through your DNS records table in GoDaddy
2. Find all **A records** that have:
   - **Name**: `@` (or blank/empty)
   - These are the records for your root domain (crestfield.app)

**What to do:**
- **If you see ANY A records for "@"**: Delete them all (we'll add the new one in the next step)
- **If you see NO A records for "@"**: That's fine! Just proceed to add the new one
- **If you're not sure**: Take a screenshot or note what A records you see

**Note**: The conflicting records Vercel mentioned might already be gone, or they might be cached. Either way, we'll make sure you have the correct one.

### Step 4: Add the New A Record

**Important**: Make sure you have NO other A records for "@" before adding this one. If you see any, delete them first.

Add this new A record:

**New Record to Add:**
- **Type**: A
- **Name**: @ (or leave blank - this means the root domain)
- **Value**: `216.198.79.1`
- **TTL**: Leave as default (usually 600 seconds or 1 hour)

**How to Add:**
1. Click the **"Add"** button (usually at the bottom of the records table)
2. Select **"A"** from the Type dropdown
3. In the **Name** field, enter **"@"** (just the @ symbol) OR leave it blank
4. In the **Value** field, enter: `216.198.79.1`
5. Leave TTL as default
6. Click **"Save"**

### Step 5: Verify in Vercel

1. Go back to your Vercel dashboard
2. The domain should still show "Invalid Configuration" for a few minutes
3. Click the **"Refresh"** button in Vercel
4. Wait 5-10 minutes for DNS to propagate
5. The status should change from "Invalid Configuration" to "Valid" ✅

---

## ⚠️ Important Notes

1. **DNS Propagation Time**: Changes can take 5 minutes to 24 hours to fully propagate. Usually it's 10-30 minutes.

2. **Only One A Record**: After you're done, you should have **only ONE** A record for "@" with the value `216.198.79.1`. 
   - If you see multiple A records for "@", delete all the old ones
   - If the conflicting records (13.248.243.5 and 76.223.105.230) aren't visible, they might already be deleted or cached - that's okay!

3. **If you see other A records**: Only delete A records that have Name = "@" (or blank). Don't delete:
   - A records with other names (like "www", "mail", etc.)
   - Other record types (CNAME, MX, TXT, etc.)

3. **Don't Delete Other Records**: Only delete the two specific A records mentioned above. Don't delete:
   - CNAME records
   - MX records (for email)
   - TXT records
   - Other records that aren't A records for "@"

4. **Check Both Tabs**: In GoDaddy, make sure you're looking at the "DNS Records" tab, not "Nameservers"

---

## 🔍 How to Verify It's Working

1. **In GoDaddy**: After saving, you should see only one A record for "@" with value `216.198.79.1`

2. **In Vercel**: 
   - Wait 5-10 minutes
   - Click "Refresh" button
   - Status should change to "Valid" ✅

3. **In Browser** (after Vercel shows "Valid"):
   - Open a new incognito/private window
   - Go to `https://crestfield.app`
   - Your site should load!

---

## 🆘 Troubleshooting

### If you can't find the records to delete:
- They might already be deleted
- Try refreshing the GoDaddy page
- Make sure you're looking at the right domain

### If Vercel still shows "Invalid Configuration" after 30 minutes:
- Double-check that you deleted the old A records
- Make sure the new A record has exactly: Name = "@", Value = "216.198.79.1"
- Click "Refresh" in Vercel
- Wait a bit longer (DNS can be slow)

### If you accidentally deleted the wrong record:
- Don't worry! You can add it back
- Only A records for "@" matter for this setup
- Other records (MX, TXT, etc.) are usually safe to keep

---

## ✅ Quick Checklist

- [ ] Logged into GoDaddy
- [ ] Opened DNS Management for crestfield.app
- [ ] Deleted A record with value `13.248.243.5`
- [ ] Deleted A record with value `76.223.105.230`
- [ ] Added new A record: Type=A, Name=@, Value=`216.198.79.1`
- [ ] Saved changes in GoDaddy
- [ ] Waited 5-10 minutes
- [ ] Clicked "Refresh" in Vercel
- [ ] Status changed to "Valid" ✅

---

**Once Vercel shows "Valid", your domain is connected!** 🎉

Your site will be accessible at `https://crestfield.app` (SSL certificate will be automatically provisioned by Vercel).
