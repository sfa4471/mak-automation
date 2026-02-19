# Multi-Tenant SaaS Implementation - Quick Reference

## 🎯 Goal
Convert MAK Automation to support multiple companies (tenants), each with:
- Separate admin & technician users
- Custom logo
- Custom company address (on PDFs)
- Custom project numbering scheme

## 🌿 Branch Strategy

```bash
# Create working branch (DO NOT touch main)
git checkout -b feature/multi-tenant-saas
git push -u origin feature/multi-tenant-saas

# Work in this branch until ready
# Then merge to main when satisfied
```

## 📊 Database Changes Summary

### New Tables
1. **`tenants`** - Company information (logo path, address, numbering config)
2. **`tenant_settings`** - Flexible key-value settings per tenant
3. **`tenant_project_counters`** - Per-tenant project numbering

### Modified Tables (Add `tenant_id` column)
- `users`
- `projects`
- `workpackages`
- `tasks`
- `wp1_data`
- `proctor_data`
- `density_reports`
- `rebar_reports`
- `notifications`
- `task_history`
- `app_settings`

## 🔐 Authentication Changes

**JWT Token Now Includes:**
```json
{
  "id": 1,
  "email": "admin@example.com",
  "role": "ADMIN",
  "name": "John Doe",
  "tenantId": 1,  // NEW
  "tenantName": "MAK Lone Star"  // NEW
}
```

## 📝 Key Implementation Areas

### 1. Project Numbering
- **Location:** `server/routes/projects.js`
- **Function:** `generateProjectNumber(tenantId)`
- **Config:** Stored in `tenants` table (prefix, format)

### 2. Logo Management
- **Storage:** `server/public/tenants/{tenant_id}/logo.{ext}`
- **Upload:** New endpoint `POST /api/tenants/logo`
- **PDF:** Update `getLogoBase64(tenantId)` in `server/routes/pdf.js`

### 3. Company Address
- **Storage:** `tenants` table (address, city, state, zip, phone, email)
- **PDF:** New function `getTenantAddress(tenantId)` in `server/routes/pdf.js`
- **UI:** Add to Settings page

### 4. Data Isolation
- **Middleware:** All routes use `requireTenant` or extract `tenantId` from JWT
- **Queries:** All database queries filter by `tenant_id`
- **Validation:** Ensure resources belong to user's tenant

## 🚀 Implementation Phases

1. **Phase 1:** Database schema (Week 1-2)
2. **Phase 2:** Authentication & tenant context (Week 2-3)
3. **Phase 3:** Project numbering (Week 3-4)
4. **Phase 4:** Logo management (Week 4-5)
5. **Phase 5:** Company address (Week 5)
6. **Phase 6:** Frontend integration (Week 6)
7. **Phase 7:** Testing (Week 7)
8. **Phase 8:** Migration & deployment (Week 8)

## 🔄 Migration Strategy

1. Create default tenant (for existing data)
2. Add `tenant_id` columns (allow NULL initially)
3. Migrate existing data to default tenant
4. Make `tenant_id` required
5. Update all queries to filter by tenant

## ✅ Testing Checklist

- [ ] Users can only see their tenant's data
- [ ] Project numbers use tenant-specific format
- [ ] PDFs show tenant-specific logo
- [ ] PDFs show tenant-specific address
- [ ] Logo upload works
- [ ] Address update works
- [ ] Project numbering config works
- [ ] No data leakage between tenants

## 📁 Key Files to Modify

### Backend
- `server/routes/auth.js` - Add tenant to JWT
- `server/middleware/auth.js` - Extract tenant from token
- `server/middleware/tenant.js` - NEW: Tenant validation
- `server/routes/projects.js` - Tenant-aware project creation
- `server/routes/pdf.js` - Tenant-specific logo/address
- `server/routes/tenants.js` - NEW: Tenant management
- `server/db/index.js` - Tenant-aware queries

### Frontend
- `client/src/context/TenantContext.tsx` - NEW: Tenant context
- `client/src/components/admin/Settings.tsx` - Add tenant config
- `client/src/api/tenants.ts` - NEW: Tenant API

### Database
- `supabase/migrations/20250202000000_add_multi_tenancy.sql` - NEW: Migration script

## ⚠️ Critical Rules

1. **NEVER modify main branch directly**
2. **Always filter queries by `tenant_id`**
3. **Validate tenant ownership before operations**
4. **Test tenant isolation thoroughly**
5. **Backup database before migration**

## 📚 Full Documentation

See `MULTI_TENANT_SAAS_IMPLEMENTATION_PLAN.md` for complete details.
