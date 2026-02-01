# Route Migration Status

## ✅ Completed

### 1. `server/routes/auth.js` - ✅ MIGRATED
- Converted to async/await
- Uses new database abstraction layer (`server/db`)
- All endpoints updated:
  - POST /login
  - GET /me
  - POST /technicians
  - GET /technicians

## 🔄 In Progress

### 2. `server/routes/projects.js` - NEEDS UPDATE
**Complexity**: High (atomic counters, JSON fields, complex queries)

**Issues to address**:
- Atomic project number generation (uses callbacks)
- Complex queries with JOINs and subqueries
- JSON field handling (now automatic with JSONB)
- Need to convert callbacks to async/await

**Status**: Ready to migrate, needs careful conversion

## 📋 Pending Routes

### 3. `server/routes/tasks.js`
- Complex queries with JOINs
- Task history logging
- Status updates
- Proctor number generation

### 4. `server/routes/workpackages.js`
- Legacy system (deprecated)
- WP1 data handling
- Status workflows

### 5. `server/routes/wp1.js`
- Compressive strength reports
- JSON cylinder data
- Complex form handling

### 6. `server/routes/proctor.js`
- Proctor test data
- JSON chart data (proctor_points, zav_points)
- Complex calculations

### 7. `server/routes/density.js`
- Density test reports
- JSON test rows
- Proctor references

### 8. `server/routes/rebar.js`
- Rebar inspection reports
- Simple CRUD operations

### 9. `server/routes/notifications.js`
- User notifications
- Simple queries

### 10. `server/routes/pdf.js`
- PDF generation (read-only queries)
- Complex data aggregation

## Migration Strategy

1. **Simple routes first** (notifications, rebar)
2. **Medium complexity** (projects, tasks)
3. **Complex routes** (wp1, proctor, density, pdf)

## Next Steps

1. Complete projects.js migration
2. Migrate simple routes (notifications, rebar)
3. Migrate medium complexity routes (tasks)
4. Migrate complex routes (wp1, proctor, density)
5. Update PDF generation routes
