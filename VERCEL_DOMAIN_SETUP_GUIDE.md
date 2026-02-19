# Vercel Custom Domain Setup Guide
## Adding crestfield.app to Your Vercel Deployment

This guide will walk you through connecting your custom domain `crestfield.app` to your Vercel project so that when users type `crestfield.app` in their browser, they'll be directed to your Vercel deployment.

---

## 📋 Prerequisites

- ✅ Your project is already deployed on Vercel
- ✅ You own the domain `crestfield.app`
- ✅ You have access to your domain registrar's DNS settings

---

## 🚀 Step-by-Step Instructions

### Step 1: Add Domain in Vercel Dashboard (THIS IS WHERE YOU GET THE DNS RECORDS!)

**Important**: You MUST add the domain in Vercel first to see the DNS records!

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com) and log in
   - Click on your project (the one you want to connect the domain to)

2. **Navigate to Domains Section**
   - Click on the **"Settings"** tab at the top
   - In the left sidebar, click on **"Domains"**
   - You should see a section that says "Domains" with a button

3. **Add Your Domain**
   - Look for a button that says **"Add Domain"** or **"Add"** or **"Add Domain"**
   - Click it
   - A popup or form will appear
   - Enter your domain: `crestfield.app` (without www, without https://)
   - Click **"Add"** or **"Continue"**

4. **View DNS Records (THIS IS WHAT YOU NEED!)**
   - After adding the domain, Vercel will show you a page with DNS configuration
   - **You'll see something like:**
     ```
     Configure the following DNS records:
     
     Type: A
     Name: @
     Value: 76.76.21.21
     ```
   - **OR you might see:**
     ```
     Type: CNAME
     Name: @
     Value: cname.vercel-dns.com
     ```
   - **COPY THESE VALUES** - you'll need them for GoDaddy!
   - You might also see a CNAME for www subdomain

5. **Keep This Page Open**
   - Don't close the Vercel page yet
   - You'll need to copy the DNS records to GoDaddy

---

### Step 2: Configure DNS Records

After adding the domain, Vercel will show you the DNS records you need to add. Here's what you'll typically need:

#### For Apex Domain (crestfield.app):

**Option 1: A Records (Recommended for most registrars)**
```
Type: A
Name: @ (or leave blank, or use "crestfield.app")
Value: 76.76.21.21
```

**Option 2: CNAME Record (If your registrar supports CNAME flattening)**
```
Type: CNAME
Name: @ (or leave blank)
Value: cname.vercel-dns.com
```

#### For WWW Subdomain (www.crestfield.app) - Optional:
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Note**: Vercel will provide you with the exact values. Use the values shown in your Vercel dashboard, as they may change.

---

### Step 3: Update DNS at GoDaddy (YOUR DOMAIN REGISTRAR)

**Before you start**: Make sure you have the DNS records from Vercel (from Step 1) copied!

1. **Log in to GoDaddy**
   - Go to [godaddy.com](https://godaddy.com) and log in
   - Click on your account/profile icon (top right)
   - Click **"My Products"** or go directly to [dcc.godaddy.com](https://dcc.godaddy.com)

2. **Find Your Domain**
   - You'll see a list of your domains
   - Find `crestfield.app` in the list
   - Click on the **three dots (⋯)** next to your domain
   - OR click directly on the domain name

3. **Open DNS Management**
   - Look for **"DNS"** or **"Manage DNS"** or **"DNS Management"**
   - Click on it
   - You'll see a table with existing DNS records

4. **Add the A Record (for crestfield.app)**
   
   **If Vercel gave you an A record:**
   - Scroll down to the "Records" section
   - Click **"Add"** button (usually at the bottom of the records table)
   - Fill in the form:
     - **Type**: Select **"A"** from dropdown
     - **Name**: Enter **"@"** (just the @ symbol) OR leave it blank OR enter "crestfield.app"
     - **Value**: Enter the IP address from Vercel (e.g., `76.76.21.21`)
     - **TTL**: Leave as default (usually 600 seconds or 1 hour)
   - Click **"Save"**

   **If Vercel gave you a CNAME record:**
   - Click **"Add"** button
   - Fill in:
     - **Type**: Select **"CNAME"** from dropdown
     - **Name**: Enter **"@"** (just the @ symbol) OR leave it blank
     - **Value**: Enter the CNAME from Vercel (e.g., `cname.vercel-dns.com`)
     - **TTL**: Leave as default
   - Click **"Save"**

5. **Add CNAME Record for www (Optional but Recommended)**
   - If Vercel showed you a www record, add it:
   - Click **"Add"** again
   - Fill in:
     - **Type**: Select **"CNAME"**
     - **Name**: Enter **"www"** (without quotes)
     - **Value**: Enter `cname.vercel-dns.com` (or what Vercel provided)
     - **TTL**: Leave as default
   - Click **"Save"**

6. **Remove Conflicting Records (Important!)**
   - Look for any existing A records or CNAME records for "@" or blank name
   - If there are old records pointing to other IPs, you may need to delete them
   - **Be careful**: Only delete records that conflict with Vercel's records
   - If unsure, you can leave them and Vercel will tell you if there's a conflict

7. **Save All Changes**
   - GoDaddy usually saves automatically, but double-check
   - Wait a few minutes for changes to take effect

---

### Step 4: Verify Domain in Vercel

1. **Wait for DNS Propagation**
   - After adding DNS records, wait a few minutes
   - You can check DNS propagation using tools like:
     - [whatsmydns.net](https://www.whatsmydns.net)
     - [dnschecker.org](https://dnschecker.org)

2. **Verify in Vercel**
   - Go back to Vercel dashboard → Your Project → Settings → Domains
   - Vercel will automatically verify the domain
   - You'll see a status indicator:
     - ⏳ **Pending**: DNS is still propagating
     - ✅ **Valid**: Domain is connected and working
     - ❌ **Invalid**: Check your DNS records

3. **SSL Certificate**
   - Vercel automatically provisions SSL certificates (HTTPS)
   - This usually happens automatically after domain verification
   - Your site will be accessible at `https://crestfield.app`

---

### Step 5: Test Your Domain

1. **Wait for Full Propagation** (can take up to 24 hours)
2. **Test in Browser**
   - Open a new incognito/private window
   - Navigate to `https://crestfield.app`
   - Your Vercel deployment should load

3. **Test Both Versions** (if you added www)
   - `https://crestfield.app`
   - `https://www.crestfield.app`

---

## 🔧 Common Issues & Solutions

### Issue: "I don't see DNS records in Vercel"

**This means you haven't added the domain yet!**

**Solution:**
1. Make sure you're in your project's Settings → Domains page
2. Click the **"Add Domain"** button (it might be at the top right or in the middle of the page)
3. Enter `crestfield.app` and click Add
4. **THEN** Vercel will show you the DNS records you need
5. If you still don't see it, make sure your project is deployed on Vercel first

### Issue: Domain shows as "Invalid" in Vercel

**Solutions:**
- Double-check DNS records match exactly what Vercel provided
- Ensure you saved DNS changes at your registrar
- Wait longer for DNS propagation (can take up to 48 hours)
- Clear your DNS cache or use a different network

### Issue: Domain works but shows "Not Secure" or SSL error

**Solutions:**
- Wait a bit longer - SSL certificates take time to provision
- Vercel automatically provisions SSL, but it can take 5-10 minutes after DNS verification
- Try accessing `https://crestfield.app` (not http)

### Issue: Domain redirects to old site or shows error

**Solutions:**
- Ensure your Vercel project is deployed and active
- Check that the domain is correctly assigned to the right project in Vercel
- Verify your `vercel.json` configuration is correct

### Issue: DNS propagation is slow

**Solutions:**
- This is normal - DNS changes can take 1-24 hours to propagate globally
- You can check propagation status using DNS checker tools
- Some registrars have faster propagation than others

### Issue: Can't find DNS settings in GoDaddy

**Solutions:**
- Go to [dcc.godaddy.com](https://dcc.godaddy.com) directly
- Click on your domain name
- Look for "DNS" tab or "DNS Management" link
- If you see "Nameservers" instead, you might need to use GoDaddy's nameservers (not recommended for Vercel)
- Make sure you're logged into the correct GoDaddy account that owns the domain

---

## 📝 Additional Configuration (Optional)

### Redirect www to non-www (or vice versa)

If you want to redirect `www.crestfield.app` to `crestfield.app` (or vice versa), you can add this to your `vercel.json`:

```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "build",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "redirects": [
    {
      "source": "/(.*)",
      "has": [
        {
          "type": "host",
          "value": "www.crestfield.app"
        }
      ],
      "destination": "https://crestfield.app/:path*",
      "permanent": true
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

---

## ✅ Checklist

- [ ] Added domain in Vercel dashboard
- [ ] Copied DNS records from Vercel
- [ ] Added DNS records at domain registrar
- [ ] Saved DNS changes
- [ ] Waited for DNS propagation (checked with DNS checker)
- [ ] Verified domain in Vercel dashboard (shows as "Valid")
- [ ] SSL certificate provisioned (automatic)
- [ ] Tested `https://crestfield.app` in browser
- [ ] Tested `https://www.crestfield.app` (if configured)

---

## 🎯 Quick Reference

**Vercel Dashboard**: [vercel.com/dashboard](https://vercel.com/dashboard)

**DNS Checker Tools**:
- [whatsmydns.net](https://www.whatsmydns.net)
- [dnschecker.org](https://dnschecker.org)

**Vercel Documentation**: [vercel.com/docs/concepts/projects/domains](https://vercel.com/docs/concepts/projects/domains)

---

## 💡 Pro Tips

1. **Use Vercel's DNS** (if available): Some registrars allow you to use Vercel as your DNS provider, which makes setup easier
2. **Add both www and non-www**: Consider adding both versions and redirecting one to the other for better SEO
3. **Monitor DNS propagation**: Use DNS checker tools to see when your changes have propagated globally
4. **Keep records**: Save a screenshot of your DNS configuration in case you need to reference it later

---

**Need Help?** If you encounter issues, check Vercel's documentation or their support team. The domain setup process is usually straightforward once DNS records are correctly configured!
