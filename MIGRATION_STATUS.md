# Route Migration Status Report

## ✅ **COMPLETED MIGRATIONS**

### 1. **projects.js** - ✅ 100% Complete
- `GET /` - Get all projects
- `GET /:id` - Get single project
- `POST /` - Create project
- `PUT /:id` - Update project

### 2. **wp1.js** - ✅ 100% Complete
- `GET /task/:taskId` - Get WP1 data
- `POST /task/:taskId` - Save WP1 data

### 3. **proctor.js** - ✅ 100% Complete
- `GET /task/:taskId` - Get Proctor data
- `POST /task/:taskId` - Save Proctor data

### 4. **density.js** - ✅ 100% Complete
- `GET /task/:taskId` - Get Density report
- `POST /task/:taskId` - Save Density report

### 5. **rebar.js** - ✅ 100% Complete
- `GET /task/:taskId` - Get Rebar report
- `POST /task/:taskId` - Save Rebar report

### 6. **pdf.js** - ✅ 100% Complete
- `GET /wp1/:id` - Generate WP1 PDF
- `GET /task/:taskId` - Generate Task Details PDF
- `GET /density/:taskId` - Generate Density PDF
- `GET /rebar/:taskId` - Generate Rebar PDF

---

## ⚠️ **PARTIALLY MIGRATED**

### 7. **tasks.js** - ⚠️ ~30% Complete

**✅ Migrated Routes:**
- `GET /` - Get all tasks
- `GET /project/:projectId` - Get tasks for project

**❌ Remaining Routes (19 routes):**
1. `GET /project/:projectId/proctors` - Get proctors for project
2. `GET /:id` - Get single task
3. `PUT /:id` - Update task (first one)
4. `POST /` - Create task
5. `PUT /:id` - Update task (second one)
6. `PUT /:id/status` - Update task status
7. `POST /:id/approve` - Approve task
8. `POST /:id/reject` - Reject task
9. `GET /dashboard/today` - Admin dashboard today
10. `GET /dashboard/upcoming` - Admin dashboard upcoming
11. `GET /dashboard/overdue` - Admin dashboard overdue
12. `GET /dashboard/technician/today` - Technician dashboard today
13. `GET /dashboard/technician/upcoming` - Technician dashboard upcoming
14. `GET /dashboard/technician/tomorrow` - Technician dashboard tomorrow
15. `GET /dashboard/technician/open-reports` - Technician open reports
16. `POST /:id/mark-field-complete` - Mark field complete
17. `GET /dashboard/technician/activity` - Technician activity
18. `GET /dashboard/activity` - Admin activity
19. `GET /:id/history` - Get task history

### 8. **workpackages.js** - ⚠️ ~50% Complete

**✅ Migrated Routes:**
- `GET /project/:projectId` - Get work packages for project
- `GET /:id` - Get single work package
- `PUT /:id/assign` - Assign work package

**❌ Remaining Routes (3 routes):**
1. `PUT /:id/status` - Update work package status
2. `GET /:id/wp1` - Get WP1 data (legacy workPackage-based)
3. `POST /:id/wp1` - Save WP1 data (legacy workPackage-based)

---

## 📋 **MIGRATION GUIDE**

### Step-by-Step Migration Process

#### 1. **Convert Route Handler to Async/Await**
```javascript
// BEFORE (Callback-based)
router.get('/route', authenticate, (req, res) => {
  db.get('SELECT * FROM table WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(row);
  });
});

// AFTER (Async/Await with db abstraction)
router.get('/route', authenticate, async (req, res) => {
  try {
    const row = await db.get('table', { id: parseInt(req.params.id) });
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(row);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});
```

#### 2. **Handle Supabase vs SQLite Conditionally**

For complex queries with JOINs:
```javascript
let result;
if (db.isSupabase()) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      projects:project_id(project_name, project_number),
      users:assigned_technician_id(name, email)
    `)
    .eq('id', taskId)
    .single();
  
  if (error || !data) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  result = {
    ...data,
    projectName: data.projects?.project_name,
    projectNumber: data.projects?.project_number,
    assignedTechnicianName: data.users?.name,
    projects: undefined,
    users: undefined
  };
} else {
  // SQLite fallback
  const sqliteDb = require('../database');
  result = await new Promise((resolve, reject) => {
    sqliteDb.get(
      `SELECT t.*, p.projectName, p.projectNumber, u.name as assignedTechnicianName
       FROM tasks t
       INNER JOIN projects p ON t.projectId = p.id
       LEFT JOIN users u ON t.assignedTechnicianId = u.id
       WHERE t.id = ?`,
      [taskId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}
```

#### 3. **Handle JSONB Fields (Supabase)**

For fields stored as JSONB in Supabase:
```javascript
// Parse JSON fields
if (typeof data.cylinders === 'string') {
  try {
    data.cylinders = JSON.parse(data.cylinders || '[]');
  } catch (e) {
    data.cylinders = [];
  }
} else {
  data.cylinders = data.cylinders || [];
}
```

#### 4. **Use db Abstraction Methods**

- `await db.get(table, conditions)` - Get single record
- `await db.all(table, conditions, options)` - Get multiple records
- `await db.insert(table, data)` - Insert record
- `await db.update(table, data, conditions)` - Update record
- `await db.delete(table, conditions)` - Delete record

#### 5. **Handle Nested Callbacks**

For routes with nested callbacks (like loops):
```javascript
// BEFORE
tasks.forEach((task) => {
  db.get('SELECT ...', [task.id], (err, data) => {
    // nested callback
  });
});

// AFTER
const tasksWithData = await Promise.all(
  tasks.map(async (task) => {
    const data = await db.get('proctor_data', { taskId: task.id });
    return {
      ...task,
      optMoisture: data?.optMoisturePct || '',
      maxDensity: data?.maxDryDensityPcf || ''
    };
  })
);
```

---

## 🎯 **PRIORITY ORDER FOR REMAINING MIGRATIONS**

### High Priority (Core Functionality)
1. **tasks.js**:
   - `GET /:id` - Get single task (used frequently)
   - `POST /` - Create task (critical for workflow)
   - `PUT /:id` - Update task (critical for workflow)
   - `PUT /:id/status` - Update status (critical for workflow)

2. **workpackages.js**:
   - `PUT /:id/status` - Update status (used frequently)
   - `GET /:id/wp1` - Legacy WP1 endpoint (if still in use)
   - `POST /:id/wp1` - Legacy WP1 save (if still in use)

### Medium Priority (Dashboard Routes)
3. **tasks.js**:
   - `GET /dashboard/today` - Admin dashboard
   - `GET /dashboard/technician/today` - Technician dashboard
   - `GET /dashboard/upcoming` - Upcoming tasks
   - `GET /dashboard/overdue` - Overdue tasks

### Low Priority (Supporting Features)
4. **tasks.js**:
   - `GET /project/:projectId/proctors` - Proctor list
   - `POST /:id/approve` - Approve task
   - `POST /:id/reject` - Reject task
   - `GET /:id/history` - Task history
   - Remaining dashboard routes

---

## 🔍 **COMMON PATTERNS TO WATCH FOR**

### Pattern 1: Sequential Database Calls
```javascript
// Convert nested callbacks to sequential awaits
const task = await db.get('tasks', { id: taskId });
const project = await db.get('projects', { id: task.projectId });
const tech = await db.get('users', { id: task.assignedTechnicianId });
```

### Pattern 2: Parallel Database Calls
```javascript
// Use Promise.all for parallel queries
const [task, project, tech] = await Promise.all([
  db.get('tasks', { id: taskId }),
  db.get('projects', { id: projectId }),
  db.get('users', { id: technicianId })
]);
```

### Pattern 3: Loops with Database Calls
```javascript
// Convert forEach with callbacks to map with Promise.all
const results = await Promise.all(
  items.map(async (item) => {
    const data = await db.get('related_table', { itemId: item.id });
    return { ...item, relatedData: data };
  })
);
```

### Pattern 4: Conditional Updates
```javascript
// Use db.update with conditional logic
if (updateStatus) {
  const taskUpdate = {
    status: updateStatus,
    updatedAt: new Date().toISOString()
  };
  
  if (updateStatus === 'READY_FOR_REVIEW') {
    taskUpdate.reportSubmitted = 1;
  }
  
  await db.update('tasks', taskUpdate, { id: taskId });
}
```

---

## ✅ **TESTING CHECKLIST**

After migrating each route:
- [ ] Test with SQLite database
- [ ] Test with Supabase database
- [ ] Verify JSONB fields are parsed correctly
- [ ] Verify error handling works
- [ ] Verify access control (ADMIN vs TECHNICIAN)
- [ ] Check for linter errors
- [ ] Test edge cases (empty results, null values, etc.)

---

## 📝 **NOTES**

- All migrated routes should use `async/await` instead of callbacks
- Always wrap route handlers in `try/catch` blocks
- Use `db.isSupabase()` to check database type for conditional logic
- Remember to parse JSONB fields when reading from Supabase
- Use `keysToCamelCase()` helper when needed (already in db.js)
- For complex JOINs, use Supabase's query builder or fallback to SQLite raw queries

---

**Last Updated:** Migration status as of current session
**Completed:** 6 files (100%), 2 files (partial)
**Total Routes Migrated:** ~35 routes
**Remaining Routes:** ~22 routes
