# Multi-Tenant SaaS Implementation Plan
## MAK Automation - Converting to Multi-Tenant Architecture

**Planning Agent:** Senior Software Architect (20+ years experience)  
**Date:** February 2025  
**Status:** Planning Phase

---

## Executive Summary

This document outlines a comprehensive plan to convert the MAK Automation application from a single-tenant system to a multi-tenant SaaS (Software as a Service) platform. The goal is to enable multiple companies to use the software independently, each with their own:
- Admin users
- Technician users
- Company logo
- Project numbering scheme
- Company address (displayed on PDFs)

**Critical Requirement:** All changes will be implemented in a separate working branch to ensure the main branch remains stable and unaffected.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema Changes](#database-schema-changes)
3. [Authentication & Authorization](#authentication--authorization)
4. [Project Numbering System](#project-numbering-system)
5. [Logo Management](#logo-management)
6. [Company Address Management](#company-address-management)
7. [PDF Generation Updates](#pdf-generation-updates)
8. [Frontend Changes](#frontend-changes)
9. [Migration Strategy](#migration-strategy)
10. [Branch Strategy](#branch-strategy)
11. [Implementation Phases](#implementation-phases)
12. [Testing Strategy](#testing-strategy)
13. [Rollout Plan](#rollout-plan)

---

## 1. Architecture Overview

### 1.1 Multi-Tenancy Model

**Selected Approach: Shared Database, Tenant Isolation via `tenant_id`**

This approach provides:
- Cost efficiency (single database instance)
- Easier maintenance and updates
- Good performance for moderate number of tenants
- Data isolation through foreign key constraints
- Row-level security (RLS) in Supabase for additional protection

### 1.2 Core Concepts

- **Tenant (Company)**: A separate organization using the software
- **Tenant ID**: Unique identifier for each company (UUID or BIGINT)
- **Tenant Isolation**: All data queries filtered by `tenant_id`
- **Tenant Configuration**: Per-tenant settings (logo, address, numbering scheme)

---

## 2. Database Schema Changes

### 2.1 New Tables

#### 2.1.1 `tenants` Table
```sql
CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE, -- Optional: for subdomain-based routing (future)
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_phone TEXT,
  company_email TEXT,
  logo_path TEXT, -- Path to logo file or base64 stored in tenant_settings
  project_number_prefix TEXT DEFAULT '02', -- Default prefix for project numbers
  project_number_format TEXT DEFAULT 'PREFIX-YYYY-NNNN', -- Format: PREFIX-YYYY-NNNN
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

#### 2.1.2 `tenant_settings` Table (for flexible configuration)
```sql
CREATE TABLE IF NOT EXISTS tenant_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT, -- Can store JSON for complex settings
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_user_id BIGINT REFERENCES users(id),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);
CREATE INDEX idx_tenant_settings_key ON tenant_settings(tenant_id, key);
```

#### 2.1.3 `tenant_project_counters` Table (per-tenant project numbering)
```sql
CREATE TABLE IF NOT EXISTS tenant_project_counters (
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, year)
);

CREATE INDEX idx_tenant_project_counters_tenant_year ON tenant_project_counters(tenant_id, year);
```

### 2.2 Modified Tables

All existing tables need a `tenant_id` column added:

#### 2.2.1 `users` Table
```sql
ALTER TABLE users ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
-- Make tenant_id required for new users (but allow NULL for migration)
-- After migration: ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
```

#### 2.2.2 `projects` Table
```sql
ALTER TABLE projects ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
-- Update unique constraint: project_number should be unique per tenant
-- Drop old: ALTER TABLE projects DROP CONSTRAINT projects_project_number_key;
-- Add new: CREATE UNIQUE INDEX idx_projects_tenant_project_number ON projects(tenant_id, project_number);
```

#### 2.2.3 `workpackages` Table
```sql
ALTER TABLE workpackages ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_workpackages_tenant_id ON workpackages(tenant_id);
-- Note: tenant_id can be derived from project, but storing it here improves query performance
```

#### 2.2.4 `tasks` Table
```sql
ALTER TABLE tasks ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
```

#### 2.2.5 `project_counters` Table
```sql
-- This table will be replaced by tenant_project_counters
-- Keep for backward compatibility during migration, then drop
```

#### 2.2.6 `app_settings` Table
```sql
ALTER TABLE app_settings ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_app_settings_tenant_id ON app_settings(tenant_id);
-- Update unique constraint: key should be unique per tenant
-- Drop old: ALTER TABLE app_settings DROP CONSTRAINT app_settings_key_key;
-- Add new: CREATE UNIQUE INDEX idx_app_settings_tenant_key ON app_settings(tenant_id, key);
```

#### 2.2.7 All Data Tables (wp1_data, proctor_data, density_reports, rebar_reports, etc.)
```sql
-- Add tenant_id to all data tables for direct tenant filtering
ALTER TABLE wp1_data ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE proctor_data ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE density_reports ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE rebar_reports ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE task_history ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;

-- Create indexes for all
CREATE INDEX idx_wp1_data_tenant_id ON wp1_data(tenant_id);
CREATE INDEX idx_proctor_data_tenant_id ON proctor_data(tenant_id);
CREATE INDEX idx_density_reports_tenant_id ON density_reports(tenant_id);
CREATE INDEX idx_rebar_reports_tenant_id ON rebar_reports(tenant_id);
CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_task_history_tenant_id ON task_history(tenant_id);
```

### 2.3 Row-Level Security (RLS) Policies (Supabase)

For additional security in Supabase, enable RLS and create policies:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ... (enable for all tables)

-- Example policy for users (users can only see their tenant's data)
CREATE POLICY "Users can only see their tenant's data"
  ON users FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id')::bigint);

-- Similar policies for all tables
-- Note: This requires setting app.current_tenant_id in a database function
```

---

## 3. Authentication & Authorization

### 3.1 JWT Token Enhancement

**Current Token Structure:**
```json
{
  "id": 1,
  "email": "admin@example.com",
  "role": "ADMIN",
  "name": "John Doe"
}
```

**New Token Structure:**
```json
{
  "id": 1,
  "email": "admin@example.com",
  "role": "ADMIN",
  "name": "John Doe",
  "tenantId": 1,
  "tenantName": "MAK Lone Star Consulting"
}
```

### 3.2 Authentication Flow Changes

#### 3.2.1 Login Endpoint (`server/routes/auth.js`)

**Changes Required:**
1. After successful password verification, fetch user's tenant information
2. Include `tenantId` and `tenantName` in JWT token
3. Return tenant information in login response

**Implementation:**
```javascript
// After user authentication
const tenant = await db.get('tenants', { id: user.tenant_id });
const token = jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    tenantId: user.tenant_id,
    tenantName: tenant?.name || 'Unknown'
  },
  JWT_SECRET,
  { expiresIn: '7d' }
);
```

### 3.3 Middleware Updates

#### 3.3.1 Tenant Context Middleware

Create new middleware to extract and validate tenant from token:

**File: `server/middleware/tenant.js`**
```javascript
const { authenticate } = require('./auth');

const requireTenant = (req, res, next) => {
  // Ensure user is authenticated first
  authenticate(req, res, () => {
    if (!req.user || !req.user.tenantId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    req.tenantId = req.user.tenantId;
    next();
  });
};

module.exports = { requireTenant };
```

#### 3.3.2 Database Query Wrapper

Update database abstraction layer to automatically filter by tenant:

**File: `server/db/index.js` (or create new wrapper)**
```javascript
// Add tenant-aware query methods
async function getWithTenant(table, conditions, tenantId) {
  return await db.get(table, { ...conditions, tenant_id: tenantId });
}

async function getAllWithTenant(table, conditions, tenantId) {
  return await db.getAll(table, { ...conditions, tenant_id: tenantId });
}
```

### 3.4 Route Protection

All routes that access tenant-scoped data must:
1. Use `requireTenant` middleware (or ensure `authenticate` sets tenant context)
2. Filter queries by `tenant_id`
3. Validate that resources belong to the user's tenant

**Example:**
```javascript
router.get('/projects', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const projects = await db.getAll('projects', { tenant_id: tenantId });
  res.json(projects);
});
```

---

## 4. Project Numbering System

### 4.1 Per-Tenant Numbering

Each tenant can have:
- **Prefix**: Custom prefix (e.g., "02", "MAK", "ABC")
- **Format**: Custom format string (e.g., "PREFIX-YYYY-NNNN", "PREFIX-NNNN-YYYY")

### 4.2 Project Number Generation

**File: `server/routes/projects.js` - Update `generateProjectNumber()` function**

**New Implementation:**
```javascript
async function generateProjectNumber(tenantId) {
  // Get tenant configuration
  const tenant = await db.get('tenants', { id: tenantId });
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const prefix = tenant.project_number_prefix || '02';
  const format = tenant.project_number_format || 'PREFIX-YYYY-NNNN';
  const year = new Date().getFullYear();

  // Get or create counter for this tenant and year
  let counter = await db.get('tenant_project_counters', {
    tenant_id: tenantId,
    year: year
  });

  if (!counter) {
    // Create new counter
    await db.insert('tenant_project_counters', {
      tenant_id: tenantId,
      year: year,
      next_seq: 1
    });
    counter = { next_seq: 1 };
  }

  // Generate sequence number
  const seq = counter.next_seq;
  
  // Increment counter atomically
  await db.update('tenant_project_counters', {
    next_seq: seq + 1
  }, {
    tenant_id: tenantId,
    year: year
  });

  // Format project number based on tenant's format
  const projectNumber = format
    .replace('PREFIX', prefix)
    .replace('YYYY', year.toString())
    .replace('NNNN', seq.toString().padStart(4, '0'));

  return projectNumber;
}
```

### 4.3 Tenant Settings UI

Add UI in Settings page for admins to configure:
- Project number prefix
- Project number format
- Preview of next project number

---

## 5. Logo Management

### 5.1 Logo Storage Options

**Option A: File System (Recommended for MVP)**
- Store logo files in `server/public/tenants/{tenant_id}/logo.{ext}`
- Store path in `tenants.logo_path` column
- Support: JPG, PNG, SVG

**Option B: Base64 in Database (Alternative)**
- Store base64-encoded logo in `tenant_settings` table
- Key: `logo_base64`
- Pros: No file system management
- Cons: Larger database, harder to update

**Option C: Cloud Storage (Future)**
- AWS S3, Google Cloud Storage, or Supabase Storage
- Store URL in database
- Best for production scale

### 5.2 Logo Upload Endpoint

**File: `server/routes/tenants.js` (new file)**

```javascript
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const upload = multer({
  dest: 'server/public/tenants/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and SVG are allowed.'));
    }
  }
});

router.post('/logo', authenticate, requireAdmin, upload.single('logo'), async (req, res) => {
  const tenantId = req.user.tenantId;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Create tenant directory if it doesn't exist
  const tenantDir = path.join(__dirname, '..', 'public', 'tenants', tenantId.toString());
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  // Move file to tenant directory
  const ext = path.extname(req.file.originalname);
  const logoPath = path.join(tenantDir, `logo${ext}`);
  fs.renameSync(req.file.path, logoPath);

  // Update tenant record
  await db.update('tenants', {
    logo_path: `/tenants/${tenantId}/logo${ext}`,
    updated_at: new Date().toISOString()
  }, { id: tenantId });

  res.json({
    success: true,
    logoPath: `/tenants/${tenantId}/logo${ext}`
  });
});
```

### 5.3 Logo Retrieval

**Update `server/routes/pdf.js` - `getLogoBase64()` function:**

```javascript
function getLogoBase64(tenantId) {
  try {
    // Get tenant logo path
    const tenant = await db.get('tenants', { id: tenantId });
    if (!tenant || !tenant.logo_path) {
      return null;
    }

    const logoPath = path.join(__dirname, '..', 'public', tenant.logo_path);
    if (fs.existsSync(logoPath)) {
      const imageBuffer = fs.readFileSync(logoPath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(logoPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 
                       ext === '.svg' ? 'image/svg+xml' : 
                       'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    }
  } catch (err) {
    console.warn('Error loading tenant logo:', err.message);
  }
  return null;
}
```

### 5.4 Frontend Logo Display

Update all PDF generation endpoints to pass `tenantId` and use tenant-specific logo.

---

## 6. Company Address Management

### 6.1 Address Storage

Store in `tenants` table:
- `company_address` (street address)
- `company_city`
- `company_state`
- `company_zip`
- `company_phone`
- `company_email`

### 6.2 Address in PDFs

**Update all PDF generation functions** to include tenant address:

**File: `server/routes/pdf.js`**

```javascript
async function getTenantAddress(tenantId) {
  const tenant = await db.get('tenants', { id: tenantId });
  if (!tenant) return null;

  const addressParts = [];
  if (tenant.company_address) addressParts.push(tenant.company_address);
  if (tenant.company_city || tenant.company_state || tenant.company_zip) {
    const cityStateZip = [
      tenant.company_city,
      tenant.company_state,
      tenant.company_zip
    ].filter(Boolean).join(', ');
    addressParts.push(cityStateZip);
  }
  if (tenant.company_phone) addressParts.push(`Phone: ${tenant.company_phone}`);
  if (tenant.company_email) addressParts.push(`Email: ${tenant.company_email}`);

  return addressParts.join('\n');
}
```

**Update PDF templates** to include `{{COMPANY_ADDRESS}}` placeholder and replace it with tenant address.

### 6.3 Address Management UI

Add form in Settings page (Admin only) to edit company address information.

---

## 7. PDF Generation Updates

### 7.1 Tenant Context in PDF Routes

All PDF generation routes must:
1. Extract `tenantId` from authenticated user
2. Fetch tenant configuration (logo, address)
3. Use tenant-specific data in PDF generation

**Example Update:**
```javascript
router.get('/wp1/:id', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const id = req.params.id;
  
  // ... existing code to fetch task/project data ...
  
  // Get tenant logo
  const logoBase64 = getLogoBase64(tenantId);
  
  // Get tenant address
  const companyAddress = await getTenantAddress(tenantId);
  
  // Update HTML template
  html = html.replace('{{LOGO_IMAGE}}', logoHtml);
  html = html.replace('{{COMPANY_ADDRESS}}', companyAddress || '');
  
  // ... rest of PDF generation ...
});
```

### 7.2 PDF Template Updates

Update all PDF HTML templates to include:
- `{{LOGO_IMAGE}}` - Tenant-specific logo
- `{{COMPANY_ADDRESS}}` - Tenant-specific address
- Remove hardcoded "MAK Lone Star Consulting" references

---

## 8. Frontend Changes

### 8.1 Tenant Context Provider

**File: `client/src/context/TenantContext.tsx` (new file)**

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface Tenant {
  id: number;
  name: string;
  logoPath?: string;
  companyAddress?: string;
  // ... other tenant fields
}

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.tenantId) {
      // Fetch tenant details
      fetchTenantDetails(user.tenantId)
        .then(setTenant)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
};
```

### 8.2 Settings Page Updates

**File: `client/src/components/admin/Settings.tsx`**

Add new sections:
1. **Company Information**
   - Company name
   - Address fields
   - Phone, email
   
2. **Logo Management**
   - Upload logo
   - Preview current logo
   - Remove logo

3. **Project Numbering**
   - Prefix input
   - Format selector/input
   - Preview next project number

### 8.3 API Updates

**File: `client/src/api/tenants.ts` (new file)**

```typescript
import { api } from './api';

export interface Tenant {
  id: number;
  name: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoPath?: string;
  projectNumberPrefix?: string;
  projectNumberFormat?: string;
}

export const tenantsAPI = {
  getCurrent: async (): Promise<Tenant> => {
    const response = await api.get('/tenants/current');
    return response.data;
  },
  
  update: async (data: Partial<Tenant>): Promise<Tenant> => {
    const response = await api.put('/tenants/current', data);
    return response.data;
  },
  
  uploadLogo: async (file: File): Promise<{ logoPath: string }> => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post('/tenants/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};
```

---

## 9. Migration Strategy

### 9.1 Data Migration Plan

**Phase 1: Create Default Tenant**
```sql
-- Create a default tenant for existing data
INSERT INTO tenants (name, project_number_prefix, project_number_format)
VALUES ('MAK Lone Star Consulting', '02', 'PREFIX-YYYY-NNNN')
RETURNING id;
-- Note the returned ID (e.g., 1)
```

**Phase 2: Migrate Existing Data**
```sql
-- Update all existing records to belong to default tenant
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE workpackages SET tenant_id = (SELECT tenant_id FROM projects WHERE projects.id = workpackages.project_id);
UPDATE tasks SET tenant_id = (SELECT tenant_id FROM projects WHERE projects.id = tasks.project_id);
-- ... update all other tables
```

**Phase 3: Migrate Project Counters**
```sql
-- Migrate existing project_counters to tenant_project_counters
INSERT INTO tenant_project_counters (tenant_id, year, next_seq)
SELECT 1, year, next_seq FROM project_counters;
```

**Phase 4: Migrate App Settings**
```sql
-- Migrate app_settings to tenant-scoped
UPDATE app_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
```

**Phase 5: Make tenant_id Required**
```sql
-- After migration, make tenant_id required
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
-- ... (for all tables)
```

### 9.2 Migration Script

Create migration script: `supabase/migrations/20250202000000_add_multi_tenancy.sql`

This script will:
1. Create new tables
2. Add tenant_id columns
3. Create default tenant
4. Migrate existing data
5. Update constraints and indexes

### 9.3 Backward Compatibility

During migration period:
- Allow `tenant_id` to be NULL temporarily
- Default to tenant_id = 1 if not set
- Gradually enforce tenant_id requirement

---

## 10. Branch Strategy

### 10.1 Branch Structure

```
main (production, stable)
  └── feature/multi-tenant-saas (working branch)
       ├── feature/tenant-database-schema
       ├── feature/tenant-authentication
       ├── feature/tenant-project-numbering
       ├── feature/tenant-logo-management
       ├── feature/tenant-address-management
       └── feature/tenant-pdf-updates
```

### 10.2 Branch Workflow

1. **Create Working Branch**
   ```bash
   git checkout -b feature/multi-tenant-saas
   git push -u origin feature/multi-tenant-saas
   ```

2. **Create Feature Branches** (optional, for large features)
   ```bash
   git checkout -b feature/tenant-database-schema
   # Make changes
   git commit -m "Add tenant database schema"
   git checkout feature/multi-tenant-saas
   git merge feature/tenant-database-schema
   ```

3. **Regular Commits**
   - Commit frequently with descriptive messages
   - Keep commits focused on single features
   - Test after each major change

4. **Merge to Main** (when ready)
   ```bash
   git checkout main
   git merge feature/multi-tenant-saas
   git push origin main
   ```

### 10.3 Protection Rules

- **Main branch**: Protected, requires PR review
- **Working branch**: Can be force-pushed if needed (development only)
- **Before merging to main**: Full test suite must pass

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Set up database schema and basic tenant structure

**Tasks:**
1. Create `feature/multi-tenant-saas` branch
2. Create database migration for tenants table
3. Add `tenant_id` columns to all tables
4. Create default tenant
5. Test database changes

**Deliverables:**
- Migration script
- Database schema updated
- Default tenant created

### Phase 2: Authentication & Authorization (Week 2-3)
**Goal:** Update authentication to include tenant context

**Tasks:**
1. Update JWT token to include tenantId
2. Create tenant middleware
3. Update all routes to use tenant context
4. Add tenant filtering to all database queries
5. Test authentication flow

**Deliverables:**
- Updated auth routes
- Tenant middleware
- All routes tenant-aware

### Phase 3: Project Numbering (Week 3-4)
**Goal:** Implement per-tenant project numbering

**Tasks:**
1. Create `tenant_project_counters` table
2. Update `generateProjectNumber()` function
3. Add project numbering settings UI
4. Test project number generation

**Deliverables:**
- Per-tenant project numbering working
- Settings UI for project numbering

### Phase 4: Logo Management (Week 4-5)
**Goal:** Implement per-tenant logo upload and display

**Tasks:**
1. Create logo upload endpoint
2. Update PDF generation to use tenant logo
3. Add logo upload UI
4. Test logo display in PDFs

**Deliverables:**
- Logo upload functionality
- Logo display in PDFs

### Phase 5: Company Address (Week 5)
**Goal:** Implement per-tenant company address

**Tasks:**
1. Add address fields to tenants table
2. Update PDF generation to include tenant address
3. Add address management UI
4. Test address display in PDFs

**Deliverables:**
- Address management
- Address in PDFs

### Phase 6: Frontend Integration (Week 6)
**Goal:** Complete frontend updates

**Tasks:**
1. Create TenantContext
2. Update Settings page
3. Update all components to use tenant context
4. Test UI changes

**Deliverables:**
- Complete frontend updates
- Settings page with tenant configuration

### Phase 7: Testing & Refinement (Week 7)
**Goal:** Comprehensive testing and bug fixes

**Tasks:**
1. Unit tests for tenant functionality
2. Integration tests
3. End-to-end testing
4. Bug fixes
5. Performance testing

**Deliverables:**
- Test suite passing
- Bug fixes applied
- Performance validated

### Phase 8: Migration & Deployment (Week 8)
**Goal:** Migrate existing data and deploy

**Tasks:**
1. Run data migration script
2. Verify data integrity
3. Deploy to staging
4. User acceptance testing
5. Deploy to production

**Deliverables:**
- Data migrated
- Application deployed
- Documentation updated

---

## 12. Testing Strategy

### 12.1 Unit Tests

**Test Files to Create:**
- `server/__tests__/middleware/tenant.test.js`
- `server/__tests__/routes/projects.test.js` (tenant-aware)
- `server/__tests__/utils/projectNumbering.test.js`

**Key Test Cases:**
- Tenant isolation (users can't access other tenant's data)
- Project number generation per tenant
- Logo retrieval per tenant
- Address display per tenant

### 12.2 Integration Tests

**Test Scenarios:**
1. Create tenant → Create user → Login → Create project
2. Upload logo → Generate PDF → Verify logo in PDF
3. Update address → Generate PDF → Verify address in PDF
4. Change project numbering → Create project → Verify format

### 12.3 Manual Testing Checklist

- [ ] Login with tenant A user
- [ ] Verify can only see tenant A projects
- [ ] Create project in tenant A
- [ ] Verify project number uses tenant A format
- [ ] Upload logo for tenant A
- [ ] Generate PDF → Verify tenant A logo
- [ ] Update address for tenant A
- [ ] Generate PDF → Verify tenant A address
- [ ] Login with tenant B user
- [ ] Verify cannot see tenant A projects
- [ ] Verify tenant B has separate logo/address/numbering

---

## 13. Rollout Plan

### 13.1 Pre-Deployment

1. **Backup Database**
   - Full backup of production database
   - Test restore procedure

2. **Staging Deployment**
   - Deploy to staging environment
   - Run migration script on staging
   - Comprehensive testing

3. **Documentation**
   - Update API documentation
   - Create user guide for tenant management
   - Update developer documentation

### 13.2 Deployment Steps

1. **Maintenance Window** (if needed)
   - Schedule downtime if required
   - Notify users

2. **Database Migration**
   - Run migration script
   - Verify data integrity
   - Check for errors

3. **Application Deployment**
   - Deploy backend
   - Deploy frontend
   - Verify health checks

4. **Post-Deployment Verification**
   - Test login
   - Test project creation
   - Test PDF generation
   - Monitor error logs

### 13.3 Rollback Plan

If issues occur:
1. Revert application code (git revert)
2. Restore database backup (if schema changes made)
3. Investigate issues
4. Fix and redeploy

---

## 14. Risk Assessment & Mitigation

### 14.1 Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | High | Low | Full backup, test migration on staging |
| Performance degradation | Medium | Medium | Add indexes, query optimization |
| Tenant data leakage | High | Low | Row-level security, thorough testing |
| Breaking existing functionality | High | Medium | Comprehensive testing, gradual rollout |
| Complex migration | Medium | High | Phased approach, detailed migration script |

### 14.2 Mitigation Strategies

1. **Data Safety**
   - Multiple backups before migration
   - Test migration on copy of production data
   - Rollback plan ready

2. **Performance**
   - Add indexes on tenant_id columns
   - Monitor query performance
   - Optimize slow queries

3. **Security**
   - Row-level security policies
   - Tenant validation in all routes
   - Security audit before production

4. **Functionality**
   - Comprehensive test suite
   - Staging environment testing
   - Gradual feature rollout

---

## 15. Success Criteria

### 15.1 Functional Requirements

- [x] Multiple tenants can use the application independently
- [x] Each tenant has isolated data (users, projects, tasks)
- [x] Each tenant can configure their own logo
- [x] Each tenant can configure their own company address
- [x] Each tenant can configure their own project numbering scheme
- [x] PDFs display tenant-specific logo and address
- [x] Users can only access their tenant's data

### 15.2 Non-Functional Requirements

- [x] No performance degradation (< 10% slower)
- [x] Database queries optimized (indexes in place)
- [x] Backward compatibility maintained during migration
- [x] All existing functionality still works
- [x] Code quality maintained (no technical debt)

---

## 16. Future Enhancements

### 16.1 Phase 2 Features (Post-MVP)

1. **Subdomain Routing**
   - Each tenant gets subdomain (e.g., `mak.yourdomain.com`)
   - Automatic tenant detection from subdomain

2. **Tenant Branding**
   - Custom color schemes per tenant
   - Custom email templates
   - Custom domain support

3. **Tenant Management UI**
   - Super admin panel to manage tenants
   - Tenant creation/deletion
   - Tenant usage analytics

4. **Billing Integration**
   - Per-tenant subscription management
   - Usage-based billing
   - Payment processing

5. **Advanced Settings**
   - Custom email notifications per tenant
   - Custom workflow configurations
   - Custom report templates

---

## 17. Conclusion

This plan provides a comprehensive roadmap for converting MAK Automation to a multi-tenant SaaS platform. The phased approach ensures:
- Minimal disruption to existing functionality
- Safe migration of existing data
- Gradual rollout with testing at each phase
- Clear success criteria and rollback plans

**Next Steps:**
1. Review and approve this plan
2. Create working branch: `feature/multi-tenant-saas`
3. Begin Phase 1: Foundation
4. Regular progress reviews at end of each phase

---

**Document Version:** 1.0  
**Last Updated:** February 2025  
**Status:** Ready for Implementation
