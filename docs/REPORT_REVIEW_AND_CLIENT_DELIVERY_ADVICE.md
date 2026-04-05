# Report Review, Admin Approval & Client Delivery – Advice & Plan

This document outlines advice and implementation options for your client’s requested features:

1. **Visibility**: Admin sees whether “PM” has reviewed (or is reviewing) each report.
2. **Notifications**: “PM is reviewing” and “PM has completed review.”
3. **Bulk approve**: Admin can glance at reports, select multiple, and approve in one click; reports that need admin signature (e.g. Rebar + one other) then show that signature and are ready to send to client.
4. **Evening auto-send**: Every evening, completed/approved reports are automatically sent to the right client(s); multiple clients are supported (e.g. per project).

---

## 1. Clarify “PM” vs “Admin”

Your app currently has **ADMIN** and **TECHNICIAN** only. In practice, the “PM” (Project Manager) is usually the same person as the Admin who reviews and approves.

**Options:**

- **A. Keep current model**: “PM” = Admin. All “PM reviewing / PM completed” is done by Admin. No schema change.
- **B. Add PM role later**: If the client later wants a distinct PM (e.g. reviews first, then Admin signs), you can add a `PM` role and an extra status (e.g. `PM_APPROVED`) so that Admin only sees tasks that PM has already approved. For now, implementing with Admin-as-PM is enough.

**Recommendation:** Implement with **Admin as PM** (option A). Add a dedicated PM role only if the client explicitly asks for a separate reviewer.

---

## 2. “PM is reviewing” / “PM has completed review” visibility

Today you have:

- **Task status**: `READY_FOR_REVIEW` → (review) → `APPROVED` (or `REJECTED_NEEDS_FIX`).
- **task_history**: `SUBMITTED`, `APPROVED`, `REJECTED`, etc.

There is no explicit “someone is currently reviewing” state.

**Ways to show “PM reviewing” vs “PM completed review”:**

### Option A – Derive from existing data (no schema change)

- **“PM has completed review”** = task has a `task_history` row with `action_type = 'APPROVED'` or `'REJECTED'` (i.e. an Admin already acted).
- **“PM is reviewing”** = task is `READY_FOR_REVIEW` and has **no** APPROVED/REJECTED in history yet → show as “In PM queue” or “Awaiting review.”
- **“PM completed review”** = show “Approved” or “Rejected” from status/history.

Admin dashboard can show columns or filters, e.g.:

- **In queue**: `READY_FOR_REVIEW` and no approve/reject in history.
- **Under review**: optional (see Option B).
- **Review complete**: `APPROVED` or `REJECTED_NEEDS_FIX`.

### Option B – Add “under review” state (optional)

If the client wants to see “PM is **currently** reviewing this report” (not just “in queue”):

- Add a task field, e.g. `review_started_at TIMESTAMPTZ` (and optionally `review_started_by_user_id`).
- When an Admin opens the task for review (e.g. opens the report detail modal or the Rebar/Density/WP1 form), call an API that sets `review_started_at = now()` (if still `READY_FOR_REVIEW`).
- Dashboard logic:
  - `READY_FOR_REVIEW` + `review_started_at` set → “PM reviewing.”
  - `READY_FOR_REVIEW` + `review_started_at` null → “In queue.”
  - `APPROVED` / `REJECTED_NEEDS_FIX` → “PM completed review.”

**Recommendation:** Start with **Option A** (derive from `task_history`). Add Option B only if the client explicitly wants “currently reviewing” vs “in queue.”

---

## 3. Notifications: “PM is reviewing” and “PM has completed review”

Current behavior:

- When technician submits → Admins get: “&lt;Technician&gt; completed &lt;Task&gt; for Project &lt;Number&gt;.”
- When Admin approves → Technician gets: “Your report for Project &lt;Number&gt; has been approved.”
- Reject → Technician gets rejection notification.

To match the new visibility:

- **“PM has completed review”**: You already notify the technician on Approve/Reject. You can rename or duplicate the message to say “PM has completed review” or “Your report has been approved/rejected by PM” if the client likes that wording.
- **“PM is reviewing”**: Only meaningful if you add “under review” (Option B above). When you set `review_started_at`, send a notification to the technician, e.g. “Your &lt;Report&gt; for Project &lt;Number&gt; is now under PM review.”

**Recommendation:** Keep existing approve/reject notifications; optionally tweak copy to “PM completed review.” Add “PM is reviewing” notification only if you implement the “under review” flow (Option B).

---

## 4. Admin “glance + one-click bulk Approve” and signature-ready reports

**Current state:** Approve is per-task (one “Approve” per row in Dashboard / Tasks Dashboard). Reports that use the company signature (e.g. Rebar, and one other that uses tenant branding) already get the tenant signature on the PDF when generated.

**Desired flow:**

1. Admin sees a list of reports (e.g. all that are “PM review complete” or “Ready for admin approval”).
2. Can select multiple reports with one click (checkboxes).
3. Clicks a single “Approve” (or “Approve & mark ready for client”) and all selected tasks are approved.
4. Reports that require admin signature (Rebar + the other type) show that signature and are then “ready to be sent to client.”

**Implementation outline:**

1. **Bulk approve API**
   - New endpoint, e.g. `POST /api/tasks/bulk-approve` with body `{ taskIds: number[] }`.
   - For each `taskId`, same logic as existing `POST /tasks/:id/approve`: set status to `APPROVED`, update `last_edited_*`, write `task_history` (APPROVED), notify technician. Enforce tenant and admin-only.

2. **UI**
   - In **Tasks Dashboard** (or a dedicated “Reports for approval” view): add checkboxes per row for tasks in `READY_FOR_REVIEW` (and optionally only those that already have “PM completed review” if you distinguish that).
   - “Select all on this page” optional.
   - Single “Approve selected” button that calls `bulk-approve` with selected IDs.
   - After success, refresh list and clear selection.

3. **Which reports have “admin signature”?**
   - Rebar: already uses tenant signature (tenant branding) on the PDF.
   - “One other”: confirm which report type (e.g. Density, WP1/Compressive, Proctor). Your PDF routes use `tenantBranding.getPdfFooterData()` (or similar); any report that uses that footer has the company/signature block. So “reports that require admin signature” = those report types that render the tenant signature on the PDF. After bulk approve, those same reports are simply “approved” and when you generate PDF they already show the signature—no extra DB field strictly required for “has signature,” unless you want to record “signed at” for audit.

4. **“Ready to send to client”**
   - Today, `APPROVED` is the final state. If “ready to send to client” is just “approved and will be included in evening send,” you can treat `APPROVED` as the trigger for the evening job (see below).
   - If the client wants a **separate** step (e.g. “Admin approved” vs “Admin signed and released to client”), add a flag or timestamp on the task (or a small `report_delivery` table), e.g. `ready_for_client_at TIMESTAMPTZ` or `admin_signed_at`. Then:
     - Bulk approve could set both `status = APPROVED` and `ready_for_client_at = now()` for selected tasks.
     - Evening job sends only tasks where `ready_for_client_at` is set (and not yet sent—see below).

**Recommendation:** Implement bulk approve and use `APPROVED` as “ready for client” for the first version. Add `ready_for_client_at` (or “sent_to_client_at”) only if you need to separate “approved” from “released for delivery” or to track “already sent.”

---

## 5. Evening automatic send to client(s)

**Requirement:** Every evening, reports that are “completed” (e.g. approved and ready) are sent to the client. There can be multiple clients (e.g. one per project).

**Data model you already have:**

- **projects** has `client_name` and `customer_email` / `customer_emails` (JSONB array). So “client” = project-level; one project can have one or more recipient emails.

**Implementation outline:**

1. **Define “reports to send”**
   - e.g. Tasks with `status = 'APPROVED'` and (optional) `updated_at` or `ready_for_client_at` on the day you run the job, and only tasks that have a report (density, rebar, wp1, proctor) so you can generate a PDF.
   - If you add `sent_to_client_at`, then “to send” = approved and `sent_to_client_at IS NULL` (and maybe approved today or in a time window).

2. **Group by client**
   - Group approved tasks by `project_id`. For each project, get `client_name`, `customer_email` or `customer_emails`. Recipients = that project’s client email(s). So “multiple clients” = multiple projects, each with its own set of recipient emails.

3. **Evening job**
   - **Cron/scheduler**: Run a script or API daily at a fixed time (e.g. 6 PM). Options:
     - **Node script** (e.g. `scripts/send-daily-reports-to-clients.js`) run by OS cron or a scheduler (e.g. Render cron, GitHub Actions, or a small cron route protected by a secret).
     - **Server route** e.g. `POST /api/cron/send-daily-reports` secured by a shared secret or internal only.
   - Job logic (per tenant if multi-tenant):
     - Query approved tasks (with report data) that are “ready to send” and not yet sent (if you track that).
     - Group by project → for each project, collect PDFs (generate PDF for each task/report type: density, rebar, wp1, proctor as needed).
     - For each project, send one email (or one per report) to `customer_email` / `customer_emails` with the PDF(s) attached (or links). Use a transactional email provider (SendGrid, Resend, AWS SES, etc.) or SMTP.
   - After sending, set `sent_to_client_at = now()` on the task (or in a `report_delivery` table) so you don’t resend.

4. **Multi-tenant**
   - Run the job per tenant (query tenants, then for each tenant query projects and tasks with that `tenant_id`). Use tenant-specific branding/sender when sending email.

**Recommendation:** Add a `sent_to_client_at` (or similar) on `tasks` so you don’t resend the same report. Use project’s `customer_email` / `customer_emails` as recipients. Start with one email per project per day (one attachment or a zip of that day’s reports for that project).

---

## 6. Suggested implementation order

| Phase | What to do |
|-------|------------|
| **1** | **Visibility**: In Admin/Tasks Dashboard, add a column or filter “Review status” derived from `task_history`: “In queue” (READY_FOR_REVIEW, no approve/reject), “Review complete” (APPROVED/REJECTED). No DB change. |
| **2** | **Bulk approve**: Add `POST /api/tasks/bulk-approve` and checkboxes + “Approve selected” in Tasks Dashboard. |
| **3** | **Optional “under review”**: If client wants “PM is currently reviewing,” add `review_started_at` (+ optional notification) and set it when Admin opens the report. |
| **4** | **Notifications**: Adjust copy to “PM completed review” if desired; add “PM is reviewing” only if you did phase 3. |
| **5** | **Evening send**: Add `sent_to_client_at` on tasks (or a small delivery table), define “ready to send” (e.g. APPROVED and not sent), cron job that groups by project and sends PDFs to project’s `customer_email`/`customer_emails`. |

---

## 7. Quick reference: where things live today

- **Task status**: `server/routes/tasks.js` (status update, approve, reject); `tasks` table.
- **Task history**: `task_history` table; `logTaskHistory()` in `server/routes/tasks.js`.
- **Notifications**: `server/routes/notifications.js` (`createNotification`); used from `tasks.js` on submit and approve/reject.
- **Admin approve**: `POST /tasks/:id/approve` in `server/routes/tasks.js`; UI in `client/src/components/Dashboard.tsx` and `client/src/components/admin/TasksDashboard.tsx`.
- **Tenant signature on PDFs**: `server/utils/tenantBranding.js` (signature image, footer); used by PDF generation (rebar, density, wp1, proctor as applicable).
- **Project client**: `projects.client_name`, `projects.customer_email` / `projects.customer_emails`; used in PDF/routes already.

If you tell me which phase you want to implement first (e.g. bulk approve + “review status” column), I can outline concrete code changes next (endpoints, DB migration if any, and UI edits).
