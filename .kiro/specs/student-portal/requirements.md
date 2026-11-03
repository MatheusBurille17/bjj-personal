# Requirements Document: Student Portal

## Introduction

This document defines the requirements for the Student Portal module of the Jiu-Jitsu private lessons management platform. This module provides students with a read-only interface to view their training information, including upcoming lessons, completed lessons, published monthly plans, authorized library videos, and training statistics. Students may have multiple enrollments with different teachers, requiring clear data separation and identification.

The Student Portal is primarily an integration and aggregation module that pulls data from other modules (lessons, plans, library, enrollments) with student-scoped views and authorization. It provides a comprehensive view of the student's training journey across all their teachers, while maintaining strict data isolation and respecting teacher-defined permissions.

## Glossary

- **Student**: User with student role who views their training information
- **Teacher**: User who manages students and publishes content
- **Enrollment**: Teacher-student relationship record defining data access scope
- **Student_Portal**: Student-facing interface for viewing training information
- **Dashboard**: Student's home screen showing summary and recent activity
- **Lesson**: Concrete class occurrence with status (scheduled, completed, cancelled, no_show)
- **Monthly_Plan**: Pedagogical planning document published by teacher
- **Plan_Day**: Individual day within a monthly plan
- **Video**: Video record from technique library
- **Library**: Collection of techniques, modules, and videos
- **Technique**: Top-level organizational unit in the library
- **Module**: Mid-level organizational unit within a technique
- **Shared_Notes**: Teacher notes visible to students from completed lessons
- **Private_Notes**: Teacher notes never visible to students
- **Training_Statistics**: Aggregated metrics about student's training history
- **Active_Enrollment**: Enrollment with active status
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Platform**: The complete application system
- **Authorized_Video**: Video that student has permission to view
- **Published_Plan**: Monthly plan with published status and student access

## Requirements

### Requirement 1: View Dashboard Summary

**User Story:** As a student, I want to see my training summary when I log in, so that I quickly understand my progress and upcoming lessons.

#### Acceptance Criteria

1. WHEN a student accesses the dashboard, THE Platform SHALL display the next upcoming lesson with date, time, and teacher name
2. THE Dashboard SHALL display the total count of completed lessons across all enrollments
3. THE Dashboard SHALL display the most recent 3 completed lessons with dates and teacher names
4. THE Dashboard SHALL display the next 3 upcoming scheduled lessons
5. THE RLS_Policy SHALL enforce that only lessons from the student's active enrollments are visible
6. WHEN the student has multiple teachers, THE Dashboard SHALL clearly identify which teacher each lesson belongs to
7. WHEN no upcoming lessons exist, THE Dashboard SHALL display a message indicating no lessons scheduled

### Requirement 2: View Total Completed Lessons

**User Story:** As a student, I want to see how many lessons I've completed, so that I can track my overall training progress.

#### Acceptance Criteria

1. WHEN a student views their statistics, THE Platform SHALL count lessons with completed status across all active enrollments
2. THE count SHALL exclude lessons with cancelled or no_show status
3. THE count SHALL exclude lessons from archived enrollments
4. THE RLS_Policy SHALL enforce that only lessons from the student's enrollments are counted
5. THE API_Route SHALL return the total count as an integer
6. WHEN the student has multiple teachers, THE Platform SHALL show both the total count and per-teacher breakdown
7. THE count SHALL update automatically when new lessons are completed

### Requirement 3: View My Agenda - Upcoming Lessons

**User Story:** As a student, I want to see my upcoming scheduled lessons, so that I know when my next training sessions are.

#### Acceptance Criteria

1. WHEN a student requests their agenda, THE API_Route SHALL return lessons with scheduled status from all active enrollments
2. THE response SHALL include lesson date, time, teacher name, and enrollment identification
3. THE API_Route SHALL sort lessons by starts_at in ascending order (earliest first)
4. THE API_Route SHALL support filtering by date range (from_date, to_date)
5. THE RLS_Policy SHALL enforce that only lessons from the student's enrollments are visible
6. WHEN the student has multiple teachers, THE response SHALL clearly identify each lesson's teacher
7. WHEN no upcoming lessons exist, THE API_Route SHALL return an empty array

### Requirement 4: View Lesson Details from Agenda

**User Story:** As a student, I want to see details of an upcoming lesson, so that I understand what content is planned.

#### Acceptance Criteria

1. WHEN a student requests details for a scheduled lesson, THE API_Route SHALL return lesson information including date, time, theme, and teacher
2. THE response SHALL include the associated plan_day information if the lesson references a plan
3. THE response SHALL include titles and thumbnails of videos associated with the lesson
4. THE response SHALL include shared_notes if provided by the teacher
5. THE RLS_Policy SHALL enforce that the lesson belongs to the student's enrollment
6. THE response SHALL NOT include private_notes under any circumstances
7. WHEN the lesson_id does not belong to the student, THE API_Route SHALL return a 403 error

### Requirement 5: View My Training Plan - Published Plans

**User Story:** As a student, I want to view the monthly plans my teachers have published to me, so that I understand the intended training structure.

#### Acceptance Criteria

1. WHEN a student requests their training plans, THE API_Route SHALL return plans where a plan_enrollments record exists for their enrollment
2. THE RLS_Policy SHALL enforce that only plans with published status are visible
3. THE response SHALL include plan title, description, period dates, and teacher identification
4. THE API_Route SHALL sort plans by period_start in descending order (most recent first)
5. WHEN the student has multiple teachers, THE response SHALL clearly identify which teacher owns each plan
6. THE response SHALL exclude plans from archived enrollments
7. WHEN no published plans exist, THE API_Route SHALL return an empty array

### Requirement 6: View Plan Days within Training Plan

**User Story:** As a student, I want to see the structure of my training plan, so that I know what content my teacher intends to cover.

#### Acceptance Criteria

1. WHEN a student requests plan days for a published plan, THE API_Route SHALL return all plan days for that plan
2. THE RLS_Policy SHALL enforce that the plan is published and accessible to the student's enrollment
3. THE response SHALL include weekday or planned_date, title, objective, and notes for each plan day
4. THE response SHALL include video associations with titles and thumbnails
5. THE API_Route SHALL sort plan days by sort_order in ascending order
6. THE response SHALL NOT include any private or teacher-only fields
7. WHEN the plan is not published to the student, THE API_Route SHALL return a 403 error

### Requirement 7: View Library - Authorized Techniques

**User Story:** As a student, I want to browse techniques I have access to, so that I can review training material.

#### Acceptance Criteria

1. WHEN a student requests their library, THE API_Route SHALL return techniques where student_technique_access exists for their enrollment
2. THE response SHALL include technique name, description, and module count
3. THE RLS_Policy SHALL enforce that only authorized techniques are visible
4. THE API_Route SHALL sort techniques by sort_order in ascending order
5. THE response SHALL exclude archived techniques
6. WHEN the student has multiple teachers, THE Platform SHALL identify which teacher granted each technique access
7. WHEN no authorized techniques exist, THE API_Route SHALL return an empty array

### Requirement 8: View Authorized Videos in Technique

**User Story:** As a student, I want to view videos within an authorized technique, so that I can watch training content.

#### Acceptance Criteria

1. WHEN a student requests videos for a technique, THE API_Route SHALL return videos where the student has access through technique authorization or lesson association
2. THE response SHALL include video title, description, thumbnail, and duration
3. THE RLS_Policy SHALL enforce that the student has explicit or implicit access to each video
4. THE API_Route SHALL exclude videos with archived status
5. THE response SHALL organize videos by module with module name and description
6. WHEN the student does not have access to the technique, THE API_Route SHALL return a 403 error
7. THE API_Route SHALL return videos in sort_order within each module

### Requirement 9: Generate Video Playback URL for Student

**User Story:** As a student, I want to watch authorized videos, so that I can review techniques and training material.

#### Acceptance Criteria

1. WHEN a student requests a playback URL for a video, THE API_Route SHALL verify the student has access through technique authorization or lesson association
2. THE API_Route SHALL create a signed playback URL from Mux with 24-hour expiration
3. THE API_Route SHALL only generate URLs for videos with status "ready"
4. THE RLS_Policy SHALL enforce that the video is authorized for the student's enrollment
5. WHEN the student does not have access, THE API_Route SHALL return a 403 error
6. WHEN the video status is not ready, THE API_Route SHALL return a 409 conflict error
7. THE signed URL SHALL use Mux secure playback policy

### Requirement 10: View History - Completed Lessons

**User Story:** As a student, I want to see my completed lessons, so that I can review my training history.

#### Acceptance Criteria

1. WHEN a student requests their lesson history, THE API_Route SHALL return lessons with completed status from all active enrollments
2. THE response SHALL include lesson date, teacher name, shared_notes, and associated videos
3. THE API_Route SHALL sort lessons by completed_at in descending order (most recent first)
4. THE response SHALL include video titles and thumbnails for each lesson
5. THE RLS_Policy SHALL enforce that only lessons from the student's enrollments are visible
6. THE response SHALL NOT include private_notes under any circumstances
7. THE API_Route SHALL support pagination with default page size of 20 lessons

### Requirement 11: Search Lesson History

**User Story:** As a student, I want to search my lesson history by date range, so that I can find specific training sessions.

#### Acceptance Criteria

1. WHEN a student provides a date range filter, THE API_Route SHALL return completed lessons within the specified range
2. THE API_Route SHALL accept optional from_date and to_date parameters
3. WHEN only from_date is provided, THE API_Route SHALL return lessons completed on or after that date
4. WHEN only to_date is provided, THE API_Route SHALL return lessons completed on or before that date
5. THE API_Route SHALL validate that date parameters are in valid ISO 8601 format
6. THE RLS_Policy SHALL enforce enrollment ownership regardless of date filter
7. THE date filter SHALL work in combination with teacher filter if the student has multiple enrollments

### Requirement 12: Filter History by Teacher

**User Story:** As a student with multiple teachers, I want to filter my history by teacher, so that I can see lessons from a specific instructor.

#### Acceptance Criteria

1. WHEN a student provides a teacher filter, THE API_Route SHALL return lessons only from the specified enrollment
2. THE API_Route SHALL validate that the enrollment belongs to the authenticated student
3. THE RLS_Policy SHALL enforce that the student can only filter by their own enrollments
4. THE filter SHALL work in combination with date range filters
5. WHEN the enrollment_id does not belong to the student, THE API_Route SHALL return a 403 error
6. WHEN no filter is provided, THE API_Route SHALL return lessons from all active enrollments
7. THE response SHALL maintain sort order by completed_at descending

### Requirement 13: View Lesson History Detail

**User Story:** As a student, I want to see full details of a completed lesson, so that I can review what was covered and watch the videos.

#### Acceptance Criteria

1. WHEN a student requests details for a completed lesson, THE API_Route SHALL return complete lesson information
2. THE response SHALL include date, time, teacher name, shared_notes, and video associations
3. THE response SHALL include video titles, descriptions, thumbnails, and durations
4. THE response SHALL include plan_day information if the lesson referenced a plan
5. THE RLS_Policy SHALL enforce that the lesson belongs to the student's enrollment
6. THE response SHALL NOT include private_notes under any circumstances
7. WHEN the lesson does not belong to the student, THE API_Route SHALL return a 403 error

### Requirement 14: View My Profile Information

**User Story:** As a student, I want to view my personal information, so that I can verify it is accurate.

#### Acceptance Criteria

1. WHEN a student requests their profile, THE API_Route SHALL return their Profile record
2. THE response SHALL include full name, email, avatar URL, and created_at
3. THE RLS_Policy SHALL enforce that students can only view their own profile
4. THE response SHALL NOT include any enrollment-specific data from the profile endpoint
5. THE API_Route SHALL return profile data in a consistent format
6. WHEN the student is not authenticated, THE API_Route SHALL return a 401 error
7. THE response SHALL use ISO 8601 format for timestamps

### Requirement 15: Edit My Profile Information

**User Story:** As a student, I want to update my personal information, so that my teachers have current contact details.

#### Acceptance Criteria

1. WHEN a student updates their profile, THE API_Route SHALL allow modification of full name and avatar URL
2. THE API_Route SHALL validate that full name is not empty and contains at least 2 characters
3. THE RLS_Policy SHALL enforce that students can only update their own profile
4. THE API_Route SHALL NOT allow students to modify their email through this endpoint
5. THE Database SHALL update the updated_at timestamp automatically
6. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages
7. THE API_Route SHALL trim whitespace from text fields before validation

### Requirement 16: View My Teachers List

**User Story:** As a student with multiple teachers, I want to see all my teachers, so that I can navigate between their content.

#### Acceptance Criteria

1. WHEN a student requests their teachers list, THE API_Route SHALL return all active enrollments with teacher information
2. THE response SHALL include teacher display name, enrollment status, and started_at date
3. THE response SHALL include next upcoming lesson date for each teacher if one exists
4. THE RLS_Policy SHALL enforce that only the student's own enrollments are visible
5. THE API_Route SHALL exclude archived enrollments by default
6. THE response SHALL include enrollment_id for filtering other portal content
7. WHEN no active enrollments exist, THE API_Route SHALL return an empty array

### Requirement 17: Aggregate Statistics Across All Teachers

**User Story:** As a student with multiple teachers, I want to see my total training statistics, so that I understand my overall progress.

#### Acceptance Criteria

1. WHEN a student requests aggregate statistics, THE API_Route SHALL calculate totals across all active enrollments
2. THE response SHALL include total completed lessons count
3. THE response SHALL include per-teacher breakdown with teacher name and lesson count
4. THE response SHALL include date of first completed lesson if any exist
5. THE RLS_Policy SHALL enforce that only the student's enrollments are included
6. THE counts SHALL exclude cancelled and no_show lessons
7. THE counts SHALL exclude lessons from archived enrollments

### Requirement 18: Private Notes Never Visible

**User Story:** As a platform operator, I want to ensure private notes are never exposed to students, so that teacher confidentiality is maintained.

#### Acceptance Criteria

1. THE RLS_Policy SHALL prevent students from querying private_notes column in any table
2. THE API_Route SHALL never include private_notes in any student-facing response
3. THE Database schema SHALL enforce that private_notes cannot be read by student role
4. WHEN a student views lesson details, THE response SHALL exclude private_notes
5. WHEN a student views enrollment information, THE response SHALL exclude private_notes
6. THE Platform SHALL log any attempt to access private_notes from student context
7. IF a bug exposes private_notes, THE Platform SHALL treat it as a critical security incident

### Requirement 19: Student Cannot Modify Lessons

**User Story:** As a platform operator, I want to prevent students from modifying lesson data, so that only teachers control lesson records.

#### Acceptance Criteria

1. THE RLS_Policy SHALL prevent students from updating lessons table
2. THE RLS_Policy SHALL prevent students from deleting lessons table records
3. THE RLS_Policy SHALL prevent students from inserting lessons table records
4. THE API_Route SHALL return 403 error if a student attempts to modify a lesson
5. THE Database SHALL reject any student-initiated write operations on lessons
6. THE student SHALL have read-only access to lessons through authorized endpoints
7. THE RLS_Policy SHALL use user role and enrollment verification for enforcement

### Requirement 20: Student Cannot Modify Plans

**User Story:** As a platform operator, I want to prevent students from modifying monthly plans, so that only teachers control plan content.

#### Acceptance Criteria

1. THE RLS_Policy SHALL prevent students from updating monthly_plans and plan_days tables
2. THE RLS_Policy SHALL prevent students from deleting plan records
3. THE RLS_Policy SHALL prevent students from inserting plan records
4. THE API_Route SHALL return 403 error if a student attempts to modify a plan
5. THE Database SHALL reject any student-initiated write operations on plans
6. THE student SHALL have read-only access to published plans through authorized endpoints
7. THE RLS_Policy SHALL enforce that only published plans are visible to students

### Requirement 21: Student Cannot Modify Library Content

**User Story:** As a platform operator, I want to prevent students from modifying library content, so that only teachers control their technique library.

#### Acceptance Criteria

1. THE RLS_Policy SHALL prevent students from updating techniques, modules, and videos tables
2. THE RLS_Policy SHALL prevent students from deleting library records
3. THE RLS_Policy SHALL prevent students from inserting library records
4. THE API_Route SHALL return 403 error if a student attempts to modify library content
5. THE Database SHALL reject any student-initiated write operations on library tables
6. THE student SHALL have read-only access to authorized library content
7. THE RLS_Policy SHALL enforce access through student_technique_access or lesson associations

### Requirement 22: Hidden Lesson Statuses

**User Story:** As a platform operator, I want to hide cancelled and no_show lessons from student views, so that students only see relevant lesson information.

#### Acceptance Criteria

1. THE API_Route SHALL exclude lessons with cancelled status from student agenda and history
2. THE API_Route SHALL exclude lessons with no_show status from student agenda and history
3. THE student SHALL only see lessons with scheduled or completed status
4. THE RLS_Policy SHALL enforce status filtering at the database level
5. WHEN counting completed lessons, THE Platform SHALL exclude cancelled and no_show lessons
6. THE Dashboard SHALL not display cancelled or no_show lessons in recent activity
7. IF a teacher cancels a lesson after the student viewed it, THE lesson SHALL disappear from student views

### Requirement 23: Video Access Authorization Rules

**User Story:** As a platform operator, I want clear rules for video access authorization, so that students only view content their teachers have permitted.

#### Acceptance Criteria

1. WHEN a video is associated with the student's completed or scheduled lesson, THE student SHALL have access to that video
2. WHEN a technique is explicitly authorized through student_technique_access, THE student SHALL have access to all videos in that technique
3. WHEN a video is not associated with a lesson or authorized technique, THE student SHALL NOT have access
4. THE API_Route SHALL check both lesson associations and technique access before generating playback URLs
5. THE RLS_Policy SHALL enforce authorization at the database query level
6. WHEN access is revoked by removing technique authorization, THE student SHALL lose access immediately
7. THE Platform SHALL return 403 error when a student attempts to access unauthorized video

### Requirement 24: Multi-Teacher Data Separation

**User Story:** As a student with multiple teachers, I want to see clear separation between my teachers' content, so that I don't confuse which content belongs to which teacher.

#### Acceptance Criteria

1. WHEN displaying lessons, THE Platform SHALL prominently show the teacher name for each lesson
2. WHEN displaying plans, THE Platform SHALL prominently show which teacher published each plan
3. WHEN displaying library content, THE Platform SHALL show which teacher granted access
4. THE API_Route SHALL include teacher identification in all relevant responses
5. THE Platform SHALL allow filtering by teacher/enrollment across all portal views
6. WHEN aggregating statistics, THE Platform SHALL provide per-teacher breakdowns
7. THE UI SHALL use visual separation (colors, sections, or labels) to distinguish teachers

### Requirement 25: Real-Time Data Consistency

**User Story:** As a student, I want to see up-to-date information when my teacher makes changes, so that I have accurate training data.

#### Acceptance Criteria

1. WHEN a teacher publishes a plan to the student, THE plan SHALL appear in the student portal immediately
2. WHEN a teacher schedules a new lesson, THE lesson SHALL appear in the student agenda within 5 seconds
3. WHEN a teacher completes a lesson, THE lesson SHALL move from agenda to history within 5 seconds
4. WHEN a teacher revokes library access, THE content SHALL disappear from student library immediately
5. THE Platform SHALL use Supabase realtime subscriptions for critical student-facing data
6. THE API_Route responses SHALL query current database state, not cached data
7. WHEN a teacher cancels a lesson, THE lesson SHALL disappear from student views within 5 seconds

### Requirement 26: Student Portal Authorization Enforcement

**User Story:** As a platform operator, I want all student portal access to be strictly enforced, so that students cannot bypass authorization.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that students can only query data through their enrollment relationships
2. THE RLS_Policy SHALL use auth.uid() to identify the authenticated student
3. THE API_Route SHALL verify student authentication before processing any request
4. WHEN a student attempts unauthorized access, THE Database SHALL return zero rows
5. THE Server SHALL never trust client-provided enrollment or teacher IDs without verification
6. THE RLS_Policy SHALL prevent cross-enrollment data leakage between students
7. THE Database SHALL reject any query that violates RLS policies

### Requirement 27: Student Portal Pagination

**User Story:** As a student with extensive training history, I want paginated views, so that the interface remains responsive.

#### Acceptance Criteria

1. THE API_Route SHALL support pagination parameters (page number and page size) for lesson history
2. THE default page size SHALL be 20 lessons per page
3. THE API_Route SHALL return total count in the response metadata
4. THE response SHALL include pagination metadata (current page, total pages, has next, has previous)
5. THE pagination SHALL work in combination with filters (date range, teacher)
6. WHEN page number exceeds available pages, THE API_Route SHALL return an empty array
7. THE API_Route SHALL validate that page size does not exceed 100 lessons

### Requirement 28: Student Portal Error Handling

**User Story:** As a student, I want clear error messages when something goes wrong, so that I understand what happened.

#### Acceptance Criteria

1. WHEN a student attempts to access a lesson they don't have access to, THE API_Route SHALL return a 403 error with message "Access denied"
2. WHEN a student requests a non-existent resource, THE API_Route SHALL return a 404 error with message "Resource not found"
3. WHEN a video is still processing, THE API_Route SHALL return a 409 error with message "Video is still processing"
4. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages
5. WHEN the student is not authenticated, THE API_Route SHALL return a 401 error with message "Authentication required"
6. THE error messages SHALL NOT expose internal system details or teacher private information
7. THE Platform SHALL log all 403 and 401 errors for security monitoring

### Requirement 29: Student Portal Timestamps

**User Story:** As a platform operator, I want consistent timestamp handling in student portal, so that dates and times display correctly.

#### Acceptance Criteria

1. THE API_Route SHALL return all timestamps in ISO 8601 format with UTC timezone
2. THE Platform SHALL use the student's browser timezone for display purposes
3. THE lesson times SHALL display in the appropriate timezone for the student's location
4. THE Database SHALL store all timestamps in UTC regardless of user timezone
5. THE API_Route SHALL include timezone information in timestamp responses
6. WHEN displaying relative times (e.g., "2 hours ago"), THE Platform SHALL calculate from current time
7. THE lesson history SHALL show completed_at timestamps accurately

### Requirement 30: Student Dashboard Performance

**User Story:** As a student, I want the dashboard to load quickly, so that I can access my training information without delay.

#### Acceptance Criteria

1. WHEN a student loads the dashboard, THE Platform SHALL return the complete dashboard data within 2 seconds
2. THE API_Route SHALL use a single optimized query to fetch dashboard data
3. THE query SHALL join necessary tables (enrollments, lessons, teachers) efficiently
4. THE Database SHALL use appropriate indexes on enrollment_id and student_profile_id
5. THE Platform SHALL cache teacher display names to reduce query complexity
6. WHEN the student has many completed lessons, THE Dashboard SHALL limit to recent 3 lessons
7. THE API_Route SHALL use database connection pooling for concurrent requests
