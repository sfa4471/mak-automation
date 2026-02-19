# Technician Management Workflow - Implementation Plan

**Prepared by:** Senior Software Engineer (20+ years experience)  
**Date:** 2025-02-01  
**Project:** MAK Automation - Manage Technician Feature Enhancement

---

## Executive Summary

This document outlines a comprehensive implementation plan for enhancing the Technician Management workflow. The plan addresses three key requirements:
1. **Password Change Functionality** - Allow technicians to change their own passwords
2. **Edit Technician Capability** - Enable admins to edit technician details after creation
3. **Delete Technician with Validation** - Implement safe deletion with task assignment checks

---

## Current State Analysis

### Existing Implementation

**Frontend:**
- `ManageTechnicians.tsx` - Displays technician list and creation form
- Only supports CREATE operation
- No edit or delete functionality
- Table displays Name and Email only

**Backend:**
- `POST /auth/technicians` - Create technician (Admin only)
- `GET /auth/technicians` - List all technicians
- No UPDATE or DELETE endpoints
- No password change endpoint

**Database:**
- `users` table with fields: id, email, password, role, name, created_at
- `workpackages` table with `assigned_to` field (references users.id)
- `tasks` table with `assigned_technician_id` field (references users.id)
- Foreign key constraints: `ON DELETE SET NULL` for workpackages

---

## Requirements Breakdown

### 1. Technician Password Change

**User Story:** As a technician, I want to change my password so that I can maintain account security.

**Acceptance Criteria:**
- Technician can access password change form from their dashboard/profile
- Requires current password verification
- New password must meet minimum requirements (6+ characters)
- Password change requires re-authentication or confirmation
- Success/error feedback provided

**Technical Approach:**
- Create new endpoint: `PUT /auth/me/password` (authenticated, technician-only)
- Validate current password before allowing change
- Hash new password using bcrypt
- Update user record in database
- Optionally invalidate existing sessions (security best practice)

### 2. Edit Technician Details

**User Story:** As an admin, I want to edit technician information so that I can update details like name and email when needed.

**Acceptance Criteria:**
- Admin can click "Edit" button on any technician row
- Edit form pre-populates with current values
- Can update: name, email (with uniqueness validation)
- Password field optional (only update if provided)
- Email uniqueness check (cannot use existing email)
- Success/error feedback provided

**Technical Approach:**
- Create new endpoint: `PUT /auth/technicians/:id` (Admin only)
- Validate email format and uniqueness (excluding current user)
- Optional password update (only hash if provided)
- **Email Update:** Immediate update (no verification required - see Email Verification section)
- Update user record with provided fields
- Return updated user object
- Show admin confirmation dialog before email change

### 3. Delete Technician with Task Validation

**User Story:** As an admin, I want to delete a technician, but only if they have no assigned tasks, to prevent data integrity issues.

**Acceptance Criteria:**
- Admin can click "Delete" button on any technician row
- System checks for assigned workpackages and tasks
- If assignments exist, show clear error message
- Error message: "Cannot delete technician. Please reassign all active tasks assigned to this technician before deletion."
- If no assignments, proceed with deletion confirmation
- Confirmation dialog before deletion
- Success feedback after deletion

**Technical Approach:**
- Create new endpoint: `DELETE /auth/technicians/:id` (Admin only)
- Query `workpackages` table for `assigned_to = technician_id`
- Query `tasks` table for `assigned_technician_id = technician_id`
- If any assignments found, return 400 error with descriptive message
- If no assignments, proceed with deletion
- Database foreign key constraint will handle `ON DELETE SET NULL` for workpackages
- Consider: Should we also handle tasks? (Check schema - may need similar constraint)

---

## Implementation Plan

### Phase 1: Backend API Development

#### 1.1 Password Change Endpoint
**File:** `server/routes/auth.js`

```javascript
// PUT /auth/me/password - Change own password (Technician only)
router.put('/me/password', authenticate, requireTechnician, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  // Implementation details...
});
```

**Validation:**
- Verify current password matches
- Ensure new password is different from current
- Hash new password with bcrypt
- Update database

#### 1.2 Update Technician Endpoint
**File:** `server/routes/auth.js`

```javascript
// PUT /auth/technicians/:id - Update technician (Admin only)
router.put('/technicians/:id', authenticate, requireAdmin, [
  body('email').optional().isEmail().normalizeEmail(),
  body('name').optional().notEmpty(),
  body('password').optional().isLength({ min: 6 })
], async (req, res) => {
  // Implementation details...
});
```

**Validation:**
- Check technician exists
- Verify email uniqueness (if email is being changed)
- Only update provided fields
- Hash password only if provided

#### 1.3 Delete Technician Endpoint
**File:** `server/routes/auth.js`

```javascript
// DELETE /auth/technicians/:id - Delete technician (Admin only)
router.delete('/technicians/:id', authenticate, requireAdmin, async (req, res) => {
  // Implementation details...
});
```

**Validation Logic:**
```javascript
// Check workpackages
const workpackages = await db.all('workpackages', { assigned_to: technicianId });
// Check tasks
const tasks = await db.all('tasks', { assigned_technician_id: technicianId });

if (workpackages.length > 0 || tasks.length > 0) {
  return res.status(400).json({ 
    error: 'Cannot delete technician. Please reassign all active tasks assigned to this technician before deletion.' 
  });
}
```

**Database Considerations:**
- Verify foreign key constraints handle cascading properly
- `workpackages.assigned_to` has `ON DELETE SET NULL` - this is acceptable
- Check `tasks.assigned_technician_id` constraint - may need similar handling

### Phase 2: Frontend API Client Updates

#### 2.1 Update API Client
**File:** `client/src/api/auth.ts`

Add new methods:
```typescript
changePassword: async (currentPassword: string, newPassword: string): Promise<void>
updateTechnician: async (id: number, data: { email?: string; name?: string; password?: string }): Promise<User>
deleteTechnician: async (id: number): Promise<void>
```

### Phase 3: Frontend UI Development

#### 3.1 Password Change Component
**New File:** `client/src/components/ChangePassword.tsx`

**Features:**
- Form with current password, new password, confirm password fields
- Validation for password match
- Success/error messaging
- Accessible from technician dashboard/profile section

#### 3.2 Enhanced ManageTechnicians Component
**File:** `client/src/components/admin/ManageTechnicians.tsx`

**Updates:**
- Add "Edit" button to each technician row
- Add "Delete" button to each technician row
- Implement edit modal/form
- Implement delete confirmation dialog
- Handle error messages for delete validation
- Update table to show action buttons column

**UI Flow:**
1. **Edit Flow:**
   - Click "Edit" → Open edit form (modal or inline)
   - Pre-populate fields
   - Submit → Call update API
   - Refresh list on success

2. **Delete Flow:**
   - Click "Delete" → Show confirmation dialog
   - Confirm → Call delete API
   - If error (has assignments) → Show error message
   - If success → Refresh list

---

## Database Schema Review

### Current Constraints
- `workpackages.assigned_to` → `ON DELETE SET NULL` ✅ (Safe)
- `tasks.assigned_technician_id` → Need to verify constraint

### Recommendations
1. Verify `tasks` table foreign key constraint
2. Consider adding `ON DELETE SET NULL` if not present
3. Ensure indexes exist on foreign key columns for performance

---

## Security Considerations

### Password Change
- ✅ Require current password verification
- ✅ Use bcrypt for password hashing
- ✅ Minimum password length enforcement
- ⚠️ Consider: Should we invalidate all sessions after password change? (Recommended for security)

### Edit Technician
- ✅ Admin-only access (middleware)
- ✅ Email uniqueness validation
- ✅ Input sanitization
- ✅ Prevent admin from editing their own role
- ⚠️ **Email Verification:** See section below for detailed discussion

### Delete Technician
- ✅ Admin-only access
- ✅ Pre-deletion validation (task assignments)
- ✅ Clear error messaging
- ✅ Confirmation dialog (UX safety)

---

## Email Verification Consideration

### Current System Analysis

**Current State:**
- No email verification system exists in the codebase
- Technicians are created by admins with immediate account activation
- Login works immediately after account creation
- No email service integration found (no SMTP/email sending functionality)

### Email Change Scenarios

When an admin edits a technician's email, we have two implementation options:

#### Option 1: Immediate Email Update (Recommended for Internal Systems)
**Approach:** Email is updated immediately without verification

**Pros:**
- ✅ Matches current system behavior (no verification on creation)
- ✅ Simpler implementation (no email service required)
- ✅ Faster workflow (no waiting for verification)
- ✅ Suitable for internal/trusted systems where admins are authorized
- ✅ Technician can immediately use new email for login

**Cons:**
- ❌ No verification that new email is valid/accessible
- ❌ Risk if admin makes typo in email address
- ❌ Technician may not be aware of email change

**Implementation:**
- Update email in database immediately
- Optionally notify technician via in-app notification (if notification system exists)
- Show success message to admin
- Technician uses new email for next login

#### Option 2: Email Verification Required
**Approach:** Send verification email to new address, update only after verification

**Pros:**
- ✅ Ensures email is valid and accessible
- ✅ Better security practice
- ✅ Technician is aware of email change
- ✅ Prevents typos from causing account lockout

**Cons:**
- ❌ Requires email service integration (SMTP/SendGrid/etc.)
- ❌ More complex implementation
- ❌ Delayed activation (technician must verify)
- ❌ Additional infrastructure and costs
- ❌ May require email service configuration

**Implementation Requirements:**
- Email service integration (SMTP, SendGrid, AWS SES, etc.)
- Verification token system
- Email template for verification
- Pending email state in database
- Verification endpoint
- Expiration handling for verification tokens

### Recommendation

**For this internal system, Option 1 (Immediate Update) is recommended** because:

1. **System Context:** This is an internal tool where:
   - Admins are trusted users
   - Technicians are known employees
   - Account creation already works without verification

2. **Consistency:** Matches existing behavior (no verification on account creation)

3. **Simplicity:** No additional infrastructure required

4. **User Experience:** Immediate effect, no waiting for email verification

### Alternative: Hybrid Approach

If email verification is desired but full implementation is complex, consider:

**Option 3: Admin Confirmation with Warning**
- Show warning dialog: "Changing email will immediately update the login email. Ensure the email is correct."
- Require admin to type technician name to confirm
- Update immediately after confirmation
- Log the change for audit purposes

### Implementation Decision

**Recommended:** Implement **Option 1 (Immediate Update)** with the following safeguards:

1. **Admin Confirmation Dialog:**
   ```
   "Are you sure you want to change this technician's email? 
   The technician will need to use the new email for login."
   ```

2. **Email Format Validation:** Ensure email format is valid before saving

3. **Uniqueness Check:** Verify email doesn't already exist

4. **Audit Trail:** (Future enhancement) Log email changes for accountability

5. **In-App Notification:** (If notification system exists) Notify technician of email change

### If Email Verification is Required

If business requirements mandate email verification, the implementation would need:

1. **Email Service Setup:**
   - Configure SMTP or email service provider
   - Add email sending library (nodemailer, SendGrid, etc.)

2. **Database Schema Addition:**
   ```sql
   ALTER TABLE users ADD COLUMN pending_email TEXT;
   ALTER TABLE users ADD COLUMN email_verification_token TEXT;
   ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMPTZ;
   ```

3. **Additional Endpoints:**
   - `POST /auth/technicians/:id/verify-email` - Send verification email
   - `GET /auth/verify-email/:token` - Verify email token
   - `PUT /auth/technicians/:id/cancel-email-change` - Cancel pending change

4. **Additional Effort:** +8-12 hours for email verification implementation

---

## Error Handling Strategy

### Backend Error Responses
```javascript
// Password change errors
400: Invalid current password
400: New password same as current
400: Validation errors

// Update errors
400: Email already exists
404: Technician not found
400: Validation errors

// Delete errors
400: Cannot delete - has assigned tasks
404: Technician not found
```

### Frontend Error Display
- Display errors in user-friendly format
- Show specific validation messages
- Handle network errors gracefully
- Provide actionable error messages

---

## Testing Strategy

### Unit Tests
- Password change validation
- Email uniqueness checks
- Task assignment queries
- Password hashing verification

### Integration Tests
- Full password change flow
- Edit technician flow
- Delete technician with/without assignments
- Error scenarios

### Manual Testing Checklist
- [ ] Technician can change password successfully
- [ ] Password change fails with wrong current password
- [ ] Admin can edit technician name
- [ ] Admin can edit technician email (with uniqueness check)
- [ ] Admin can edit technician password
- [ ] Admin cannot delete technician with assigned workpackages
- [ ] Admin cannot delete technician with assigned tasks
- [ ] Admin can delete technician with no assignments
- [ ] Error messages are clear and actionable

---

## Implementation Order

### Recommended Sequence
1. **Backend API** (Foundation)
   - Password change endpoint
   - Update technician endpoint
   - Delete technician endpoint

2. **API Client** (Integration layer)
   - Add new API methods

3. **Frontend Components** (User interface)
   - Password change component
   - Enhanced ManageTechnicians with edit/delete

4. **Testing & Refinement**
   - Test all flows
   - Refine error messages
   - UX improvements

---

## UI/UX Recommendations

### Edit Technician Form
- Use modal dialog for edit (cleaner UX)
- Pre-populate all fields
- Show "Cancel" and "Save" buttons
- Optional password field (only update if filled)
- Clear indication of what's being edited

### Delete Confirmation
- Two-step confirmation:
  1. Click Delete → Show confirmation dialog
  2. Type technician name or click "Confirm" → Execute deletion
- Show error message inline if deletion fails
- Highlight which tasks need reassignment (future enhancement)

### Password Change Form
- Accessible from technician dashboard
- Clear current/new/confirm password fields
- Show password strength indicator (optional enhancement)
- Success message with option to logout (if session invalidation implemented)

---

## Future Enhancements (Out of Scope)

1. **Bulk Operations:** Edit/delete multiple technicians
2. **Task Reassignment:** Direct reassignment from delete error message
3. **Activity Logging:** Track who edited/deleted technicians
4. **Soft Delete:** Archive technicians instead of hard delete
5. **Password Policy:** Enforce complexity requirements
6. **Email Notifications:** Notify technician of account changes

---

## Risk Assessment

### Low Risk
- Password change functionality (standard pattern)
- Edit functionality (straightforward CRUD)

### Medium Risk
- Delete validation logic (need to verify all assignment scenarios)
- Database constraint handling (verify cascading behavior)

### Mitigation
- Thorough testing of delete scenarios
- Verify database constraints in both SQLite and Supabase
- Add comprehensive error handling

---

## Estimated Effort

### Backend Development
- Password change endpoint: 2-3 hours
- Update technician endpoint: 2-3 hours (3-4 hours if email verification required)
- Delete technician endpoint: 3-4 hours
- **Total Backend: 7-10 hours** (15-17 hours if email verification required)

### Frontend Development
- Password change component: 3-4 hours
- Edit functionality: 4-5 hours
- Delete functionality: 3-4 hours
- **Total Frontend: 10-13 hours**

### Testing & Refinement
- Unit tests: 3-4 hours
- Integration testing: 2-3 hours
- Bug fixes & refinement: 2-3 hours
- **Total Testing: 7-10 hours**

### **Grand Total: 24-33 hours**

---

## Conclusion

This implementation plan provides a comprehensive roadmap for enhancing the Technician Management workflow. The phased approach ensures a solid foundation (backend) before building the user interface, minimizing integration issues and enabling parallel development where possible.

The plan prioritizes security, data integrity, and user experience while maintaining code quality and maintainability standards expected in enterprise software development.

---

**Next Steps:**
1. Review and approve this plan
2. Verify database constraints (especially tasks table)
3. Begin Phase 1: Backend API Development
4. Iterate based on testing feedback
