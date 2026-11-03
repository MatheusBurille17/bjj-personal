# Implementation Plan: Student Management (GestÃƒÂ£o de Alunos)

## Overview

This implementation plan establishes the student management module for the Jiu-Jitsu lessons platform through enrollment relationships (vÃƒÂ­nculos). The module enables teachers to invite students via email, manage their roster through comprehensive CRUD operations, and maintain private observations. Enrollments serve as the central data isolation boundary for the entire platform. Implementation follows a bottom-up approach: database layer Ã¢â€ â€™ service layer Ã¢â€ â€™ API layer Ã¢â€ â€™ frontend components.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- PostgreSQL with RLS policies for data isolation
- Supabase Auth for session management
- Resend for invitation emails
- shadcn/ui for UI components (Table, Form, Badge, Dialog, Pagination)
- fast-check for property-based testing

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create enrollments table migration
    - Create `supabase/migrations/[timestamp]_create_enrollments_table.sql`
    - Define enrollments table with columns: id (UUID PK), teacher_id (UUID FK to teachers), student_profile_id (UUID nullable FK to profiles), student_name (TEXT), student_email (TEXT), student_phone (TEXT nullable), status (TEXT CHECK constraint), started_at (TIMESTAMPTZ), archived_at (TIMESTAMPTZ nullable), private_notes (TEXT with 5000 char CHECK), invite_token (TEXT nullable), invite_expires_at (TIMESTAMPTZ nullable), created_at, updated_at
    - Add unique constraint on (teacher_id, student_email) WHERE status IN ('active', 'pending')
    - Create indexes on teacher_id, student_profile_id, status, student_email, invite_token
    - Add CHECK constraint for status values: 'pending', 'active', 'paused', 'archived'
    - Add CHECK constraint for private_notes length <= 5000
    - _Requirements: 1.1, 1.5, 1.6, 1.8, 13.1, 15.4, 15.5, 16.1_

  - [x] 1.2 Create RLS policies for enrollments table
    - Create `supabase/migrations/[timestamp]_add_enrollments_rls_policies.sql`
    - Enable RLS on enrollments table
    - Policy: Teachers can SELECT their own enrollments (WHERE teacher_id = auth.uid())
    - Policy: Teachers can INSERT enrollments for themselves (WITH CHECK teacher_id = auth.uid())
    - Policy: Teachers can UPDATE their own enrollments (USING teacher_id = auth.uid())
    - Policy: Teachers can DELETE their own enrollments (USING teacher_id = auth.uid())
    - Policy: Students can SELECT enrollments where they are linked (WHERE student_profile_id = auth.uid()) but exclude private_notes column
    - _Requirements: 2.3, 5.3, 6.4, 15.2, 15.3, 18.1, 18.2, 18.3, 18.5, 18.6_

  - [x] 1.3 Create student_enrollments view
    - Add student_enrollments view to same migration file
    - SELECT all columns EXCEPT private_notes FROM enrollments WHERE student_profile_id = auth.uid()
    - This view ensures students never see private notes
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 1.4 Add trigger for updated_at timestamp
    - Add trigger to enrollments table using update_updated_at_column() function
    - Trigger fires BEFORE UPDATE on enrollments table
    - Automatically sets updated_at to current timestamp
    - _Requirements: 16.2, 16.5_


- [x] 2. TypeScript type definitions
  - [x] 2.1 Create enrollment types
    - Create `types/enrollment.ts`
    - Define EnrollmentStatus type: 'pending' | 'active' | 'paused' | 'archived'
    - Define Enrollment interface with all database fields
    - Define EnrollmentDetail interface extending Enrollment with completed_lessons_count and next_lesson
    - Define EnrollmentListItem interface with subset of fields for list view
    - Define EnrollmentFormData interface for create/update operations
    - Define EnrollmentUpdateData interface with optional fields
    - Define PaginationMeta interface (total, page, pageSize, totalPages, hasNext, hasPrevious)
    - Define InviteTokenData interface (valid, enrollment, teacher_name, error)
    - Export all types from `types/index.ts`
    - _Requirements: 1.5, 1.6, 2.2, 2.6, 5.1, 5.2, 19.1, 20.3_

- [x] 3. Validation utilities and schemas
  - [x] 3.1 Create enrollment validation schemas
    - Create `lib/utils/enrollment-validation.ts`
    - Define createEnrollmentSchema with Zod: student_name (min 2 chars), student_email (email format), student_phone (optional phone format), private_notes (optional, max 5000 chars)
    - Define updateEnrollmentSchema with all optional fields but same validation rules
    - Define searchEnrollmentsSchema for query parameters: search (string), status (array), page (number), pageSize (number, max 100)
    - Implement isValidPhoneNumber() helper function
    - _Requirements: 1.8, 6.3, 19.1, 19.2, 19.3, 19.6_

  - [x] 3.2 Create status transition validation
    - Add validateStatusTransition(currentStatus, targetStatus) function
    - Enforce valid transitions: pending Ã¢â€ â€™ (active | archived), active Ã¢â€ â€™ (paused | archived), paused Ã¢â€ â€™ (active | archived), archived Ã¢â€ â€™ (no transitions)
    - Return validation error with current and target status in message
    - _Requirements: 7.4, 8.4, 17.1, 17.2, 17.3, 17.4, 17.6_

- [x] 4. Service layer - Invitation service
  - [x] 4.1 Create invitation token generation
    - Create `lib/services/invitation.service.ts`
    - Implement generateInviteToken() using crypto.randomBytes(32).toString('hex')
    - Return secure random token suitable for URL use
    - _Requirements: 1.2, 1.3, 7.1_

  - [x]* 4.2 Write property test for invite token security
    - **Property 1: Secure Token Generation**
    - **Validates: Requirements 1.2, 7.1**
    - Test that any generated token has sufficient entropy (minimum 32 chars, URL-safe)

  - [x] 4.3 Implement sendInvitationEmail function
    - Implement sendInvitationEmail(enrollment, inviteToken)
    - Use Resend client from `lib/resend/client.ts`
    - Create invitation email template with teacher name, student email, invitation link with token
    - Link format: `${baseUrl}/auth/invite/${inviteToken}`
    - Include token expiration date (7 days) in email
    - _Requirements: 1.4, 7.3_

  - [x] 4.4 Implement verifyInviteToken function
    - Implement verifyInviteToken(token)
    - Query enrollments table for matching invite_token
    - Check token exists and invite_expires_at > current timestamp
    - Return InviteTokenData with valid flag, enrollment, teacher_name, error message
    - _Requirements: 7.4, 12.5, 12.6_


  - [x] 4.5 Implement activateEnrollment function
    - Implement activateEnrollment(token, studentProfileId)
    - Verify token is valid using verifyInviteToken
    - Update enrollment: status = 'active', student_profile_id = studentProfileId, invite_token = null, invite_expires_at = null
    - Use Supabase admin client for update (called during auth flow)
    - Return updated enrollment
    - _Requirements: 12.2, 12.3, 12.4_

  - [x]* 4.6 Write property test for enrollment activation
    - **Property 2: Enrollment Activation on Valid Token**
    - **Validates: Requirements 12.2, 12.3, 12.4**
    - Test that any valid token activates enrollment and clears token fields

  - [x] 4.7 Implement resendInvitation function
    - Implement resendInvitation(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher and status is 'pending'
    - Generate new invite token
    - Set new expiration (7 days from now)
    - Update enrollment with new token and expiration
    - Send invitation email
    - Return success with new expiration timestamp
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

  - [x]* 4.8 Write property test for invitation resend
    - **Property 3: Invitation Resend Invalidates Old Token**
    - **Validates: Requirements 11.2, 11.3**
    - Test that resending generates new token and old token becomes invalid

- [x] 5. Service layer - Enrollment CRUD service
  - [x] 5.1 Create enrollment creation function
    - Create `lib/services/enrollment.service.ts`
    - Implement createEnrollment(teacherId, data: EnrollmentFormData)
    - Validate input data using createEnrollmentSchema
    - Check for existing active/pending enrollment with same email (unique constraint)
    - Generate invite token and expiration (7 days)
    - Insert enrollment with status 'pending', started_at = NOW(), teacher_id, student details
    - Send invitation email via invitation.service
    - Return created enrollment
    - _Requirements: 1.1, 1.5, 1.7, 1.8, 1.9, 13.7_

  - [x]* 5.2 Write property test for enrollment creation
    - **Property 4: Enrollment Creation Generates Pending Status**
    - **Validates: Requirements 1.1, 1.5**
    - Test that any successful enrollment creation has status 'pending' and started_at set

  - [x] 5.3 Implement getEnrollments function
    - Implement getEnrollments(teacherId, options: { search?, status?, page?, pageSize? })
    - Default exclude archived enrollments unless explicitly in status filter
    - Apply search filter: case-insensitive partial match on student_name
    - Apply status filter: WHERE status IN (statuses)
    - Default sort: student_name ASC
    - Calculate pagination: offset = (page - 1) * pageSize
    - Query enrollments with LEFT JOIN to get next_lesson (lessons table, MIN scheduled_at WHERE status = 'scheduled')
    - Return enrollments array and pagination metadata
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.5, 3.6, 4.5, 20.1, 20.2, 20.5, 20.6_


  - [x]* 5.4 Write property test for search functionality
    - **Property 5: Search Matches Partial Student Names**
    - **Validates: Requirements 3.1, 3.2, 3.4**
    - Test that search query finds all enrollments containing substring (case-insensitive)

  - [x]* 5.5 Write property test for status filtering
    - **Property 6: Status Filter Returns Only Matching Enrollments**
    - **Validates: Requirements 4.2, 4.5**
    - Test that any status filter only returns enrollments with those statuses

  - [x] 5.6 Implement getEnrollmentDetail function
    - Implement getEnrollmentDetail(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher (RLS will enforce but check explicitly)
    - Query enrollment with all fields including private_notes
    - Calculate completed_lessons_count: COUNT lessons WHERE enrollment_id = enrollmentId AND status = 'completed'
    - Get next_lesson: MIN scheduled_at from lessons WHERE enrollment_id = enrollmentId AND status = 'scheduled'
    - Return EnrollmentDetail object
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 5.7 Write property test for enrollment detail retrieval
    - **Property 7: Enrollment Detail Includes Lesson Statistics**
    - **Validates: Requirements 5.3, 5.4**
    - Test that enrollment detail includes completed count and next lesson when they exist

  - [x] 5.8 Implement updateEnrollment function
    - Implement updateEnrollment(enrollmentId, teacherId, data: EnrollmentUpdateData)
    - Verify enrollment belongs to teacher
    - Validate input data using updateEnrollmentSchema
    - Check email uniqueness if email is being changed (unique constraint check)
    - Update allowed fields: student_name, student_email, student_phone, private_notes
    - Do NOT allow status changes (use dedicated functions)
    - updated_at automatically updated by trigger
    - Return updated enrollment
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x]* 5.9 Write property test for profile updates
    - **Property 8: Profile Update Preserves Enrollment Status**
    - **Validates: Requirements 6.1**
    - Test that any profile update does not change enrollment status or timestamps except updated_at

- [x] 6. Service layer - Enrollment status management
  - [x] 6.1 Implement pauseEnrollment function
    - Implement pauseEnrollment(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher
    - Check current status is 'active' (use validateStatusTransition)
    - Update status to 'paused'
    - Return updated enrollment
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x]* 6.2 Write property test for pause transition
    - **Property 9: Pause Only Works on Active Enrollments**
    - **Validates: Requirements 7.4, 17.1**
    - Test that pause only succeeds when current status is 'active'


  - [x] 6.3 Implement reactivateEnrollment function
    - Implement reactivateEnrollment(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher
    - Check current status is 'paused' (use validateStatusTransition)
    - Update status to 'active'
    - Return updated enrollment
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 6.4 Write property test for reactivation transition
    - **Property 10: Reactivate Only Works on Paused Enrollments**
    - **Validates: Requirements 8.3, 17.2**
    - Test that reactivation only succeeds when current status is 'paused'

  - [x] 6.5 Implement archiveEnrollment function
    - Implement archiveEnrollment(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher
    - Check current status is not already 'archived' (use validateStatusTransition)
    - Update status to 'archived', set archived_at to current timestamp
    - Return updated enrollment
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x]* 6.6 Write property test for archive preservation
    - **Property 11: Archive Sets Timestamp and Preserves History**
    - **Validates: Requirements 9.2, 9.7**
    - Test that archiving sets archived_at and does not modify lesson records

  - [x] 6.7 Implement canDeleteEnrollment function
    - Implement canDeleteEnrollment(enrollmentId)
    - Query lessons table: COUNT WHERE enrollment_id = enrollmentId
    - Return true if count is 0, false otherwise
    - _Requirements: 10.1, 10.2, 10.4_

  - [x] 6.8 Implement deleteEnrollment function
    - Implement deleteEnrollment(enrollmentId, teacherId)
    - Verify enrollment belongs to teacher
    - Check canDeleteEnrollment is true
    - If lessons exist, throw 409 error with message suggesting archive
    - Delete enrollment record
    - Return success response
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_

  - [x]* 6.9 Write property test for deletion protection
    - **Property 12: Enrollments With Lessons Cannot Be Deleted**
    - **Validates: Requirements 10.2, 10.4**
    - Test that any enrollment with lesson history cannot be deleted

- [x] 7. Checkpoint - Service layer complete
  - Ensure all service functions implemented
  - Run all property tests and unit tests
  - Verify database interactions with local Supabase
  - Test invitation email sending with Resend test mode
  - Ask the user if questions arise

- [x] 8. API Routes - Enrollment collection endpoints
  - [x] 8.1 Create POST /api/enrollments endpoint
    - Create `app/api/enrollments/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Parse and validate request body with createEnrollmentSchema
    - Call enrollment.service createEnrollment
    - Return 201 with created enrollment data
    - Handle validation errors (400)
    - Handle duplicate email error (409)
    - _Requirements: 1.1, 1.2, 1.8, 1.9, 13.1_


  - [x]* 8.2 Write unit test for enrollment creation endpoint
    - Test successful creation returns 201
    - Test duplicate email returns 409
    - Test invalid email format returns 400
    - Test unauthenticated request returns 401

  - [x] 8.3 Create GET /api/enrollments endpoint
    - Add GET handler to `app/api/enrollments/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Parse query parameters: search, status (array), page, pageSize
    - Validate query parameters with searchEnrollmentsSchema
    - Call enrollment.service getEnrollments with filters
    - Return 200 with enrollments array and pagination metadata
    - Handle validation errors (400)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 3.1, 3.3, 3.5, 4.1, 4.2, 4.4, 20.1, 20.3, 20.5_

  - [x]* 8.4 Write property test for list endpoint authorization
    - **Property 13: Teachers Only See Own Enrollments**
    - **Validates: Requirements 2.3, 18.1**
    - Test that any teacher query only returns their own enrollments

  - [x]* 8.5 Write unit test for search and filter functionality
    - Test search by name filters correctly
    - Test status filter returns only matching statuses
    - Test pagination works correctly
    - Test empty results return empty array
    - Test default excludes archived

- [x] 9. API Routes - Enrollment item endpoints
  - [x] 9.1 Create GET /api/enrollments/[id] endpoint
    - Create `app/api/enrollments/[id]/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call enrollment.service getEnrollmentDetail
    - Return 200 with complete enrollment details including lesson stats
    - Return 404 if enrollment not found
    - Return 403 if enrollment belongs to different teacher
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 9.2 Write property test for enrollment detail authorization
    - **Property 14: Enrollment Access Restricted to Owner Teacher**
    - **Validates: Requirements 5.5, 18.2, 18.5**
    - Test that any teacher can only access their own enrollment details

  - [x] 9.3 Create PATCH /api/enrollments/[id] endpoint
    - Add PATCH handler to `app/api/enrollments/[id]/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Parse and validate request body with updateEnrollmentSchema
    - Call enrollment.service updateEnrollment
    - Return 200 with updated enrollment
    - Handle validation errors (400)
    - Handle email conflict (409)
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

  - [x]* 9.4 Write property test for email uniqueness
    - **Property 15: Email Uniqueness Per Teacher**
    - **Validates: Requirements 13.1, 13.2, 13.5**
    - Test that teacher cannot have two active/pending enrollments with same email

  - [x] 9.5 Create DELETE /api/enrollments/[id] endpoint
    - Add DELETE handler to `app/api/enrollments/[id]/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call enrollment.service deleteEnrollment
    - Return 200 with success message
    - Return 409 if lessons exist (suggest archive instead)
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_

  - [x]* 9.6 Write integration test for deletion protection
    - Create enrollment, create lesson for enrollment
    - Attempt deletion, verify 409 error
    - Verify error message suggests archiving
    - Delete lesson, retry deletion, verify success


- [x] 10. API Routes - Enrollment status action endpoints
  - [x] 10.1 Create POST /api/enrollments/[id]/pause endpoint
    - Create `app/api/enrollments/[id]/pause/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call enrollment.service pauseEnrollment
    - Return 200 with updated enrollment
    - Return 400 if enrollment not active
    - Return 409 if invalid status transition
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 7.1, 7.2, 7.4, 7.7, 17.1_

  - [x]* 10.2 Write property test for pause validation
    - **Property 16: Pause Validates Current Status**
    - **Validates: Requirements 7.4, 17.1**
    - Test that pause only succeeds on active enrollments

  - [x] 10.3 Create POST /api/enrollments/[id]/reactivate endpoint
    - Create `app/api/enrollments/[id]/reactivate/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call enrollment.service reactivateEnrollment
    - Return 200 with updated enrollment
    - Return 400 if enrollment not paused
    - Return 409 if invalid status transition
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 17.2_

  - [x]* 10.4 Write property test for reactivation validation
    - **Property 17: Reactivate Validates Current Status**
    - **Validates: Requirements 8.3, 17.2**
    - Test that reactivate only succeeds on paused enrollments

  - [x] 10.5 Create POST /api/enrollments/[id]/archive endpoint
    - Create `app/api/enrollments/[id]/archive/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call enrollment.service archiveEnrollment
    - Return 200 with updated enrollment (status 'archived', archived_at set)
    - Return 409 if already archived
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 17.3_

  - [x]* 10.6 Write property test for archive irreversibility
    - **Property 18: Archive is One-Way Transition**
    - **Validates: Requirements 17.4**
    - Test that archived status cannot transition to any other status

  - [x] 10.7 Create POST /api/enrollments/[id]/resend-invite endpoint
    - Create `app/api/enrollments/[id]/resend-invite/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Extract enrollment ID from URL params
    - Call invitation.service resendInvitation
    - Return 200 with success and new expiration timestamp
    - Return 400 if enrollment not pending
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

  - [x]* 10.8 Write integration test for invitation resend
    - Create pending enrollment with token
    - Resend invitation, verify new token generated
    - Verify old token is invalid
    - Verify new email sent

- [x] 11. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify RLS policies enforce authorization
  - Test all error responses follow standard format
  - Verify invitation emails send correctly with Resend
  - Test status transitions enforce valid flows
  - Ask the user if questions arise


- [x] 12. Frontend - shadcn/ui components setup
  - [x] 12.1 Install required shadcn/ui components
    - Run `npx shadcn-ui@latest add table badge input form select button dialog pagination alert skeleton`
    - Verify components installed to `components/ui/`
    - _Requirements: None (infrastructure)_

- [x] 13. Frontend - Student list components
  - [x] 13.1 Create StudentList component
    - Create `components/students/StudentList.tsx` as client component
    - Props: enrollments (EnrollmentListItem[]), onSearch, onFilterStatus, onPaginate, pagination, loading
    - Use shadcn/ui Table for enrollment display
    - Columns: student name, email, status badge, started date, next lesson, actions
    - Include search input with debounce (300ms)
    - Include status filter chips using Badge component
    - Status badge colors: pending (yellow), active (green), paused (gray), archived (red)
    - Action buttons: View, Pause/Reactivate, Archive (contextual based on status)
    - Empty state when no enrollments found
    - Skeleton loading state using shadcn/ui Skeleton
    - _Requirements: 2.1, 2.2, 3.1, 4.1_

  - [x] 13.2 Create StudentCard component
    - Create `components/students/StudentCard.tsx` as client component
    - Props: enrollment (EnrollmentDetail), onEdit, onPause, onReactivate, onArchive, onDelete
    - Use shadcn/ui Card for layout
    - Display: student name, email, phone, status badge, enrollment date, duration calculation
    - Display completed lessons count and next lesson info
    - Display private notes (teacher only)
    - Action menu with contextual options based on status
    - Confirmation dialog for destructive actions (archive, delete)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 15.1_

  - [x] 13.3 Create StudentForm component
    - Create `components/students/StudentForm.tsx` as client component
    - Props: enrollment (optional for edit mode), onSave, onCancel
    - Use shadcn/ui Form with React Hook Form and Zod validation
    - Fields: student_name (required), student_email (required, email validation), student_phone (optional, phone validation), private_notes (optional, textarea, 5000 char limit with counter)
    - Client-side validation matching server schema
    - Display field-specific error messages
    - Save and Cancel buttons
    - Loading state during save
    - _Requirements: 1.1, 6.1, 19.1, 19.2, 19.6_

  - [x] 13.4 Create InvitationStatus component
    - Create `components/students/InvitationStatus.tsx` as client component
    - Props: enrollment (with pending status), onResend
    - Display pending invitation badge with alert styling
    - Show email address and invitation date
    - Token expiration countdown (days remaining)
    - Resend invitation button with cooldown indicator
    - Success/error toast notifications using shadcn/ui Toast
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 13.5 Create enrollment status action components
    - Create `components/students/EnrollmentActions.tsx` as client component
    - Props: enrollment, onPause, onReactivate, onArchive, onDelete
    - Dropdown menu with contextual actions based on current status
    - Active: show Pause and Archive options
    - Paused: show Reactivate and Archive options
    - Pending: show Archive and Delete options
    - Archived: show no actions (read-only)
    - Confirmation dialogs for destructive actions
    - _Requirements: 7.1, 8.1, 9.1, 10.1_


- [x] 14. Frontend - Custom hooks for client state
  - [x] 14.1 Create useEnrollments hook
    - Create `hooks/useEnrollments.ts`
    - Manage state: enrollments, loading, error, pagination
    - Provide search(query) function with debounce
    - Provide filterByStatus(statuses) function
    - Provide goToPage(page) function
    - Provide refresh() function
    - Fetch from GET /api/enrollments with query params
    - Handle loading and error states
    - Return UseEnrollmentsReturn interface
    - _Requirements: 2.1, 3.1, 4.1, 20.1_

  - [x] 14.2 Create useEnrollment hook
    - Create `hooks/useEnrollment.ts`
    - Manage state: enrollment (EnrollmentDetail), loading, error
    - Provide update(data) function calling PATCH /api/enrollments/[id]
    - Provide pause() function calling POST /api/enrollments/[id]/pause
    - Provide reactivate() function calling POST /api/enrollments/[id]/reactivate
    - Provide archive() function calling POST /api/enrollments/[id]/archive
    - Provide delete() function calling DELETE /api/enrollments/[id]
    - Provide resendInvite() function calling POST /api/enrollments/[id]/resend-invite
    - Handle optimistic updates and rollback on error
    - Return UseEnrollmentReturn interface
    - _Requirements: 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1_

- [x] 15. Frontend - Teacher pages for student management
  - [x] 15.1 Create students list page
    - Create `app/(teacher)/students/page.tsx` as server component
    - Fetch initial enrollments server-side from GET /api/enrollments
    - Pass data to StudentList client component
    - Include "Add Student" button opening dialog with StudentForm
    - Protected by middleware (teacher role required)
    - Handle empty state with call-to-action to invite first student
    - _Requirements: 2.1, 2.2_

  - [x] 15.2 Create student detail page
    - Create `app/(teacher)/students/[id]/page.tsx` as server component
    - Fetch enrollment detail server-side from GET /api/enrollments/[id]
    - Pass data to StudentCard component
    - Show edit dialog with StudentForm
    - Show enrollment history and statistics
    - Protected by middleware (teacher role required)
    - Handle 404 if enrollment not found
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 15.3 Create new student dialog
    - Add dialog to students list page using shadcn/ui Dialog
    - Render StudentForm in create mode (no initial data)
    - Call POST /api/enrollments on form submit
    - Close dialog and refresh list on success
    - Show toast notification for success/error
    - _Requirements: 1.1_

- [x] 16. Frontend - API client functions
  - [x] 16.1 Create enrollment API client
    - Create `lib/api/enrollments.ts`
    - Implement getEnrollments(params) calling GET /api/enrollments
    - Implement getEnrollment(id) calling GET /api/enrollments/[id]
    - Implement createEnrollment(data) calling POST /api/enrollments
    - Implement updateEnrollment(id, data) calling PATCH /api/enrollments/[id]
    - Implement deleteEnrollment(id) calling DELETE /api/enrollments/[id]
    - Implement pauseEnrollment(id) calling POST /api/enrollments/[id]/pause
    - Implement reactivateEnrollment(id) calling POST /api/enrollments/[id]/reactivate
    - Implement archiveEnrollment(id) calling POST /api/enrollments/[id]/archive
    - Implement resendInvitation(id) calling POST /api/enrollments/[id]/resend-invite
    - Handle errors and return typed responses
    - _Requirements: All API operations_


- [x] 17. Frontend - Student invitation acceptance page
  - [x] 17.1 Create invitation validation page
    - Create `app/(auth)/invite/[token]/page.tsx`
    - Extract token from URL params
    - Call GET /api/auth/invite/[token] to verify token
    - Display invitation details: teacher name, student email
    - Show token expiration warning if < 24 hours remaining
    - Show error message if token invalid or expired
    - Render student signup form if token valid
    - _Requirements: 12.5, 12.6_

  - [x] 17.2 Create student signup form for invitation
    - Form fields: password (required, min 8 chars), full_name (required)
    - Email is pre-filled and read-only (from invitation)
    - Call POST /api/auth/invite/[token] with password and full_name
    - On success, create session and redirect to student dashboard
    - Display validation errors
    - Link back to login if student already has account
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 18. Property-based tests for data isolation
  - [x]* 18.1 Write property test for teacher data isolation
    - **Property 19: Enrollments Isolated by Teacher**
    - **Validates: Requirements 14.1, 14.3, 18.1**
    - Test that any two teachers cannot access each other's enrollments

  - [x]* 18.2 Write property test for student view restrictions
    - **Property 20: Students Cannot See Private Notes**
    - **Validates: Requirements 15.1, 15.2, 15.3**
    - Test that any student query never returns private_notes field

  - [x]* 18.3 Write property test for RLS enforcement
    - **Property 21: RLS Policies Block Unauthorized Access**
    - **Validates: Requirements 18.5, 18.6, 18.7**
    - Test direct database queries respect RLS policies

  - [x]* 18.4 Write property test for multi-teacher student support
    - **Property 22: Student Can Have Multiple Teacher Enrollments**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.5**
    - Test that one student can have independent enrollments with multiple teachers

- [x] 19. Property-based tests for validation rules
  - [x]* 19.1 Write property test for email validation
    - **Property 23: Email Format Validation**
    - **Validates: Requirements 1.8, 19.2**
    - Test that any invalid email format is rejected

  - [x]* 19.2 Write property test for name length validation
    - **Property 24: Student Name Length Validation**
    - **Validates: Requirements 19.1**
    - Test that names under 2 characters are rejected

  - [x]* 19.3 Write property test for phone validation
    - **Property 25: Phone Format Validation**
    - **Validates: Requirements 19.3, 19.4**
    - Test that invalid phone formats are rejected when provided

  - [x]* 19.4 Write property test for private notes length
    - **Property 26: Private Notes Length Limit**
    - **Validates: Requirements 15.5, 15.6**
    - Test that private notes over 5000 characters are rejected

- [x] 20. Property-based tests for timestamps and audit trail
  - [x]* 20.1 Write property test for timestamp creation
    - **Property 27: Created Timestamp Set on Creation**
    - **Validates: Requirements 16.1**
    - Test that any enrollment creation sets created_at to current UTC time

  - [x]* 20.2 Write property test for timestamp updates
    - **Property 28: Updated Timestamp on Modification**
    - **Validates: Requirements 16.2, 16.5**
    - Test that any enrollment update increases updated_at timestamp

  - [x]* 20.3 Write property test for archive timestamp
    - **Property 29: Archived Timestamp Set on Archive**
    - **Validates: Requirements 9.2, 16.3, 16.4**
    - Test that archiving sets archived_at and leaves it null for non-archived

  - [x]* 20.4 Write property test for UTC timezone
    - **Property 30: All Timestamps in UTC**
    - **Validates: Requirements 16.6**
    - Test that all timestamps stored and returned in UTC format


- [x] 21. Property-based tests for status transitions
  - [x]* 21.1 Write property test for valid transitions
    - **Property 31: Valid Status Transitions**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.5**
    - Test that all valid transitions succeed (pendingÃ¢â€ â€™active, activeÃ¢â€ â€™paused, etc.)

  - [x]* 21.2 Write property test for invalid transitions
    - **Property 32: Invalid Status Transitions Rejected**
    - **Validates: Requirements 17.4, 17.6, 17.7**
    - Test that invalid transitions return 409 error (archivedÃ¢â€ â€™active, etc.)

  - [x]* 21.3 Write property test for started_at immutability
    - **Property 33: Started Timestamp Immutable**
    - **Validates: Requirements 1.7**
    - Test that started_at never changes after enrollment creation

- [x] 22. Integration tests for complete flows
  - [x]* 22.1 Write integration test for enrollment lifecycle
    - Test: create enrollment (pending) Ã¢â€ â€™ invite sent Ã¢â€ â€™ student signup (active) Ã¢â€ â€™ pause Ã¢â€ â€™ reactivate Ã¢â€ â€™ archive
    - Verify status changes correctly at each step
    - Verify timestamps set appropriately
    - Verify invitation token cleared on activation

  - [x]* 22.2 Write integration test for search and filter
    - Create multiple enrollments with different statuses and names
    - Test search by partial name returns correct results
    - Test status filter returns only matching enrollments
    - Test pagination works correctly
    - Test combined search + filter + pagination

  - [x]* 22.3 Write integration test for deletion protection
    - Create enrollment, add lesson to enrollment
    - Attempt delete, verify 409 error
    - Archive enrollment instead, verify success
    - Create new enrollment without lessons, verify delete succeeds

  - [x]* 22.4 Write integration test for email uniqueness
    - Create active enrollment with email
    - Attempt create another active enrollment with same email, verify 409
    - Archive first enrollment
    - Retry create with same email, verify success
    - Verify different teacher can use same email

  - [x]* 22.5 Write integration test for invitation resend
    - Create enrollment with invitation
    - Wait or simulate time passing
    - Resend invitation, verify new token generated
    - Verify old token invalid, new token valid
    - Verify new expiration set

- [x] 23. Unit tests for edge cases
  - [x]* 23.1 Write unit tests for validation edge cases
    - Test student_name exactly 2 chars (valid)
    - Test student_name 1 char (invalid)
    - Test private_notes exactly 5000 chars (valid)
    - Test private_notes 5001 chars (invalid)
    - Test empty search query returns all
    - Test whitespace-only search treated as empty

  - [x]* 23.2 Write unit tests for pagination edge cases
    - Test page size exactly 100 (valid)
    - Test page size 101 (invalid)
    - Test page number beyond available pages returns empty array
    - Test total pages calculation correct
    - Test hasNext and hasPrevious flags correct

  - [x]* 23.3 Write unit tests for status-based behavior
    - Test paused enrollment doesn't appear in default list (unless filter includes paused)
    - Test archived enrollment excluded from default list
    - Test pending enrollment shows invitation status
    - Test next_lesson null when no scheduled lessons


- [x] 24. RLS policy verification tests
  - [x]* 24.1 Write direct database test for teacher RLS
    - Create two teachers with enrollments
    - Use Supabase client authenticated as teacher 1
    - Attempt to query teacher 2's enrollments
    - Verify zero rows returned (RLS blocks access)
    - _Requirements: 18.1, 18.2, 18.3, 18.5_

  - [x]* 24.2 Write direct database test for student RLS
    - Create enrollment with student linked
    - Use Supabase client authenticated as student
    - Query enrollments, verify private_notes excluded
    - Query student_enrollments view, verify data visible
    - Attempt to query other student's enrollments, verify blocked
    - _Requirements: 15.2, 15.3, 18.4_

  - [x]* 24.3 Write direct database test for update restrictions
    - Authenticate as teacher 1
    - Attempt to update teacher 2's enrollment
    - Verify update returns zero rows (RLS blocks)
    - Attempt to delete teacher 2's enrollment
    - Verify delete returns zero rows (RLS blocks)
    - _Requirements: 18.2, 18.6_

- [x] 25. Final checkpoint - Complete implementation verification
  - Run full test suite (unit + property + integration + RLS)
  - Verify all 33 correctness properties pass
  - Verify test coverage Ã¢â€°Â¥ 80%
  - Test complete enrollment lifecycle manually in browser
  - Test invitation email delivery with real Resend account
  - Verify student signup from invitation link works
  - Test search, filter, and pagination in UI
  - Test all status transitions through UI
  - Verify error messages are user-friendly
  - Verify no security issues (private notes never exposed to students)
  - Test RLS policies block unauthorized access
  - Ask the user if questions arise

- [x] 26. Documentation and code quality
  - [x] 26.1 Add code comments to complex functions
    - Add JSDoc comments to all exported service functions
    - Document expected input/output
    - Document error scenarios
    - Add inline comments for complex business logic (status transitions, uniqueness checks)

  - [x] 26.2 Add database migration documentation
    - Add comments to migration files explaining table purpose
    - Document RLS policy logic
    - Document constraint rationale (unique email, status values)
    - Add rollback migration if needed

  - [x] 26.3 Update API documentation
    - Document all enrollment endpoints in README or separate API doc
    - Include request/response examples
    - Document query parameters for list endpoint
    - Document error codes and meanings
    - Add authentication requirements

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests verify complete workflows end-to-end
- RLS policies tested both through API endpoints and direct database queries
- Invitation emails should be tested with Resend test mode during development
- Private notes must NEVER be exposed to students (enforced at DB, service, and API layers)
- Status transitions follow strict rules enforced by validateStatusTransition function
- Email uniqueness per teacher enforced by partial unique constraint
- Archive is permanent (no reactivation from archived status)
- Deletion only allowed for enrollments without lesson history
- All timestamps stored in UTC regardless of teacher timezone preference
- Search is case-insensitive and matches partial strings
- Default list view excludes archived enrollments unless explicitly requested
- Pagination defaults to 20 items per page, maximum 100
- Token expiration is 7 days from generation
- Resending invitation invalidates old token and generates new one

