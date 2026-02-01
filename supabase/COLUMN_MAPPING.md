# Column Name Mapping: SQLite → PostgreSQL

This document provides a complete mapping of column names from SQLite (camelCase) to PostgreSQL (snake_case) for use during application code migration.

## Users Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `email` | `email` |
| `password` | `password` |
| `role` | `role` |
| `name` | `name` |
| `createdAt` | `created_at` |

## Projects Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `projectNumber` | `project_number` |
| `projectName` | `project_name` |
| `projectSpec` | `project_spec` |
| `customerEmail` | `customer_email` (legacy) |
| `specStrengthPsi` | `spec_strength_psi` |
| `specAmbientTempF` | `spec_ambient_temp_f` |
| `specConcreteTempF` | `spec_concrete_temp_f` |
| `specSlump` | `spec_slump` |
| `specAirContentByVolume` | `spec_air_content_by_volume` |
| `customerEmails` | `customer_emails` (JSONB) |
| `soilSpecs` | `soil_specs` (JSONB) |
| `concreteSpecs` | `concrete_specs` (JSONB) |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

## Project Counters Table

| SQLite | PostgreSQL |
|--------|------------|
| `year` | `year` |
| `nextSeq` | `next_seq` |
| `updatedAt` | `updated_at` |

## Workpackages Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `projectId` | `project_id` |
| `name` | `name` |
| `type` | `type` |
| `status` | `status` |
| `assignedTo` | `assigned_to` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

## Tasks Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `projectId` | `project_id` |
| `taskType` | `task_type` |
| `status` | `status` |
| `assignedTechnicianId` | `assigned_technician_id` |
| `dueDate` | `due_date` |
| `scheduledStartDate` | `scheduled_start_date` |
| `scheduledEndDate` | `scheduled_end_date` |
| `locationName` | `location_name` |
| `locationNotes` | `location_notes` |
| `engagementNotes` | `engagement_notes` |
| `rejectionRemarks` | `rejection_remarks` |
| `resubmissionDueDate` | `resubmission_due_date` |
| `fieldCompleted` | `field_completed` |
| `fieldCompletedAt` | `field_completed_at` |
| `reportSubmitted` | `report_submitted` |
| `lastEditedByUserId` | `last_edited_by_user_id` |
| `lastEditedByRole` | `last_edited_by_role` |
| `lastEditedAt` | `last_edited_at` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `proctorNo` | `proctor_no` |

## WP1 Data Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `taskId` | `task_id` |
| `workPackageId` | `work_package_id` |
| `technician` | `technician` |
| `weather` | `weather` |
| `placementDate` | `placement_date` |
| `specStrength` | `spec_strength` |
| `specStrengthDays` | `spec_strength_days` |
| `structure` | `structure` |
| `sampleLocation` | `sample_location` |
| `supplier` | `supplier` |
| `timeBatched` | `time_batched` |
| `classMixId` | `class_mix_id` |
| `timeSampled` | `time_sampled` |
| `yardsBatched` | `yards_batched` |
| `ambientTempMeasured` | `ambient_temp_measured` |
| `ambientTempSpecs` | `ambient_temp_specs` |
| `truckNo` | `truck_no` |
| `ticketNo` | `ticket_no` |
| `concreteTempMeasured` | `concrete_temp_measured` |
| `concreteTempSpecs` | `concrete_temp_specs` |
| `plant` | `plant` |
| `slumpMeasured` | `slump_measured` |
| `slumpSpecs` | `slump_specs` |
| `yardsPlaced` | `yards_placed` |
| `totalYards` | `total_yards` |
| `airContentMeasured` | `air_content_measured` |
| `airContentSpecs` | `air_content_specs` |
| `waterAdded` | `water_added` |
| `unitWeight` | `unit_weight` |
| `finalCureMethod` | `final_cure_method` |
| `specimenNo` | `specimen_no` |
| `specimenQty` | `specimen_qty` |
| `specimenType` | `specimen_type` |
| `cylinders` | `cylinders` (JSONB) |
| `remarks` | `remarks` |
| `lastEditedByRole` | `last_edited_by_role` |
| `lastEditedByName` | `last_edited_by_name` |
| `lastEditedByUserId` | `last_edited_by_user_id` |
| `updatedAt` | `updated_at` |

## Proctor Data Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `taskId` | `task_id` |
| `projectName` | `project_name` |
| `projectNumber` | `project_number` |
| `sampledBy` | `sampled_by` |
| `testMethod` | `test_method` |
| `client` | `client` |
| `soilClassification` | `soil_classification` |
| `description` | `description` |
| `maximumDryDensityPcf` | `maximum_dry_density_pcf` |
| `optimumMoisturePercent` | `optimum_moisture_percent` |
| `optMoisturePct` | `opt_moisture_pct` |
| `maxDryDensityPcf` | `max_dry_density_pcf` |
| `liquidLimitLL` | `liquid_limit_ll` |
| `plasticLimit` | `plastic_limit` |
| `plasticityIndex` | `plasticity_index` |
| `sampleDate` | `sample_date` |
| `calculatedBy` | `calculated_by` |
| `reviewedBy` | `reviewed_by` |
| `checkedBy` | `checked_by` |
| `percentPassing200` | `percent_passing200` |
| `passing200` | `passing200` (JSONB) |
| `passing200SummaryPct` | `passing200_summary_pct` |
| `specificGravityG` | `specific_gravity_g` |
| `proctorPoints` | `proctor_points` (JSONB) |
| `zavPoints` | `zav_points` (JSONB) |
| `updatedAt` | `updated_at` |

## Density Reports Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `taskId` | `task_id` |
| `clientName` | `client_name` |
| `datePerformed` | `date_performed` |
| `structure` | `structure` |
| `structureType` | `structure_type` |
| `testRows` | `test_rows` (JSONB) |
| `proctors` | `proctors` (JSONB) |
| `densSpecPercent` | `dens_spec_percent` |
| `moistSpecMin` | `moist_spec_min` |
| `moistSpecMax` | `moist_spec_max` |
| `gaugeNo` | `gauge_no` |
| `stdDensityCount` | `std_density_count` |
| `stdMoistCount` | `std_moist_count` |
| `transDepthIn` | `trans_depth_in` |
| `methodD2922` | `method_d2922` |
| `methodD3017` | `method_d3017` |
| `methodD698` | `method_d698` |
| `remarks` | `remarks` |
| `techName` | `tech_name` |
| `technicianId` | `technician_id` |
| `timeStr` | `time_str` |
| `specDensityPct` | `spec_density_pct` |
| `proctorTaskId` | `proctor_task_id` |
| `proctorOptMoisture` | `proctor_opt_moisture` |
| `proctorMaxDensity` | `proctor_max_density` |
| `proctorSoilClassification` | `proctor_soil_classification` |
| `proctorSoilClassificationText` | `proctor_soil_classification_text` |
| `proctorDescriptionLabel` | `proctor_description_label` |
| `lastEditedByRole` | `last_edited_by_role` |
| `lastEditedByUserId` | `last_edited_by_user_id` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

## Rebar Reports Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `taskId` | `task_id` |
| `clientName` | `client_name` |
| `reportDate` | `report_date` |
| `inspectionDate` | `inspection_date` |
| `generalContractor` | `general_contractor` |
| `locationDetail` | `location_detail` |
| `wireMeshSpec` | `wire_mesh_spec` |
| `drawings` | `drawings` |
| `technicianId` | `technician_id` |
| `techName` | `tech_name` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

## Notifications Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `userId` | `user_id` |
| `message` | `message` |
| `type` | `type` |
| `isRead` | `is_read` |
| `relatedTaskId` | `related_task_id` |
| `relatedWorkPackageId` | `related_work_package_id` |
| `relatedProjectId` | `related_project_id` |
| `createdAt` | `created_at` |

## Task History Table

| SQLite | PostgreSQL |
|--------|------------|
| `id` | `id` |
| `taskId` | `task_id` |
| `timestamp` | `timestamp` |
| `actorRole` | `actor_role` |
| `actorName` | `actor_name` |
| `actorUserId` | `actor_user_id` |
| `actionType` | `action_type` |
| `note` | `note` |

## Usage Notes

1. **Supabase Client:** When using Supabase client, column names are automatically converted. However, if using raw SQL queries, use snake_case.

2. **JSONB Fields:** Supabase returns JSONB fields as parsed JavaScript objects/arrays. No need for `JSON.parse()`.

3. **Timestamps:** All timestamp fields use `TIMESTAMPTZ` and are returned as ISO 8601 strings by Supabase.

4. **Boolean Fields:** Integer fields with CHECK constraints (0/1) are used for boolean-like values. Handle in application code.

## Migration Helper Function

Consider creating a helper function to map column names:

```javascript
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
```
