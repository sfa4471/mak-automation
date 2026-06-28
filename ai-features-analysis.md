# Crestfield AI Features — Complete Analysis & Testing Guide

> **How to read this document:** Open in VS Code (it renders with formatting) or paste into Google Docs / Word.  
> Written for a non-technical audience. Every feature is explained with a real-world example from the CMT industry.

---

## Table of Contents

1. [What Crestfield Was Before AI (The Baseline)](#1-baseline)
2. [The Big Picture — What Changed](#2-big-picture)
3. [Phase-by-Phase Feature Breakdown](#3-phases)
4. [Before vs After Comparison](#4-comparison)
5. [Complete Testing Guide](#5-testing)
6. [Go-to-Market Positioning](#6-gtm)
7. [Feature Rollout Recommendation](#7-rollout)

---

## 1. What Crestfield Was Before AI (The Baseline) {#1-baseline}

Before any of these phases were built, Crestfield was a solid **manual field reporting system**. Here is exactly what it could do:

### What It Could Do (Original)

| Capability | How It Worked |
|---|---|
| Field Reports | Technicians filled out density, rebar, proctor, compressive strength reports on their phone/tablet |
| PDF Generation | When a PE approved a report, a PDF was automatically generated and emailed |
| Task Assignment | Admin manually picked a technician and assigned them to a workorder |
| Project Management | Admin created projects, added specs manually |
| Invoicing | Admin manually calculated and created invoices |
| Notifications | Tech got an email when assigned. PE got notification when report submitted |

### What It Could NOT Do (Original)

- Could not detect if test results were out of spec before admin reviewed
- Could not suggest who to assign (admin had to know technician schedules from memory)
- Could not alert admin when a project was ready to bill
- Could not write any part of the PE report narrative
- Could not receive job requests from clients by email
- Could not learn from mistakes or get smarter over time

### The Admin's Day (Before AI)

A typical morning for a Crestfield admin looked like this:

1. Check email for new job requests from clients → manually create workorders
2. Open calendar, check which techs are free → manually assign
3. Check all projects to see if any are ready to invoice → time consuming
4. Open every submitted report → read the numbers → decide if anything is out of spec
5. Write or edit PE notes from scratch for each report

**Estimate: 3-5 hours of administrative work per day just for coordination.**

---

## 2. The Big Picture — What Changed {#2-big-picture}

Think of the AI features in three layers, like a pyramid:

```
        ┌─────────────────────────────┐
        │   PHASE 8 + 9               │
        │   Self-Improving AI         │  ← The system learns from mistakes
        │   (Feedback Loop)           │
        └─────────────────────────────┘
        ┌─────────────────────────────┐
        │   PHASE 5, 6, 7             │
        │   Autonomous Actions        │  ← AI acts without asking (with safeguards)
        │   (Tier 2 Automation)       │
        └─────────────────────────────┘
        ┌─────────────────────────────┐
        │   PHASE 1, 2, 3, 4          │
        │   AI Assists Human          │  ← AI helps, human decides
        │   (Tier 1 Automation)       │
        └─────────────────────────────┘
        ┌─────────────────────────────┐
        │   ORIGINAL CRESTFIELD       │
        │   Manual Everything         │  ← Starting point
        └─────────────────────────────┘
```

### The Two Hard Rules That Never Change

No matter how autonomous the system gets, two things are **always human decisions**:

1. **A PE stamp on a report is NEVER automatic** — a licensed engineer must approve every field report before it's final
2. **An invoice is NEVER pushed to QuickBooks automatically** — a human must confirm every invoice push

These are not technical limitations. These are regulatory and business requirements baked permanently into the system.

---

## 3. Phase-by-Phase Feature Breakdown {#3-phases}

---

### PHASE 1 — QC Result Screening
**In one sentence:** *The system reads test results and flags problems before the admin opens the report.*

#### What It Does

When a technician submits a report (moves it to "Ready for Review"), the system automatically:
- Loads the test data from the report
- Loads the project's required specs (compaction %, concrete strength, etc.)
- Compares actual results vs required specs
- Stamps a result badge: **PASS**, **FAIL**, **ATTENTION**, or **SKIPPED**

This happens in the background — the technician's submission is never slowed down.

#### Real-World Example

> **Scenario:** Riverside Commercial Project requires 95% compaction for structural fill.  
> Technician submits a density report with these 4 readings: 96%, 94%, 97%, 91%.
>
> **Before Phase 1:** Admin opens the report, manually scans each number, mentally compares to 95% spec, realizes reading #4 at Station 12+50 is failing.  
>
> **After Phase 1:** Admin opens the dashboard and sees a red **FAIL** badge on this report before even clicking on it. Badge says: "1 of 4 tests below specified 95% — Location: Station 12+50 (91%)". Admin immediately knows the situation.

#### What Each Badge Means

| Badge | Color | Meaning |
|---|---|---|
| PASS | Green | All results meet spec |
| FAIL | Red | One or more results below spec |
| ATTENTION | Yellow | Results near the threshold — worth a closer look |
| SKIPPED | Grey | No specs configured for this project yet |

#### Why SKIPPED Is Not the Same as PASS

If a project has no specs set up, the system shows SKIPPED — not a green pass. This is intentional. A silent pass on a project with no specs could hide real problems. SKIPPED tells the admin "we couldn't check because no spec exists — set up specs for this project."

#### What It Does NOT Do

- Does NOT reject the report
- Does NOT prevent the technician from submitting
- Does NOT auto-approve passing reports
- The PE still reviews every report regardless of badge color

---

### PHASE 2 — Dispatch Suggestions (Tier 1)
**In one sentence:** *When assigning a technician, the system tells you who is free and who has conflicts.*

#### What It Does

When an admin opens the workorder edit/create form and sets a scheduled date, a new "Auto-assign" button appears. Clicking it runs a conflict check across all technicians:

- Are they already assigned to another workorder that day?
- Do they have an availability block (vacation, equipment hold, etc.)?
- Which ones have worked this project before (preferred candidates)?

Returns a ranked list of candidates. Admin clicks one to fill the dropdown. Admin still hits Save to commit.

#### Real-World Example

> **Scenario:** You need someone for a Wednesday workorder at Oakwood Subdivision.
>
> **Before Phase 2:** Admin mentally recalls: "I think Mike is on Oak Street that day... or was that Thursday? Let me check the calendar..." — 5 minutes of cross-referencing.
>
> **After Phase 2:** Admin clicks "Auto-assign." System returns:
> - ✅ **Sarah Chen** — No conflicts, worked this project last month (Recommended)
> - ✅ **Mike Torres** — No conflicts
> - ❌ **James Park** — Already assigned to WO-0041 (Downtown Plaza, same day)
>
> Admin clicks Sarah Chen, her name fills the dropdown. Admin clicks Save.

#### Tier 1 Means Human Confirms

In Phase 2, the system SUGGESTS but never writes to the database until admin clicks Save. This is Tier 1 — human in the loop for every decision.

---

### PHASE 3 — Invoice Readiness Alerts
**In one sentence:** *The system emails admin when a project is complete and ready to bill — no more checking manually.*

#### What It Does

A background job runs every 30 minutes and checks every project for this condition:
- All workorders on the project are in "complete" or "approved" status (no open field work)
- At least one workorder has billing status "unbilled"
- No invoice has been created yet

When this condition is true, admin gets an email:

> **Subject:** Riverside Commercial — Ready to Invoice  
> **Body:** All field work is complete on Riverside Commercial. Estimated billable amount: $4,250. Includes 3 workorders, 14 labor hours, 48 cylinders. Click here to open the invoice pool.

#### Real-World Example

> **Scenario:** Riverside Commercial Project has 5 workorders. 4 have been approved for weeks. The 5th workorder (re-test after a failed density) just got completed today.
>
> **Before Phase 3:** Admin doesn't know the 5th workorder is done until they happen to check the project page. Invoice sits unbilled for days.
>
> **After Phase 3:** 30 minutes after the 5th workorder is marked complete, admin gets an email alert. Project gets invoiced the same day.

#### What It Does NOT Do

- Does NOT create the invoice automatically
- Does NOT push anything to QuickBooks
- Admin still opens the invoice pool, reviews line items, and clicks Generate Invoice

---

### PHASE 4 — Report Narrative Draft
**In one sentence:** *AI writes a first draft of the PE notes so the engineer edits instead of writing from scratch.*

#### What It Does

When a technician submits a report (READY_FOR_REVIEW status), the system:
1. Reads the full test data (all readings, locations, pass/fail)
2. Reads the project specs (what was required)
3. Calls Claude (Anthropic's AI) to write a professional CMT narrative
4. Saves the draft to the "PE Notes" field on the task

The PE sees a yellow "AI Draft — edit before approving" label. They edit, remove the label, and approve.

#### Real-World Example

> **Scenario:** Density report with 4 tests: 3 passing, 1 failing at a specific location.
>
> **Before Phase 4:** PE opens the report, reads the numbers, opens a blank text field, and writes:  
> *"Three of four tests met the specified 95% minimum compaction requirement per project specifications. Test No. 4 at Station 12+50 recorded 91.2%, below the specified minimum. Re-testing is recommended at this location prior to placement of subsequent lifts."*  
> — Takes 5-10 minutes per report.
>
> **After Phase 4:** PE opens the report and sees this already written in the PE Notes field:  
> *"Four in-place density tests were performed on structural fill at the referenced project location. Tests 1, 2, and 3 at Stations 10+00, 11+25, and 14+00 recorded compaction values of 96.3%, 97.1%, and 95.8% respectively, meeting the project-specified minimum of 95% of maximum dry density (ASTM D1557). Test No. 4 at Station 12+50 recorded 91.2%, which does not meet the specified minimum. It is recommended that the contractor re-compact and re-test at Station 12+50 prior to placing additional structural fill or pavement layers."*  
>
> PE reads it, makes a small edit to add their professional judgment, clicks Approve. Takes 2 minutes instead of 10.

#### What It Does NOT Do

- Does NOT approve the report
- The PE stamp is always a human decision
- AI label is always visible when draft is unedited, so there's no confusion about authorship

---

### PHASE 5 — Email Intake Parsing + Spec Extraction (Tier 1)
**In one sentence:** *Clients email job requests and the system automatically reads them, creates draft workorders, and even extracts specs from attached PDFs.*

#### What It Does

This is a two-part feature:

**Part A — Scheduling Intake:**
- Client sends an email to your intake address (e.g., `jobs@intake.crestfield.app`)
- SendGrid receives it and forwards to your server
- Claude reads the email and extracts: project name, date, test types, site location, requester
- System fuzzy-matches the project name to your project database
- Creates a "draft workorder" in the Intake Queue for admin review

**Part B — Spec Extraction:**
- If the email has a PDF attached (geotech report, civil drawings, specs sheet)
- Claude reads the PDF as a native document (not a scan — actual PDF content)
- Extracts soil specs (compaction %, moisture ranges) and concrete specs (f'c, slump, air content)
- Pre-populates the project's spec fields
- Admin can accept or skip the spec update

#### Real-World Example

> **Scenario:** Client engineer at Brightwater Development emails:  
> *"Hi, we need density and cylinder pickup testing at Brightwater Residential Phase 3 this coming Thursday July 10th. Site is at 4420 Lakeview Drive. Let me know if you need anything else. — David Kim, PE"*  
> And attaches the geotech report PDF.
>
> **Before Phase 5:** Admin reads the email, opens Crestfield, creates a workorder manually (project, date, location, test types), opens the project specs page and manually enters compaction requirements from the PDF. 10-15 minutes.
>
> **After Phase 5:** 30 seconds after the email arrives, admin sees a card in the Intake Queue:
> - **Project:** Brightwater Residential Phase 3 (matched, confidence 94%)
> - **Date:** July 10, 2026
> - **Tests:** DENSITY_MEASUREMENT, CYLINDER_PICKUP
> - **Site:** 4420 Lakeview Drive
> - **Specs from PDF:** Structural Fill → 95% compaction, ±2% moisture. Slab on Grade → 4000 psi, 4" slump.
>
> Admin clicks **Accept + Apply Specs**. Done in 10 seconds.

#### Confidence Badges

Every extracted field shows a confidence badge:
- **Green (High):** Explicitly stated in the email
- **Yellow (Medium):** Clearly implied
- **Red (Low):** Inferred or guessed — admin should verify

#### What It Does NOT Do

- Does NOT create the actual workorder without admin clicking Accept
- Does NOT overwrite existing project specs — merges them (existing manual specs are preserved)
- Admin can always click "Accept — Skip Specs" if they don't trust the PDF extraction

---

### PHASE 6 — Auto-Assign Dispatch (Tier 2)
**In one sentence:** *When exactly one technician is free, the system assigns them automatically with a 30-minute cancellation window.*

#### What It Does

This upgrades Phase 2 from "suggest" to "act" — but only when the decision is unambiguous:

1. Admin clicks "Auto-assign" on a workorder (or it can be triggered automatically)
2. System checks all technicians for conflicts and availability blocks
3. **If exactly ONE technician is free:** 
   - Assigns them to the workorder immediately
   - Queues the assignment email with a 30-minute hold
   - Shows an amber countdown strip on the dashboard
4. **If multiple are free:** Falls back to Tier 1 — shows candidates, admin picks
5. **If none are free:** Returns conflict list, admin resolves manually

#### The Hold Window (The Safety Net)

The 30-minute hold is critical. Assignment email is NOT sent immediately. During this window:

```
[ASSIGNED: Sarah Chen → Oakwood Subdivision WO-0045]  [23 min remaining]  [Cancel]
```

Admin sees this strip on the dashboard. If they realize it's wrong (wrong project, wrong tech, client called to reschedule), they click Cancel. The email never goes out and the assignment is cleared.

After 30 minutes, email fires automatically.

#### Real-World Example

> **Scenario:** Tuesday morning, 3 new workorders come in for Friday.  
> Friday availability: Mike → blocked (vacation). James → already on WO-0043. Sarah → free.
>
> **Before Phase 6:** Admin checks each workorder, cross-references calendar, assigns Sarah to all 3. 15 minutes.
>
> **After Phase 6:** System auto-assigns Sarah to all 3 within seconds. Admin sees 3 amber strips on dashboard. Reviews them in 30 seconds. All correct. Does nothing. Emails fire 30 min later.

#### Availability Blocks

Admins can pre-block a technician for specific dates:
- "Mike on vacation July 14-18"
- "Gauge #3 in calibration July 12"

Auto-assign respects these blocks and skips blocked technicians.

---

### PHASE 7 — Intake Auto-Accept (Tier 2)
**In one sentence:** *High-confidence email intakes skip the review queue and become workorders automatically.*

#### What It Does

Upgrade from Phase 5 — instead of creating a draft for admin to review, the system commits directly when ALL of these are true:

- Tenant has enabled "Auto-accept" in Settings → Automation
- Project match score ≥ 85% (system is very confident about which project)
- All key field confidences ≥ configured threshold (default 92%)
- Date is present and clear
- Test types are present and clear
- Circuit breaker is NOT active (Phase 8 hasn't detected too many errors)

If any condition fails → drops back to draft queue (Phase 5 behavior).

#### Real-World Example

> **Scenario:** Brightwater Development sends the same style of request every week:  
> *"Please schedule weekly density testing at Brightwater Phase 3 this Monday July 14."*  
>
> **After 10 of these emails, pattern is clear:**
> - Project match: 97% (always maps to same project)
> - Date confidence: 95% (date always clearly stated)
> - Test type confidence: 98% ("density testing" is unambiguous)
>
> **Before Phase 7:** Still goes to Intake Queue. Admin clicks Accept on the same thing every week.
>
> **After Phase 7 (enabled by admin toggle):** Email arrives → workorder created → tech assigned (if Phase 6 also active) → zero admin interaction for routine jobs.

#### How to Turn It On (Per Tenant)

Settings → Automation → "Auto-accept high-confidence intakes" → ON  
Set the confidence threshold (70-99%). Start at 92% and adjust based on calibration data.

---

### PHASE 8 — Correction Capture + Few-Shot Feedback
**In one sentence:** *Every time admin corrects an AI extraction, the system remembers and does better next time.*

#### What It Does

This is the learning layer. Three components:

**A — Correction Capture**  
When an admin edits a draft before accepting (changes the date, picks a different project, adjusts test types), the system automatically:
- Records what AI extracted vs what human corrected
- Stores it in a `intake_correction_examples` table with context

**B — Few-Shot Injection**  
Before the next extraction for the same tenant, the system:
- Pulls the last 5 corrections from the database
- Injects them into the Claude prompt as examples: "Last time you saw an email from this client, you extracted X but the correct answer was Y"
- Claude uses these examples to avoid repeating the same mistake

**C — Circuit Breaker**  
If correction rate exceeds 20% in a rolling 7-day window:
- Auto-accept is automatically suspended (even if admin has it turned on)
- Dashboard shows a warning: "Circuit breaker active — auto-accept paused"
- Admin is alerted to investigate why accuracy dropped

#### Real-World Example

> **Scenario:** A client at ABC Concrete always sends requests for "cylinder pickup" but their emails say "pick up the breaks" — an informal term the system initially misses.
>
> **Round 1:** AI extracts testTypes: [] (empty). Admin corrects to CYLINDER_PICKUP. Correction stored.
>
> **Round 2:** AI prompt now includes: *"Past correction: When email said 'pick up the breaks', correct testType was CYLINDER_PICKUP."* AI extracts correctly this time.
>
> **Round 3, 4, 5:** AI continues getting it right. No correction needed. Accuracy score climbs.

#### What the Circuit Breaker Looks Like

```
┌──────────────────────────────────────────────────────┐
│ ⚠️  Circuit Breaker Active                           │
│ Correction rate is 28% this week (above 20% limit). │
│ Auto-accept is paused until accuracy improves.       │
└──────────────────────────────────────────────────────┘
```

This prevents a bad streak (maybe a new client with unusual email formats) from causing a flood of wrong auto-accepted workorders.

#### In AI Terms

This technique is called **Retrieval-Augmented Few-Shot Learning**. Instead of retraining Claude (which would require Anthropic), we inject labeled examples from your real data into the prompt at inference time. The model hasn't changed — but the instructions have gotten better, tailored to your specific tenants.

---

### PHASE 9 — Outcome Verification (Real-World Feedback Loop)
**In one sentence:** *After the job is actually done in the field, the system compares what it predicted vs what really happened — and learns from the difference.*

#### What It Does

Phase 8 learns from human edits before acceptance. Phase 9 learns from what happened after acceptance — the real world outcome.

**Two types of outcome signals:**

1. **Scheduling Accuracy** (outcomeCollector.js, runs every 30 min):
   - For every auto-accepted workorder that is now complete/approved
   - Compares: AI's predicted project vs actual project on the workorder
   - Compares: AI's predicted date vs actual scheduled date
   - Records whether they matched or didn't
   - When 50+ signals exist for a tenant AND mismatch rate is high → feeds mismatches back into Phase 8's correction bank

2. **PE Approval Signals** (tasks.js):
   - When a PE approves a report from an auto-accepted workorder
   - Records a "pe_approved" signal — this is positive confirmation the whole chain worked

#### The Dormant Phase

Phase 9 is built and deployed but **stays silent** until:
- 50 outcome signals have accumulated for a tenant

This prevents the system from overreacting to small samples. With only 5 completed workorders, a 40% mismatch rate might just be random variance. With 50+, it's a real signal.

#### Real-World Example

> **Scenario:** Over 3 months, the system has auto-accepted 60 workorders for Brightwater Development. Outcome collector runs every 30 minutes and has now recorded 50+ signals.
>
> **Pattern discovered:** AI consistently assigns workorders to project ID 47 ("Brightwater Phase 3") but techs have been doing work for project ID 48 ("Brightwater Phase 3 — Commercial"). These are two separate projects in the system.
>
> **Phase 9 action:** Mismatches for this pattern are fed back as corrections into Phase 8's correction bank. Next time Brightwater emails, the prompt includes: "Past outcome: email extracted project Brightwater Phase 3 (ID 47) but actual project was Brightwater Phase 3 — Commercial (ID 48)."
>
> Claude adjusts and starts correctly routing to ID 48.

#### The Feedback Flywheel

```
Client emails → AI extracts → Admin accepts (with edits?) 
    ↓                                      ↓
Phase 9:                          Phase 8:
Real outcome                    Correction stored
measured                              ↓
    ↓                         Injected into next
Mismatch?                       Claude prompt
    ↓                                  ↓
Feed into                      AI gets better
correction bank         →      fewer corrections
                               circuit breaker
                               stays open
```

---

## 4. Before vs After Comparison {#4-comparison}

### Admin Daily Workflow

| Task | Before AI | After AI (Phases 1-7) |
|---|---|---|
| New job request from client | Read email, manually create workorder | Email arrives → draft in Intake Queue (or auto-committed at Tier 2) |
| Assign technician | Check calendar mentally, pick from dropdown | Click auto-assign or accept suggestion |
| Review submitted report | Open report, read all numbers, check spec | Open report, see QC badge, read AI narrative draft |
| Write PE notes | Write from scratch | Edit AI draft |
| Know when to invoice | Manually check all projects | Get email alert automatically |
| Route email to right project | Manual lookup | Fuzzy-matched by system |

### Estimated Time Savings Per Day

| Activity | Before | After | Saved |
|---|---|---|---|
| Processing incoming job requests | 45 min | 5 min | 40 min |
| Technician dispatch | 30 min | 5 min | 25 min |
| Checking which projects to invoice | 20 min | 2 min | 18 min |
| Report review + narrative writing | 60 min | 20 min | 40 min |
| **Total** | **155 min** | **32 min** | **~2 hours/day** |

*Estimates based on 10 workorders/day. Scale with volume.*

### System Intelligence Over Time

| Timeframe | What the System Knows |
|---|---|
| Day 1 | Nothing about your specific clients |
| Week 1 | Has seen a few email patterns, no corrections yet |
| Month 1 | Phase 8 active — has 20-30 correction examples per tenant |
| Month 3 | Phase 9 activating — 50+ outcome signals, real-world accuracy measuring |
| Month 6 | System has learned your top clients' email styles, project naming, and common test types |
| Year 1 | High-confidence auto-acceptance for routine work. Admin intervention only for unusual or new clients |

---

## 5. Complete Testing Guide {#5-testing}

### How to Test Each Feature

> **Before testing:** Make sure all 8 migrations have been run in Supabase and the server has been deployed.

---

### TEST PLAN 1 — QC Result Screening (Phase 1)

**What you're testing:** The PASS/FAIL badge appears correctly on the TasksDashboard when a technician submits a report.

#### Test Case 1A — FAIL Badge

1. Create a project with soil specs: Structural Fill → 95% compaction
2. Create a density task on that project, assign to a technician
3. Log in as the technician, fill out the density report with ONE reading below 95% (e.g., 91%)
4. Submit the report (set status to READY_FOR_REVIEW)
5. Log in as admin, open TasksDashboard

**Expected result:** The task shows a **red FAIL badge** before you even open the report. Badge says which location failed and by how much.

#### Test Case 1B — PASS Badge

1. Repeat above but all readings at 96% or above
2. Submit the report

**Expected result:** **Green PASS badge** on the dashboard.

#### Test Case 1C — SKIPPED Badge (No Specs)

1. Create a project with NO soil specs configured
2. Submit a density report on that project

**Expected result:** **Grey SKIPPED badge.** Not green. Not red. Grey with text "Specs not configured."

#### Test Case 1D — Compressive Strength

1. Create a project with concrete spec: Slab on Grade → 4000 psi
2. Create a compressive strength task
3. Submit with one cylinder break below 4000 psi (e.g., 3750 psi at 28 days)

**Expected result:** **Red FAIL badge** identifying the cylinder that failed.

#### What to Check in the Database (Advanced)

```sql
SELECT id, qc_result FROM tasks WHERE id = [your task id];
```
Should return a JSON object like: `{"status": "FAIL", "flags": [{"location": "...", "actual": 91, "required": 95}]}`

---

### TEST PLAN 2 — Dispatch Suggestions (Phase 2)

**What you're testing:** The auto-assign button suggests the right technicians.

#### Test Case 2A — One Free Tech

1. Create 2 technicians: Sarah and Mike
2. Assign Mike to a workorder on July 14
3. Create a NEW workorder also on July 14
4. Open the new workorder edit form, set date to July 14
5. Click "Auto-assign"

**Expected result:** System returns Sarah as the only free candidate. Mike shows as having a conflict on July 14.

#### Test Case 2B — Availability Block

1. Add an availability block: Sarah is blocked July 14 (vacation)
2. Repeat Test 2A

**Expected result:** NEITHER tech is available. System returns "No free technicians for this date."

#### Test Case 2C — Multiple Free Techs

1. Remove all existing assignments for July 15
2. Create a workorder for July 15
3. Click Auto-assign

**Expected result:** Multiple candidate chips appear. Admin must pick one. System does NOT auto-commit.

---

### TEST PLAN 3 — Invoice Readiness Alerts (Phase 3)

**What you're testing:** Admin gets an email when a project is fully complete.

#### Test Case 3A — Basic Alert

1. Create a project with 2 workorders
2. Mark both workorders as "complete"
3. Wait up to 30 minutes (the polling interval) OR manually trigger the checker

**Expected result:** Admin user gets an email: "[Project Name] is ready to invoice — estimated $X,XXX"

#### Test Case 3B — Not Triggered If Still Open

1. Create a project with 2 workorders
2. Mark only ONE as complete, leave other as "open"
3. Wait 30 minutes

**Expected result:** No email. Project is not fully complete yet.

#### Test Case 3C — Not Double-Alerted

1. After alert fires for a project, wait another 30 minutes

**Expected result:** No second email for the same project on the same day.

---

### TEST PLAN 4 — Report Narrative Draft (Phase 4)

**What you're testing:** PE Notes field is populated by AI after technician submits.

**Prerequisite:** `ANTHROPIC_API_KEY` must be set in Render environment variables.

#### Test Case 4A — Density Narrative

1. Submit a density report with mixed pass/fail results to READY_FOR_REVIEW
2. Wait 15-30 seconds
3. Open the task as admin, look at PE Notes field

**Expected result:** A professional narrative paragraph is pre-filled. Label says "AI Draft — edit before approving." The narrative mentions which tests passed, which failed, and recommends a course of action.

#### Test Case 4B — Edit and Approve

1. After seeing the AI draft, edit one sentence
2. Approve the report

**Expected result:** The "AI Draft" label clears. Report is approved with your edited notes. PDF includes the final PE notes.

#### Test Case 4C — No API Key

1. Temporarily remove `ANTHROPIC_API_KEY` from environment
2. Submit a report

**Expected result:** PE Notes field remains empty. No crash. Graceful failure — the technician's submission still works normally.

---

### TEST PLAN 5 — Email Intake (Phase 5)

**What you're testing:** Emails become draft workorders and PDFs extract specs.

**Prerequisites:**
- `SENDGRID_INBOUND_PARSE_SECRET` set in Render
- SendGrid Inbound Parse configured with your webhook URL
- MX record for intake subdomain pointing to `mx.sendgrid.net`
- Intake email address set in Settings → Automation

#### Test Case 5A — Basic Email Intake

1. Send an email to your intake address with this content:
   ```
   Hi,
   Please schedule density testing at [your project name] on [next Monday's date].
   Site is at [your site address].
   Thanks
   ```
2. Wait 60 seconds
3. Open the app → Intake Queue (Admin → Intake Queue in navigation)

**Expected result:** A new card appears in the queue showing the project matched, date extracted, test type = DENSITY_MEASUREMENT. Confidence badges should be green for date and test type.

#### Test Case 5B — Accept and Create Workorder

1. After Test 5A, click "Accept — Skip Specs"

**Expected result:** 
- Draft disappears from queue
- A new workorder appears in your workorders list with the extracted project, date, and test type
- Draft status in database = "accepted"

#### Test Case 5C — Email with PDF Attachment

1. Attach a geotech report PDF to a job request email and send to intake address
2. Wait 60 seconds, open Intake Queue

**Expected result:**
- Left panel: scheduling fields (same as 5A)
- Right panel: extracted specs — soil specs table with compaction % per structure type, concrete specs with f'c strength
- Confidence badges: High (green) for clearly stated specs, Medium/Low for inferred

#### Test Case 5D — Accept + Apply Specs

1. After Test 5C, click "Accept + Apply Specs"

**Expected result:**
- Workorder created
- Open the project in the project list → Specs tab → the extracted specs are now populated
- `specs_applied = true` in draft_workorders table

#### Test Case 5E — Duplicate Email (Dedup)

1. Forward or resend the exact same email twice to the intake address

**Expected result:** Only ONE draft appears in the queue. The second one is silently dropped (dedup_key match).

#### Test Case 5F — Wrong Intake Address

1. Send to a fake address at your intake domain (e.g., `wrongaddress@intake.crestfield.app`)

**Expected result:** No draft created. Server returns 200 OK (so SendGrid doesn't retry), but logs "No tenant matched to-address."

---

### TEST PLAN 6 — Auto-Assign Dispatch (Phase 6)

**What you're testing:** Workorder is auto-assigned with a hold window.

#### Test Case 6A — Single Free Tech Auto-Assign

1. Only ONE technician has no conflicts on the target date
2. Open workorder, set date, click "Auto-assign"

**Expected result:**
- Technician is immediately assigned in the dropdown
- Amber strip appears on dashboard: "[Tech Name] assigned to [WO#] — 28 min remaining [Cancel]"
- Wait 30 minutes → strip disappears, technician gets assignment email

#### Test Case 6B — Cancel Within Hold Window

1. Repeat Test 6A
2. Before 30 minutes expires, click "Cancel" on the amber strip

**Expected result:**
- Strip disappears
- Workorder goes back to unassigned
- No email is sent to the technician
- Database: `assigned_technician_id = null`, pending_notifications row deleted

#### Test Case 6C — Multiple Free Techs (Falls Back to Tier 1)

1. Two technicians both free on the target date
2. Click "Auto-assign"

**Expected result:** No auto-assignment. System shows both as candidates for admin to choose. Same behavior as Phase 2.

---

### TEST PLAN 7 — Intake Auto-Accept (Phase 7)

**What you're testing:** High-confidence intakes skip the queue.

#### Setup

1. Go to Settings → Automation
2. Turn ON "Auto-accept high-confidence intakes"
3. Set threshold to 85% (lower for easier testing)
4. Save

#### Test Case 7A — High-Confidence Auto-Accept

1. Send a clear, unambiguous email to your intake address:
   ```
   Please schedule density testing at [exact project name from your database]  
   on [specific date, e.g., July 14, 2026].
   Site: [address]
   ```
2. Wait 60 seconds
3. Check Intake Queue

**Expected result:** Queue is EMPTY. No draft waiting for review.  
Check workorders list → new workorder already created and approved.  
Check database:
```sql
SELECT id, status, auto_accepted FROM draft_workorders ORDER BY created_at DESC LIMIT 1;
```
Should show `status = 'accepted'`, `auto_accepted = true`.

#### Test Case 7B — Low-Confidence Falls Back to Queue

1. Send a vague email: *"Hey can you guys come out sometime this week maybe? We need some tests done."*
2. Check Intake Queue

**Expected result:** Draft appears in queue. Confidence scores are low (red badges). Admin review required.

#### Test Case 7C — Turn Off Auto-Accept

1. Settings → Automation → Auto-accept → OFF → Save
2. Send the same clear email as Test 7A

**Expected result:** Draft appears in queue even though confidence would be high. Setting overrides the AI decision.

---

### TEST PLAN 8 — Correction Capture (Phase 8)

**What you're testing:** Human corrections are captured and injected into future prompts.

#### Test Case 8A — Correction Is Stored

1. Send an email where the AI will get the date wrong (e.g., say "next Monday" without specifying the date)
2. In the Intake Queue, correct the date field to the right value before accepting
3. Click Accept

**Expected result:** A correction record exists in the database:
```sql
SELECT * FROM intake_correction_examples ORDER BY created_at DESC LIMIT 5;
```
Should show: `correction_type = 'scheduling'`, `field = 'scheduledDate'`, `ai_value = [wrong date]`, `human_value = [correct date]`

#### Test Case 8B — Circuit Breaker (Advanced)

This is hard to test without volume, but you can manually insert correction records:
```sql
INSERT INTO intake_correction_examples (tenant_id, correction_type, field, ai_value, human_value, source)
SELECT [your_tenant_id], 'scheduling', 'scheduledDate', '2026-07-14', '2026-07-15', 'human'
FROM generate_series(1, 10); -- insert 10 fake corrections
```

Then check if auto-accept is suppressed:
```sql
-- Check correction rate
SELECT COUNT(*) FROM intake_correction_examples 
WHERE tenant_id = [your_tenant_id] 
AND created_at > NOW() - INTERVAL '7 days'
AND source = 'human';
```

If count / accepted_count > 0.20 (20%), circuit breaker should trip.

---

### TEST PLAN 9 — Outcome Verification (Phase 9)

**Note:** Phase 9 stays dormant until 50 outcome signals accumulate. You won't see interventions in early testing, but you can verify signals are being recorded.

#### Test Case 9A — PE Approval Creates Signal

1. Accept an auto-accepted workorder (or create one manually with `auto_accepted = true` in DB)
2. Create a task on that workorder
3. Submit the task as tech, approve it as PE

**Expected result:**
```sql
SELECT * FROM outcome_signals WHERE signal_type = 'pe_approved' ORDER BY created_at DESC LIMIT 1;
```
Should show a new row with `matched = true`.

#### Test Case 9B — Outcome Collector Records Scheduling Accuracy

1. Have at least one completed workorder that came from an auto-accepted draft
2. Wait 30 minutes (outcomeCollector poll interval) or restart server to trigger immediate poll

**Expected result:**
```sql
SELECT * FROM outcome_signals WHERE signal_type IN ('project_match', 'date_match') ORDER BY created_at DESC LIMIT 10;
```
Should show rows comparing predicted vs actual values.

#### Checking Calibration Stats

Open Settings → Automation. The calibration panel shows:
- **Correction rate (7d):** What % of recent accepted drafts had human corrections
- **Real-world outcome accuracy:** (appears after 50 signals) What % of predictions matched real outcomes
- **Circuit breaker status:** Active or not

---

## 6. Go-to-Market Positioning {#6-gtm}

### How to Describe These Features to Clients

#### For a Sales Call (30-Second Version)

*"Crestfield now has AI built in. When a client emails you a job request, the system reads it and creates the workorder automatically. When a tech submits a report, the system checks the numbers against your project specs and flags anything out of spec before the PE even opens it. The AI also writes a first draft of the PE narrative so your engineers edit instead of write. Everything is self-learning — it gets better the more you use it. And no matter what, your PE still stamps every report and you still confirm every invoice."*

#### Pain Points This Solves (By Role)

**For the Office Admin / Dispatcher:**
- "I spend my morning processing emails and assigning technicians" → Phases 5, 6, 7
- "I never know which projects are ready to invoice until I manually check" → Phase 3
- "Assigning the right tech requires knowing everyone's schedule from memory" → Phase 2, 6

**For the PE / Project Manager:**
- "I spend 10 minutes per report just writing the narrative" → Phase 4
- "I have to read every number in every report to catch out-of-spec results" → Phase 1
- "I want AI help but I can't have it auto-stamp reports" → Hard constraint preserved

**For the Business Owner:**
- "My admin spends too much time on coordination instead of client service" → All phases
- "We're leaving money on the table with delayed invoicing" → Phase 3
- "I want to scale without hiring more office staff" → Phases 5-7

### Pricing Tier Suggestion

| Tier | Features | Target Customer |
|---|---|---|
| **Standard** | Phases 1-4 (AI assist, human decides everything) | Small firms, new to AI |
| **Pro** | Phases 1-7 (Tier 2 automation, email intake) | Growing firms, 5+ field techs |
| **Enterprise** | All Phases 1-9 (Self-improving, outcome feedback) | Established firms, high volume |

### Competitive Differentiators

1. **Industry-specific AI** — Claude is prompted as a CMT expert, not a generic assistant. It knows what "density testing" means, understands "f'c", recognizes "proctor" vs "compressive strength."
2. **Self-improving per tenant** — Each firm's AI gets better based on their own clients and projects. A correction made for Brightwater Development doesn't affect other tenants.
3. **Regulatory compliance built in** — PE stamp and invoice confirmation are never automated. This is a feature, not a limitation. It's what prevents liability.
4. **Graceful degradation** — If AI confidence is low, it falls back to human review. If correction rate is too high, circuit breaker trips. The system fails safe, not silently.
5. **No vendor lock-in for AI** — The system uses Claude via API. The model version can be upgraded without changing any business logic. Better models = better results automatically.

---

## 7. Feature Rollout Recommendation {#7-rollout}

### For Your Own Tenants

Don't turn everything on at once. Follow this sequence:

**Week 1-2: Enable Phases 1-4**
- QC badges, dispatch suggestions, invoice alerts, narrative drafts
- Zero risk — all Tier 1, human confirms everything
- Build trust in the AI outputs

**Week 3-4: Enable Phase 5 (Intake Queue)**
- Set up intake email address in Settings
- Let emails come in, admin reviews every draft
- Watch confidence scores and project matching accuracy

**Week 5-6: Watch Calibration Stats**
- Open Settings → Automation → look at calibration panel
- Are project match accuracy and date match accuracy above 90%?
- Are there many corrections being made?
- Check correction rate

**Week 7+: Enable Tier 2 (Phases 6-7) if calibration is good**
- Enable intake auto-accept threshold at 92% first
- Enable dispatch auto-assign
- Monitor circuit breaker status

**Month 3+: Phase 9 activates automatically**
- No action needed — it wakes up once 50 outcome signals accumulate
- Real-world accuracy starts feeding back into prompt improvements

### Red Flags to Watch (When to Pause Tier 2)

| Signal | What To Do |
|---|---|
| Circuit breaker active | Review recent corrections, identify pattern, clear it when fixed |
| Outcome match rate drops below 80% | Temporarily lower auto-accept threshold or disable |
| Client complains wrong date | Check extraction_json in DB, adjust threshold or disable for that type |
| Wrong project matched repeatedly | Update project names to be more distinct, add project numbers to names |

---

## Appendix: Key Tables Added by AI Phases

| Table | Phase | Purpose |
|---|---|---|
| `tasks.qc_result` | 1 | JSONB field storing QC badge result per task |
| `tasks.pe_notes` | 4 | AI-drafted + PE-edited narrative |
| `workorders.suggested_technician_id` | 2 | Advisory field — never triggers notifications |
| `draft_workorders` | 5 | Holds parsed email intakes for review |
| `technician_availability` | 6 | Availability blocks (vacation, equipment hold) |
| `pending_notifications.hold_until` | 6 | Delays assignment email during hold window |
| `draft_workorders.auto_accepted` | 7 | Flags which drafts were committed without human review |
| `intake_correction_examples` | 8 | Stores AI extraction vs human correction pairs |
| `outcome_signals` | 9 | Records AI predictions vs real-world outcomes |

---

*Document generated: June 2026*  
*Project: Crestfield — Multi-tenant CMT Field Reporting SaaS*  
*AI Provider: Anthropic Claude (claude-haiku-4-5-20251001 for parsing, claude-sonnet-4-6 for spec extraction and narratives)*
