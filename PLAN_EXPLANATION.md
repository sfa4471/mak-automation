# Multi-Tenant SaaS Plan - Simple Explanation

## 🎯 What is This Plan About?

Right now, your software is built for **one company** (MAK Lone Star Consulting). This plan shows how to convert it so **multiple companies** can use it, each with their own:
- Admin users
- Technician users  
- Company logo
- Project numbering (like "02-2025-0001" vs "ABC-2025-0001")
- Company address (shown on PDFs)

Think of it like an apartment building: right now you have one apartment, but you want to build more apartments where each tenant has their own space, their own key, and their own decorations.

---

## 🏗️ The Big Picture: How It Works

### Current Situation (Single Tenant)
```
┌─────────────────────────────────┐
│   MAK Automation Application    │
│                                 │
│  ┌──────────────────────────┐   │
│  │  All Users               │   │
│  │  All Projects            │   │
│  │  One Logo                │   │
│  │  One Address             │   │
│  │  One Numbering Scheme    │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

### After Implementation (Multi-Tenant)
```
┌─────────────────────────────────────────────┐
│      MAK Automation SaaS Platform           │
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  Company A   │  │  Company B   │        │
│  │              │  │              │        │
│  │  • Admin A   │  │  • Admin B   │        │
│  │  • Tech A    │  │  • Tech B    │        │
│  │  • Logo A    │  │  • Logo B    │        │
│  │  • Address A │  │  • Address B │        │
│  │  • Format A  │  │  • Format B  │        │
│  └──────────────┘  └──────────────┘         │
│                                             │
│  Each company's data is completely          │
│  isolated - they can't see each other      │
└─────────────────────────────────────────────┘
```

---

## 📊 Part 1: Database Changes

### What's Happening?
We need to add a "tenant ID" (company ID) to every piece of data so the system knows which company it belongs to.

### New Tables Created:

1. **`tenants` Table** - Stores company information
   - Company name
   - Company address (street, city, state, zip, phone, email)
   - Logo file path
   - Project numbering settings (prefix like "02", format like "PREFIX-YYYY-NNNN")

2. **`tenant_settings` Table** - Flexible settings storage
   - Key-value pairs for any custom settings per company
   - Example: "email_signature" = "Best regards, Company A"

3. **`tenant_project_counters` Table** - Project numbering per company
   - Each company has their own counter
   - Company A: 02-2025-0001, 02-2025-0002...
   - Company B: ABC-2025-0001, ABC-2025-0002...

### Existing Tables Modified:
Every table gets a new column: `tenant_id`

- `users` → `tenant_id` (which company does this user belong to?)
- `projects` → `tenant_id` (which company owns this project?)
- `tasks` → `tenant_id` (which company's task is this?)
- `wp1_data` → `tenant_id` (which company's report data?)
- And so on for all tables...

**Why?** So when Company A logs in, they only see Company A's data. Company B can't see Company A's projects, users, or anything else.

---

## 🔐 Part 2: Authentication & Security

### How Login Changes:

**Before:**
```json
{
  "id": 1,
  "email": "admin@mak.com",
  "role": "ADMIN"
}
```

**After:**
```json
{
  "id": 1,
  "email": "admin@mak.com",
  "role": "ADMIN",
  "tenantId": 1,        // NEW: Which company?
  "tenantName": "MAK"   // NEW: Company name
}
```

### How It Works:
1. User logs in with email/password
2. System checks: "Which company does this user belong to?"
3. System includes company ID in the security token (JWT)
4. Every request automatically filters by company ID
5. User can ONLY see their company's data

**Example:**
- Admin from Company A logs in → Gets `tenantId: 1`
- When they request projects → System only returns projects where `tenant_id = 1`
- They can't see Company B's projects (even if they try to hack the URL)

---

## 🔢 Part 3: Project Numbering

### Current System:
- All projects use: `02-YYYY-NNNN` (like "02-2025-0001")
- One counter for everyone

### New System:
- **Company A** might use: `02-YYYY-NNNN` → "02-2025-0001"
- **Company B** might use: `ABC-YYYY-NNNN` → "ABC-2025-0001"
- **Company C** might use: `XYZ-NNNN-YYYY` → "XYZ-0001-2025"

### How It Works:
1. Each company configures their prefix and format in Settings
2. When creating a project:
   - System looks up company's numbering settings
   - Gets the next number from that company's counter
   - Generates project number using company's format
3. Each company has their own counter (stored in `tenant_project_counters`)

---

## 🖼️ Part 4: Logo Management

### Current System:
- One logo file: `server/public/MAK logo_consulting.jpg`
- Same logo for everyone

### New System:
- Each company uploads their own logo
- Stored in: `server/public/tenants/{company_id}/logo.jpg`
- When generating PDFs, system uses that company's logo

### How It Works:
1. Admin goes to Settings page
2. Clicks "Upload Logo"
3. System saves logo to company's folder
4. When generating PDFs:
   - System checks: "Which company is this user from?"
   - Loads that company's logo
   - Embeds it in the PDF

---

## 📍 Part 5: Company Address

### Current System:
- Address is probably hardcoded or in one place
- Same address on all PDFs

### New System:
- Each company has their own address stored in `tenants` table
- When generating PDFs, system uses that company's address

### How It Works:
1. Admin goes to Settings page
2. Enters company address (street, city, state, zip, phone, email)
3. When generating PDFs:
   - System gets company's address from database
   - Replaces `{{COMPANY_ADDRESS}}` placeholder in PDF template
   - Each company's PDF shows their own address

---

## 📄 Part 6: PDF Generation Updates

### What Changes:
All PDF generation code needs to:
1. Get the user's company ID from their login token
2. Load that company's logo
3. Load that company's address
4. Use those in the PDF template

### Example Flow:
```
User requests PDF for project 123
  ↓
System checks: User's tenantId = 1
  ↓
Load Company 1's logo from: /tenants/1/logo.jpg
Load Company 1's address from: tenants table
  ↓
Generate PDF with Company 1's logo and address
  ↓
Return PDF to user
```

---

## 🎨 Part 7: Frontend Changes

### New Components:

1. **TenantContext** - React context that provides company information
   - Available throughout the app
   - Components can access: "What company am I part of?"

2. **Settings Page Updates** - New sections:
   - **Company Information**: Edit address, phone, email
   - **Logo Management**: Upload/remove logo, preview
   - **Project Numbering**: Configure prefix and format, preview next number

### User Experience:
- Admin logs in → Sees their company's logo in header
- Admin goes to Settings → Can configure their company's branding
- When creating project → Uses their company's numbering format
- When viewing PDF → Shows their company's logo and address

---

## 🔄 Part 8: Migration Strategy

### The Problem:
You already have data in your database (users, projects, etc.). How do we convert it?

### The Solution:

**Step 1:** Create a "default tenant" (for your existing data)
```sql
INSERT INTO tenants (name) VALUES ('MAK Lone Star Consulting');
-- This creates tenant ID = 1
```

**Step 2:** Add `tenant_id` columns to all tables (allow NULL temporarily)

**Step 3:** Assign all existing data to the default tenant
```sql
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
-- etc. for all tables
```

**Step 4:** Make `tenant_id` required (no more NULL allowed)

**Result:** All your existing data now belongs to "MAK Lone Star Consulting" tenant, and everything still works!

---

## 🌿 Part 9: Branch Strategy

### Why This Matters:
You don't want to break your current working code!

### The Approach:
```
main branch (current code - DON'T TOUCH)
  │
  └── feature/multi-tenant-saas (working branch)
       │
       └── All new code goes here
```

### Workflow:
1. Create new branch: `feature/multi-tenant-saas`
2. Make all changes in that branch
3. Test thoroughly
4. When happy, merge to `main`
5. If something breaks, just delete the branch - `main` is safe!

---

## 📅 Part 10: Implementation Phases (8 Weeks)

### Phase 1: Foundation (Week 1-2)
- Create database tables
- Add `tenant_id` columns
- Create default tenant
- **Result:** Database ready for multi-tenancy

### Phase 2: Authentication (Week 2-3)
- Update login to include company ID
- Add security checks
- **Result:** Users are tied to companies

### Phase 3: Project Numbering (Week 3-4)
- Per-company numbering system
- Settings UI for configuration
- **Result:** Each company has their own project numbers

### Phase 4: Logo Management (Week 4-5)
- Logo upload functionality
- Logo display in PDFs
- **Result:** Each company can use their own logo

### Phase 5: Company Address (Week 5)
- Address storage and management
- Address in PDFs
- **Result:** Each company's address on their PDFs

### Phase 6: Frontend (Week 6)
- Settings page updates
- Tenant context throughout app
- **Result:** Complete user interface

### Phase 7: Testing (Week 7)
- Test everything
- Fix bugs
- **Result:** Everything works perfectly

### Phase 8: Deployment (Week 8)
- Migrate existing data
- Deploy to production
- **Result:** Live multi-tenant system!

---

## ✅ What Success Looks Like

### Scenario 1: Company A
- Admin logs in → Sees only Company A's projects
- Creates project → Gets "02-2025-0001" (Company A's format)
- Generates PDF → Shows Company A's logo and address

### Scenario 2: Company B
- Admin logs in → Sees only Company B's projects (can't see Company A's)
- Creates project → Gets "ABC-2025-0001" (Company B's format)
- Generates PDF → Shows Company B's logo and address

### Scenario 3: Data Isolation
- Company A admin tries to access Company B's project → **BLOCKED** (403 error)
- Company A technician can only see Company A's tasks
- Complete data separation

---

## 🛡️ Security & Safety

### Data Isolation:
- Every database query filters by `tenant_id`
- Users can't access other companies' data
- Even if they try to hack URLs, the system blocks them

### Migration Safety:
- Full database backup before migration
- Test migration on copy of data first
- Rollback plan if something goes wrong

### Code Safety:
- Work in separate branch
- Main branch stays untouched
- Can always revert if needed

---

## 🎯 Key Takeaways

1. **One Database, Multiple Companies**: All companies share the same database, but data is separated by `tenant_id`

2. **Complete Isolation**: Company A can't see Company B's data, even accidentally

3. **Customization Per Company**: Each company can have their own logo, address, and project numbering

4. **Safe Migration**: Your existing data becomes "Company 1" and continues working

5. **Safe Development**: All work happens in a separate branch, main code stays safe

6. **Phased Approach**: 8 weeks, one phase at a time, test as you go

---

## ❓ Common Questions

**Q: Will my existing data be lost?**  
A: No! All existing data becomes "Company 1" and continues working exactly as before.

**Q: Can I test this without breaking my current system?**  
A: Yes! Work in the `feature/multi-tenant-saas` branch. Your main branch stays untouched.

**Q: What if something goes wrong?**  
A: You can always delete the branch and go back to main. Or restore from database backup.

**Q: How long will this take?**  
A: Plan estimates 8 weeks, but you can go faster or slower depending on your needs.

**Q: Can I add more companies later?**  
A: Yes! Once the system is built, adding new companies is just creating a new row in the `tenants` table.

---

## 📚 Next Steps

1. **Review this explanation** - Make sure you understand the approach
2. **Review the full plan** - See `MULTI_TENANT_SAAS_IMPLEMENTATION_PLAN.md` for technical details
3. **Create the branch** - `git checkout -b feature/multi-tenant-saas`
4. **Start Phase 1** - Begin with database schema changes
5. **Test as you go** - Don't wait until the end to test!

---

**Remember:** This is a big change, but it's broken down into manageable pieces. Take it one phase at a time, test thoroughly, and you'll have a professional multi-tenant SaaS system!
