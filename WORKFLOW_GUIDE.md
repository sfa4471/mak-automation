# Admin and Technician Workflow Guide

This guide will walk you through testing the complete admin and technician workflow.

## 🚀 Starting the Application

1. **Install dependencies** (if not already done):
   ```bash
   npm run install-all
   ```

2. **Run database migrations** (FIRST TIME ONLY - adds new columns to existing tables):
   
   **Windows PowerShell:**
   ```powershell
   cd server
   node migrate-to-structured-specs.js
   node migrate-to-tasks.js
   cd ..
   ```
   
   **Linux/Mac/Git Bash:**
   ```bash
   cd server && node migrate-to-structured-specs.js && node migrate-to-tasks.js && cd ..
   ```
   
   > **Note**: These migrations add new columns to existing tables. The database schema is automatically created when the server starts, so migrations are mainly needed if you have existing data.

3. **Start the development server**:
   ```bash
   npm run dev
   ```

   This starts:
   - Backend API on `http://localhost:5000`
   - Frontend React app on `http://localhost:3000`

4. **Open your browser** to `http://localhost:3000`

---

## 👨‍💼 ADMIN WORKFLOW

### Step 1: Login as Admin

1. Go to `http://localhost:3000`
2. You'll be redirected to the login page
3. **Default Admin Credentials**:
   - **Email**: `admin@maklonestar.com`
   - **Password**: `admin123`
4. Click "Login"

You should now see the **Admin Dashboard** with:
- Header showing your name/email and role
- "Create New Project" button
- "Manage Technicians" button
- "Tasks Dashboard" button (NEW - for task-oriented view)
- Notifications bell icon (🔔) in the header

### Step 2: Create a Technician Account

1. Click **"Manage Technicians"** button
2. Fill in the form:
   - **Name**: `John Doe` (or any name)
   - **Email**: `john@example.com` (or any email)
   - **Password**: `technician123` (or any password)
3. Click **"Create Technician"**
4. The technician will appear in the list below

**Note**: Remember the technician email and password for later!

### Step 3: Create a Project

1. Click **"Create New Project"** button
2. Fill in the form:
   - **Project Name**: `Test Project 1`
   - **Customer Email**: `customer@example.com` (optional)
   - **Project Specifications** (NEW):
     - **Spec Strength (PSI)**: `4000` (required)
     - **Ambient Temp (°F)**: `70` or `65-75` (optional)
     - **Concrete Temp (°F)**: `75` or `70-80` (optional)
     - **Slump**: `3-5` (optional)
     - **Air Content (% by Volume)**: `3-6` (optional)
3. Click **"Create Project"**

The system will automatically:
- Generate a project number (e.g., `MAK-2024-1234`)
- Store the project specifications (used across all tasks in this project)

> **Note**: Projects no longer auto-create work packages. Tasks are now created manually per project.

### Step 4: Create a Task (NEW)

1. In the project card, click the **"Create Task"** button
2. Fill in the task creation form:
   - **Task Type**: Select `Compressive Strength Field Report` (or any other task type)
   - **Assign to Technician**: Select the technician you created (e.g., `John Doe`)
   - **Due Date**: Select a date (optional but recommended)
   - **Location Name**: e.g., `Building A, Foundation Pour 1` (optional)
   - **Location Notes**: Additional location details (optional)
   - **Engagement Notes**: e.g., `1 day`, `2 consecutive days`, `Mon/Wed/Fri` (optional)
3. Click **"Create Task"**

**What happens**:
- Task is created with status "ASSIGNED"
- If task type is "Compressive Strength Field Report", a WP1 report instance is automatically created
- Technician receives a notification: "Admin assigned Compressive Strength Field Report for Project MAK-YYYY-####"

### Step 5: View Tasks Dashboard (NEW)

1. Click **"Tasks Dashboard"** button in the header
2. You'll see three filter tabs:
   - **Today**: Tasks due today or created today
   - **Previous Day**: Tasks completed yesterday or due yesterday
   - **Overdue/Pending**: Tasks past due date and not completed/approved
3. Click on any task row to open it
4. For tasks with status "Ready for Review", you can:
   - Click **"Approve"** to approve the task
   - Click **"Reject"** to reject (requires rejection remarks and resubmission due date)

### Step 5: View Notifications (Optional)

1. Click the **🔔 bell icon** in the header
2. You'll see notifications when technicians complete work packages
3. Click a notification to navigate to the work package

---

## 👷 TECHNICIAN WORKFLOW

### Step 1: Login as Technician

1. **Logout** from the admin account (click "Logout" button)
2. You'll be redirected to the login page
3. **Login with technician credentials**:
   - **Email**: `john@example.com` (the email you used when creating the technician)
   - **Password**: `technician123` (the password you set)
4. Click "Login"

You should now see the **Technician Dashboard** with:
- Header showing your name/email
- Notifications bell icon (🔔) with a badge if you have unread notifications
- A table showing your assigned tasks with:
  - Project Number
  - Task Name
  - Status
  - Due Date
  - Resubmission Due Date (if task was rejected)

### Step 2: View Assigned Tasks

1. In the table, you should see the task assigned by admin:
   - Project Number (e.g., `MAK-2024-1234`)
   - Task: `Compressive Strength Field Report`
   - Status: `Assigned` (or `Rejected - Needs Fix` if rejected)
   - Due Date: The date set by admin
   - Resubmission Due Date: Shown if task was rejected

2. **Status badges** you might see:
   - **OVERDUE**: Red badge if task is past due date
   - **REJECTED**: Red badge if task was rejected
   - **READY_FOR_REVIEW**: Green badge if ready for admin review

3. **Click on the row** to open the WP1 form (for Compressive Strength Field Report tasks)

### Step 3: Fill Out WP1 Form

The form has several sections. As a technician, you can edit:

**Placement Information**:
- **Technician**: Auto-filled (read-only)
- **Weather**: Enter weather conditions (e.g., "Sunny, 75°F")
- **Placement Date**: Select or enter date
- **Spec. Strength**: Auto-populated from project specs (editable if needed)

> **NEW**: The following fields are now auto-populated from project-level specs:
- **Spec. Strength** (from specStrengthPsi)
- **Ambient Temp SPECS** (from specAmbientTempF)
- **Concrete Temp SPECS** (from specConcreteTempF)
- **Slump SPECS** (from specSlump)
- **Air Content SPECS** (from specAirContentByVolume)

**Sample Information**:
- Fill in all the sample details:
  - Structure, Sample Location, Supplier, etc.
  - Test results (Slump, Air Content, etc.)

**Specimen Information**:
- The form starts with **Specimen Set 1** (5 cylinders)
- Click **"Add Another Set"** to add more sets if needed
- Fill in specimen details for each set
- Enter test results for each cylinder

**Remarks**:
- Add any remarks or notes

**Note**: The form **autosaves** every 800ms when you make changes. You'll see "Saving..." or "Saved at HH:MM" at the top.

### Step 4: Save Update (Optional)

1. Click **"Save Update"** button (top right)
2. This will:
   - Save all form data
   - Set status to **"In Progress"** (IN_PROGRESS_TECH)
   - Show a confirmation message

**Note**: You can continue editing after saving. The status will remain "In Progress".

### Step 5: Send Update to Admin

1. When you're done filling out the form, click **"Send Update to Admin"** button
2. Confirm the action in the popup
3. This will:
   - Save all form data
   - Set status to **"Ready for Review"** (READY_FOR_REVIEW)
   - **Lock the form** (you can no longer edit)
   - Send notification to admin: "<YourName> completed Compressive Strength Field Report for Project MAK-YYYY-####"
   - Redirect you back to the dashboard

**Important**: Once you send the update, you cannot edit the form anymore. The admin must review it.

### Step 6: Handle Rejected Tasks (NEW)

If a task was rejected by admin:

1. The task will show status **"Rejected - Needs Fix"** with a red badge
2. You'll see the **rejection remarks** displayed in the task list
3. The **resubmission due date** will be shown (this becomes your new due date)
4. Click on the task to open the WP1 form
5. The form will be unlocked again (you can edit)
6. Make the necessary corrections
7. Click **"Send Update to Admin"** again to resubmit
8. Status will change back to **"Ready for Review"**

### Step 6: View Notifications

1. Click the **🔔 bell icon** in the header
2. You should see:
   - Notification: "Admin assigned WP1 for Project MAK-YYYY-####"
3. Click a notification to navigate to the related work package

---

## 👨‍💼 ADMIN REVIEW WORKFLOW

### Step 1: Review Technician Work

1. **Login as admin** again (if logged out)
2. Go to **Tasks Dashboard** (click "Tasks Dashboard" button)
3. You should see:
   - A notification badge on the bell icon (if technician sent update)
   - Tasks with status **"Ready for Review"** in the Today or Previous Day filter

4. **Click the notification** or **click on a task row** to open it

### Step 2: Review and Edit WP1 Form

1. The WP1 form opens with all the data the technician entered
2. As admin, you can:
   - **View all data** entered by technician
   - **Edit any field** (no restrictions)
   - **Generate PDF** using the "Generate PDF" button
   - **Save changes** using the "Save" button

3. Review the form and make any necessary corrections

### Step 3: Approve or Reject Task (NEW)

**Option A: Approve Task**

1. In the Tasks Dashboard, find the task with status "Ready for Review"
2. Click the **"Approve"** button in the Actions column
3. Confirm the action
4. Task status changes to **"APPROVED"**

**Option B: Reject Task**

1. In the Tasks Dashboard, find the task with status "Ready for Review"
2. Click the **"Reject"** button in the Actions column
3. Enter **rejection remarks** (required) - explain what needs to be fixed
4. Enter **resubmission due date** (required) - when the task should be resubmitted
5. Click OK
6. Task status changes to **"REJECTED_NEEDS_FIX"**
7. Technician receives a notification and can see the remarks and new due date

---

## 📊 Status Flow Summary

```
1. ASSIGNED (task created and assigned to technician)
   ↓
2. IN_PROGRESS_TECH (technician starts editing / saves update)
   ↓
3. READY_FOR_REVIEW (technician sends to admin)
   ↓
4a. APPROVED (admin approves)
   OR
4b. REJECTED_NEEDS_FIX (admin rejects with remarks)
   ↓ (if rejected)
   Back to IN_PROGRESS_TECH → READY_FOR_REVIEW (technician fixes and resubmits)
```

---

## 🔔 Notifications Summary

**Technician receives**:
- ✅ "Admin assigned [Task Name] for Project MAK-YYYY-####" (when admin creates and assigns task)
- ✅ "Your task for Project MAK-YYYY-#### has been rejected. Please review the remarks and resubmit." (when admin rejects task)

**Admin receives**:
- ✅ "<TechnicianName> completed [Task Name] for Project MAK-YYYY-####" (when technician sends update)

---

## 🧪 Testing Checklist

### Admin Tests:
- [ ] Login as admin
- [ ] Create technician account
- [ ] Create new project with structured specs
- [ ] Create a task for the project
- [ ] View Tasks Dashboard (Today/Previous Day/Overdue filters)
- [ ] View notification when technician completes task
- [ ] Review technician's work (open WP1 form)
- [ ] Edit technician's work
- [ ] Approve a task
- [ ] Reject a task (with remarks and resubmission date)
- [ ] Generate PDF

### Technician Tests:
- [ ] Login as technician
- [ ] View assigned tasks (check for OVERDUE/REJECTED badges)
- [ ] Open WP1 form from task
- [ ] Verify specs are auto-populated from project
- [ ] Fill out form fields
- [ ] Verify autosave works
- [ ] Click "Save Update" button
- [ ] Click "Send Update to Admin" button
- [ ] Verify form is locked after sending
- [ ] View notifications
- [ ] Handle rejected task (see remarks, fix, resubmit)

---

## 🐛 Troubleshooting

**Issue**: Can't login
- **Solution**: Make sure the server is running (`npm run dev`)
- Check browser console for errors
- Verify credentials are correct

**Issue**: Technician doesn't see assigned work package
- **Solution**: Make sure admin assigned the work package
- Check that technician is logged in with correct account
- Refresh the page

**Issue**: Form is locked but shouldn't be
- **Solution**: Check the work package status
- Only "READY_FOR_REVIEW" and "Approved" lock the form for technicians
- Admin can always edit

**Issue**: Notifications not showing
- **Solution**: Click the bell icon to open notifications dropdown
- Check that notifications were created in the database
- Refresh the page

---

## 📝 Notes

- **Autosave**: Form autosaves every 800ms when you make changes
- **Mobile-friendly**: All interfaces are responsive and work on mobile devices
- **Real-time**: Admin can see technician updates immediately (refresh page)
- **Permissions**: Technicians can only see and edit their assigned work packages
- **Audit Trail**: All edits are tracked with user role, name, and timestamp

---

## 🎯 Quick Test Scenario

1. **Admin**: Login → Create Technician → Create Project → Assign WP1
2. **Technician**: Login → Open WP1 → Fill form → Send to Admin
3. **Admin**: See notification → Review → Approve/Edit

This completes the full workflow cycle!

