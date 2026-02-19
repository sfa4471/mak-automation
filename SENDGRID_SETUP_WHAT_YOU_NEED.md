# SendGrid: What You Need to Provide

For the email verification / forgot-password / admin-invite features (branch database only), the app will use **SendGrid** to send emails. All configuration is via **environment variables** (e.g. in `.env.local`). **Do not commit real API keys.**

---

## Required

| What | Env variable | Where to get it |
|------|--------------|-----------------|
| **API key** | `SENDGRID_API_KEY` | SendGrid Dashboard → **Settings** → **API Keys** → **Create API Key**. Give it a name (e.g. "Mak Automation"). Under permissions, enable **Mail Send** (you can restrict to only that). Copy the key once; SendGrid won’t show it again. |
| **Sender email** | `SENDGRID_FROM_EMAIL` | The “From” address recipients see (e.g. `noreply@yourdomain.com` or `app@crestfield.com`). This address **must be verified** in SendGrid (see “Sender verification” below). |

---

## Optional

| What | Env variable | Example |
|------|--------------|---------|
| **Sender name** | `SENDGRID_FROM_NAME` | `"CrestField"` or `"Mak Automation"` (display name in inbox). |
| **Reply-to** | `SENDGRID_REPLY_TO` | `support@yourdomain.com` (where replies go). |

---

## Sender verification (SendGrid requirement)

SendGrid will not send until the **From** address is verified. Two options:

1. **Single Sender Verification**  
   - SendGrid → **Settings** → **Sender Authentication** → **Single Sender Verification**.  
   - Add the exact email you want to use for `SENDGRID_FROM_EMAIL`.  
   - SendGrid sends a verification link to that inbox; click it.  
   - Good for testing or if you don’t have a custom domain (e.g. use a Gmail you control).

2. **Domain Authentication** (recommended for production)  
   - SendGrid → **Settings** → **Sender Authentication** → **Domain Authentication**.  
   - Add your domain (e.g. `yourdomain.com`).  
   - SendGrid gives you DNS records (CNAME, etc.); add them at your DNS provider (GoDaddy, Cloudflare, etc.).  
   - After verification, any address at that domain (e.g. `noreply@yourdomain.com`) can be used as `SENDGRID_FROM_EMAIL`.

If you don’t have a domain yet, use Single Sender Verification with a Gmail or other email you control. You can switch to a custom domain later.

---

## Summary – what to give / put in env

1. **SENDGRID_API_KEY** – API key with Mail Send permission.  
2. **SENDGRID_FROM_EMAIL** – Verified sender or an address on a verified domain.  
3. (Optional) **SENDGRID_FROM_NAME** – e.g. `"CrestField"`.  
4. (Optional) **SENDGRID_REPLY_TO** – e.g. `support@yourdomain.com`.

Add these to `.env.local` (branch/dev); for production, add them to your hosting provider’s environment (e.g. Vercel, Railway) and never commit them.
