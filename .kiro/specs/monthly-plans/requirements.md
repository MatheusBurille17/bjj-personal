# Requirements Document: Monthly Plans (Planos Mensais)

## Introduction

This document defines the requirements for the Monthly Plans module of the Jiu-Jitsu private lessons management platform. This module enables teachers to create pedagogical planning documents that define intended content for specific periods (typically monthly), organizing training content by day/week with associated videos. Monthly plans represent **planning intent** - what the teacher intends to teach - separate from **reality** (actual lessons executed).

Plans serve as templates and organizational tools for teachers to structure their curriculum, which can then be referenced when scheduling and conducting actual lessons. Plans can be published to specific students for visibility, reused across different periods, and duplicated as starting points for future planning cycles.

## Glossary

- **Monthly_Plan**: Pedagogical planning document for a specific period, defining intended content structure
- **Plan_Day**: Individual day or session within a monthly plan, containing theme, objectives, and associated videos
- **Teacher**: User with teacher role who creates and manages monthly plans
- **Student**: User with student role who views published plans they're authorized to see
- **Enrollment**: Teacher-student relationship record used to scope plan publication
- **Plan_Status**: State of a plan (draft, published, archived)
- **Video**: Video record from the technique library that can be associated with plan days
- **Lesson**: Concrete class occurrence that may reference a plan day but exists independently
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Platform**: The complete application system
- **Plan_Enrollment**: Association record defining which enrollments can view a specific published plan
- **Sort_Order**: Integer field determining display sequence

## Requirements

### Requirement 1: Create Monthly Plan

**User Story:** As a teacher, I want to create a monthly plan with a title and period, so that I can organize my pedagogical content for a specific timeframe.

#### Acceptance Criteria

1. WHEN a teacher provides a plan title, period start, and period end, THE Platform SHALL create a monthly plan record owned by that teacher
2. THE API_Route SHALL validate that the title is not empty
3. THE API_Route SHALL validate that period_end is equal to or after period_start
4. THE Database SHALL set status to draft by default
5. THE Database SHALL set created_at and updated_at timestamps automatically
6. THE description field SHALL be optional and nullable
7. THE RLS_Policy SHALL enforce that the plan belongs to the authenticated teacher

### Requirement 2: List Monthly Plans

**User Story:** As a teacher, I want to view all my monthly plans with status indicators, so that I can navigate and manage my planning documents.

#### Acceptance Criteria

1. WHEN a teacher requests their plan list, THE API_Route SHALL return all monthly plans where teacher_id matches the authenticated teacher
2. THE response SHALL exclude archived plans by default
3. THE API_Route SHALL sort plans by period_start in descending order (most recent first)
4. WHEN the teacher requests archived plans, THE API_Route SHALL include plans with archived status
5. THE RLS_Policy SHALL prevent teachers from viewing plans owned by other teachers
6. WHEN no plans exist, THE API_Route SHALL return an empty array
7. THE response SHALL include plan_id, title, description, period_start, period_end, status, published_at, and plan day count for each plan

### Requirement 3: Filter Plans by Status

**User Story:** As a teacher, I want to filter plans by status (draft, published, archived), so that I can focus on specific planning stages.

#### Acceptance Criteria

1. WHEN a teacher requests plans with a status filter, THE API_Route SHALL return only plans matching the specified status
2. THE API_Route SHALL support filtering by draft, published, and archived statuses
3. THE API_Route SHALL allow filtering by multiple statuses simultaneously
4. WHEN no status filter is provided, THE API_Route SHALL return only draft and published plans (excluding archived)
5. THE RLS_Policy SHALL enforce teacher ownership regardless of status filter
6. IF an invalid status value is provided, THEN THE API_Route SHALL return a validation error
7. THE filter SHALL work independently of the date range filter

### Requirement 4: Filter Plans by Date Range

**User Story:** As a teacher, I want to filter plans by period dates, so that I can find plans for specific timeframes.

#### Acceptance Criteria

1. WHEN a teacher provides a date range filter, THE API_Route SHALL return plans where period_start or period_end falls within the specified range
2. THE API_Route SHALL accept optional from_date and to_date parameters
3. WHEN only from_date is provided, THE API_Route SHALL return plans starting on or after that date
4. WHEN only to_date is provided, THE API_Route SHALL return plans ending on or before that date
5. THE API_Route SHALL validate that date parameters are in valid ISO 8601 format
6. THE RLS_Policy SHALL enforce teacher ownership regardless of date filter
7. THE date filter SHALL work in combination with status filters

### Requirement 5: Update Plan Metadata

**User Story:** As a teacher, I want to edit plan title, description, and period dates, so that I can keep my planning documents accurate.

#### Acceptance Criteria

1. WHEN a teacher updates a plan, THE API_Route SHALL allow modification of title, description, period_start, and period_end fields
2. THE API_Route SHALL validate that title is not empty
3. THE API_Route SHALL validate that period_end is equal to or after period_start
4. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp automatically
6. WHEN the plan_id does not exist, THE API_Route SHALL return a 404 error
7. WHEN the plan belongs to a different teacher, THE API_Route SHALL return a 403 error

### Requirement 6: Create Plan Day

**User Story:** As a teacher, I want to add days to my monthly plan with themes and objectives, so that I can structure my intended content.

#### Acceptance Criteria

1. WHEN a teacher provides a weekday, title, and monthly_plan_id, THE Platform SHALL create a plan day record
2. THE API_Route SHALL validate that the monthly_plan_id exists and belongs to the authenticated teacher
3. THE plan day record SHALL store monthly_plan_id, weekday, planned_date, title, objective, notes, and sort_order fields
4. THE weekday field SHALL accept integer values 0-6 (Sunday through Saturday)
5. THE planned_date field SHALL be optional and nullable
6. THE objective and notes fields SHALL be optional and nullable
7. THE Database SHALL set created_at and updated_at timestamps automatically

### Requirement 7: Choose Weekday or Specific Date Model

**User Story:** As a teacher, I want to organize plan days either by weekday (recurring) or specific dates, so that my planning matches my teaching approach.

#### Acceptance Criteria

1. THE plan day record SHALL support both weekday-based (0-6) and date-based (planned_date) organization
2. WHEN weekday is provided and planned_date is null, THE plan day represents a recurring weekday pattern
3. WHEN planned_date is provided, THE plan day represents a specific calendar date
4. THE API_Route SHALL validate that at least one of weekday or planned_date is provided
5. THE API_Route SHALL validate that weekday is between 0 and 6 if provided
6. THE API_Route SHALL validate that planned_date is within the plan's period if provided
7. THE Platform SHALL allow teachers to use either model or mix both within the same plan

### Requirement 8: List Plan Days for a Plan

**User Story:** As a teacher, I want to view all days within a monthly plan in order, so that I can see the complete structure.

#### Acceptance Criteria

1. WHEN a teacher requests plan days for a specific plan, THE API_Route SHALL return all plan days where monthly_plan_id matches the requested plan
2. THE RLS_Policy SHALL verify that the parent plan belongs to the authenticated teacher
3. THE API_Route SHALL sort plan days by sort_order in ascending order, then by weekday or planned_date
4. THE response SHALL include plan_day_id, weekday, planned_date, title, objective, notes, sort_order, and associated video count
5. WHEN no plan days exist for the plan, THE API_Route SHALL return an empty array
6. THE response SHALL include video associations for each plan day
7. WHEN the plan does not belong to the teacher, THE API_Route SHALL return a 403 error

### Requirement 9: Update Plan Day

**User Story:** As a teacher, I want to edit plan day content, so that I can refine my planned structure.

#### Acceptance Criteria

1. WHEN a teacher updates a plan day, THE API_Route SHALL allow modification of weekday, planned_date, title, objective, notes, and sort_order fields
2. THE API_Route SHALL validate that title is not empty
3. THE API_Route SHALL validate that weekday is between 0 and 6 if provided
4. THE RLS_Policy SHALL verify that the parent plan belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp automatically
6. WHEN the plan_day_id does not exist, THE API_Route SHALL return a 404 error
7. WHEN the plan day belongs to a different teacher's plan, THE API_Route SHALL return a 403 error

### Requirement 10: Reorder Plan Days

**User Story:** As a teacher, I want to change the display order of plan days, so that I can present content in the optimal learning sequence.

#### Acceptance Criteria

1. WHEN a teacher provides new sort_order values for plan days, THE Database SHALL update the sort_order fields
2. THE API_Route SHALL accept an array of plan_day_id and sort_order pairs
3. THE RLS_Policy SHALL verify that all plan days belong to plans owned by the authenticated teacher
4. THE API_Route SHALL validate that all sort_order values are non-negative integers
5. IF any plan day belongs to a different teacher's plan, THEN THE API_Route SHALL return a 403 error
6. THE Database SHALL update all sort_order values within a single transaction
7. WHEN the transaction fails, THE Database SHALL roll back all changes

### Requirement 11: Delete Plan Day

**User Story:** As a teacher, I want to remove a day from my plan, so that I can adjust my planning structure.

#### Acceptance Criteria

1. WHEN a teacher deletes a plan day, THE Database SHALL remove the plan day record
2. THE Database SHALL remove all associated plan_day_videos records
3. THE RLS_Policy SHALL verify that the parent plan belongs to the authenticated teacher
4. WHEN lessons reference the plan_day_id, THE deletion SHALL NOT fail
5. THE lesson references SHALL be preserved for historical integrity
6. WHEN the plan_day_id does not exist, THE API_Route SHALL return a 404 error
7. WHEN the plan day belongs to a different teacher's plan, THE API_Route SHALL return a 403 error

### Requirement 12: Associate Video to Plan Day

**User Story:** As a teacher, I want to add videos from my library to plan days, so that I can specify intended video content.

#### Acceptance Criteria

1. WHEN a teacher provides a plan_day_id and video_id, THE Platform SHALL create a plan_day_videos association
2. THE API_Route SHALL validate that the plan day belongs to a plan owned by the authenticated teacher
3. THE API_Route SHALL validate that the video belongs to the authenticated teacher
4. THE API_Route SHALL validate that the video_id exists and is not archived
5. THE association SHALL store plan_day_id, video_id, sort_order, and created_at
6. THE API_Route SHALL prevent duplicate associations of the same video to the same plan day
7. THE sort_order SHALL default to the next available position if not provided

### Requirement 13: Remove Video from Plan Day

**User Story:** As a teacher, I want to remove a video from a plan day, so that I can adjust my planned content.

#### Acceptance Criteria

1. WHEN a teacher removes a video association, THE Database SHALL delete the plan_day_videos record
2. THE RLS_Policy SHALL verify that the parent plan belongs to the authenticated teacher
3. THE removal SHALL NOT affect the video record in the library
4. THE removal SHALL NOT affect lessons that have already used this plan day
5. WHEN the association does not exist, THE API_Route SHALL return a 404 error
6. WHEN the plan day belongs to a different teacher, THE API_Route SHALL return a 403 error
7. THE Database SHALL automatically reorder remaining videos if sort_order gaps exist

### Requirement 14: Reorder Videos Within Plan Day

**User Story:** As a teacher, I want to change the order of videos within a plan day, so that I can sequence content appropriately.

#### Acceptance Criteria

1. WHEN a teacher provides new sort_order values for plan day videos, THE Database SHALL update the sort_order fields
2. THE API_Route SHALL accept an array of plan_day_videos association IDs and sort_order pairs
3. THE RLS_Policy SHALL verify that the parent plan belongs to the authenticated teacher
4. THE API_Route SHALL validate that all associations belong to the same plan_day_id
5. THE API_Route SHALL validate that all sort_order values are non-negative integers
6. THE Database SHALL update all sort_order values within a single transaction
7. WHEN the transaction fails, THE Database SHALL roll back all changes

### Requirement 15: Publish Plan

**User Story:** As a teacher, I want to publish a plan so that students can view it, so that they understand the intended training structure.

#### Acceptance Criteria

1. WHEN a teacher publishes a plan, THE Database SHALL update the status field to published
2. THE Database SHALL set published_at to the current timestamp
3. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
4. THE API_Route SHALL only allow publishing plans with draft status
5. IF the plan status is already published, THEN THE API_Route SHALL return a 409 conflict error
6. THE Database SHALL update the updated_at timestamp
7. THE publishing action SHALL NOT automatically grant access to any students

### Requirement 16: Unpublish Plan

**User Story:** As a teacher, I want to unpublish a plan to make further changes privately, so that students don't see incomplete updates.

#### Acceptance Criteria

1. WHEN a teacher unpublishes a plan, THE Database SHALL update the status field to draft
2. THE published_at timestamp SHALL remain unchanged for audit purposes
3. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
4. THE API_Route SHALL only allow unpublishing plans with published status
5. IF the plan status is already draft, THEN THE API_Route SHALL return a 409 conflict error
6. WHILE the plan is unpublished, THE plan SHALL not be visible in student-facing endpoints
7. THE unpublishing SHALL NOT remove plan_enrollments associations

### Requirement 17: Grant Plan Access to Enrollment

**User Story:** As a teacher, I want to publish a plan to specific students, so that only authorized students can view it.

#### Acceptance Criteria

1. WHEN a teacher grants plan access to an enrollment, THE Platform SHALL create a plan_enrollments record
2. THE API_Route SHALL validate that the enrollment belongs to the authenticated teacher
3. THE API_Route SHALL validate that the plan belongs to the authenticated teacher
4. THE API_Route SHALL validate that the plan status is published
5. THE plan_enrollments record SHALL store monthly_plan_id, enrollment_id, and published_at
6. THE API_Route SHALL prevent duplicate associations of the same plan to the same enrollment
7. IF the plan is not published, THEN THE API_Route SHALL return a validation error

### Requirement 18: Revoke Plan Access from Enrollment

**User Story:** As a teacher, I want to revoke a student's access to a plan, so that they no longer see it in their portal.

#### Acceptance Criteria

1. WHEN a teacher revokes plan access, THE Database SHALL delete the plan_enrollments record
2. THE RLS_Policy SHALL verify that both the plan and enrollment belong to the authenticated teacher
3. THE revocation SHALL NOT affect the plan record itself
4. THE revocation SHALL NOT affect lessons that referenced the plan
5. WHEN the association does not exist, THE API_Route SHALL return a 404 error
6. WHEN either the plan or enrollment belongs to a different teacher, THE API_Route SHALL return a 403 error
7. WHILE access is revoked, THE student SHALL NOT see the plan in their portal

### Requirement 19: List Enrollments with Plan Access

**User Story:** As a teacher, I want to see which students have access to a plan, so that I can manage plan visibility.

#### Acceptance Criteria

1. WHEN a teacher requests enrollments for a plan, THE API_Route SHALL return all plan_enrollments associations for that plan
2. THE response SHALL include enrollment details (student_name, status)
3. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
4. THE API_Route SHALL exclude archived enrollments by default
5. WHEN the teacher requests all enrollments, THE API_Route SHALL include archived enrollments
6. WHEN no enrollments have access, THE API_Route SHALL return an empty array
7. THE response SHALL include the published_at timestamp for each association

### Requirement 20: Student View Published Plans

**User Story:** As a student, I want to view monthly plans published to me, so that I can understand my teacher's intended training structure.

#### Acceptance Criteria

1. WHEN a student requests their published plans, THE API_Route SHALL return plans where a plan_enrollments record exists for their enrollment
2. THE RLS_Policy SHALL enforce that only plans with status published are visible to students
3. THE API_Route SHALL include plan metadata (title, description, period dates)
4. THE API_Route SHALL include plan days with associated video information
5. THE student SHALL NOT see private_notes or internal teacher information
6. THE API_Route SHALL return only plans for active enrollments
7. WHEN the student has multiple teachers, THE API_Route SHALL clearly identify which teacher owns each plan

### Requirement 21: Duplicate Plan as Template

**User Story:** As a teacher, I want to duplicate an existing plan as a starting point for a new period, so that I can reuse successful planning structures.

#### Acceptance Criteria

1. WHEN a teacher duplicates a plan, THE Platform SHALL create a new monthly plan record with copied content
2. THE new plan SHALL have a new title (original title + " (Copy)")
3. THE new plan SHALL have status set to draft
4. THE Platform SHALL copy all plan days with their titles, objectives, notes, and sort_order
5. THE Platform SHALL copy all plan_day_videos associations with the same sort_order
6. THE new plan SHALL NOT copy plan_enrollments associations
7. THE published_at field SHALL be null for the new plan

### Requirement 22: Archive Plan

**User Story:** As a teacher, I want to archive old plans, so that they don't clutter my active plan list but history is preserved.

#### Acceptance Criteria

1. WHEN a teacher archives a plan, THE Database SHALL update the status field to archived
2. THE Database SHALL set archived_at to the current timestamp (if not already set)
3. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
4. WHILE a plan is archived, THE plan SHALL not appear in default plan lists
5. THE archiving SHALL preserve all plan days and video associations
6. THE archiving SHALL preserve all lesson references to plan days
7. THE API_Route SHALL allow archiving plans of any status (draft or published)

### Requirement 23: Unarchive Plan

**User Story:** As a teacher, I want to reactivate an archived plan, so that I can use it again or make it visible.

#### Acceptance Criteria

1. WHEN a teacher unarchives a plan, THE Database SHALL update the status field to draft
2. THE RLS_Policy SHALL verify that the plan belongs to the authenticated teacher
3. THE API_Route SHALL only allow unarchiving plans with archived status
4. IF the plan status is not archived, THEN THE API_Route SHALL return a 409 conflict error
5. THE archived_at timestamp SHALL remain for audit purposes
6. WHEN a plan is unarchived, THE plan SHALL appear in the draft plans list
7. THE teacher SHALL need to explicitly publish the plan again to make it visible to students

### Requirement 24: Prevent Plan Deletion with Lesson References

**User Story:** As a platform operator, I want to prevent deletion of plans referenced by lessons, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a teacher attempts to delete a plan, THE API_Route SHALL check for lessons that reference plan_day_id values from that plan
2. IF lesson references exist, THEN THE API_Route SHALL return a 409 conflict error with a message indicating archival is required
3. WHEN no lesson references exist, THE Database SHALL allow deletion of the plan and all associated plan days and video associations
4. THE deletion check SHALL include lessons of all statuses
5. THE RLS_Policy SHALL verify teacher ownership before allowing any deletion attempt
6. THE error message SHALL suggest archiving as the alternative action
7. THE deletion SHALL use a transaction to ensure data consistency

### Requirement 25: Plan Day Video Association Reusability

**User Story:** As a teacher, I want to use the same video in multiple plan days across different plans, so that I don't need to re-upload content.

#### Acceptance Criteria

1. THE Database schema SHALL allow a single video to be referenced by multiple plan_day_videos records
2. THE API_Route SHALL NOT restrict video association based on existing plan day references
3. WHEN a video is associated with multiple plan days, THE Platform SHALL NOT create copies of the video record
4. THE archiving of a video SHALL NOT automatically remove it from plan day associations
5. THE archived videos SHALL appear in plan day details with an archived indicator
6. THE RLS_Policy SHALL enforce teacher ownership when videos are associated with plan days
7. THE historical plan records SHALL maintain video associations even if the video is later archived

### Requirement 26: Plan Days Do Not Modify Lesson History

**User Story:** As a platform operator, I want changes to plan days to preserve lesson history, so that completed lessons remain accurate.

#### Acceptance Criteria

1. WHEN a teacher edits a plan day, THE changes SHALL NOT modify lesson records that referenced that plan day
2. WHEN a teacher deletes a plan day, THE lesson records SHALL preserve the plan_day_id reference
3. THE lessons SHALL maintain their recorded video associations independently of current plan day videos
4. THE Platform SHALL display lesson history with plan day information as it existed at lesson time
5. THE API_Route SHALL NOT cascade updates from plan days to lessons
6. THE lesson details SHALL indicate if the referenced plan day no longer exists
7. THE lesson video associations SHALL remain independent from plan day video changes

### Requirement 27: Plan Authorization Enforcement

**User Story:** As a platform operator, I want all plan access to be strictly enforced at the database level, so that authorization cannot be bypassed.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that teachers can only query monthly_plans where teacher_id equals their user ID
2. THE RLS_Policy SHALL enforce that plan day queries verify parent plan ownership
3. THE RLS_Policy SHALL enforce that plan_day_videos queries verify parent plan ownership through plan day relationship
4. THE RLS_Policy SHALL enforce that students can only query plans through plan_enrollments associations
5. WHEN a user attempts unauthorized access, THE Database SHALL return zero rows
6. THE RLS_Policy SHALL use auth.uid() to get the authenticated user ID from the JWT token
7. THE Database SHALL reject any query that violates RLS policies

### Requirement 28: Plan Metadata Validation

**User Story:** As a teacher, I want to be notified of validation errors when entering plan information, so that my plans maintain quality standards.

#### Acceptance Criteria

1. THE API_Route SHALL validate that plan title is not empty and contains at least 3 characters
2. THE API_Route SHALL validate that plan title does not exceed 200 characters
3. THE API_Route SHALL validate that description does not exceed 2000 characters if provided
4. THE API_Route SHALL validate that period_start and period_end are valid dates in ISO 8601 format
5. THE API_Route SHALL validate that period_end is not before period_start
6. THE API_Route SHALL trim whitespace from title and description fields before validation
7. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages

### Requirement 29: Plan Day Metadata Validation

**User Story:** As a teacher, I want to be notified of validation errors when entering plan day information, so that my plan structure maintains quality standards.

#### Acceptance Criteria

1. THE API_Route SHALL validate that plan day title is not empty and contains at least 2 characters
2. THE API_Route SHALL validate that plan day title does not exceed 200 characters
3. THE API_Route SHALL validate that objective does not exceed 1000 characters if provided
4. THE API_Route SHALL validate that notes do not exceed 2000 characters if provided
5. THE API_Route SHALL validate that weekday is between 0 and 6 if provided
6. THE API_Route SHALL validate that planned_date is a valid date if provided
7. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages

### Requirement 30: Plan List Pagination

**User Story:** As a teacher with extensive planning history, I want paginated plan lists, so that the interface remains responsive.

#### Acceptance Criteria

1. THE API_Route SHALL support pagination parameters (page number and page size) for plan lists
2. THE default page size SHALL be 20 plans per page
3. THE API_Route SHALL return total count in the response metadata
4. THE response SHALL include pagination metadata (current page, total pages, has next, has previous)
5. THE pagination SHALL work in combination with status and date filters
6. WHEN page number exceeds available pages, THE API_Route SHALL return an empty array
7. THE API_Route SHALL validate that page size does not exceed 100 plans

### Requirement 31: Plan Timestamps and Audit Trail

**User Story:** As a platform operator, I want accurate timestamps on all plan records, so that we can track planning activity and changes.

#### Acceptance Criteria

1. THE Database SHALL automatically set created_at to the current UTC timestamp when plan records are created
2. THE Database SHALL automatically update updated_at whenever plan records are modified
3. WHEN a plan is published, THE Database SHALL set published_at to the current timestamp
4. WHEN a plan is archived, THE Database SHALL set archived_at if not already set
5. THE API_Route SHALL return all timestamp fields in ISO 8601 format with UTC timezone
6. THE Database SHALL use TIMESTAMPTZ type for all timestamp columns
7. THE timestamps SHALL be consistent across monthly_plans, plan_days, and plan_day_videos tables

### Requirement 32: Search Plans by Title

**User Story:** As a teacher, I want to search for plans by title, so that I can quickly find specific planning documents.

#### Acceptance Criteria

1. WHEN a teacher provides a search query, THE API_Route SHALL return plans where title contains the query string (case-insensitive)
2. THE search SHALL match partial strings anywhere in the title field
3. THE RLS_Policy SHALL enforce that only the teacher's own plans are searchable
4. THE search SHALL exclude archived plans by default unless explicitly requested
5. WHEN the search query is empty or whitespace only, THE API_Route SHALL return all plans
6. THE API_Route SHALL trim whitespace from the search query before matching
7. WHEN no plans match the search, THE API_Route SHALL return an empty array
