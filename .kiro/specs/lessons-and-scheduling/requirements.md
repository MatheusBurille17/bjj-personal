# Requirements Document: Lessons and Scheduling (Agenda e Aulas)

## Introduction

This document defines the requirements for the Lessons and Scheduling module of the Jiu-Jitsu private lessons management platform. This module manages concrete lesson occurrences, representing **REALITY** versus **PLANNING**. Teachers schedule lessons (individual or from recurring patterns), mark attendance, associate videos, and add notes. Lessons reference enrollments and optionally reference plan days for content suggestions.

This module is central to the platform's core workflow: transforming pedagogical planning into actual executed lessons with documented outcomes. Lessons preserve historical accuracy even when plans or schedules change, ensuring data integrity and reliable tracking of student progress.

## Glossary

- **Lesson**: Concrete class occurrence record with defined start/end times and status
- **Weekly_Slot**: Recurring schedule template that generates lesson suggestions
- **Lesson_Status**: State of a lesson (scheduled, completed, cancelled, no_show)
- **Lesson_Video**: Association record linking lessons to videos from library
- **Teacher**: User with teacher role who schedules and conducts lessons
- **Student**: User with student role who participates in lessons
- **Enrollment**: Teacher-student relationship record that scopes all lessons
- **Plan_Day**: Optional reference to monthly plan content for lesson suggestions
- **Video**: Video record from technique library that can be associated with lessons
- **Monthly_Plan**: Pedagogical planning document (defined in separate spec)
- **Shared_Notes**: Observations visible to the student about a lesson
- **Private_Notes**: Teacher's confidential observations never visible to student
- **Completed_At**: Timestamp when lesson was marked as completed
- **Source**: Origin indicator for video association (plan or manual)
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Platform**: The complete application system
- **Agenda**: Calendar view showing scheduled and historical lessons
- **Timezone**: IANA timezone identifier for teacher's configured timezone

## Requirements

### Requirement 1: Create Individual Lesson

**User Story:** As a teacher, I want to schedule an individual lesson for a student, so that we can record a specific class occurrence.

#### Acceptance Criteria

1. WHEN a teacher provides enrollment_id, start time, and end time, THE Platform SHALL create a lesson record
2. THE API_Route SHALL validate that the enrollment belongs to the authenticated teacher
3. THE API_Route SHALL validate that end time is after start time
4. THE Database SHALL set status to scheduled by default
5. THE lesson record SHALL store teacher_id, enrollment_id, plan_day_id (nullable), starts_at, ends_at, status, shared_notes, and private_notes
6. THE Database SHALL set created_at and updated_at timestamps automatically
7. THE RLS_Policy SHALL enforce that the lesson belongs to the authenticated teacher

### Requirement 2: Create Recurring Weekly Schedule

**User Story:** As a teacher, I want to define recurring weekly time slots for a student, so that regular lessons are structured consistently.

#### Acceptance Criteria

1. WHEN a teacher provides enrollment_id, weekday, start time, and end time, THE Platform SHALL create a weekly slot record
2. THE API_Route SHALL validate that the enrollment belongs to the authenticated teacher
3. THE API_Route SHALL validate that weekday is between 0 and 6 (Sunday through Saturday)
4. THE API_Route SHALL validate that end time is after start time
5. THE weekly slot SHALL store teacher_id, enrollment_id, weekday, start_time, end_time, valid_from, valid_until (nullable), and status
6. THE Database SHALL set status to active by default
7. THE RLS_Policy SHALL enforce that the weekly slot belongs to the authenticated teacher

### Requirement 3: Generate Lesson Suggestions from Weekly Slots

**User Story:** As a teacher, I want to generate lesson occurrences from weekly slots for review, so that I can confirm scheduled lessons before they're final.

#### Acceptance Criteria

1. WHEN a teacher requests lesson generation for a date range, THE Platform SHALL create suggested lesson records based on active weekly slots
2. THE API_Route SHALL generate one lesson per slot occurrence within the specified date range
3. THE generated lessons SHALL have status set to scheduled
4. THE API_Route SHALL detect and warn about scheduling conflicts with existing lessons
5. THE teacher SHALL confirm generation before lessons are persisted to the database
6. THE API_Route SHALL validate that the date range does not exceed 90 days
7. THE RLS_Policy SHALL enforce that only the teacher's own weekly slots generate lessons

### Requirement 4: List Weekly Slots for Enrollment

**User Story:** As a teacher, I want to view all recurring time slots for a student, so that I can understand their regular schedule.

#### Acceptance Criteria

1. WHEN a teacher requests weekly slots for an enrollment, THE API_Route SHALL return all slots where enrollment_id matches
2. THE response SHALL include weekday, start_time, end_time, valid_from, valid_until, and status
3. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
4. THE API_Route SHALL sort slots by weekday in ascending order
5. THE response SHALL exclude slots where valid_until has passed
6. WHEN no slots exist for the enrollment, THE API_Route SHALL return an empty array
7. THE response SHALL indicate if the slot is currently active or paused

### Requirement 5: Update Weekly Slot Times

**User Story:** As a teacher, I want to modify the times for a recurring slot, so that I can adjust to schedule changes.

#### Acceptance Criteria

1. WHEN a teacher updates a weekly slot, THE API_Route SHALL allow modification of weekday, start_time, end_time, valid_from, and valid_until fields
2. THE API_Route SHALL validate that end_time is after start_time
3. THE API_Route SHALL validate that weekday is between 0 and 6 if provided
4. THE RLS_Policy SHALL verify that the weekly slot belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp automatically
6. THE update SHALL NOT modify existing lesson records generated from this slot
7. WHEN the slot_id does not exist, THE API_Route SHALL return a 404 error

### Requirement 6: Pause and Activate Weekly Slot

**User Story:** As a teacher, I want to pause and reactivate recurring slots, so that I can manage temporary schedule changes without losing the configuration.

#### Acceptance Criteria

1. WHEN a teacher pauses a weekly slot, THE Database SHALL update the status field to paused
2. WHEN a teacher activates a paused slot, THE Database SHALL update the status field to active
3. THE RLS_Policy SHALL verify that the weekly slot belongs to the authenticated teacher
4. WHILE a slot is paused, THE Platform SHALL NOT generate new lesson suggestions from that slot
5. THE status change SHALL NOT affect existing lessons generated from this slot
6. THE Database SHALL update the updated_at timestamp when status changes
7. THE API_Route SHALL validate that the slot status transition is valid

### Requirement 7: Delete Weekly Slot with Safety Check

**User Story:** As a teacher, I want to delete a recurring slot only if no lessons have been generated, so that historical data is preserved.

#### Acceptance Criteria

1. WHEN a teacher attempts to delete a weekly slot, THE API_Route SHALL check for lessons generated from that slot
2. IF lessons exist referencing the slot (implicitly through matching times and enrollment), THEN THE API_Route SHALL return a 409 conflict error
3. WHEN no lessons exist, THE Database SHALL allow deletion of the weekly slot record
4. THE RLS_Policy SHALL verify that the weekly slot belongs to the authenticated teacher
5. THE error message SHALL suggest pausing the slot as an alternative
6. WHEN the slot_id does not exist, THE API_Route SHALL return a 404 error
7. THE deletion check SHALL use a database transaction to prevent race conditions

### Requirement 8: Associate Plan Day to Lesson

**User Story:** As a teacher, I want to link a lesson to a plan day, so that planned content is suggested for the lesson.

#### Acceptance Criteria

1. WHEN a teacher provides a plan_day_id for a lesson, THE Database SHALL store the reference
2. THE API_Route SHALL validate that the plan day exists and belongs to a plan owned by the authenticated teacher
3. THE API_Route SHALL validate that the plan day's plan is published or draft (not archived)
4. THE plan_day_id field SHALL be nullable to support lessons without plan references
5. THE association SHALL NOT automatically copy videos from the plan day to the lesson
6. THE RLS_Policy SHALL verify that both the lesson and plan day belong to the authenticated teacher
7. WHEN the plan_day_id is set to null, THE Database SHALL remove the plan day reference

### Requirement 9: Copy Videos from Plan Day to Lesson

**User Story:** As a teacher, I want to copy suggested videos from a plan day to a lesson, so that planned content is easily applied.

#### Acceptance Criteria

1. WHEN a teacher requests to copy videos from a plan day, THE Platform SHALL create lesson_videos associations with source set to plan
2. THE API_Route SHALL validate that the lesson has a plan_day_id reference
3. THE API_Route SHALL copy all video associations from plan_day_videos to lesson_videos
4. THE copied associations SHALL preserve the sort_order from the plan day
5. THE source field SHALL be set to "plan" to indicate origin
6. THE API_Route SHALL NOT duplicate videos if they already exist in lesson_videos
7. THE RLS_Policy SHALL verify that the lesson and plan day belong to the authenticated teacher

### Requirement 10: Manually Associate Video to Lesson

**User Story:** As a teacher, I want to add specific videos to a lesson, so that I can customize content beyond the plan.

#### Acceptance Criteria

1. WHEN a teacher provides a lesson_id and video_id, THE Platform SHALL create a lesson_videos association
2. THE API_Route SHALL validate that the lesson belongs to the authenticated teacher
3. THE API_Route SHALL validate that the video exists and belongs to the authenticated teacher
4. THE API_Route SHALL validate that the video status is ready (not archived or processing)
5. THE association SHALL store lesson_id, video_id, source (set to manual), sort_order, and created_at
6. THE API_Route SHALL prevent duplicate associations of the same video to the same lesson
7. THE sort_order SHALL default to the next available position if not provided

### Requirement 11: Remove Video from Lesson

**User Story:** As a teacher, I want to remove a video from a lesson, so that I can adjust lesson content.

#### Acceptance Criteria

1. WHEN a teacher removes a video association, THE Database SHALL delete the lesson_videos record
2. THE RLS_Policy SHALL verify that the parent lesson belongs to the authenticated teacher
3. THE removal SHALL NOT affect the video record in the library
4. THE removal SHALL NOT affect the plan day video associations if the video came from a plan
5. WHEN the association does not exist, THE API_Route SHALL return a 404 error
6. WHEN the lesson status is completed, THE API_Route SHALL return a 409 conflict error to preserve history
7. THE Database SHALL automatically reorder remaining videos if sort_order gaps exist

### Requirement 12: Reorder Videos Within Lesson

**User Story:** As a teacher, I want to change the order of videos in a lesson, so that content is presented in the optimal sequence.

#### Acceptance Criteria

1. WHEN a teacher provides new sort_order values for lesson videos, THE Database SHALL update the sort_order fields
2. THE API_Route SHALL accept an array of lesson_videos IDs and sort_order pairs
3. THE RLS_Policy SHALL verify that the parent lesson belongs to the authenticated teacher
4. THE API_Route SHALL validate that all associations belong to the same lesson_id
5. THE API_Route SHALL validate that all sort_order values are non-negative integers
6. THE Database SHALL update all sort_order values within a single transaction
7. WHEN the lesson status is completed, THE API_Route SHALL return a 409 conflict error to preserve history

### Requirement 13: View Weekly Agenda

**User Story:** As a teacher, I want to see all lessons for a week, so that I can understand my upcoming schedule.

#### Acceptance Criteria

1. WHEN a teacher requests a weekly agenda, THE API_Route SHALL return all lessons within the specified week
2. THE response SHALL include lessons for all enrollments owned by the teacher
3. THE API_Route SHALL sort lessons by starts_at in ascending order
4. THE response SHALL include enrollment details (student_name), plan_day reference, and video count for each lesson
5. THE RLS_Policy SHALL enforce that only the teacher's own lessons are returned
6. THE API_Route SHALL accept a week_start_date parameter in ISO 8601 format
7. WHEN no week is specified, THE API_Route SHALL default to the current week

### Requirement 14: View Daily Agenda

**User Story:** As a teacher, I want to see all lessons for a specific day, so that I can focus on today's schedule.

#### Acceptance Criteria

1. WHEN a teacher requests a daily agenda, THE API_Route SHALL return all lessons for the specified date
2. THE response SHALL include lessons for all enrollments owned by the teacher
3. THE API_Route SHALL sort lessons by starts_at in ascending order
4. THE response SHALL include full enrollment details, lesson status, and associated video information
5. THE RLS_Policy SHALL enforce that only the teacher's own lessons are returned
6. THE API_Route SHALL accept a date parameter in ISO 8601 format
7. WHEN no date is specified, THE API_Route SHALL default to the current date

### Requirement 15: List Lessons for Enrollment

**User Story:** As a teacher, I want to see all lessons for a specific student, so that I can review their training history.

#### Acceptance Criteria

1. WHEN a teacher requests lessons for an enrollment, THE API_Route SHALL return all lessons where enrollment_id matches
2. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
3. THE API_Route SHALL support filtering by status (scheduled, completed, cancelled, no_show)
4. THE API_Route SHALL support filtering by date range (from_date, to_date)
5. THE API_Route SHALL sort lessons by starts_at in descending order (most recent first)
6. THE response SHALL include plan_day reference, video count, and completion information
7. WHEN no lessons exist for the enrollment, THE API_Route SHALL return an empty array

### Requirement 16: View Lesson Details

**User Story:** As a teacher, I want to view complete details of a lesson, so that I can review or modify its content and outcome.

#### Acceptance Criteria

1. WHEN a teacher requests lesson details, THE API_Route SHALL return the complete lesson record
2. THE response SHALL include enrollment details (student_name, student_email)
3. THE response SHALL include plan_day information if referenced (title, objective)
4. THE response SHALL include all associated videos with their metadata (title, thumbnail, duration, source)
5. THE response SHALL include shared_notes and private_notes
6. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
7. WHEN the lesson_id does not exist, THE API_Route SHALL return a 404 error

### Requirement 17: Update Lesson Time and Plan Reference

**User Story:** As a teacher, I want to modify lesson times and plan references, so that I can adjust scheduling before the lesson occurs.

#### Acceptance Criteria

1. WHEN a teacher updates a lesson, THE API_Route SHALL allow modification of starts_at, ends_at, and plan_day_id fields
2. THE API_Route SHALL validate that ends_at is after starts_at
3. THE API_Route SHALL validate that plan_day_id exists and belongs to the teacher if provided
4. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp automatically
6. THE API_Route SHALL NOT allow time changes for lessons with status completed
7. WHEN the lesson status is completed, THE API_Route SHALL return a 409 conflict error

### Requirement 18: Update Lesson Notes Before Completion

**User Story:** As a teacher, I want to add or modify lesson notes before marking it complete, so that I can document planning and preparation.

#### Acceptance Criteria

1. WHEN a teacher updates lesson notes, THE API_Route SHALL allow modification of shared_notes and private_notes fields
2. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
3. THE shared_notes SHALL be visible to the student when the lesson is completed
4. THE private_notes SHALL never be visible to the student
5. THE Database SHALL update the updated_at timestamp automatically
6. THE API_Route SHALL allow note updates for lessons in any status
7. THE notes fields SHALL support up to 5000 characters each

### Requirement 19: Mark Lesson as Completed

**User Story:** As a teacher, I want to mark a lesson as completed with final notes, so that the session is recorded as executed.

#### Acceptance Criteria

1. WHEN a teacher marks a lesson as completed, THE Database SHALL update the status field to completed
2. THE Database SHALL set completed_at to the current timestamp
3. THE API_Route SHALL require that the lesson status is scheduled before allowing completion
4. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp
6. WHEN a lesson is completed, THE lesson record SHALL become immutable except for notes
7. THE completed lesson SHALL count toward the enrollment's total completed lessons

### Requirement 20: Mark Lesson as Cancelled

**User Story:** As a teacher, I want to mark a lesson as cancelled, so that it doesn't count as completed but preserves the scheduled record.

#### Acceptance Criteria

1. WHEN a teacher marks a lesson as cancelled, THE Database SHALL update the status field to cancelled
2. THE API_Route SHALL require that the lesson status is scheduled before allowing cancellation
3. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp
5. THE cancelled lesson SHALL NOT count toward completed lesson totals
6. THE API_Route SHALL allow adding shared_notes to explain the cancellation
7. IF the status is already cancelled, THEN THE API_Route SHALL return a 409 conflict error

### Requirement 21: Mark Lesson as No Show

**User Story:** As a teacher, I want to record when a student doesn't show up, so that attendance patterns are tracked accurately.

#### Acceptance Criteria

1. WHEN a teacher marks a lesson as no_show, THE Database SHALL update the status field to no_show
2. THE API_Route SHALL require that the lesson status is scheduled before marking no_show
3. THE RLS_Policy SHALL verify that the lesson belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp
5. THE no_show lesson SHALL NOT count toward completed lesson totals
6. THE API_Route SHALL allow adding private_notes about the absence
7. IF the status is already no_show, THEN THE API_Route SHALL return a 409 conflict error

### Requirement 22: Lesson Status Transition Rules

**User Story:** As a platform operator, I want to enforce valid status transitions, so that lessons maintain logical states and history integrity.

#### Acceptance Criteria

1. THE scheduled status SHALL transition to completed, cancelled, or no_show
2. THE completed status SHALL NOT transition to any other status
3. THE cancelled status SHALL NOT transition to any other status
4. THE no_show status SHALL NOT transition to any other status
5. THE API_Route SHALL validate status transitions before allowing updates
6. IF an invalid transition is requested, THEN THE API_Route SHALL return a 409 conflict error
7. THE error message SHALL indicate the current status and the invalid target status

### Requirement 23: Prevent Lesson Deletion

**User Story:** As a platform operator, I want to prevent deletion of lessons to preserve historical accuracy, so that training records remain complete.

#### Acceptance Criteria

1. THE API_Route SHALL NOT provide a delete endpoint for lessons
2. WHEN a teacher wants to remove a lesson from view, THE Platform SHALL require status change to cancelled
3. THE archived enrollments SHALL preserve all lesson records
4. THE Database SHALL enforce referential integrity for lesson records
5. THE historical lesson data SHALL remain queryable for reporting purposes
6. THE API_Route documentation SHALL indicate that lessons cannot be deleted
7. THE cancellation SHALL be the only method to mark a lesson as not executed

### Requirement 24: Student View Upcoming Lessons

**User Story:** As a student, I want to see my upcoming scheduled lessons, so that I know when my next classes are.

#### Acceptance Criteria

1. WHEN a student requests upcoming lessons, THE API_Route SHALL return lessons where enrollment matches the student and status is scheduled
2. THE API_Route SHALL filter for lessons where starts_at is in the future
3. THE response SHALL include lesson time, teacher name, plan_day reference (title only), and video count
4. THE RLS_Policy SHALL enforce that only the student's own lessons are returned
5. THE API_Route SHALL sort lessons by starts_at in ascending order
6. THE response SHALL NOT include private_notes
7. WHEN no upcoming lessons exist, THE API_Route SHALL return an empty array

### Requirement 25: Student View Lesson History

**User Story:** As a student, I want to see my past completed lessons, so that I can review my training progress.

#### Acceptance Criteria

1. WHEN a student requests lesson history, THE API_Route SHALL return lessons where enrollment matches the student and status is completed
2. THE API_Route SHALL filter for lessons where starts_at is in the past
3. THE response SHALL include lesson time, plan_day reference, associated videos, and shared_notes
4. THE RLS_Policy SHALL enforce that only the student's own lessons are returned
5. THE API_Route SHALL sort lessons by starts_at in descending order (most recent first)
6. THE response SHALL NOT include private_notes
7. THE API_Route SHALL support pagination for large histories

### Requirement 26: Student View Lesson Details

**User Story:** As a student, I want to view details of a specific lesson, so that I can see the content and notes for that session.

#### Acceptance Criteria

1. WHEN a student requests lesson details, THE API_Route SHALL verify the lesson belongs to one of the student's enrollments
2. THE response SHALL include lesson time, plan_day information (title, objective), and shared_notes
3. THE response SHALL include associated videos with playback URLs if status is completed or scheduled
4. THE RLS_Policy SHALL enforce that only the student's own lessons are accessible
5. THE response SHALL NOT include private_notes
6. WHEN the lesson status is cancelled or no_show, THE response SHALL indicate the status clearly
7. WHEN the lesson_id does not exist or belongs to another student, THE API_Route SHALL return a 404 error

### Requirement 27: Lesson Video Associations Preserve History

**User Story:** As a platform operator, I want lesson video associations to remain unchanged after completion, so that historical records are accurate.

#### Acceptance Criteria

1. WHEN a lesson status is completed, THE lesson_videos associations SHALL become immutable
2. THE API_Route SHALL prevent adding or removing videos from completed lessons
3. THE API_Route SHALL prevent reordering videos in completed lessons
4. THE video metadata at completion time SHALL be preserved for historical reference
5. IF a video is later archived or deleted from the library, THE lesson_videos association SHALL remain
6. THE lesson history SHALL display archived videos with an indicator
7. THE RLS_Policy SHALL enforce that only teachers can view private_notes in historical lessons

### Requirement 28: Plan Day Edits Do Not Modify Lesson History

**User Story:** As a platform operator, I want plan day modifications to not affect completed lessons, so that execution history remains accurate.

#### Acceptance Criteria

1. WHEN a teacher edits a plan day, THE changes SHALL NOT modify lesson records that reference that plan_day_id
2. THE lesson record SHALL maintain its original plan_day_id reference even if the plan day content changes
3. THE lesson_videos associations SHALL remain unchanged when plan_day_videos associations are modified
4. THE lesson detail view SHALL display plan day content as a reference, not as the definitive lesson content
5. THE API_Route SHALL clearly distinguish between plan day suggestions and actual lesson execution
6. THE lesson shared_notes SHALL take precedence over plan day objectives for historical display
7. THE Platform SHALL indicate when referenced plan day content has changed since lesson completion

### Requirement 29: Detect Scheduling Conflicts

**User Story:** As a teacher, I want to be warned about scheduling conflicts, so that I don't double-book time slots.

#### Acceptance Criteria

1. WHEN a teacher creates or updates a lesson, THE API_Route SHALL check for overlapping lessons for the same teacher
2. THE conflict detection SHALL consider starts_at and ends_at time ranges
3. THE API_Route SHALL return a warning if another scheduled lesson overlaps
4. THE warning SHALL include details of the conflicting lesson (enrollment, time)
5. THE teacher SHALL be able to override the warning and create the lesson anyway
6. THE conflict detection SHALL only consider lessons with status scheduled (not completed, cancelled, or no_show)
7. THE API_Route SHALL use timezone-aware comparison for conflict detection

### Requirement 30: Lesson Timestamps and Timezone Handling

**User Story:** As a platform operator, I want all lesson times to be stored consistently with timezone information, so that schedules are accurate across timezones.

#### Acceptance Criteria

1. THE Database SHALL store starts_at and ends_at using TIMESTAMPTZ type (UTC)
2. THE API_Route SHALL accept lesson times in ISO 8601 format with timezone information
3. THE API_Route SHALL use the teacher's configured timezone for display formatting
4. THE Database SHALL store completed_at using TIMESTAMPTZ type
5. THE API_Route SHALL return all timestamps in ISO 8601 format with UTC timezone indicator
6. THE weekly slots SHALL store start_time and end_time as TIME type (local time without date)
7. THE lesson generation from weekly slots SHALL apply the teacher's timezone to create timestamped lessons

### Requirement 31: Lesson Authorization Enforcement

**User Story:** As a platform operator, I want all lesson access to be strictly enforced at the database level, so that authorization cannot be bypassed.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that teachers can only query lessons where teacher_id equals their user ID
2. THE RLS_Policy SHALL enforce that students can only query lessons through enrollments where student_profile_id equals their user ID
3. THE API_Route SHALL verify teacher ownership before any create, update, or status change operation
4. WHEN a user attempts unauthorized access, THE Database SHALL return zero rows
5. THE RLS_Policy SHALL use auth.uid() to get the authenticated user ID from the JWT token
6. THE Database SHALL reject any query that violates RLS policies
7. THE private_notes field SHALL be excluded from all student-facing RLS policies

### Requirement 32: Lesson Count and Statistics

**User Story:** As a teacher, I want to see lesson statistics for enrollments, so that I can track student progress and engagement.

#### Acceptance Criteria

1. THE API_Route SHALL provide an endpoint to retrieve lesson counts per enrollment
2. THE response SHALL include counts by status (scheduled, completed, cancelled, no_show)
3. THE response SHALL include total lessons and completion rate percentage
4. THE RLS_Policy SHALL enforce that only the teacher can query statistics for their enrollments
5. THE statistics SHALL be calculated from lesson records, not estimated from weekly slots
6. THE API_Route SHALL support filtering statistics by date range
7. WHEN no lessons exist for an enrollment, THE API_Route SHALL return zero counts

### Requirement 33: Lesson Metadata Validation

**User Story:** As a teacher, I want to be notified of validation errors when scheduling lessons, so that lesson data maintains quality standards.

#### Acceptance Criteria

1. THE API_Route SHALL validate that starts_at is a valid ISO 8601 timestamp
2. THE API_Route SHALL validate that ends_at is after starts_at
3. THE API_Route SHALL validate that lesson duration does not exceed 8 hours
4. THE API_Route SHALL validate that enrollment_id is a valid UUID and exists
5. THE API_Route SHALL validate that plan_day_id is a valid UUID if provided
6. THE API_Route SHALL validate that shared_notes and private_notes do not exceed 5000 characters each
7. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages

### Requirement 34: Weekly Slot Metadata Validation

**User Story:** As a teacher, I want to be notified of validation errors when creating recurring slots, so that schedule data is accurate.

#### Acceptance Criteria

1. THE API_Route SHALL validate that weekday is an integer between 0 and 6
2. THE API_Route SHALL validate that start_time and end_time are valid TIME format (HH:MM:SS)
3. THE API_Route SHALL validate that end_time is after start_time on the same day
4. THE API_Route SHALL validate that valid_from is a valid date if provided
5. THE API_Route SHALL validate that valid_until is after valid_from if both provided
6. THE API_Route SHALL validate that enrollment_id exists and belongs to the teacher
7. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages

### Requirement 35: Lesson Pagination and Filtering

**User Story:** As a teacher with extensive lesson history, I want paginated lesson lists with filtering, so that the interface remains responsive.

#### Acceptance Criteria

1. THE API_Route SHALL support pagination parameters (page number and page size) for lesson lists
2. THE default page size SHALL be 20 lessons per page
3. THE API_Route SHALL return total count in the response metadata
4. THE response SHALL include pagination metadata (current page, total pages, has next, has previous)
5. THE pagination SHALL work in combination with status, date range, and enrollment filters
6. WHEN page number exceeds available pages, THE API_Route SHALL return an empty array
7. THE API_Route SHALL validate that page size does not exceed 100 lessons

### Requirement 36: Bulk Status Update for Lessons

**User Story:** As a teacher, I want to mark multiple lessons with the same status at once, so that I can efficiently update my schedule.

#### Acceptance Criteria

1. WHEN a teacher provides an array of lesson IDs and a target status, THE API_Route SHALL update all lessons in a single transaction
2. THE API_Route SHALL validate that all lesson IDs belong to the authenticated teacher
3. THE API_Route SHALL validate that all status transitions are valid for each lesson
4. IF any lesson has an invalid transition, THEN THE entire operation SHALL be rolled back
5. THE API_Route SHALL support bulk updates for completed, cancelled, and no_show statuses
6. THE response SHALL indicate which lessons were updated and which failed validation
7. THE Database SHALL update the updated_at timestamp for all affected lessons

### Requirement 37: Next Lesson Query Optimization

**User Story:** As a student, I want to quickly see my next upcoming lesson, so that the dashboard loads efficiently.

#### Acceptance Criteria

1. THE API_Route SHALL provide an optimized endpoint to retrieve only the next scheduled lesson per student
2. THE query SHALL filter for status scheduled and starts_at in the future
3. THE response SHALL include lesson time, teacher name, plan_day title, and video count
4. THE RLS_Policy SHALL enforce that only the student's next lesson is returned
5. THE query SHALL use database indexing on starts_at for performance
6. WHEN no upcoming lesson exists, THE API_Route SHALL return null
7. THE response time SHALL be under 200ms for typical database loads

### Requirement 38: Lesson Search by Date Range

**User Story:** As a teacher, I want to search lessons across all students by date range, so that I can review specific periods.

#### Acceptance Criteria

1. WHEN a teacher provides a from_date and to_date, THE API_Route SHALL return all lessons within that range
2. THE API_Route SHALL include lessons for all enrollments owned by the teacher
3. THE API_Route SHALL validate that to_date is equal to or after from_date
4. THE API_Route SHALL support filtering by status in combination with date range
5. THE RLS_Policy SHALL enforce that only the teacher's own lessons are returned
6. THE API_Route SHALL sort results by starts_at in ascending order
7. THE API_Route SHALL support pagination for large result sets

### Requirement 39: Lesson Video Source Transparency

**User Story:** As a teacher, I want to see which videos came from the plan versus manually added, so that I understand lesson customization.

#### Acceptance Criteria

1. THE lesson detail response SHALL include source field (plan or manual) for each video association
2. THE API_Route SHALL distinguish videos copied from plan_day_videos (source=plan) from manually added (source=manual)
3. THE student-facing lesson detail SHALL display videos in the order defined by sort_order
4. THE teacher-facing lesson detail SHALL indicate the source of each video visually
5. WHEN a video association has source=plan, THE Platform SHALL indicate the originating plan_day
6. THE source field SHALL be immutable after the lesson_video association is created
7. THE API_Route SHALL allow filtering lesson videos by source

### Requirement 40: Lesson Completion Validation

**User Story:** As a platform operator, I want to enforce business rules when marking lessons complete, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a teacher marks a lesson as completed, THE API_Route SHALL validate that starts_at is not in the distant future (more than 7 days ahead)
2. THE API_Route SHALL allow completing lessons up to 30 days in the past
3. IF starts_at is more than 30 days ago, THE API_Route SHALL return a warning but allow completion with confirmation
4. THE API_Route SHALL validate that at least one video or shared_notes exists before completion (optional warning)
5. THE completed_at timestamp SHALL be set to the current time, not the lesson's starts_at
6. THE API_Route SHALL prevent completing lessons with archived enrollments
7. THE validation rules SHALL be configurable without code changes for future adjustments
