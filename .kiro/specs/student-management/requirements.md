# Requirements Document: Student Management (Gestão de Alunos)

## Introduction

This document defines the requirements for the Student Management module of the Jiu-Jitsu private lessons management platform. This module manages the teacher-student relationship through "enrollments" (vínculos), enabling teachers to register, manage, and track their students. Each enrollment represents an independent relationship between one teacher and one student, serving as the central entity for data isolation across all platform features.

The enrollment model ensures that a student can have multiple independent relationships with different teachers, each with its own status, notes, and history. All other platform features (lessons, plans, access control) reference enrollments as the primary isolation boundary.

## Glossary

- **Enrollment (Vínculo)**: The relationship record between one teacher and one student, serving as the central entity for data isolation
- **Teacher**: User with teacher role who manages enrollments and lessons
- **Student**: User with student role who participates in enrollments
- **Student_Profile**: The profile record referenced by an enrollment (may be null for pending invitations)
- **Enrollment_Status**: The state of an enrollment (pending, active, paused, archived)
- **Invite_Token**: Secure token sent to students for account creation and enrollment activation
- **Private_Notes**: Teacher's personal observations about a student, never visible to the student
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Platform**: The complete application system
- **Lesson**: Concrete class occurrence record (defined in separate spec)
- **Monthly_Plan**: Pedagogical planning document (defined in separate spec)

## Requirements

### Requirement 1: Create Enrollment with Invitation

**User Story:** As a teacher, I want to invite a student by email so they can create an account and access their training information.

#### Acceptance Criteria

1. WHEN a teacher provides a valid email, student name, and optional phone, THE Platform SHALL create an enrollment record with pending status
2. THE Platform SHALL generate a secure Invite_Token for the enrollment
3. THE Invite_Token SHALL expire after 7 days from generation
4. WHEN enrollment creation succeeds, THE Platform SHALL send an invitation email containing the Invite_Token
5. THE Database SHALL store student_name, student_email, and student_phone before account creation
6. THE student_profile_id field SHALL be null until the student creates an account
7. THE started_at timestamp SHALL be set to the current date when the enrollment is created
8. THE API_Route SHALL validate that the email format is correct before creating the enrollment
9. IF the teacher already has an active or pending enrollment with the same email, THEN THE Platform SHALL return a validation error

### Requirement 2: View Enrollment List

**User Story:** As a teacher, I want to see a list of all my students with their status and next lesson, so that I can quickly understand my current student roster.

#### Acceptance Criteria

1. WHEN a teacher requests their enrollment list, THE API_Route SHALL return all enrollments where teacher_id matches the authenticated teacher
2. THE response SHALL include student_name, student_email, status, started_at, and next_lesson information for each enrollment
3. THE RLS_Policy SHALL prevent teachers from viewing enrollments owned by other teachers
4. WHILE the default view is active, THE API_Route SHALL exclude archived enrollments unless explicitly requested
5. THE API_Route SHALL sort enrollments by student_name in alphabetical order by default
6. THE response SHALL include enrollment_id for navigation and actions
7. WHEN no enrollments exist, THE API_Route SHALL return an empty array

### Requirement 3: Search Enrollments by Name

**User Story:** As a teacher, I want to search for a student by name, so that I can quickly find a specific student in my roster.

#### Acceptance Criteria

1. WHEN a teacher provides a search query, THE API_Route SHALL return enrollments where student_name contains the query string (case-insensitive)
2. THE search SHALL match partial strings anywhere in the student_name field
3. THE RLS_Policy SHALL enforce that only the teacher's own enrollments are searchable
4. WHEN the search query is empty or whitespace only, THE API_Route SHALL return all enrollments
5. THE search SHALL respect the current status filter if applied
6. THE API_Route SHALL trim whitespace from the search query before matching
7. WHEN no enrollments match the search, THE API_Route SHALL return an empty array

### Requirement 4: Filter Enrollments by Status

**User Story:** As a teacher, I want to filter students by status (active, paused, archived), so that I can focus on specific groups of students.

#### Acceptance Criteria

1. WHEN a teacher requests enrollments with a status filter, THE API_Route SHALL return only enrollments matching the specified status
2. THE API_Route SHALL support filtering by pending, active, paused, and archived statuses
3. THE API_Route SHALL allow filtering by multiple statuses simultaneously
4. WHEN no status filter is provided, THE API_Route SHALL return only active and paused enrollments (excluding archived)
5. THE RLS_Policy SHALL enforce teacher ownership regardless of status filter
6. THE filter SHALL work in combination with search queries
7. IF an invalid status value is provided, THEN THE API_Route SHALL return a validation error

### Requirement 5: View Enrollment Details

**User Story:** As a teacher, I want to view a student's complete profile with lesson count and history summary, so that I can understand their training progress.

#### Acceptance Criteria

1. WHEN a teacher requests enrollment details, THE API_Route SHALL return the complete enrollment record including all fields
2. THE response SHALL include student_name, student_email, student_phone, status, started_at, archived_at, and private_notes
3. THE response SHALL include the total count of completed lessons for this enrollment
4. THE response SHALL include the date and time of the next scheduled lesson if one exists
5. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
6. WHEN the enrollment_id does not exist, THE API_Route SHALL return a 404 error
7. WHEN the enrollment belongs to a different teacher, THE API_Route SHALL return a 403 error

### Requirement 6: Update Enrollment Information

**User Story:** As a teacher, I want to edit a student's contact information and private notes, so that I can keep records accurate and maintain my observations.

#### Acceptance Criteria

1. WHEN a teacher updates an enrollment, THE API_Route SHALL allow modification of student_name, student_email, student_phone, and private_notes fields
2. THE API_Route SHALL validate that student_name is not empty
3. THE API_Route SHALL validate that student_email has correct format if provided
4. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher before allowing updates
5. THE Database SHALL update the updated_at timestamp automatically
6. WHEN email is changed and an account already exists, THE API_Route SHALL verify the new email is not in use by another active enrollment for this teacher
7. IF validation fails, THEN THE API_Route SHALL return detailed validation errors

### Requirement 7: Pause Enrollment

**User Story:** As a teacher, I want to pause a student's enrollment when they're temporarily away, so that they don't appear in my active roster but history is preserved.

#### Acceptance Criteria

1. WHEN a teacher pauses an active enrollment, THE Database SHALL update the status field to 'paused'
2. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
3. WHILE an enrollment is paused, THE enrollment SHALL still appear in the teacher's enrollment list with paused indicator
4. THE API_Route SHALL prevent pausing an enrollment that is already paused or archived
5. THE Database SHALL update the updated_at timestamp when status changes
6. WHEN an enrollment is paused, THE Platform SHALL not schedule new lessons automatically
7. IF the enrollment status is pending, THEN THE API_Route SHALL return a validation error

### Requirement 8: Reactivate Enrollment

**User Story:** As a teacher, I want to reactivate a paused enrollment, so that the student returns to my active roster.

#### Acceptance Criteria

1. WHEN a teacher reactivates a paused enrollment, THE Database SHALL update the status field to 'active'
2. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
3. THE API_Route SHALL only allow reactivation of enrollments with paused status
4. THE Database SHALL update the updated_at timestamp when status changes
5. WHEN an enrollment is reactivated, THE enrollment SHALL appear in the active students list
6. IF the enrollment status is not paused, THEN THE API_Route SHALL return a validation error
7. THE reactivation SHALL not modify any historical lesson records

### Requirement 9: Archive Enrollment

**User Story:** As a teacher, I want to archive a student when they stop training permanently, so that their history is preserved but they don't appear in active lists.

#### Acceptance Criteria

1. WHEN a teacher archives an enrollment, THE Database SHALL update the status field to 'archived'
2. THE Database SHALL set the archived_at timestamp to the current date and time
3. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
4. WHILE an enrollment is archived, THE enrollment SHALL not appear in default enrollment lists
5. THE archived enrollment SHALL remain queryable when explicitly requesting archived enrollments
6. THE API_Route SHALL prevent archiving an enrollment that is already archived
7. THE archiving SHALL preserve all historical lesson records associated with the enrollment

### Requirement 10: Prevent Enrollment Deletion with Lessons

**User Story:** As a platform administrator, I want to prevent deletion of enrollments that have lesson history, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a teacher attempts to delete an enrollment, THE API_Route SHALL check for associated lesson records
2. IF lessons exist for the enrollment, THEN THE API_Route SHALL return a 409 conflict error with a message indicating archival is required
3. WHEN no lessons exist, THE Database SHALL allow deletion of the enrollment record
4. THE deletion check SHALL include lessons of all statuses (scheduled, completed, cancelled, no_show)
5. THE RLS_Policy SHALL verify teacher ownership before allowing any deletion attempt
6. THE error message SHALL suggest archiving as the alternative action
7. THE API_Route SHALL verify that the enrollment exists before checking for lessons

### Requirement 11: Resend Invitation

**User Story:** As a teacher, I want to resend an invitation if a student didn't receive it, so that they can create their account without creating a duplicate enrollment.

#### Acceptance Criteria

1. WHEN a teacher resends an invitation for a pending enrollment, THE Platform SHALL generate a new Invite_Token
2. THE new Invite_Token SHALL expire 7 days from the resend time
3. THE Platform SHALL invalidate the previous Invite_Token
4. THE Platform SHALL send a new invitation email with the updated token
5. THE RLS_Policy SHALL verify that the enrollment belongs to the authenticated teacher
6. THE API_Route SHALL only allow resending for enrollments with pending status
7. IF the enrollment status is not pending, THEN THE API_Route SHALL return a validation error

### Requirement 12: Accept Invitation and Activate Enrollment

**User Story:** As a student, I want to use an invitation link to create my account, so that I can access my training information from my teacher.

#### Acceptance Criteria

1. WHEN a student uses a valid Invite_Token, THE Platform SHALL allow account creation with password and full name
2. WHEN account creation succeeds, THE Database SHALL update the enrollment status from pending to active
3. THE Database SHALL set the student_profile_id to the newly created profile ID
4. THE Platform SHALL invalidate the Invite_Token after successful activation
5. WHEN the Invite_Token is expired, THE Platform SHALL return an error indicating the token is invalid
6. WHEN the Invite_Token does not exist, THE Platform SHALL return an error
7. IF the student_email already has an active profile, THE Platform SHALL link the existing profile to the enrollment

### Requirement 13: Validate Email Uniqueness per Teacher

**User Story:** As a teacher, I want to be prevented from inviting the same email twice as active, so that I don't create duplicate enrollments.

#### Acceptance Criteria

1. WHEN a teacher creates an enrollment, THE API_Route SHALL check for existing enrollments with the same email and teacher_id
2. IF an active or pending enrollment exists with the same email, THEN THE API_Route SHALL return a validation error
3. THE validation SHALL allow the same email if the existing enrollment is archived
4. THE validation SHALL be case-insensitive for email comparison
5. THE validation SHALL not prevent the same email from having enrollments with different teachers
6. THE error message SHALL indicate that an enrollment already exists for this email
7. THE validation SHALL occur before the Invite_Token is generated

### Requirement 14: Support Multiple Teachers per Student

**User Story:** As a student, I want to have enrollments with multiple teachers, so that each teacher manages my training independently.

#### Acceptance Criteria

1. THE Database SHALL allow the same student_profile_id to appear in multiple enrollment records
2. WHEN a student has multiple enrollments, THE enrollments SHALL be independent with separate statuses and notes
3. THE RLS_Policy SHALL ensure each teacher can only access their own enrollment with the student
4. WHEN a student authenticates, THE Platform SHALL show all active enrollments as separate teacher relationships
5. THE private_notes in one enrollment SHALL not be visible to other teachers
6. THE lessons SHALL be associated with specific enrollments to maintain data isolation
7. THE API_Route SHALL support querying enrollments by student_profile_id for the authenticated student

### Requirement 15: Private Notes Confidentiality

**User Story:** As a teacher, I want my private notes about a student to remain confidential, so that students never see these observations.

#### Acceptance Criteria

1. THE API_Route SHALL include private_notes when a teacher requests enrollment details
2. THE API_Route SHALL never include private_notes in any student-facing endpoint
3. THE RLS_Policy SHALL prevent students from querying the private_notes column
4. WHEN a student views their enrollment (as "teacher relationship"), THE response SHALL exclude private_notes
5. THE private_notes field SHALL support up to 5000 characters
6. THE API_Route SHALL validate that private_notes do not exceed the character limit
7. THE private_notes SHALL be nullable and default to null

### Requirement 16: Enrollment Timestamps and Audit Trail

**User Story:** As a platform operator, I want accurate timestamps on all enrollments, so that we can track when relationships started and ended.

#### Acceptance Criteria

1. THE Database SHALL automatically set created_at to the current UTC timestamp when an enrollment is created
2. THE Database SHALL automatically update updated_at whenever the enrollment record is modified
3. WHEN an enrollment is archived, THE Database SHALL set archived_at to the current UTC timestamp
4. WHILE an enrollment is active or paused, THE archived_at field SHALL be null
5. THE started_at field SHALL be explicitly set when the enrollment is created
6. THE API_Route SHALL return all timestamp fields in ISO 8601 format with UTC timezone
7. THE Database SHALL use TIMESTAMPTZ type for all timestamp columns

### Requirement 17: Enrollment Status Transitions

**User Story:** As a platform operator, I want to enforce valid status transitions, so that enrollments maintain logical states.

#### Acceptance Criteria

1. THE pending status SHALL only transition to active (via invitation acceptance) or archived
2. THE active status SHALL transition to paused or archived
3. THE paused status SHALL transition to active or archived
4. THE archived status SHALL not transition to any other status
5. THE API_Route SHALL validate status transitions before allowing updates
6. IF an invalid transition is requested, THEN THE API_Route SHALL return a 409 conflict error
7. THE error message SHALL indicate the current status and the invalid target status

### Requirement 18: Enrollment Authorization Enforcement

**User Story:** As a platform operator, I want all enrollment access to be strictly enforced at the database level, so that authorization cannot be bypassed.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that teachers can only query enrollments where teacher_id equals their user ID
2. THE RLS_Policy SHALL enforce that students can only view enrollments where student_profile_id equals their user ID
3. THE RLS_Policy SHALL prevent students from querying the enrollments table directly (they use derived views)
4. THE API_Route SHALL verify teacher ownership before any create, update, or delete operation
5. WHEN a user attempts unauthorized access, THE Database SHALL return zero rows
6. THE RLS_Policy SHALL use auth.uid() to get the authenticated user ID from the JWT token
7. THE Database SHALL reject any query that violates RLS policies

### Requirement 19: Enrollment Contact Information Validation

**User Story:** As a teacher, I want to be notified of validation errors when entering student information, so that I maintain accurate contact details.

#### Acceptance Criteria

1. THE API_Route SHALL validate that student_name is not empty and contains at least 2 characters
2. THE API_Route SHALL validate that student_email matches a valid email format
3. THE API_Route SHALL validate that student_phone matches a valid phone format if provided
4. THE student_phone field SHALL be optional and nullable
5. THE API_Route SHALL trim whitespace from all text fields before validation
6. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages
7. THE API_Route SHALL validate input on both create and update operations

### Requirement 20: Enrollment Count and Pagination

**User Story:** As a teacher with many students, I want to paginate my enrollment list, so that the interface remains responsive and organized.

#### Acceptance Criteria

1. THE API_Route SHALL support pagination parameters (page number and page size)
2. THE default page size SHALL be 20 enrollments per page
3. THE API_Route SHALL return total enrollment count in the response metadata
4. THE response SHALL include pagination metadata (current page, total pages, has next, has previous)
5. THE pagination SHALL work in combination with search and filter parameters
6. WHEN page number exceeds available pages, THE API_Route SHALL return an empty array
7. THE API_Route SHALL validate that page size does not exceed 100 enrollments

