# Multi-Tenant SaaS Implementation Plan
## MAK Automation → Multi-Tenant SaaS Platform

**Planning Agent:** Senior Software Architect (20+ years experience)  
**Date:** February 2025  
**Status:** Planning Phase - Ready for Review  
**Version:** 2.0

---

## Executive Summary

This document provides a comprehensive, production-ready plan to transform the MAK Automation application from a single-tenant system into a multi-tenant SaaS platform. The transformation will enable multiple companies to use the software independently, each with:

- **Isolated user management** (separate admins and technicians per company)
- **Custom branding** (company logos, colors, addresses)
- **Customized workflows** (task status flows, approval processes, notification rules)
- **Independent project numbering** (custom prefixes and formats)
- **Tenant-specific configurations** (folder paths, PDF templates, email settings)

**Critical Success Factors:**
1. **Zero disruption** to MAK's current operations during development
2. **Thorough testing** with MAK before exposing to other companies
3. **Feedback-driven iteration** based on real-world usage
4. **Safe deployment** using branch-based development strategy

---

## Table of Contents

1. [Strategic Overview](#1-strategic-overview)
2. [Architecture Design](#2-architecture-design)
3. [Database Schema Evolution](#3-database-schema-evolution)
4. [Workflow Customization System](#4-workflow-customization-system)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Tenant Isolation Strategy](#6-tenant-isolation-strategy)
7. [Branding & Customization](#7-branding--customization)
8. [Branch Strategy & Development Workflow](#8-branch-strategy--development-workflow)
9. [Testing Strategy with MAK](#9-testing-strategy-with-mak)
10. [Feedback Collection & Iteration](#10-feedback-collection--iteration)
11. [Implementation Phases](#11-implementation-phases)
12. [Migration & Deployment](#12-migration--deployment)
13. [Risk Management](#13-risk-management)
14. [Success Metrics](#14-success-metrics)

---

## 1. Strategic Overview

### 1.1 Business Objectives

**Primary Goals:**
- Enable multiple companies to use the platform simultaneously
- Maintain complete data isolation between tenants
- Allow per-tenant customization without code changes
- Preserve all existing functionality for MAK
- Enable rapid onboarding of new companies

**Success Criteria:**
- MAK can use the system without any disruption
- New companies can be onboarded in < 1 day
- Zero data leakage between tenants
- Performance impact < 5% compared to single-tenant
- 100% backward compatibility with existing MAK data

### 1.2 Development Philosophy

**Principles:**
1. **Safety First**: Main branch remains stable; all changes in feature branch
2. **Test in Production (with MAK)**: Real-world testing before exposing to others
3. **Iterative Refinement**: Collect feedback, iterate, improve
4. **Backward Compatible**: Existing MAK workflows continue to work
5. **Gradual Rollout**: Phase-by-phase implementation with validation at each step

---

## 2. Architecture Design

### 2.1 Multi-Tenancy Model

**Selected Approach: Shared Database with Row-Level Isolation**

This approach provides:
- ✅ Cost efficiency (single database instance)
- ✅ Easier maintenance and updates
- ✅ Good performance for moderate number of tenants (< 100)
- ✅ Strong data isolation through foreign keys + RLS policies
- ✅ Simplified backup and disaster recovery

**Alternative Considered:** Separate databases per tenant
- ❌ Higher infrastructure costs
- ❌ Complex deployment and updates
- ✅ Better isolation (but not necessary for our use case)

### 2.2 Core Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Frontend   │  │   Backend    │  │   PDF Gen    │       │
│  │   (React)    │  │   (Express)  │  │   (PDFKit)   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                │                    │              │
│         └────────────────┴────────────────────┘              │
│                            │                                   │
└────────────────────────────┼───────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Tenant Context │
                    │    Middleware   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Database Layer  │
                    │  (Supabase/     │
                    │   PostgreSQL)   │
                    └─────────────────┘
```

### 2.3 Tenant Context Flow

```
User Login → JWT Token (includes tenantId) → Middleware extracts tenantId 
→ All queries filtered by tenant_id → Response scoped to tenant
```

---

## 3. Database Schema Evolution

### 3.1 New Tables

#### 3.1.1 `tenants` Table
```sql
CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE, -- For future subdomain routing (e.g., mak.yourdomain.com)
  
  -- Company Information
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  
  -- Branding
  logo_path TEXT, -- Path to logo file
  primary_color TEXT DEFAULT '#007bff', -- For UI customization (future)
  secondary_color TEXT DEFAULT '#6c757d',
  
  -- Project Numbering
  project_number_prefix TEXT DEFAULT '02',
  project_number_format TEXT DEFAULT 'PREFIX-YYYY-NNNN',
  
  -- Workflow Configuration (JSONB for flexibility)
  workflow_config JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "task_statuses": ["ASSIGNED", "IN_PROGRESS", "READY_FOR_REVIEW", "APPROVED"],
  --   "approval_required": true,
  --   "auto_notify_on_submit": true,
  --   "custom_fields": {...}
  -- }
  
  -- Storage Configuration
  workflow_base_path TEXT, -- Per-tenant folder path (overrides global)
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMPTZ, -- For future billing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

#### 3.1.2 `tenant_settings` Table (Flexible Configuration)
```sql
CREATE TABLE IF NOT EXISTS tenant_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT, -- Can store JSON for complex settings
  value_type TEXT DEFAULT 'string' CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  category TEXT, -- 'workflow', 'branding', 'notifications', 'storage', etc.
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_user_id BIGINT REFERENCES users(id),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);
CREATE INDEX idx_tenant_settings_category ON tenant_settings(tenant_id, category);
```

**Example Settings:**
- `workflow.auto_approve_tasks` → `false`
- `workflow.require_approval_for_pdf` → `true`
- `notifications.email_on_task_submit` → `true`
- `notifications.email_recipients` → `["admin@company.com"]`
- `pdf.template_style` → `"modern"` or `"classic"`
- `storage.use_onedrive` → `true`
- `storage.custom_path` → `"C:\Company\Projects"`

#### 3.1.3 `tenant_project_counters` Table
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

#### 3.1.4 `tenant_workflow_templates` Table (For Custom Workflows)
```sql
CREATE TABLE IF NOT EXISTS tenant_workflow_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  task_type TEXT NOT NULL, -- 'DENSITY_MEASUREMENT', 'PROCTOR', etc.
  status_flow JSONB NOT NULL, -- Array of status transitions
  -- Example: [
  --   {"from": "ASSIGNED", "to": "IN_PROGRESS", "role": "TECHNICIAN"},
  --   {"from": "IN_PROGRESS", "to": "READY_FOR_REVIEW", "role": "TECHNICIAN"},
  --   {"from": "READY_FOR_REVIEW", "to": "APPROVED", "role": "ADMIN"}
  -- ]
  required_fields JSONB DEFAULT '[]'::jsonb, -- Fields required at each status
  notification_rules JSONB DEFAULT '[]'::jsonb, -- When to send notifications
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, template_name, task_type)
);

CREATE INDEX idx_tenant_workflow_templates_tenant ON tenant_workflow_templates(tenant_id, task_type);
```

### 3.2 Modified Tables (Add `tenant_id`)

**All existing tables need `tenant_id` column:**

```sql
-- Users
ALTER TABLE users ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

-- Projects
ALTER TABLE projects ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
-- Update unique constraint: project_number unique per tenant
DROP INDEX IF EXISTS projects_project_number_key;
CREATE UNIQUE INDEX idx_projects_tenant_project_number ON projects(tenant_id, project_number);

-- Tasks
ALTER TABLE tasks ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);

-- Workpackages (deprecated but kept for compatibility)
ALTER TABLE workpackages ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX idx_workpackages_tenant_id ON workpackages(tenant_id);

-- Data tables
ALTER TABLE wp1_data ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE proctor_data ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE density_reports ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE rebar_reports ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE task_history ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE app_settings ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;

-- Create indexes for all
CREATE INDEX idx_wp1_data_tenant_id ON wp1_data(tenant_id);
CREATE INDEX idx_proctor_data_tenant_id ON proctor_data(tenant_id);
CREATE INDEX idx_density_reports_tenant_id ON density_reports(tenant_id);
CREATE INDEX idx_rebar_reports_tenant_id ON rebar_reports(tenant_id);
CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_task_history_tenant_id ON task_history(tenant_id);
CREATE INDEX idx_app_settings_tenant_id ON app_settings(tenant_id);

-- Update app_settings unique constraint
DROP INDEX IF EXISTS app_settings_key_key;
CREATE UNIQUE INDEX idx_app_settings_tenant_key ON app_settings(tenant_id, key);
```

### 3.3 Row-Level Security (RLS) Policies

For Supabase, enable RLS for additional security:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ... (enable for all tables)

-- Policy: Users can only see their tenant's data
CREATE POLICY "tenant_isolation_users"
  ON users FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::bigint);

-- Similar policies for all tables
-- Note: Requires setting app.current_tenant_id via database function or application context
```

---

## 4. Workflow Customization System

### 4.1 Workflow Configuration Structure

Each tenant can customize:
1. **Task Status Flow**: Define allowed status transitions
2. **Approval Requirements**: Which statuses require admin approval
3. **Notification Rules**: When to send notifications and to whom
4. **Required Fields**: Fields required at each status
5. **Custom Fields**: Tenant-specific fields per task type

### 4.2 Default Workflow (MAK's Current Flow)

```json
{
  "task_statuses": [
    "ASSIGNED",
    "IN_PROGRESS_TECH",
    "READY_FOR_REVIEW",
    "APPROVED",
    "REJECTED_NEEDS_FIX"
  ],
  "status_transitions": [
    {
      "from": "ASSIGNED",
      "to": "IN_PROGRESS_TECH",
      "allowed_roles": ["TECHNICIAN"],
      "action": "Save Update"
    },
    {
      "from": "IN_PROGRESS_TECH",
      "to": "READY_FOR_REVIEW",
      "allowed_roles": ["TECHNICIAN"],
      "action": "Send Update to Admin",
      "locks_form": true,
      "notifies": ["ADMIN"]
    },
    {
      "from": "READY_FOR_REVIEW",
      "to": "APPROVED",
      "allowed_roles": ["ADMIN"],
      "action": "Approve",
      "unlocks_form": false
    },
    {
      "from": "READY_FOR_REVIEW",
      "to": "REJECTED_NEEDS_FIX",
      "allowed_roles": ["ADMIN"],
      "action": "Reject",
      "requires_remarks": true,
      "unlocks_form": true,
      "notifies": ["TECHNICIAN"]
    },
    {
      "from": "REJECTED_NEEDS_FIX",
      "to": "READY_FOR_REVIEW",
      "allowed_roles": ["TECHNICIAN"],
      "action": "Resubmit",
      "locks_form": true
    }
  ],
  "required_fields_by_status": {
    "READY_FOR_REVIEW": ["technician", "placementDate", "structure"],
    "APPROVED": []
  },
  "notification_rules": [
    {
      "trigger": "status_change",
      "from": "IN_PROGRESS_TECH",
      "to": "READY_FOR_REVIEW",
      "notify": ["ADMIN"],
      "message_template": "{{technician_name}} completed {{task_type}} for Project {{project_number}}"
    },
    {
      "trigger": "status_change",
      "from": "READY_FOR_REVIEW",
      "to": "REJECTED_NEEDS_FIX",
      "notify": ["TECHNICIAN"],
      "message_template": "Your {{task_type}} for Project {{project_number}} was rejected. Please review remarks."
    }
  ]
}
```

### 4.3 Workflow Engine Implementation

**File: `server/utils/workflowEngine.js`**

```javascript
class WorkflowEngine {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.config = null;
  }

  async loadConfig() {
    // Load tenant's workflow configuration
    const tenant = await db.get('tenants', { id: this.tenantId });
    this.config = tenant.workflow_config || this.getDefaultConfig();
    return this.config;
  }

  canTransition(task, fromStatus, toStatus, userRole) {
    const transition = this.config.status_transitions.find(
      t => t.from === fromStatus && t.to === toStatus
    );
    
    if (!transition) return false;
    if (!transition.allowed_roles.includes(userRole)) return false;
    
    return true;
  }

  getRequiredFields(status) {
    return this.config.required_fields_by_status[status] || [];
  }

  getNotificationRules(fromStatus, toStatus) {
    return this.config.notification_rules.filter(
      rule => rule.from === fromStatus && rule.to === toStatus
    );
  }

  getDefaultConfig() {
    // Return MAK's default workflow
    return { /* default config */ };
  }
}
```

### 4.4 Workflow Customization UI

**File: `client/src/components/admin/WorkflowSettings.tsx`** (New)

Features:
- Visual workflow builder (drag-and-drop status transitions)
- Configure notification rules
- Set required fields per status
- Preview workflow
- Test workflow with sample data

---

## 5. Authentication & Authorization

### 5.1 Enhanced JWT Token

**Current Token:**
```json
{
  "id": 1,
  "email": "admin@maklonestar.com",
  "role": "ADMIN",
  "name": "John Doe"
}
```

**New Token (with tenant context):**
```json
{
  "id": 1,
  "email": "admin@maklonestar.com",
  "role": "ADMIN",
  "name": "John Doe",
  "tenantId": 1,
  "tenantName": "MAK Lone Star Consulting",
  "tenantSubdomain": "mak" // For future subdomain routing
}
```

### 5.2 Updated Login Flow

**File: `server/routes/auth.js`**

```javascript
router.post('/login', async (req, res) => {
  // ... existing validation ...
  
  const user = await db.get('users', { email });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Fetch tenant information
  const tenant = await db.get('tenants', { id: user.tenant_id });
  if (!tenant || !tenant.is_active) {
    return res.status(403).json({ error: 'Account is inactive' });
  }

  // Create token with tenant context
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenant_id,
      tenantName: tenant.name,
      tenantSubdomain: tenant.subdomain
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenant_id,
      tenantName: tenant.name
    }
  });
});
```

### 5.3 Tenant Context Middleware

**File: `server/middleware/tenant.js`** (New)

```javascript
const { authenticate } = require('./auth');

/**
 * Middleware to ensure tenant context is available
 * Must be used after authenticate middleware
 */
const requireTenant = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(403).json({ 
      error: 'Tenant context required. Please log in again.' 
    });
  }
  
  req.tenantId = req.user.tenantId;
  next();
};

/**
 * Middleware to validate resource belongs to user's tenant
 */
const validateTenantResource = (resourceGetter) => {
  return async (req, res, next) => {
    try {
      const resource = await resourceGetter(req);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      
      if (resource.tenant_id !== req.user.tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { requireTenant, validateTenantResource };
```

### 5.4 Updated Route Protection

**Example: `server/routes/projects.js`**

```javascript
const { authenticate } = require('../middleware/auth');
const { requireTenant, validateTenantResource } = require('../middleware/tenant');

// All routes now require tenant context
router.get('/', authenticate, requireTenant, async (req, res) => {
  const projects = await db.getAll('projects', { 
    tenant_id: req.tenantId 
  });
  res.json(projects);
});

router.get('/:id', 
  authenticate, 
  requireTenant,
  validateTenantResource(async (req) => {
    return await db.get('projects', { id: req.params.id });
  }),
  async (req, res) => {
    res.json(req.resource);
  }
);
```

---

## 6. Tenant Isolation Strategy

### 6.1 Database Query Wrapper

**File: `server/db/index.js`** (Update existing or create new)

```javascript
// Tenant-aware query methods
async function getWithTenant(table, conditions, tenantId) {
  return await db.get(table, { ...conditions, tenant_id: tenantId });
}

async function getAllWithTenant(table, conditions, tenantId) {
  return await db.getAll(table, { ...conditions, tenant_id: tenantId });
}

async function insertWithTenant(table, data, tenantId) {
  return await db.insert(table, { ...data, tenant_id: tenantId });
}

async function updateWithTenant(table, data, conditions, tenantId) {
  return await db.update(table, data, { ...conditions, tenant_id: tenantId });
}

// Helper to automatically add tenant_id to queries
function addTenantFilter(query, tenantId) {
  if (typeof query === 'object') {
    return { ...query, tenant_id: tenantId };
  }
  // If query is a string (SQL), append WHERE clause
  // Implementation depends on your DB abstraction layer
}
```

### 6.2 Automatic Tenant Filtering

**Best Practice:** Always filter by tenant_id, even when querying through relationships.

**Example:**
```javascript
// ❌ BAD: Could leak data if project_id is wrong
const task = await db.get('tasks', { id: taskId });

// ✅ GOOD: Explicit tenant check
const task = await db.get('tasks', { 
  id: taskId, 
  tenant_id: req.tenantId 
});

// ✅ ALSO GOOD: Validate through relationship
const task = await db.get('tasks', { id: taskId });
const project = await db.get('projects', { 
  id: task.project_id, 
  tenant_id: req.tenantId 
});
if (!project) {
  throw new Error('Task not found or access denied');
}
```

---

## 7. Branding & Customization

### 7.1 Logo Management

**Storage Options:**
1. **File System** (MVP): `server/public/tenants/{tenant_id}/logo.{ext}`
2. **Supabase Storage** (Recommended for production): Use Supabase Storage buckets
3. **Base64 in Database** (Not recommended): Only for very small logos

**Implementation:**
- Upload endpoint: `POST /api/tenants/logo`
- Retrieval: `GET /api/tenants/logo` or direct file serving
- PDF generation: Load tenant logo dynamically

### 7.2 Company Address in PDFs

**Update all PDF generation functions** to use tenant address:

```javascript
async function getTenantAddress(tenantId) {
  const tenant = await db.get('tenants', { id: tenantId });
  if (!tenant) return null;

  const parts = [];
  if (tenant.company_address) parts.push(tenant.company_address);
  
  const cityStateZip = [
    tenant.company_city,
    tenant.company_state,
    tenant.company_zip
  ].filter(Boolean).join(', ');
  if (cityStateZip) parts.push(cityStateZip);
  
  if (tenant.company_phone) parts.push(`Phone: ${tenant.company_phone}`);
  if (tenant.company_email) parts.push(`Email: ${tenant.company_email}`);

  return parts.join('\n');
}
```

### 7.3 Project Numbering Customization

**Per-tenant project numbering:**

```javascript
async function generateProjectNumber(tenantId) {
  const tenant = await db.get('tenants', { id: tenantId });
  const prefix = tenant.project_number_prefix || '02';
  const format = tenant.project_number_format || 'PREFIX-YYYY-NNNN';
  const year = new Date().getFullYear();

  // Get or create counter
  let counter = await db.get('tenant_project_counters', {
    tenant_id: tenantId,
    year: year
  });

  if (!counter) {
    await db.insert('tenant_project_counters', {
      tenant_id: tenantId,
      year: year,
      next_seq: 1
    });
    counter = { next_seq: 1 };
  }

  const seq = counter.next_seq;
  await db.update('tenant_project_counters', {
    next_seq: seq + 1
  }, {
    tenant_id: tenantId,
    year: year
  });

  // Format: PREFIX-YYYY-NNNN
  return format
    .replace('PREFIX', prefix)
    .replace('YYYY', year.toString())
    .replace('NNNN', seq.toString().padStart(4, '0'));
}
```

---

## 8. Branch Strategy & Development Workflow

### 8.1 Branch Structure

```
main (production, stable - MAK's current system)
  │
  └── feature/multi-tenant-saas (working branch)
       │
       ├── feature/tenant-database-schema
       ├── feature/tenant-authentication
       ├── feature/tenant-isolation
       ├── feature/workflow-customization
       ├── feature/tenant-branding
       ├── feature/tenant-settings-ui
       └── feature/tenant-migration
```

### 8.2 Development Workflow

**Phase 1: Setup Working Branch**
```bash
# Create and push working branch
git checkout -b feature/multi-tenant-saas
git push -u origin feature/multi-tenant-saas

# Create .env.local for testing (don't commit)
cp .env .env.local
# Modify .env.local for testing environment
```

**Phase 2: Feature Development**
```bash
# Work on feature branch
git checkout feature/multi-tenant-saas

# Make changes, commit frequently
git add .
git commit -m "feat: add tenant database schema"

# Push to remote
git push origin feature/multi-tenant-saas
```

**Phase 3: Testing with MAK**
```bash
# Deploy working branch to staging/test environment
# MAK tests the system
# Collect feedback
# Make fixes on working branch
```

**Phase 4: Merge to Main (When Ready)**
```bash
# After thorough testing and MAK approval
git checkout main
git merge feature/multi-tenant-saas
git push origin main
```

### 8.3 Branch Protection Rules

**Main Branch:**
- ✅ Protected (no direct pushes)
- ✅ Requires pull request
- ✅ Requires code review
- ✅ Requires all tests to pass
- ✅ Requires MAK approval (manual check)

**Working Branch:**
- ✅ Can be force-pushed (development only)
- ✅ No restrictions (for rapid iteration)
- ⚠️ Never merge to main without testing

### 8.4 Environment Strategy

**Development Environments:**
1. **Local**: Developer's machine (uses SQLite or local Supabase)
2. **Staging**: Test environment for MAK testing (separate Supabase project)
3. **Production**: Live system (MAK's current Supabase project)

**Environment Variables:**
```env
# .env.local (for working branch testing)
NODE_ENV=development
SUPABASE_URL=https://test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=test-key
ENABLE_MULTI_TENANT=true

# .env (production - main branch)
NODE_ENV=production
SUPABASE_URL=https://mak-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=prod-key
ENABLE_MULTI_TENANT=false # Until ready
```

---

## 9. Testing Strategy with MAK

### 9.1 Pre-Testing Setup

**Step 1: Create Test Tenant for MAK**
```sql
-- In staging/test database
INSERT INTO tenants (name, project_number_prefix, project_number_format)
VALUES ('MAK Lone Star Consulting', '02', 'PREFIX-YYYY-NNNN')
RETURNING id;
-- Note the tenant ID (e.g., 1)
```

**Step 2: Migrate MAK's Data to Test Tenant**
```sql
-- Update all MAK data to belong to tenant_id = 1
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ... (update all tables)
```

**Step 3: Deploy Working Branch to Staging**
- Deploy `feature/multi-tenant-saas` branch to staging environment
- Point staging to test Supabase project
- Verify all migrations ran successfully

### 9.2 Testing Checklist for MAK

**Functional Testing:**
- [ ] Login works (JWT includes tenantId)
- [ ] Can see all existing projects
- [ ] Can create new project (uses tenant's project numbering)
- [ ] Can create tasks
- [ ] Can assign tasks to technicians
- [ ] Technicians can complete tasks
- [ ] Admin can approve/reject tasks
- [ ] PDFs generate with correct logo and address
- [ ] Notifications work correctly
- [ ] Settings page works
- [ ] All existing workflows function as before

**Data Integrity Testing:**
- [ ] No data loss during migration
- [ ] All relationships preserved (projects → tasks → reports)
- [ ] File paths still work
- [ ] PDFs generate correctly

**Performance Testing:**
- [ ] Page load times similar to before
- [ ] Database queries perform well
- [ ] No noticeable slowdown

**Security Testing:**
- [ ] Cannot access other tenant's data (if multiple tenants exist)
- [ ] JWT tokens are valid
- [ ] Tenant context is enforced in all routes

### 9.3 Testing Timeline

**Week 1: Initial Testing**
- MAK tests basic functionality
- Report bugs/issues
- Developer fixes on working branch

**Week 2: Extended Testing**
- MAK uses system for real work
- Test edge cases
- Performance monitoring

**Week 3: Refinement**
- Address feedback
- Optimize performance
- Final bug fixes

**Week 4: Approval**
- MAK signs off on system
- Ready for other companies

### 9.4 Feedback Collection

**Methods:**
1. **In-App Feedback Form**: Quick feedback button in UI
2. **Email**: Direct email to developer
3. **Issue Tracker**: GitHub issues or similar
4. **Weekly Check-ins**: Scheduled calls with MAK

**Feedback Categories:**
- Bugs/Errors
- Performance Issues
- Feature Requests
- Workflow Improvements
- UI/UX Suggestions

---

## 10. Feedback Collection & Iteration

### 10.1 Feedback Collection System

**In-App Feedback Component:**
```typescript
// client/src/components/FeedbackButton.tsx
const FeedbackButton = () => {
  const [showModal, setShowModal] = useState(false);
  
  const submitFeedback = async (feedback) => {
    await api.post('/api/feedback', {
      type: feedback.type, // 'bug', 'feature', 'improvement'
      message: feedback.message,
      tenantId: user.tenantId,
      userEmail: user.email
    });
  };
  
  // ... UI implementation
};
```

**Backend Endpoint:**
```javascript
// server/routes/feedback.js
router.post('/', authenticate, requireTenant, async (req, res) => {
  const { type, message } = req.body;
  
  // Store feedback in database or send to issue tracker
  await db.insert('feedback', {
    tenant_id: req.tenantId,
    user_id: req.user.id,
    type,
    message,
    created_at: new Date()
  });
  
  res.json({ success: true });
});
```

### 10.2 Iteration Process

**Feedback → Issue → Fix → Test → Deploy**

1. **Collect**: MAK submits feedback
2. **Prioritize**: Developer prioritizes based on:
   - Severity (critical bugs first)
   - Impact (affects many users?)
   - Effort (quick wins vs. large features)
3. **Implement**: Fix on working branch
4. **Test**: MAK tests the fix
5. **Iterate**: If not satisfactory, repeat
6. **Deploy**: Once approved, merge to main

### 10.3 Change Management

**Breaking Changes:**
- Must be discussed with MAK first
- Provide migration path
- Document changes thoroughly

**Non-Breaking Changes:**
- Can be implemented and tested
- MAK reviews and approves

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Database schema and basic tenant structure

**Tasks:**
1. Create `feature/multi-tenant-saas` branch
2. Create database migration for tenants table
3. Add `tenant_id` columns to all tables
4. Create default tenant for MAK
5. Update indexes and constraints
6. Test database changes

**Deliverables:**
- ✅ Migration script: `supabase/migrations/20250202000000_add_multi_tenancy.sql`
- ✅ Database schema updated
- ✅ Default tenant created
- ✅ All indexes in place

**Testing:**
- Run migration on test database
- Verify schema changes
- Test data integrity

---

### Phase 2: Authentication & Authorization (Week 2-3)
**Goal:** Update authentication to include tenant context

**Tasks:**
1. Update JWT token to include tenantId
2. Create tenant middleware
3. Update login endpoint
4. Update all routes to use tenant context
5. Add tenant filtering to all database queries
6. Test authentication flow

**Deliverables:**
- ✅ Updated auth routes
- ✅ Tenant middleware
- ✅ All routes tenant-aware
- ✅ JWT tokens include tenant context

**Testing:**
- Test login with MAK credentials
- Verify JWT includes tenantId
- Test that routes require tenant context
- Test tenant isolation (if multiple tenants exist)

---

### Phase 3: Tenant Isolation (Week 3-4)
**Goal:** Ensure complete data isolation

**Tasks:**
1. Update all database queries to filter by tenant_id
2. Add tenant validation to all routes
3. Implement tenant resource validation middleware
4. Add RLS policies (if using Supabase)
5. Test isolation thoroughly

**Deliverables:**
- ✅ All queries tenant-scoped
- ✅ Resource validation middleware
- ✅ RLS policies (if applicable)
- ✅ Isolation tests passing

**Testing:**
- Create test tenant
- Verify cannot access other tenant's data
- Test all CRUD operations
- Test edge cases (malformed requests, etc.)

---

### Phase 4: Workflow Customization (Week 4-5)
**Goal:** Implement customizable workflows

**Tasks:**
1. Create workflow engine
2. Create workflow configuration UI
3. Update task status transitions to use workflow engine
4. Implement notification rules
5. Add required fields validation
6. Test workflow customization

**Deliverables:**
- ✅ Workflow engine
- ✅ Workflow settings UI
- ✅ Customizable status flows
- ✅ Notification rules

**Testing:**
- Test default workflow (MAK's current flow)
- Test custom workflow creation
- Test status transitions
- Test notifications

---

### Phase 5: Branding & Customization (Week 5-6)
**Goal:** Per-tenant branding and configuration

**Tasks:**
1. Implement logo upload
2. Update PDF generation to use tenant logo/address
3. Implement project numbering customization
4. Create tenant settings UI
5. Test branding in PDFs

**Deliverables:**
- ✅ Logo upload functionality
- ✅ Tenant-specific PDFs
- ✅ Custom project numbering
- ✅ Settings UI

**Testing:**
- Upload logo for MAK
- Generate PDFs, verify logo and address
- Test project numbering
- Test settings updates

---

### Phase 6: Frontend Integration (Week 6-7)
**Goal:** Complete frontend updates

**Tasks:**
1. Create TenantContext
2. Update Settings page with tenant configuration
3. Update all components to use tenant context
4. Add workflow customization UI
5. Test UI changes

**Deliverables:**
- ✅ TenantContext provider
- ✅ Updated Settings page
- ✅ Workflow customization UI
- ✅ All components tenant-aware

**Testing:**
- Test UI with MAK tenant
- Test settings updates
- Test workflow customization UI
- Test responsive design

---

### Phase 7: MAK Testing & Refinement (Week 7-8)
**Goal:** Thorough testing with MAK and bug fixes

**Tasks:**
1. Deploy to staging environment
2. MAK tests all functionality
3. Collect feedback
4. Fix bugs and issues
5. Iterate based on feedback
6. Performance optimization

**Deliverables:**
- ✅ Staging deployment
- ✅ MAK testing complete
- ✅ All bugs fixed
- ✅ Performance validated
- ✅ MAK approval

**Testing:**
- MAK uses system for real work
- Monitor performance
- Collect and address feedback
- Final bug fixes

---

### Phase 8: Migration & Production Deployment (Week 8-9)
**Goal:** Migrate MAK's production data and deploy

**Tasks:**
1. Backup production database
2. Run migration script on production
3. Verify data integrity
4. Deploy application to production
5. Monitor for issues
6. Document changes

**Deliverables:**
- ✅ Production migration complete
- ✅ Application deployed
- ✅ Data integrity verified
- ✅ Documentation updated

**Testing:**
- Verify all MAK data migrated correctly
- Test production system
- Monitor error logs
- Verify performance

---

### Phase 9: Onboarding Other Companies (Week 9+)
**Goal:** Onboard new companies

**Tasks:**
1. Create onboarding process
2. Create new tenant for company
3. Set up company configuration
4. Create admin user
5. Provide training/support

**Deliverables:**
- ✅ Onboarding process documented
- ✅ New companies onboarded
- ✅ Feedback collected
- ✅ Iterative improvements

---

## 12. Migration & Deployment

### 12.1 Data Migration Plan

**Step 1: Backup**
```bash
# Backup Supabase database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Or use Supabase dashboard backup feature
```

**Step 2: Create Default Tenant**
```sql
INSERT INTO tenants (
  name, 
  project_number_prefix, 
  project_number_format,
  company_address,
  company_city,
  company_state,
  company_zip,
  company_phone,
  company_email
)
VALUES (
  'MAK Lone Star Consulting',
  '02',
  'PREFIX-YYYY-NNNN',
  '123 Main St', -- Update with actual address
  'City',
  'State',
  '12345',
  '555-1234',
  'info@maklonestar.com'
)
RETURNING id;
-- Note the tenant ID (e.g., 1)
```

**Step 3: Migrate Existing Data**
```sql
-- Set tenant_id for all existing data
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_id = (SELECT tenant_id FROM projects WHERE projects.id = tasks.project_id);
UPDATE workpackages SET tenant_id = (SELECT tenant_id FROM projects WHERE projects.id = workpackages.project_id);
UPDATE wp1_data SET tenant_id = (SELECT tenant_id FROM tasks WHERE tasks.id = wp1_data.task_id);
UPDATE proctor_data SET tenant_id = (SELECT tenant_id FROM tasks WHERE tasks.id = proctor_data.task_id);
UPDATE density_reports SET tenant_id = (SELECT tenant_id FROM tasks WHERE tasks.id = density_reports.task_id);
UPDATE rebar_reports SET tenant_id = (SELECT tenant_id FROM tasks WHERE tasks.id = rebar_reports.task_id);
UPDATE notifications SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = notifications.user_id);
UPDATE task_history SET tenant_id = (SELECT tenant_id FROM tasks WHERE tasks.id = task_history.task_id);
UPDATE app_settings SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Migrate project counters
INSERT INTO tenant_project_counters (tenant_id, year, next_seq)
SELECT 1, year, next_seq FROM project_counters
ON CONFLICT (tenant_id, year) DO NOTHING;
```

**Step 4: Verify Migration**
```sql
-- Check for any NULL tenant_ids
SELECT 'users' as table_name, COUNT(*) as null_count 
FROM users WHERE tenant_id IS NULL
UNION ALL
SELECT 'projects', COUNT(*) FROM projects WHERE tenant_id IS NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks WHERE tenant_id IS NULL;
-- Should all return 0

-- Verify data counts match
SELECT 
  (SELECT COUNT(*) FROM users) as users_count,
  (SELECT COUNT(*) FROM users WHERE tenant_id = 1) as users_with_tenant;
-- Should match
```

**Step 5: Make tenant_id Required (After Verification)**
```sql
-- Only after confirming all data has tenant_id
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
-- ... (for all tables)
```

### 12.2 Deployment Checklist

**Pre-Deployment:**
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Database migration script tested
- [ ] Backup created
- [ ] Rollback plan ready
- [ ] MAK approval received

**Deployment:**
- [ ] Run database migration
- [ ] Verify migration success
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Verify health checks
- [ ] Test login
- [ ] Test critical workflows

**Post-Deployment:**
- [ ] Monitor error logs
- [ ] Monitor performance
- [ ] Verify data integrity
- [ ] Collect MAK feedback
- [ ] Document any issues

### 12.3 Rollback Plan

**If Issues Occur:**
1. **Immediate**: Revert application code (git revert)
2. **If Schema Changed**: Restore database backup
3. **Investigate**: Identify root cause
4. **Fix**: Implement fix on working branch
5. **Retest**: Test thoroughly before redeploying

---

## 13. Risk Management

### 13.1 Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | Critical | Low | Full backup, test migration on staging |
| Performance degradation | High | Medium | Add indexes, query optimization, load testing |
| Tenant data leakage | Critical | Low | Row-level security, thorough testing, code review |
| Breaking existing functionality | High | Medium | Comprehensive testing, gradual rollout, MAK testing |
| Complex migration | Medium | High | Phased approach, detailed migration script, dry runs |
| MAK workflow disruption | High | Low | Test thoroughly, gradual rollout, quick rollback |
| Feedback overload | Low | Medium | Prioritize feedback, set expectations |

### 13.2 Mitigation Strategies

**Data Safety:**
- Multiple backups before migration
- Test migration on copy of production data
- Rollback plan ready
- Verify data integrity after migration

**Performance:**
- Add indexes on tenant_id columns
- Monitor query performance
- Optimize slow queries
- Load testing with realistic data

**Security:**
- Row-level security policies (Supabase)
- Tenant validation in all routes
- Security audit before production
- Penetration testing (optional)

**Functionality:**
- Comprehensive test suite
- Staging environment testing
- MAK testing before production
- Gradual feature rollout

---

## 14. Success Metrics

### 14.1 Technical Metrics

- **Performance**: < 5% performance degradation
- **Uptime**: 99.9% availability
- **Error Rate**: < 0.1% error rate
- **Data Integrity**: 100% data migrated correctly
- **Security**: Zero data leakage incidents

### 14.2 Business Metrics

- **MAK Satisfaction**: MAK approves system
- **Onboarding Time**: < 1 day to onboard new company
- **Feature Adoption**: Companies use customization features
- **Feedback Response**: Address critical feedback within 24 hours

### 14.3 Quality Metrics

- **Test Coverage**: > 80% code coverage
- **Bug Rate**: < 1 critical bug per week during testing
- **Code Quality**: All code reviewed before merge
- **Documentation**: All features documented

---

## 15. Future Enhancements (Post-MVP)

### 15.1 Phase 2 Features

1. **Subdomain Routing**
   - Each tenant gets subdomain (e.g., `mak.yourdomain.com`)
   - Automatic tenant detection from subdomain

2. **Advanced Workflow Customization**
   - Visual workflow builder
   - Conditional logic in workflows
   - Custom approval chains

3. **Tenant Management UI**
   - Super admin panel to manage tenants
   - Tenant creation/deletion
   - Tenant usage analytics

4. **Billing Integration**
   - Per-tenant subscription management
   - Usage-based billing
   - Payment processing

5. **Advanced Branding**
   - Custom color schemes per tenant
   - Custom email templates
   - Custom domain support

---

## 16. Conclusion

This plan provides a comprehensive, production-ready roadmap for converting MAK Automation to a multi-tenant SaaS platform. The phased approach ensures:

- ✅ **Zero disruption** to MAK's current operations
- ✅ **Thorough testing** with MAK before exposing to others
- ✅ **Feedback-driven iteration** for continuous improvement
- ✅ **Safe deployment** using branch-based development
- ✅ **Complete data isolation** between tenants
- ✅ **Flexible customization** for each company's needs

**Next Steps:**
1. Review and approve this plan
2. Create working branch: `feature/multi-tenant-saas`
3. Begin Phase 1: Foundation
4. Schedule regular progress reviews (weekly)
5. Set up feedback collection system

**Timeline:** 8-9 weeks to production-ready multi-tenant system

---

**Document Version:** 2.0  
**Last Updated:** February 2025  
**Status:** Ready for Implementation  
**Approved By:** [Pending]  
**Next Review Date:** [TBD]
