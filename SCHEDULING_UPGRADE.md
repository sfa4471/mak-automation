# Scheduling Upgrade - Implementation Summary

## Overview
Replaced "Engagement Notes" text-based scheduling with calendar-based date pickers for task scheduling.

## Database Changes

### New Columns Added to `tasks` Table:
- `scheduledStartDate` (TEXT, optional) - When the task is scheduled to begin
- `scheduledEndDate` (TEXT, optional) - When the task is scheduled to end (null = single-day task)

### Migration
Run the migration script to add the new columns:
```bash
cd server
node migrate-add-scheduled-dates.js
```

## UI Changes

### Create Task Form
- **Due Date**: Required field (deadline for task completion)
- **Scheduled Dates Section**:
  - Checkbox: "Schedule for date range (multi-day task)"
  - **Scheduled Start Date**: Optional date picker
  - **Scheduled End Date**: Optional date picker (only shown when date range checkbox is checked)
- **Engagement Notes**: Now optional free-text for special instructions only

### Date Range Behavior
- **Single Date**: Set `scheduledStartDate` only, leave `scheduledEndDate` empty
- **Date Range**: Check the checkbox, set both `scheduledStartDate` and `scheduledEndDate`

## Dashboard Behavior

### Today Tab
Shows tasks that are:
1. **Scheduled for today**: Tasks where today falls between `scheduledStartDate` and `scheduledEndDate` (or equals `scheduledStartDate` if `scheduledEndDate` is null)
2. **Due today** (fallback): Tasks with `dueDate` = today if no scheduled dates exist
3. **Created today** (fallback): Tasks created today if neither scheduled nor due dates exist

### Overdue/Pending Tab
Still based on `dueDate` (deadline), not scheduled dates.

## API Changes

### Create Task Request
```typescript
{
  projectId: number;
  taskType: TaskType;
  assignedTechnicianId?: number;
  dueDate?: string;  // Required for deadline
  scheduledStartDate?: string;  // Optional
  scheduledEndDate?: string;  // Optional (only for multi-day tasks)
  locationName?: string;
  locationNotes?: string;
  engagementNotes?: string;  // Now for special instructions only
}
```

## Usage Example

### Single-Day Task
1. Set **Due Date** (required)
2. Set **Scheduled Start Date** (optional, e.g., "2024-01-15")
3. Leave date range checkbox unchecked
4. Task appears in "Today" tab on Jan 15

### Multi-Day Task
1. Set **Due Date** (required)
2. Check "Schedule for date range"
3. Set **Scheduled Start Date** (e.g., "2024-01-15")
4. Set **Scheduled End Date** (e.g., "2024-01-17")
5. Task appears in "Today" tab from Jan 15-17

## Backward Compatibility
- Existing tasks without scheduled dates will continue to work
- "Today" tab falls back to `dueDate` if `scheduledStartDate` is not set
- `engagementNotes` field is preserved for special instructions

