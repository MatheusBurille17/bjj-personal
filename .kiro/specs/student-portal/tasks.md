# Implementation Plan: Student Portal

## Overview

This implementation plan establishes the Student Portal module for the Jiu-Jitsu platform. The Student Portal is a read-only, student-centric aggregation layer that consolidates data from multiple modules (lessons, plans, library, enrollments) into coherent student-facing views. Students view their training across multiple teachers while platform enforces strict read-only access, enrollment-based authorization, and private_notes protection.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- PostgreSQL with RLS policies for data isolation
- Supabase for database and authentication
- Mux for video playback with signed URLs
- shadcn/ui for UI components
- fast-check for property-based testing

## Tasks

- [x] 1. Database schema review and RLS policies
  - [x] 1.1 Review existing tables for student portal dependencies
    - Verify enrollments table exists with: id, teacher_id, student_profile_id, status
    - Verify lessons table exists with: id, enrollment_id, status, shared_notes, private_notes, completed_at
    - Verify monthly_plans table with: id, status, period_start
    - Verify plan_enrollments table with: id, plan_id, enrollment_id
    - Verify student_technique_access table exists
    - _Requirements: 1.1, 3.1, 5.1, 7.1_

  - [x] 1.2 Create RLS policy for lessons - student read-only
    - Create `supabase/migrations/[timestamp]_add_lessons_student_rls_read.sql`
    - Enable RLS on lessons table (if not already)
    - Policy: Students SELECT lessons only through enrollments (no private_notes)
    - Policy excludes private_notes column (column-level security)
    - Policy filters: enrollment_id IN (student's enrollments)
    - Query: Excludes lessons with status='cancelled' or status='no_show'
    - _Requirements: 4.6, 10.6, 13.6, 18.1, 18.2, 18.3, 18.4, 18.5, 19.1, 19.2, 19.3, 26.1, 26.2, 26.4_

  - [x] 1.3 Create RLS policy for monthly_plans - student read-only
    - Create `supabase/migrations/[timestamp]_add_monthly_plans_student_rls.sql`
    - Policy: Students SELECT plans only with status='published' through plan_enrollments
    - Policy enforces: status='published' at RLS level
    - _Requirements: 5.2, 5.3, 6.2, 6.7, 20.7_

  - [x] 1.4 Create RLS policy for plan_days - student read-only
    - Create `supabase/migrations/[timestamp]_add_plan_days_student_rls.sql`
    - Policy: Students SELECT plan_days only through published plans in plan_enrollments
    - No private or teacher-only fields accessible
    - _Requirements: 6.3, 6.6_

  - [x] 1.5 Create RLS policy for techniques - student read-only
    - Create `supabase/migrations/[timestamp]_add_techniques_student_rls.sql`
    - Policy: Students SELECT techniques through student_technique_access
    - Excludes archived techniques (status != 'archived')
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 21.7_

  - [x] 1.6 Create RLS policy for videos - student read-only
    - Create `supabase/migrations/[timestamp]_add_videos_student_rls.sql`
    - Policy: Students SELECT videos through two paths:
      - Path 1: Videos in student's lessons (lesson_videos table)
      - Path 2: Videos in authorized techniques (module_videos of authorized techniques)
    - Excludes archived videos (status != 'archived')
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 23.1, 23.2, 23.3, 23.4, 23.6_

  - [x] 1.7 Create RLS policy to prevent student writes
    - Create `supabase/migrations/[timestamp]_add_student_write_prevention_rls.sql`
    - Policy: Students CANNOT INSERT/UPDATE/DELETE on lessons, plans, plan_days, techniques, modules, videos
    - Use USING false for INSERT/UPDATE/DELETE operations
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [x] 1.8 Create database indexes for performance
    - Create `supabase/migrations/[timestamp]_add_student_portal_indexes.sql`
    - Index on enrollments(student_profile_id)
    - Index on lessons(enrollment_id, status)
    - Index on lessons(starts_at DESC) where status='scheduled'
    - Index on lessons(completed_at DESC) where status='completed'
    - Index on plan_enrollments(enrollment_id)
    - Index on student_technique_access(enrollment_id)
    - Index on monthly_plans(period_start DESC)
    - _Requirements: 30.4, 30.5_

- [x] 2. TypeScript type definitions
  - [x] 2.1 Create student portal view types
    - Create `types/student-portal.ts`
    - Define StudentDashboard, StudentLessonSummary, StudentLessonDetail interfaces
    - Define StudentPlan, StudentPlanDay interfaces
    - Define StudentTechnique, StudentModule, StudentVideo interfaces
    - Define TeacherSummary, AggregateStatistics interfaces
    - _Requirements: 1.1, 1.2, 3.1, 5.1, 7.1_

  - [x] 2.2 Create pagination and filter types
    - Define PaginationMeta interface: page, pageSize, total, totalPages, hasNext, hasPrevious
    - Define StudentLessonHistoryResponse with pagination metadata
    - Define filter interfaces: LessonHistoryFilter, LessonAgendaFilter
    - _Requirements: 10.7, 27.2, 27.3, 27.4_

  - [x] 2.3 Create student profile types
    - Define StudentProfile interface: id, fullName, email, avatarUrl, createdAt, updatedAt
    - Define ProfileUpdateInput: fullName?, avatarUrl?
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

  - [x] 2.4 Export all types from types/index.ts
    - Ensure all student portal types accessible via single import
    - _Requirements: 1.1_

- [x] 3. Validation utilities
  - [x] 3.1 Create student portal validation helpers
    - Create `lib/utils/student-portal-validation.ts`
    - Implement validateEnrollmentId(enrollmentId, studentId) - verify ownership
    - Implement validatePageSize(size) - check 1-100 range
    - Implement validateDateRange(fromDate, toDate) - check validity
    - Implement validateISO8601Date(dateStr) - check format
    - Implement validateProfileInput(fullName, avatarUrl) - check lengths and formats
    - _Requirements: 11.5, 15.2, 15.7, 27.7, 28.4_

  - [x] 3.2 Create Zod validation schemas
    - Define lessonHistoryQuerySchema
    - Define agendaQuerySchema
    - Define profileUpdateSchema with fullName (2-255 chars), avatarUrl (URL format)
    - Define paginationSchema with page, pageSize validation
    - _Requirements: 15.2, 27.7, 28.4_

- [x] 4. Service layer - Dashboard service
  - [x] 4.1 Implement dashboard aggregation service
    - Create `lib/services/student-dashboard.service.ts`
    - Implement getStudentDashboard(studentId)
    - Query upcoming lessons: status='scheduled', starts_at > now(), LIMIT 3, ordered by starts_at ASC
    - Query recent lessons: status='completed', starts_at < now(), LIMIT 3, ordered by completed_at DESC
    - Count total completed lessons across all active enrollments
    - Calculate per-teacher breakdown with lesson counts
    - Include teacher summaries with next lesson dates
    - Return aggregated StudentDashboard object
    - Exclude private_notes from all lesson data
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.6, 3.5, 30.1, 30.2, 30.3_

  - [x]* 4.2 Write property test for dashboard aggregation
    - **Property 1: Student Dashboard Shows Only Own Lessons**
    - **Validates: Requirements 1.5, 3.5, 10.5, 26.1, 26.4**
    - Test that dashboard includes only lessons from student's enrollments

  - [x]* 4.3 Write property test for dashboard counts
    - **Property 11: Dashboard Aggregates Across Enrollments**
    - **Validates: Requirements 1.2, 2.1, 2.6, 17.1, 17.2, 17.3**
    - Test that totals sum correctly from all active enrollments

- [x] 5. Service layer - Lesson access service
  - [x] 5.1 Implement upcoming lessons retrieval
    - Create `lib/services/student-lesson.service.ts`
    - Implement getStudentUpcomingLessons(studentId)
    - Query: status='scheduled', starts_at > now(), ordered by starts_at ASC, LIMIT 1
    - Include: id, startsAt, endsAt, teacherName, enrollmentId, planDay title, videoCount
    - Exclude: private_notes, video sources
    - Return single lesson or null
    - _Requirements: 3.1, 3.2, 3.3_

  - [x]* 5.2 Write property test for upcoming lessons
    - **Property 15: Student Upcoming Lesson Filtering**
    - **Validates: Requirements 3.1, 3.2**
    - Test that only scheduled future lessons returned

  - [x] 5.3 Implement lesson history retrieval
    - Implement getStudentLessonHistory(studentId, filters: {enrollmentId?, fromDate?, toDate?, page?, pageSize?})
    - Query: status='completed', starts_at < now(), ordered by completed_at DESC
    - Support pagination (default 20, max 100)
    - Support enrollment filter (single teacher)
    - Support date range filters (inclusive)
    - Return paginated array with metadata
    - Exclude private_notes
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 10.7, 25.1, 25.2, 25.3, 25.5, 25.7_

  - [x]* 5.4 Write property test for history pagination
    - **Property 19: Pagination Default Page Size Is 20**
    - **Validates: Requirements 10.7, 27.2**
    - Test that default page size is 20 when not specified

  - [x] 5.5 Implement lesson detail retrieval
    - Implement getStudentLessonDetail(studentId, lessonId)
    - Verify lesson belongs to student's enrollment (RLS)
    - Return complete StudentLessonDetail with: times, teacherName, status, sharedNotes, videos, planDay
    - For completed lessons: include video thumbnails
    - Exclude private_notes completely
    - Return 404 if lesson not found or not authorized
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x]* 5.6 Write property test for lesson detail authorization
    - **Property 5: Enrollment-Based Access Control**
    - **Validates: Requirements 3.5, 5.2, 12.2, 12.3, 12.5, 26.1, 26.2, 26.5, 26.6, 26.7**
    - Test that accessing lesson from different enrollment returns 403

  - [x] 5.7 Verify canceled/no-show lessons excluded
    - All lesson queries automatically exclude status='cancelled' and status='no_show' via RLS
    - Test explicitly that these statuses never appear in student views
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

  - [x]* 5.8 Write property test for cancelled lesson exclusion
    - **Property 3: Cancelled and No-Show Lessons Excluded**
    - **Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.6**
    - Test that cancelled/no-show lessons never appear in results

- [x] 6. Service layer - Plans access service
  - [x] 6.1 Implement published plans retrieval
    - Create `lib/services/student-plans.service.ts`
    - Implement getStudentPlans(studentId, enrollmentId?)
    - Query: status='published' through plan_enrollments
    - Filter by enrollmentId if provided (single teacher)
    - Sorted by period_start DESC (most recent first)
    - Return: id, title, description, periodStart, periodEnd, teacherName, teacherId, enrollmentId
    - Exclude archived enrollments
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.2 Implement plan days retrieval
    - Implement getStudentPlanDays(studentId, planId)
    - Verify plan is published and accessible to student (RLS)
    - Return plan_days sorted by sort_order ASC
    - Include video associations with titles, thumbnails, durations
    - Exclude private or teacher-only fields
    - Return 404 if not authorized
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 7. Service layer - Library access service
  - [x] 7.1 Implement authorized techniques retrieval
    - Create `lib/services/student-library.service.ts`
    - Implement getStudentTechniques(studentId, enrollmentId?)
    - Query through student_technique_access relationship
    - Exclude archived techniques
    - Sort by sort_order ASC
    - Filter by enrollmentId if provided
    - Return: id, name, description, moduleCount, sortOrder, teacherName, enrollmentId
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 7.2 Write property test for technique access
    - **Property 9: Technique Access Through Authorization Relationship**
    - **Validates: Requirements 7.1, 7.3, 7.6, 21.7**
    - Test that only authorized techniques appear for student

  - [x] 7.3 Implement videos in technique retrieval
    - Implement getStudentVideosInTechnique(studentId, techniqueId)
    - Verify technique is authorized through student_technique_access (RLS)
    - Return all videos in technique, grouped by module
    - Each module: id, name, description, videos sorted by sort_order
    - Each video: id, title, description, thumbnailUrl, duration
    - Exclude archived videos, exclude processing/failed videos
    - Return 403 if not authorized
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 7.4 Implement video playback URL generation
    - Implement generateVideoPlaybackUrl(studentId, videoId)
    - Verify student has access through:
      - Path 1: Video in completed/scheduled lesson (lesson_videos), OR
      - Path 2: Video in authorized technique (module_videos)
    - Check video status='ready' (not processing, archived, failed)
    - Generate Mux signed playback URL with 24-hour expiration
    - Return: {playbackUrl, expiresAt, videoTitle}
    - Return 403 if not authorized
    - Return 409 if video status != 'ready'
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 23.1, 23.2, 23.3, 23.4, 23.5, 23.7_

  - [x]* 7.5 Write property test for video access authorization
    - **Property 8: Video Access AuthorizationÃ¢â‚¬â€Dual-Path**
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5, 23.7, 9.1, 9.4, 9.5**
    - Test that authorization checks both lesson and technique paths

- [x] 8. Service layer - Statistics aggregation
  - [x] 8.1 Implement aggregate statistics calculation
    - Create `lib/services/student-statistics.service.ts`
    - Implement getStudentStatistics(studentId)
    - Calculate totalCompletedLessons: COUNT(status='completed') across active enrollments
    - Calculate firstLessonDate: MIN(completed_at) from completed lessons
    - Calculate perTeacher breakdown with completed counts
    - Exclude cancelled, no_show lessons
    - Exclude archived enrollments
    - Return AggregateStatistics object
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x]* 8.2 Write property test for statistics accuracy
    - **Property 12: Completed Count Excludes Cancelled and No-Show**
    - **Validates: Requirements 2.2, 2.5, 17.6, 42.5**
    - Test that counts exclude non-completed statuses

- [x] 9. Service layer - Teachers list service
  - [x] 9.1 Implement teachers list retrieval
    - Create `lib/services/student-teachers.service.ts`
    - Implement getStudentTeachers(studentId)
    - Query active enrollments with teacher information
    - Include: teacherId, teacherName, enrollmentId, enrollmentStatus, startedAt
    - Calculate nextLessonDate if upcoming lesson exists
    - Exclude archived enrollments by default
    - Sort by startedAt ASC (earliest first)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 10. Service layer - Profile management
  - [x] 10.1 Implement profile retrieval
    - Create `lib/services/student-profile.service.ts`
    - Implement getStudentProfile(studentId)
    - Return: id, fullName, email, avatarUrl, createdAt, updatedAt
    - RLS enforces student can only see own profile
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

  - [x] 10.2 Implement profile update
    - Implement updateStudentProfile(studentId, updates: {fullName?, avatarUrl?})
    - Validate fullName: 2-255 characters, trim whitespace before validation
    - Validate avatarUrl: valid URL format (if provided)
    - Prevent email modification via this endpoint
    - Return updated StudentProfile
    - Return 400 if validation fails with field-specific errors
    - Database auto-updates updated_at timestamp
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

  - [x]* 10.3 Write property test for profile update validation
    - **Property 40: Full Name ValidationÃ¢â‚¬â€Minimum Length**
    - **Validates: Requirements 15.2**
    - Test that fullName < 2 chars rejected with 400

- [x] 11. Checkpoint - Service layer complete
  - Run all unit tests for services
  - Run all property tests
  - Verify database interactions with local Supabase
  - Verify RLS policies block unauthorized access
  - Verify pagination works correctly (default 20, max 100)
  - Verify private_notes never appears in any service output
  - Verify cancelled/no_show lessons excluded
  - Verify multi-teacher aggregation correct
  - Ask user if questions arise

- [x] 12. API Routes - Dashboard endpoint
  - [x] 12.1 Create GET /api/student/dashboard endpoint
    - Create `app/api/student/dashboard/route.ts`
    - Verify authentication with session
    - Call student-dashboard.service getStudentDashboard
    - Return {data: StudentDashboard, meta: {fetchedAt}}
    - Handle 401 if not authenticated
    - Performance: must complete within 2 seconds
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 30.1, 30.2, 30.3_

  - [x]* 12.2 Write unit test for GET /api/student/dashboard
    - Test authenticated request returns complete dashboard
    - Test dashboard respects 2-second performance target
    - Test unauthenticated request returns 401
    - Test excludes private_notes

- [x] 13. API Routes - Lessons endpoints
  - [x] 13.1 Create GET /api/student/agenda endpoint
    - Create `app/api/student/agenda/route.ts`
    - Query params: enrollmentId?, fromDate?, toDate?
    - Call student-lesson.service getStudentUpcomingLessons (or filtered version)
    - Support date range filtering
    - Support teacher/enrollment filtering
    - Return paginated StudentLessonSummary[] (for consistency)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x]* 13.2 Write unit test for GET /api/student/agenda
    - Test filters work correctly (date range, teacher)
    - Test excludes cancelled/no_show
    - Test sorted by starts_at ASC

  - [x] 13.3 Create GET /api/student/lessons/history endpoint
    - Create `app/api/student/lessons/history/route.ts`
    - Query params: enrollmentId?, fromDate?, toDate?, page?, pageSize?
    - Call student-lesson.service getStudentLessonHistory
    - Support all filters and pagination
    - Return {data: StudentLessonDetail[], meta: {pagination}}
    - Default page size 20, max 100
    - Return 400 if pageSize > 100
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.1, 12.4, 12.6, 12.7, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_

  - [x]* 13.4 Write unit test for GET /api/student/lessons/history
    - Test pagination default (20) and max (100)
    - Test page size validation
    - Test out-of-bounds page returns empty array
    - Test filters combine correctly
    - Test pagination metadata accurate

  - [x] 13.5 Create GET /api/student/lessons/[id] endpoint
    - Create `app/api/student/lessons/[id]/route.ts`
    - Call student-lesson.service getStudentLessonDetail
    - Return {data: StudentLessonDetail}
    - Return 404 if not found
    - Return 403 if not authorized
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x]* 13.6 Write unit test for GET /api/student/lessons/[id]
    - Test authorized access returns full details
    - Test unauthorized access returns 403
    - Test non-existent lesson returns 404

- [x] 14. API Routes - Plans endpoints
  - [x] 14.1 Create GET /api/student/plans endpoint
    - Create `app/api/student/plans/route.ts`
    - Query params: enrollmentId?
    - Call student-plans.service getStudentPlans
    - Return {data: StudentPlan[]}
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 14.2 Create GET /api/student/plans/[id]/days endpoint
    - Create `app/api/student/plans/[id]/days/route.ts`
    - Call student-plans.service getStudentPlanDays
    - Return {data: StudentPlanDay[]}
    - Return 403 if plan not published or not accessible
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 15. API Routes - Library endpoints
  - [x] 15.1 Create GET /api/student/library/techniques endpoint
    - Create `app/api/student/library/techniques/route.ts`
    - Query params: enrollmentId?
    - Call student-library.service getStudentTechniques
    - Return {data: StudentTechnique[]}
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 15.2 Create GET /api/student/library/techniques/[id]/videos endpoint
    - Create `app/api/student/library/techniques/[id]/videos/route.ts`
    - Call student-library.service getStudentVideosInTechnique
    - Return {data: StudentVideo[]} organized by module
    - Return 403 if technique not authorized
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 15.3 Create GET /api/student/videos/[id]/playback-url endpoint
    - Create `app/api/student/videos/[id]/playback-url/route.ts`
    - Call student-library.service generateVideoPlaybackUrl
    - Return {data: {playbackUrl, expiresAt, videoTitle}}
    - Return 403 if not authorized
    - Return 409 if video not ready
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [x]* 15.4 Write unit test for playback URL generation
    - Test authorized access returns signed URL
    - Test unauthorized access returns 403
    - Test video not ready returns 409
    - Test URL expires in 24 hours

- [x] 16. API Routes - Statistics and Profile endpoints
  - [x] 16.1 Create GET /api/student/statistics endpoint
    - Create `app/api/student/statistics/route.ts`
    - Call student-statistics.service getStudentStatistics
    - Return {data: AggregateStatistics}
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 16.2 Create GET /api/student/teachers endpoint
    - Create `app/api/student/teachers/route.ts`
    - Call student-teachers.service getStudentTeachers
    - Return {data: TeacherSummary[]}
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [x] 16.3 Create GET /api/student/profile endpoint
    - Create `app/api/student/profile/route.ts`
    - Call student-profile.service getStudentProfile
    - Return {data: StudentProfile}
    - RLS enforces student can only see own profile
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

  - [x] 16.4 Create PATCH /api/student/profile endpoint
    - Body: {fullName?, avatarUrl?}
    - Call student-profile.service updateStudentProfile
    - Return {data: StudentProfile}
    - Return 400 if validation fails with field errors
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

  - [x]* 16.5 Write unit test for PATCH /api/student/profile
    - Test valid update returns 200
    - Test fullName < 2 chars returns 400
    - Test email modification is prevented
    - Test updated_at timestamp updated

- [x] 17. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify authentication and authorization on all routes
  - Test RLS policies block unauthorized access
  - Verify pagination works on history endpoint
  - Verify error responses follow standard format (no sensitive data)
  - Verify all responses use ISO 8601 UTC timestamps
  - Verify multi-teacher responses include teacher identification
  - Verify private_notes never appears in responses
  - Verify cancelled/no_show lessons excluded
  - Ask user if questions arise

- [x] 18. Frontend - shadcn/ui component setup
  - [x] 18.1 Install required shadcn/ui components
    - Run `npx shadcn-ui@latest add button input label form card alert dialog tabs select`
    - Run `npx shadcn-ui@latest add calendar popover badge skeleton pagination`
    - Run `npx shadcn-ui@latest add table dropdown-menu`
    - Verify components installed to `components/ui/`

  - [x] 18.2 Create date/time display utilities
    - Create `lib/utils/date-display.ts`
    - Helper function to format ISO 8601 UTC timestamp for display
    - Helper function to display timezone-aware times (UTC storage, local display)
    - Use date-fns for formatting

- [x] 19. Frontend - Dashboard components
  - [x] 19.1 Create StudentDashboard component
    - Create `components/student/StudentDashboard.tsx` as server component
    - Fetch from GET /api/student/dashboard
    - Display upcoming lessons (next 3)
    - Display completed count and per-teacher breakdown
    - Display teacher list with next lesson dates
    - Use shadcn/ui card and badge components
    - Real-time subscription to lessons changes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [x] 19.2 Create LessonSummaryCard component
    - Create `components/student/LessonSummaryCard.tsx` as client component
    - Display: time, teacher name, status, video count, plan day title
    - Link to full lesson details
    - Show upcoming indicator or completed date
    - _Requirements: 1.3, 1.4, 1.6, 3.2_

  - [x] 19.3 Create StatisticsSummary component
    - Create `components/student/StatisticsSummary.tsx` as client component
    - Display total completed lessons
    - Display first lesson date
    - Display per-teacher breakdown table
    - Use shadcn/ui table component
    - _Requirements: 2.1, 2.6, 17.1, 17.2, 17.3_

- [x] 20. Frontend - Agenda views
  - [x] 20.1 Create StudentAgendaView component
    - Create `components/student/StudentAgendaView.tsx` as server component
    - Fetch from GET /api/student/agenda
    - Display upcoming scheduled lessons
    - Support date range filter and teacher filter
    - Show filters UI (popover with date and teacher select)
    - Display empty state if no lessons
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 20.2 Create StudentHistoryView component
    - Create `components/student/StudentHistoryView.tsx` as client component
    - Fetch from GET /api/student/lessons/history with pagination
    - Display completed lessons in table
    - Support date range and teacher filters
    - Support pagination (next/previous, page size selector)
    - Each row: date, teacher, video count, preview of notes
    - Link to full lesson details
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.1, 12.4_

  - [x] 20.3 Create LessonDetailView component
    - Create `components/student/LessonDetailView.tsx` as client component
    - Fetch from GET /api/student/lessons/[id]
    - Display full lesson details: times, teacher, status, shared_notes
    - Display plan day information if present
    - Display video list with play buttons
    - Show "No videos" message if empty
    - Show completed timestamp if completed
    - Read-only display (no editing)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 26.1, 26.2, 26.3, 26.4, 26.5_

- [x] 21. Frontend - Plans and Library components
  - [x] 21.1 Create StudentPlansView component
    - Create `components/student/StudentPlansView.tsx` as server component
    - Fetch from GET /api/student/plans
    - Display published plans as cards
    - Each card: title, description, period, teacher name
    - Click to expand and view plan days
    - Support teacher filter
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 21.2 Create PlanDaysView component
    - Create `components/student/PlanDaysView.tsx` as client component
    - Fetch from GET /api/student/plans/[id]/days
    - Display plan days as list
    - Each day: date/weekday, title, objective, notes, video count
    - Expandable to show videos
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 21.3 Create StudentLibraryView component
    - Create `components/student/StudentLibraryView.tsx` as client component
    - Fetch from GET /api/student/library/techniques
    - Display techniques as list or grid
    - Click technique to view videos
    - Support teacher filter
    - Show "No authorized techniques" if empty
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 21.4 Create TechniqueVideosView component
    - Create `components/student/TechniqueVideosView.tsx` as client component
    - Fetch from GET /api/student/library/techniques/[id]/videos
    - Display videos organized by module
    - Each video: title, thumbnail, duration, play button
    - Play button triggers video player with playback URL
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 21.5 Create VideoPlayerModal component
    - Create `components/student/VideoPlayerModal.tsx` as client component
    - Fetch playback URL from GET /api/student/videos/[id]/playback-url
    - Display Mux player with signed URL
    - Show video title, duration, description
    - Display expiration time of URL
    - Handle video not ready (409) with message
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 22. Frontend - Profile components
  - [x] 22.1 Create StudentProfileView component
    - Create `components/student/StudentProfileView.tsx` as server component
    - Fetch from GET /api/student/profile
    - Display profile information read-only initially
    - Edit button toggles form display
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

  - [x] 22.2 Create ProfileEditForm component
    - Create `components/student/ProfileEditForm.tsx` as client component
    - Form fields: fullName, avatarUrl
    - Zod validation client-side
    - Submit button calls PATCH /api/student/profile
    - Show validation errors
    - Show success toast on save
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

  - [x] 22.3 Create StudentTeachersView component
    - Create `components/student/StudentTeachersView.tsx` as client component
    - Fetch from GET /api/student/teachers
    - Display as card list
    - Each card: teacher name, enrollment date, next lesson date
    - Show "No teachers" if empty
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 23. Frontend - Student pages
  - [x] 23.1 Create student dashboard page
    - Create `app/(student)/dashboard/page.tsx` as server component
    - Render StudentDashboard component
    - Protected by middleware (student role)
    - _Requirements: 1.1_

  - [x] 23.2 Create student agenda page
    - Create `app/(student)/my-agenda/page.tsx` as server component
    - Render StudentAgendaView component
    - Include tabs: Upcoming, History
    - Protected by middleware
    - _Requirements: 3.1, 10.1_

  - [x] 23.3 Create student plans page
    - Create `app/(student)/my-plans/page.tsx` as server component
    - Render StudentPlansView component
    - Protected by middleware
    - _Requirements: 5.1_

  - [x] 23.4 Create student library page
    - Create `app/(student)/library/page.tsx` as server component
    - Render StudentLibraryView component
    - Protected by middleware
    - _Requirements: 7.1_

  - [x] 23.5 Create student profile page
    - Create `app/(student)/profile/page.tsx` as server component
    - Render StudentProfileView component
    - Protected by middleware
    - _Requirements: 14.1, 15.1_

  - [x] 23.6 Create student lesson detail page
    - Create `app/(student)/lessons/[id]/page.tsx` as server component
    - Render LessonDetailView component
    - Protected by middleware
    - _Requirements: 4.1, 26.1_

- [x] 24. Custom hooks for client state
  - [x] 24.1 Create useStudentDashboard hook
    - Create `hooks/useStudentDashboard.ts`
    - Fetch dashboard with revalidation
    - Real-time subscription to changes
    - Handle loading/error states
    - _Requirements: 1.1_

  - [x] 24.2 Create useStudentLessons hook
    - Create `hooks/useStudentLessons.ts`
    - Fetch upcoming and history lessons
    - Support pagination
    - Handle filtering
    - _Requirements: 3.1, 10.1_

  - [x] 24.3 Create useStudentPlans hook
    - Create `hooks/useStudentPlans.ts`
    - Fetch published plans
    - Handle enrollment filter
    - _Requirements: 5.1_

  - [x] 24.4 Create useStudentLibrary hook
    - Create `hooks/useStudentLibrary.ts`
    - Fetch authorized techniques
    - Fetch videos in technique
    - Handle teacher filter
    - _Requirements: 7.1, 8.1_

  - [x] 24.5 Create useStudentProfile hook
    - Create `hooks/useStudentProfile.ts`
    - Fetch and update profile
    - Handle validation errors
    - _Requirements: 14.1, 15.1_

- [x] 25. Property-based tests for authorization
  - [x]* 25.1 Write property test for private_notes exclusion
    - **Property 2: Private Notes Never Exposed**
    - **Validates: Requirements 4.6, 10.6, 13.6, 18.1, 18.2, 18.3, 18.4, 18.5**
    - Test that private_notes never appears in any response

  - [x]* 25.2 Write property test for read-only enforcement
    - **Property 6: Read-Only Access for Students**
    - **Validates: Requirements 19.1-19.7, 20.1-20.6, 21.1-21.6**
    - Test that all write operations return 403 for students

  - [x]* 25.3 Write property test for RLS enforcement
    - **Property 7: RLS Prevents Cross-Enrollment Data Leakage**
    - **Validates: Requirements 26.4, 26.6**
    - Test that students cannot query other students' enrollments

  - [x]* 25.4 Write property test for plans visibility
    - **Property 10: Plans Only Visible When Published**
    - **Validates: Requirements 5.2, 5.3, 6.2, 6.7, 20.7**
    - Test that unpublished plans never appear in results

- [x] 26. Property-based tests for filtering and aggregation
  - [x]* 26.1 Write property test for date filtering
    - **Property 15: Date Range Filtering Works Correctly**
    - **Validates: Requirements 3.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7**
    - Test that date filters include only lessons in range

  - [x]* 26.2 Write property test for teacher filtering
    - **Property 16: Teacher Filter Isolates Single Enrollment**
    - **Validates: Requirements 12.1, 12.4, 12.6**
    - Test that enrollment filter restricts to single teacher

  - [x]* 26.3 Write property test for aggregation accuracy
    - **Property 13: Archived Enrollments Excluded from Aggregates**
    - **Validates: Requirements 2.3, 5.6, 16.5, 17.7**
    - Test that archived enrollments excluded from totals

  - [x]* 26.4 Write property test for pagination
    - **Property 21: Page Size Validation**
    - **Validates: Requirements 27.7**
    - Test that pageSize > 100 rejected with 400

- [x] 27. Property-based tests for data completeness
  - [x]* 27.1 Write property test for lesson detail response
    - **Property 24: Lesson Detail Response Complete**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 13.1, 13.2, 13.3, 13.4**
    - Test that all required fields present in lesson response

  - [x]* 27.2 Write property test for teacher identification
    - **Property 25: Teacher Identification Always Present**
    - **Validates: Requirements 3.2, 5.3, 16.2, 24.4**
    - Test that multi-teacher responses always identify teacher

  - [x]* 27.3 Write property test for timestamp format
    - **Property 27: Timestamps In ISO 8601 UTC Format**
    - **Validates: Requirements 14.7, 29.1, 29.4, 29.5, 29.7**
    - Test that all timestamps are ISO 8601 with Z suffix

  - [x]* 27.4 Write property test for profile response
    - **Property 28: Profile Response Excludes Enrollment Data**
    - **Validates: Requirements 14.4**
    - Test that profile endpoint returns only profile fields

- [x] 28. Property-based tests for error handling
  - [x]* 28.1 Write property test for authorization errors
    - **Property 45: 403 Error Returned For Access Denied**
    - **Validates: Requirements 28.1, 4.7, 12.5, 13.7, 20.4, 21.4**
    - Test that unauthorized access returns 403 with generic message

  - [x]* 28.2 Write property test for validation errors
    - **Property 48: 400 Error For Validation Failure**
    - **Validates: Requirements 28.4**
    - Test that invalid inputs return 400 with field errors

  - [x]* 28.3 Write property test for error message safety
    - **Property 50: Error Messages Don't Expose Sensitive Data**
    - **Validates: Requirements 28.6**
    - Test that error messages never include private data or IDs

- [x] 29. Integration tests for complete workflows
  - [x]* 29.1 Write integration test for student dashboard workflow
    - Test: load dashboard Ã¢â€ â€™ verify data from all enrollments
    - Verify private_notes not visible
    - Verify cancelled/no_show excluded

  - [x]* 29.2 Write integration test for lesson view workflow
    - Test: view upcoming lesson Ã¢â€ â€™ get details Ã¢â€ â€™ access videos
    - Verify video playback URL valid and restricted

  - [x]* 29.3 Write integration test for multi-teacher scenario
    - Test: student with 2 teachers Ã¢â€ â€™ dashboard aggregates both
    - Verify each lesson identified by correct teacher
    - Verify filters work per-teacher

  - [x]* 29.4 Write integration test for real-time updates
    - Test: lesson marked complete Ã¢â€ â€™ moves to history immediately
    - Test: lesson cancelled Ã¢â€ â€™ disappears from agenda
    - Test: technique access revoked Ã¢â€ â€™ removed from library

- [x] 30. Unit tests for edge cases
  - [x]* 30.1 Write unit tests for pagination edge cases
    - Test page size 1, 20 (default), 100 (max)
    - Test first page, last page, out of bounds
    - Test with 0 results, 1 result, 100+ results

  - [x]* 30.2 Write unit tests for filtering combinations
    - Test date range + teacher filter
    - Test teacher filter without date range
    - Test all filters with pagination

  - [x]* 30.3 Write unit tests for profile updates
    - Test fullName whitespace trimming
    - Test fullName too short (1 char) rejected
    - Test avatarUrl invalid format rejected
    - Test email not modifiable

  - [x]* 30.4 Write unit tests for video access
    - Test video through lesson association
    - Test video through technique authorization
    - Test video neither path: 403
    - Test video not ready: 409

- [x] 31. RLS policy verification tests
  - [x]* 31.1 Write database test for lesson RLS
    - Create two students with different enrollments
    - Attempt unauthorized query from student role
    - Verify RLS returns zero rows
    - _Requirements: 26.1, 26.2, 26.4_

  - [x]* 31.2 Write database test for private_notes exclusion
    - Query lesson from student role
    - Verify private_notes field not in results (RLS column filter)
    - _Requirements: 4.6, 10.6, 13.6, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x]* 31.3 Write database test for plan visibility
    - Create published and unpublished plans
    - Attempt query from student role
    - Verify only published plans returned
    - _Requirements: 5.2, 5.3, 6.2, 6.7, 20.7_

  - [x]* 31.4 Write database test for technique access
    - Create techniques with and without student access
    - Attempt query from student role
    - Verify only authorized techniques returned
    - _Requirements: 7.1, 7.3, 7.6, 21.7_

  - [x]* 31.5 Write database test for write prevention
    - Attempt INSERT/UPDATE/DELETE on lessons from student role
    - Verify all operations return 403 (permission denied)
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [x] 32. Final checkpoint - Complete implementation verification
  - Run full test suite (unit + property + integration + RLS)
  - Verify all property tests pass with 100+ iterations
  - Verify test coverage Ã¢â€°Â¥ 80%
  - Test complete workflows manually:
    - Student logs in Ã¢â€ â€™ sees dashboard Ã¢â€ â€™ views upcoming lessons Ã¢â€ â€™ views history
    - Student filters history by date and teacher Ã¢â€ â€™ paginate through results
    - Student views plan details Ã¢â€ â€™ expands to see plan days Ã¢â€ â€™ views videos
    - Student accesses library Ã¢â€ â€™ views authorized techniques Ã¢â€ â€™ watches video
    - Student updates profile Ã¢â€ â€™ verifies changes saved
  - Verify error messages are user-friendly and non-leaky
  - Verify all RLS policies block unauthorized access
  - Verify real-time subscriptions work (cancelled lesson disappears)
  - Verify pagination works correctly (default 20, max 100)
  - Verify multi-teacher aggregation correct
  - Verify cancelled/no_show lessons excluded everywhere
  - Verify private_notes never visible
  - Ask user if questions arise

- [x] 33. Documentation and cleanup
  - [x] 33.1 Add code comments to complex functions
    - JSDoc comments on all exported service functions
    - Document authorization logic (RLS dependencies)
    - Document multi-teacher aggregation in dashboard
    - Document pagination implementation

  - [x] 33.2 Create database schema documentation
    - Document RLS policies purpose for student portal
    - Document column-level security for private_notes
    - Document indexes created for performance

  - [x] 33.3 Update README with student portal docs
    - Document student portal architecture
    - Document API endpoints (18+)
    - Document authorization model
    - Document real-time features

  - [x] 33.4 Create student portal user guide (optional)
    - Screenshot walkthrough of dashboard
    - How to filter history
    - How to view plans and videos
    - How to manage profile

  - [x] 33.5 Clean up temporary files
    - Remove any console.logs from production code
    - Verify no debug endpoints remain
    - Verify all tests pass before marking complete

## Notes

- Tasks marked with `*` are optional property-based and integration testing tasks; can be skipped for faster MVP
- Each task references specific requirements for full traceability
- Checkpoints ensure incremental validation at key milestones (service layer, API layer, integration)
- Property tests validate 60+ correctness properties from the design document
- All student portal access is read-only (RLS prevents all writes)
- All lessons queries exclude cancelled and no_show statuses (status filtering in RLS)
- Private_notes excluded at database level via RLS column filtering
- Multi-teacher students see aggregated data with teacher identification in all responses
- Dashboard optimized for <2 second performance (single query with indexes)
- Pagination default 20 items, max 100 per page
- All timestamps stored in UTC, displayed in local timezone via client logic
- Enrollment-based authorization verified at API and RLS levels
- Video access authorization checks both lesson association and technique paths
- Real-time subscriptions ensure data consistency (<5 second updates)
- Error responses never expose sensitive data (generic 403 messages, no ID leakage)
- Teacher names cached/efficiently joined to prevent N+1 queries
- Date validation requires ISO 8601 format (YYYY-MM-DD)
- Profile updates validate fullName (2-255 chars), prevent email modification
- All responses follow standard format {data, meta} with pagination metadata where applicable
