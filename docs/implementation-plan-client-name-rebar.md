# Implementation Plan: Client Name, Report Auto-Populate, Rebar Workflow

This document is a concrete implementation plan for three features. File paths and component names are from the current codebase.

---

## Section 1: Client Name Under Project Information

### 1.1 Database

- **Projects table** currently has no `client_name` column (see `supabase/migrations/20250131000000_initial_schema.sql`: `projects` has `project_name`, `project_number`, etc., but no `client_name`).

**DB migration (Supabase):**

- Create a new migration file, e.g. `supabase/migrations/YYYYMMDD_add_project_client_name.sql`:
  - `ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;`
- Run migrations as usual for your environment.

**SQLite (legacy):**

- In `server/database.js`, the `projects` table is created in `db.serialize()`. Add a one-time `ALTER TABLE projects ADD COLUMN clientName TEXT` (or run it in a separate migration script so existing DBs get the column). The codebase uses camelCase for SQLite column names (e.g. `projectName`), so use `clientName` for SQLite.

### 1.2 API (server)

- **File:** `server/routes/projects.js`
- **Create (POST `/`):**
  - Add to validation: `body('clientName').optional().trim()`.
  - In the handler, read `clientName` from `req.body` and include it in `projectData` (e.g. `projectData.clientName = clientName != null ? String(clientName).trim() : null`). For Supabase use snake_case: `client_name`.
  - Ensure the inserted row is returned with `client_name` / `clientName` so the frontend receives it.
- **Update (PUT `/:id`):**
  - Add `body('clientName').optional().trim()` (or allow empty string to clear).
  - In the update branch, if `clientName !== undefined`, set `updateData.clientName` (SQLite) or `updateData.client_name` (Supabase).
- **GET one (GET `/:id`) and list (GET `/`):**
  - Ensure the project(s) returned include `client_name` (Supabase) / `clientName` (SQLite). The `db.get` / list path may need to explicitly select or map this field if the generic layer does not return all columns. Map to camelCase for JSON: `clientName`.

### 1.3 Frontend – Types and API

- **File:** `client/src/api/projects.ts`
  - In `Project` interface add: `clientName?: string;`
  - In `CreateProjectRequest` add: `clientName?: string;`

### 1.4 Frontend – Create Project form

- **File:** `client/src/components/admin/CreateProject.tsx`
  - Add state: `const [clientName, setClientName] = useState('');`
  - In the submit payload (around line 278), add `clientName` (trimmed or as-is per product rules).
  - In the form JSX, add a new field **after** the “Project Name *” block (after the input with `id="projectName"`):
    - Label: e.g. “Client Name”
    - Controlled input: `value={clientName}`, `onChange={(e) => setClientName(e.target.value)}`, optional (no `required` unless product requires it).

### 1.5 Frontend – Project details / edit

- **File:** `client/src/components/admin/ProjectDetails.tsx`
  - Add state (or extend existing project state) for `clientName` (e.g. `const [clientName, setClientName] = useState('');`).
  - When loading project (around line 86 where `setProjectName(projectData.projectName || '')`): set `setClientName(projectData.clientName || '');`
  - In the update payload (around line 463), include `clientName`.
  - After the “Project Name / Address” block (the `form-group` with `id="projectName"`, around lines 705–715), add a new `form-group`:
    - Label: “Client Name”
    - Controlled input bound to `clientName` and `setClientName`, included in the save/update payload.
  - After a successful update (around line 591), set `setClientName(updatedProject.clientName || '');`

### 1.6 Other project display locations (optional consistency)

- **TaskDetailModal** (`client/src/components/TaskDetailModal.tsx`): Shows `task.projectName` (around line 250). If you later add `task.projectClientName` from the API, you can show Client Name here.
- **TasksDashboard** (`client/src/components/admin/TasksDashboard.tsx`): Uses `task.projectName` (around line 425). Same optional addition for client name if task list includes it.
- **CreateTask, AssignWorkPackage, TechnicianDashboard, ProctorSummary, WP1Form**: These use `project.projectName` or `task.projectName`. No change required unless you decide to show Client Name in those UIs; then ensure the project/task payload includes `clientName` and render it.

---

## Section 2: Auto-Populate Client Name in Reports

Only **Density** and **Rebar** reports have an explicit client name field in the templates and data model. WP1 and Compressive Strength templates do not have a `{{CLIENT_NAME}}` placeholder.

### 2.1 Summary table

| Report type | Template file | API route (GET report) | Frontend form | Change to auto-populate client name |
|-------------|---------------|------------------------|---------------|--------------------------------------|
| **Density** | `server/templates/density-report.html` | `server/routes/density.js` GET `/task/:taskId` | `client/src/components/DensityReportForm.tsx` | In density GET: include `client_name` in project select; when building response (existing or default), set `clientName = data.clientName ?? task.projectClientName ?? ''`. No template/PDF change. |
| **Rebar** | `server/templates/rebar-report.html` | `server/routes/rebar.js` GET `/task/:taskId` | `client/src/components/RebarForm.tsx` | In rebar GET: include `client_name` in project select; when building response (existing or default), set `clientName = data.clientName ?? task.projectClientName ?? ''`. No template/PDF change. |

### 2.2 Density report

- **File:** `server/routes/density.js`
  - In the GET `/task/:taskId` handler, where the task is loaded from Supabase:
    - Change the `projects:project_id(...)` select to include `client_name`, e.g.  
      `projects:project_id(project_name, project_number, concrete_specs, soil_specs, client_name)`.
    - After building `task`, set `task.projectClientName = data.projects?.client_name ?? null` (or equivalent from the joined project).
  - For SQLite branch, add `p.clientName` (or `client_name` if you keep SQLite column name consistent) to the `SELECT` and set `task.projectClientName` from the row.
  - Where you attach project info to the report:
    - If `data` exists: `data.clientName = data.clientName ?? task.projectClientName ?? ''` (so saved report value wins; otherwise project client name).
    - If returning the default new-report object (the `res.json({ taskId, projectName, ..., clientName: '', ... })` block): set `clientName: task.projectClientName || ''` instead of `clientName: ''`.
- **PDF:** `server/routes/pdf.js` density branch already uses `data.clientName` from the report row. No change needed; once the form is pre-filled and saved, the PDF will have the value.

### 2.3 Rebar report

- **File:** `server/routes/rebar.js`
  - In GET `/task/:taskId`:
    - Supabase: change `projects:project_id(project_name, project_number)` to include `client_name`.
    - Set `task.projectClientName = data.projects?.client_name ?? null` when mapping the task.
    - SQLite: add project’s client name column to the SELECT and set `task.projectClientName`.
  - When returning existing report: add `data.clientName = data.clientName ?? task.projectClientName ?? ''` before sending (or when building the payload that includes project info).
  - When returning the default new-report object: set `clientName: task.projectClientName || ''` instead of `clientName: ''`.
- **PDF:** `server/routes/pdf.js` rebar GET/POST already use `data.clientName`. No change.

### 2.4 Frontend (Density and Rebar)

- **DensityReportForm.tsx** and **RebarForm.tsx** already bind `clientName` to the report payload and send it on save. No change required: when the API returns `clientName` from the project for new or empty reports, the form will show it and persist it when the user saves.

---

## Section 3: Rebar Workflow UI Changes

### 3.1 Method of test – make it editable

- **Current behavior:** In `client/src/components/RebarForm.tsx` (around lines 531–535), “METHOD OF TEST” is a static block:
  - `<label>METHOD OF TEST:</label>` and `<span className="static-text">Applicable ACI Recommendations and ASTM Standards</span>` (no input, not bound to state).
- **Component/state:** The form state is `formData` (type `RebarReport`). There is no `methodOfTest` in `RebarReport` or in the DB today.

**Plan:**

1. **DB:** Add column to `rebar_reports`:
   - New migration: `ALTER TABLE rebar_reports ADD COLUMN IF NOT EXISTS method_of_test TEXT;`
   - SQLite: in `server/database.js` (or migration), add `methodOfTest TEXT` to the rebar_reports table creation or an ALTER.

2. **API:** `server/routes/rebar.js`
   - GET: When returning report (existing or default), include `methodOfTest` (default `'Applicable ACI Recommendations and ASTM Standards'` when missing).
   - POST: Accept `methodOfTest` from `req.body` and persist it in the rebar_reports row (`method_of_test` for Supabase, `methodOfTest` for SQLite).

3. **Frontend type:** `client/src/api/rebar.ts` – add to `RebarReport`: `methodOfTest?: string;`

4. **RebarForm.tsx:**
   - Replace the static block with a field similar to General Contractor: a `form-field-inline` with label “METHOD OF TEST:” and an `<input type="text">` bound to `formData.methodOfTest`, `onChange` via `handleFieldChange('methodOfTest', e.target.value)`, default in initial data from API. Use `readOnly={!isEditable}` and the same `className` pattern as other editable fields so it respects edit mode.

5. **PDF template:** `server/templates/rebar-report.html` (around lines 238–242): Replace the static “Applicable ACI Recommendations and ASTM Standards” with a placeholder, e.g. `{{METHOD_OF_TEST}}`.

6. **PDF route:** `server/routes/pdf.js` (rebar GET and POST branches): When building the data object for the template, set `methodOfTest` from report data (default to `'Applicable ACI Recommendations and ASTM Standards'` if empty). Replace in HTML: `html.replace('{{METHOD_OF_TEST}}', escapeHtml(data.methodOfTest || 'Applicable ACI Recommendations and ASTM Standards'));`

### 3.2 Result/Remark – replace with single text box

- **Current behavior:** In `RebarForm.tsx` (around 537–579), the “Results / Remarks” section contains:
  - A section label “Results / Remarks:”
  - A prefilled paragraph (“On the above-mentioned date, a representative of MAK…”).
  - A “Location Detail” textarea (`formData.locationDetail`).
  - A “Wire Mesh Spec” input (`formData.wireMeshSpec`).
  - Another prefilled paragraph (“The wire mesh was checked for…”).
- **Requirement:** Replace this entire block with a **single text box** for client-entered text. Drawing and Technician Name stay as they are.

**Plan:**

1. **DB:** Add a single column for the new content, e.g. `result_remarks TEXT` (Supabase) / `resultRemarks TEXT` (SQLite). Optionally keep `location_detail` and `wire_mesh_spec` for backward compatibility (existing reports) but the UI and PDF will no longer use them for new content; or migrate existing content into `result_remarks` and deprecate the old fields. For a minimal change, add `result_remarks` and use it as the single source of truth for the new UI/PDF.

2. **API:** `server/routes/rebar.js`
   - GET: Return `resultRemarks` from the report row (or map `result_remarks` → `resultRemarks`). For existing rows with no `result_remarks`, you can optionally backfill from `locationDetail` + `wireMeshSpec` for display, or leave blank.
   - POST: Accept `resultRemarks` and save to `result_remarks` / `resultRemarks`.

3. **Frontend type:** `client/src/api/rebar.ts` – add `resultRemarks?: string;` to `RebarReport`. You can keep `locationDetail` and `wireMeshSpec` in the type for backward compatibility but remove them from the form UI.

4. **RebarForm.tsx:**
   - Remove from the Results / Remarks section:
     - The two prefilled paragraphs.
     - The “Location Detail” textarea and its label.
     - The “Wire Mesh Spec” input and its label.
   - Replace with a single block:
     - Keep the section label “Results / Remarks:” (or “Result/Remark” if you prefer).
     - One `<textarea>` bound to `formData.resultRemarks`, `onChange` via `handleFieldChange('resultRemarks', e.target.value)`, with appropriate `rows` and `readOnly={!isEditable}`. No extra labels/fields inside the section.

5. **PDF template:** `server/templates/rebar-report.html` (around 244–259). Replace the entire “Results / Remarks Section” (title + prefilled paragraph + `{{LOCATION_DETAIL}}` + wire-mesh paragraph) with a single block that outputs one placeholder, e.g. `{{RESULT_REMARKS}}`, with appropriate markup (e.g. a div with class for styling/whitespace).

6. **PDF route:** `server/routes/pdf.js` (rebar GET and POST): When building data for the template, pass `resultRemarks` (from report data). In the replacement step, add e.g. `.replace('{{RESULT_REMARKS}}', escapeHtml(data.resultRemarks || ''))`. Remove or leave unused the replacements for `{{LOCATION_DETAIL}}` and `{{WIRE_MESH_SPEC}}` depending on template changes.

### 3.3 Spacing between Result section and Drawing section

- **Requirement:** No large empty gap when the Result text is short; spacing should be dynamic.

**Files and approach:**

- **File:** `client/src/components/RebarForm.css`
  - The Results / Remarks block is wrapped in a container (e.g. `.form-section`). Ensure this container has **no** `min-height` so it doesn’t force a large gap.
  - Use normal block margin (e.g. `margin: 20px 0` or similar) and no fixed height. The single textarea will dictate the height; the section should grow/shrink with content.
- **File:** `client/src/components/RebarForm.tsx`
  - Structure: After the Result/Remark section, the next block is “Drawings” (`.form-row` with Drawings input). Avoid wrapping the Result section in a container that has `min-height` or `flex: 1` that would expand. Prefer a simple structure like `<div className="form-section">...</div>` followed by the existing Drawings `.form-row`.
- **Approach:** Use **flex** only where needed for the overall form layout; for the Result section use **block layout** and **no min-height**. Optionally add a small bottom margin (e.g. `margin-bottom: 16px`) on the Result section so the gap to Drawings is consistent but still small when the text is short.

**Summary:** No min-height on the Result/Remarks section; use normal margins; single textarea drives height; Drawings section follows immediately so spacing stays dynamic.

---

## Summary checklist

- **Section 1:** Migration(s) for `projects.client_name` / `clientName`; projects API create/update/get; `projects.ts` types; CreateProject and ProjectDetails forms + state and payloads.
- **Section 2:** Density and Rebar GET report: project select includes `client_name`; default/prefill `clientName` from `task.projectClientName`; no change to PDF or templates for auto-populate.
- **Section 3:** Rebar: add `method_of_test` and `result_remarks` to DB; rebar API GET/POST; RebarReport type; RebarForm – editable Method of Test, single Result/Remark textarea; rebar-report.html and pdf.js placeholders and replacements; RebarForm.css – no min-height, dynamic spacing for Result section.
