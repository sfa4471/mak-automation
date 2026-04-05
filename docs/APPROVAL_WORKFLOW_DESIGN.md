# Approval Workflow Design (ELM Tree–Style)

This document describes how to support an approval process where:
- **Technician** sends the report for review.
- **PM (Project Manager)** reviews and clicks Accept or Reject (optional role; your client may not have one yet).
- If **Accept**, the report goes to **Admin/Engineer** (you) for final review and sending.
- PM can be the same person as the main engineer (one user with both PM and Admin capabilities, or a single “reviewer” step).

---

## 1. Current State (What You Have Now)

- **Roles:** `ADMIN`, `TECHNICIAN` only.
- **Task status flow:**  
  `ASSIGNED` → `IN_PROGRESS_TECH` → `READY_FOR_REVIEW` → `APPROVED` or `REJECTED_NEEDS_FIX`
- **Who can approve/reject:** Only **ADMIN** (you). Technician submits → you approve or reject.
- This already matches “technician + himself”: you are the only reviewer and the one who “sends” the report.

So for your client’s **current** setup (only technician + himself), no change is required; the existing flow is correct.

---

## 2. Target Behavior (When a PM Exists)

When your client later hires a PM (or you want to act as PM first, then as engineer):

| Step | Who                | Action                    | Resulting status / next step                    |
|------|--------------------|---------------------------|-------------------------------------------------|
| 1    | Technician         | Submits report            | `READY_FOR_REVIEW`                             |
| 2    | PM                 | Reviews → **Reject**      | `REJECTED_NEEDS_FIX` (back to technician)       |
| 2    | PM                 | Reviews → **Accept**      | `PENDING_FINAL_APPROVAL` (goes to Admin/Engineer) |
| 3    | Admin / Engineer   | Final review → Approve    | `APPROVED` (ready to send)                     |

So we need:

- A way to have a **PM** (or “reviewer”) role.
- A new status: **`PENDING_FINAL_APPROVAL`** (report accepted by PM, waiting for admin/engineer).
- Logic so that:
  - If the tenant **does not** use a PM step: `READY_FOR_REVIEW` → only Admin can approve → `APPROVED` (current behavior).
  - If the tenant **does** use a PM step: only PM can move `READY_FOR_REVIEW` → Accept/Reject; Accept → `PENDING_FINAL_APPROVAL`; only Admin can move `PENDING_FINAL_APPROVAL` → `APPROVED`.

“PM can also be the main engineer” is handled by either:
- Having one user with a role that can do both (e.g. **PM** can approve from `READY_FOR_REVIEW` and your tenant has no separate “final approver”), or
- Using a **tenant setting** to choose “single-step” (only Admin) vs “two-step” (PM then Admin). When it’s only the client, they use single-step; when they add a PM, they switch to two-step.

---

## 3. Recommended Approach: Optional Two-Stage with PM Role

### 3.1 Roles

- Keep: **ADMIN**, **TECHNICIAN**.
- Add: **PM** (Project Manager).
  - PM can: approve or reject tasks in `READY_FOR_REVIEW` (same as today’s admin for that step).
  - PM cannot: create projects, manage technicians, or perform “final” approve (that stays with Admin when two-stage is on).

### 3.2 Task Statuses

- Keep: `ASSIGNED`, `IN_PROGRESS_TECH`, `READY_FOR_REVIEW`, `APPROVED`, `REJECTED_NEEDS_FIX`.
- Add: **`PENDING_FINAL_APPROVAL`**  
  Meaning: “PM has accepted; waiting for Admin/Engineer to final-approve (and send).”

### 3.3 Tenant-Level Setting (How to Support “Only Technician + Himself” vs “Technician + PM + Him”)

Add a tenant setting so behavior is explicit and easy to change later:

- **Option A – Explicit workflow mode (recommended)**  
  - `approval_workflow`: `"single"` | `"two_stage"`  
  - `single`: Only Admin can approve from `READY_FOR_REVIEW` → `APPROVED` (current behavior).  
  - `two_stage`: PM approves/rejects from `READY_FOR_REVIEW`; on Accept → `PENDING_FINAL_APPROVAL`; only Admin can move `PENDING_FINAL_APPROVAL` → `APPROVED`.

- **Option B – Implicit from users**  
  - If tenant has at least one user with role `PM`, use two-stage; otherwise single-stage.  
  - Simpler (no new setting), but less explicit and harder to “turn on” two-stage before the first PM is created.

Recommendation: use **Option A** (tenant setting). Default for existing tenants: `"single"` so nothing changes until the client turns on two-stage and adds a PM.

### 3.4 Who Can Do What (Summary)

| Status                  | Single-stage tenant           | Two-stage tenant                    |
|-------------------------|-------------------------------|------------------------------------|
| `READY_FOR_REVIEW`      | Admin: Approve → APPROVED     | PM: Approve → PENDING_FINAL_APPROVAL |
|                         | Admin: Reject → REJECTED_NEEDS_FIX | PM: Reject → REJECTED_NEEDS_FIX  |
| `PENDING_FINAL_APPROVAL`| (not used)                    | Admin: Approve → APPROVED          |

So:

- **Current client (only technician + himself):**  
  Tenant stays `approval_workflow = "single"`. He continues to approve from `READY_FOR_REVIEW` as Admin. No PM user needed.
- **Future (technician + PM + him):**  
  Set `approval_workflow = "two_stage"`, create a user with role PM. Technician submits → PM reviews (accept/reject) → on accept, task goes to him (Admin) for final approval/sending.

If “PM is the main engineer” (same person), that person can have role **ADMIN** and the tenant can stay in **single-stage** (they do the only approval step). When they want a separate reviewer, they add a PM and switch to two-stage.

---

## 4. Database and Schema Changes

1. **Users / roles**  
   - Allow `role` to be `'ADMIN' | 'TECHNICIAN' | 'PM'` (migration: alter check constraint or add enum).

2. **Tasks**  
   - Add status `PENDING_FINAL_APPROVAL` to the task status check constraint.  
   - Optional but useful: add `reviewed_by_user_id` (and maybe `reviewed_at`) when moving to `PENDING_FINAL_APPROVAL` or `APPROVED`, so you know who (PM or Admin) did each step.

3. **Tenants**  
   - Use existing `workflow_config` JSONB, or add a dedicated column, e.g.  
     `approval_workflow TEXT DEFAULT 'single' CHECK (approval_workflow IN ('single', 'two_stage'))`.  
   - Default `'single'` for all existing tenants.

4. **Task history**  
   - Keep logging who approved/rejected; extend as needed for “PM approved” vs “Admin approved” (e.g. action types or notes).

---

## 5. Backend (API) Logic

- **GET task / list tasks**  
  - Return new status `PENDING_FINAL_APPROVAL` and any new fields (`reviewed_by_user_id`, etc.).

- **POST `/:id/approve`**  
  - Resolve tenant’s `approval_workflow` (and optionally that the task is in the right status).
  - **If `READY_FOR_REVIEW`:**
    - Single-stage: only **ADMIN** can call approve → set status `APPROVED`.
    - Two-stage: only **PM** can call approve → set status `PENDING_FINAL_APPROVAL`; optionally set `reviewed_by_user_id`, log “PM approved”.
  - **If `PENDING_FINAL_APPROVAL`:**
    - Only **ADMIN** can call approve → set status `APPROVED`; log “Admin approved (final)”.
  - Return 403 if the current user’s role is not allowed for that transition.

- **POST `/:id/reject`**  
  - From `READY_FOR_REVIEW`: in two-stage, only **PM** (or Admin) can reject; in single-stage, only **ADMIN**.  
  - Same request body (e.g. `rejectionRemarks`, `resubmissionDueDate`).  
  - Set status `REJECTED_NEEDS_FIX` and create notification for technician.

- **Auth middleware**  
  - Add a helper like `requireReviewer` (PM or Admin) for the approve/reject routes, and inside the route decide behavior based on `approval_workflow` and current status.

---

## 6. Frontend (UI) Implications

- **Tasks list / dashboard**  
  - Show status `PENDING_FINAL_APPROVAL` with a label like “Pending your approval” (for Admin) or “Pending final approval” (for PM).  
  - For Admin: show both “Ready for review” and “Pending final approval” queues; for PM (when two-stage): show only “Ready for review.”

- **Approve / Reject buttons**  
  - Show “Approve” / “Reject” only when the current user is allowed to perform that action for the task’s current status (based on role and tenant workflow).  
  - Optional: different button label for final step, e.g. “Approve & send” when moving from `PENDING_FINAL_APPROVAL` to `APPROVED`.

- **Technician**  
  - No change: they still submit to “review”; they don’t need to know whether it’s one or two steps.

- **Settings (Admin)**  
  - In tenant or company settings, add a dropdown or toggle: “Approval workflow: Single step (only me) / Two steps (PM then me).”  
  - When set to “Two steps,” show or enable “Manage PMs” (or “Manage users” with role PM) if you add PM management.

---

## 7. Implementation Order (Phased)

**Phase 1 – No code change for current client**  
- Document that current flow is “technician → you (Admin)”; no PM, no second step.  
- Optionally add the tenant setting `approval_workflow` with default `single` and no UI change.

**Phase 2 – Add PM role and two-stage support**  
- Migration: add `PM` to role check; add `PENDING_FINAL_APPROVAL`; add tenant `approval_workflow` (default `single`).  
- Backend: implement approve/reject rules above; add `requireReviewer` or equivalent.  
- Frontend: show new status; show Approve/Reject only when allowed; add workflow setting in admin settings.

**Phase 3 – Optional**  
- “Manage PMs” (create/edit users with role PM).  
- Notifications: notify Admin when task moves to `PENDING_FINAL_APPROVAL`; optionally notify PM when technician submits.

---

## 8. Summary Table for Your Client

| Scenario                          | Tenant setting   | Who reviews first | Who does final approve |
|----------------------------------|------------------|--------------------|-------------------------|
| Only technician + himself (now)  | Single           | Admin (him)        | N/A (one step)          |
| Technician + PM + him (future)   | Two-stage        | PM                 | Admin (him)             |
| PM is the same as engineer       | Single (or two-stage with one user as both PM and Admin) | Same person | Same person |

This gives you a clear path: no change today, and a simple way to add an ELM tree–style approval process when they add a PM.
