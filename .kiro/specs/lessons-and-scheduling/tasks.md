# Implementation Plan: Lessons and Scheduling

## Overview

This implementation plan establishes the lessons and scheduling module for the Jiu-Jitsu platform. The module manages concrete lesson occurrences, distinguishing between planning (intent) and reality (execution). It implements timezone-aware scheduling, weekly recurring slot patterns, comprehensive status tracking, and student access to their lessons and history.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- PostgreSQL with RLS policies for data isolation
- Supabase for database and authentication
- Mux for video playback with signed URLs
- shadcn/ui for UI components
- fast-check for property-based testing

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create weekly_slots table migration
    - Create `supabase/migrations/[timestamp]_create_weekly_slots_table.sql`
    - Define weekly_slots table: id (UUID, PK), teacher_id (UUID, FK), enrollment_id (UUID, FK), weekday (INTEGER 0-6), start_time (TIME), end_time (TIME), valid_from (DATE nullable), valid_until (DATE nullable), status (ENUM), created_at, updated_at
    - Add constraint: end_time > start_time
    - Add constraint: valid_until >= valid_from (if both provided)
    - Add indexes on teacher_id, enrollment_id, status
    - _Requirements: 2.1, 2.2, 2.3, 4.5, 4.7_

  - [x] 1.2 Create lessons table migration
    - Create `supabase/migrations/[timestamp]_create_lessons_table.sql`
    - Define lessons table: id (UUID, PK), teacher_id (UUID, FK), enrollment_id (UUID, FK), plan_day_id (UUID, FK nullable), starts_at (TIMESTAMPTZ), ends_at (TIMESTAMPTZ), status (ENUM), shared_notes (TEXT nullable, max 5000), private_notes (TEXT nullable, max 5000), completed_at (TIMESTAMPTZ nullable), created_at, updated_at
    - Add constraint: ends_at > starts_at
    - Add constraint: duration <= 8 hours (28800 seconds)
    - Add indexes on teacher_id, enrollment_id, starts_at, status, plan_day_id
    - _Requirements: 1.5, 1.6, 1.7, 16.1, 30.1_

  - [x] 1.3 Create lesson_videos table migration
    - Create `supabase/migrations/[timestamp]_create_lesson_videos_table.sql`
    - Define lesson_videos table: id (UUID, PK), lesson_id (UUID, FK), video_id (UUID, FK), source (ENUM 'plan'|'manual'), sort_order (INTEGER), created_at
    - Add unique constraint on (lesson_id, video_id)
    - Add indexes on lesson_id, video_id
    - _Requirements: 9.5, 10.6, 12.3_

  - [x] 1.4 Create ENUM types migration
    - Create `supabase/migrations/[timestamp]_create_enums.sql`
    - Define enum_slot_status: 'active', 'paused'
    - Define enum_lesson_status: 'scheduled', 'completed', 'cancelled', 'no_show'
    - Define enum_video_source: 'plan', 'manual'
    - _Requirements: 2.6, 22.1, 22.2_

  - [x] 1.5 Create RLS policies for weekly_slots
    - Create `supabase/migrations/[timestamp]_add_weekly_slots_rls_policies.sql`
    - Enable RLS on weekly_slots table
    - Policy: Teachers SELECT own weekly_slots (teacher_id = auth.uid())
    - Policy: Teachers INSERT own weekly_slots
    - Policy: Teachers UPDATE own weekly_slots
    - Policy: Teachers DELETE own weekly_slots
    - _Requirements: 2.7, 4.6, 31.1_

  - [x] 1.6 Create RLS policies for lessons
    - Create `supabase/migrations/[timestamp]_add_lessons_rls_policies.sql`
    - Enable RLS on lessons table
    - Policy: Teachers SELECT own lessons (teacher_id = auth.uid())
    - Policy: Teachers INSERT own lessons
    - Policy: Teachers UPDATE own lessons
    - Policy: Teachers UPDATE status field only (via status change endpoint)
    - Policy: Students SELECT own lessons through enrollments (no private_notes)
    - Student query: no private_notes field, filter by enrollment
    - _Requirements: 13.5, 31.1, 31.2, 31.7_

  - [x] 1.7 Create RLS policies for lesson_videos
    - Create `supabase/migrations/[timestamp]_add_lesson_videos_rls_policies.sql`
    - Enable RLS on lesson_videos table
    - Policy: Teachers access through lesson ownership
    - Policy: Students access through lesson ownership (for view, not manipulation)
    - _Requirements: 31.1, 31.2_

  - [x] 1.8 Create database utility triggers
    - Add updated_at trigger function for weekly_slots, lessons
    - Add validation trigger for lesson duration (ends_at - starts_at <= 8 hours)
    - _Requirements: 30.1, 1.7_

- [x] 2. Environment and service setup
  - [x] 2.1 Verify Supabase client instances exist
    - Confirm `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts` from auth module
    - _Requirements: 31.5_

  - [x] 2.2 Verify Mux client initialization
    - Confirm `lib/mux/client.ts` and playback URL generation from video library module
    - _Requirements: 26.3_

- [x] 3. TypeScript type definitions
  - [x] 3.1 Create lesson types
    - Create `types/lesson.ts`
    - Define WeeklySlot interface: id, teacherId, enrollmentId, weekday, startTime, endTime, validFrom, validUntil, status, createdAt, updatedAt
    - Define Lesson interface: id, teacherId, enrollmentId, planDayId, startsAt, endsAt, status, sharedNotes, privateNotes, completedAt, createdAt, updatedAt
    - Define LessonStatus type: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
    - _Requirements: 1.6, 16.1, 22.1_

  - [x] 3.2 Create lesson video types
    - Define LessonVideo interface: id, lessonId, videoId, source, sortOrder, createdAt
    - Define VideoSource type: 'plan' | 'manual'
    - Define LessonDetail interface with nested enrollment, planDay, videos
    - _Requirements: 9.5, 27.1_

  - [x] 3.3 Create student view types
    - Define StudentLessonView interface: id, startsAt, endsAt, status, teacherName, sharedNotes, planDay, videos
    - Define StudentUpcomingLesson interface
    - _Requirements: 24.3, 25.3, 26.2_

  - [x] 3.4 Create validation and API types
    - Define WeeklySlotInput, LessonInput, LessonStatusChangeInput types
    - Define LessonConflict, LessonStats interfaces
    - Export all types from `types/index.ts`
    - _Requirements: 1.7, 29.4_

- [x] 4. Validation utilities
  - [x] 4.1 Create lesson validation helpers
    - Create `lib/utils/lesson-validation.ts`
    - Implement validateWeekday() - check 0-6 range
    - Implement validateTimeFormat() - check HH:MM:SS
    - Implement validateDateRange() - check start <= end
    - Implement validateTimeRange() - check start < end for lesson times
    - Implement validateLessonDuration() - check <= 8 hours
    - Implement validateISOTimestamp() - check valid ISO 8601 with timezone
    - _Requirements: 2.3, 2.4, 17.2, 30.2, 33.1, 33.2_

  - [x] 4.2 Create Zod validation schemas
    - Define weeklySlotSchema with Zod validation
    - Define lessonSchema with start/end validation
    - Define lessonStatusChangeSchema
    - Define lessonGenerationSchema
    - Define lessonVideoAssociationSchema
    - _Requirements: 2.1, 1.1, 19.1, 9.1, 10.1_

- [x] 5. Service layer - Weekly slots service
  - [x] 5.1 Implement weekly slot creation function
    - Create `lib/services/weekly-slots.service.ts`
    - Implement createWeeklySlot(teacherId, enrollmentId, weekday, startTime, endTime, validFrom, validUntil)
    - Validate enrollment belongs to teacher (RLS will enforce, but validate for better error)
    - Validate weekday 0-6, time format, and constraints
    - Return WeeklySlot with auto-generated id and timestamps
    - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 5.2 Write property test for weekly slot creation
    - **Property 1: Valid Weekly Slot Creation**
    - **Validates: Requirements 2.1, 2.3**
    - Test that any valid weekday/time creates slot with active status

  - [x] 5.3 Implement weekly slot retrieval functions
    - Implement getWeeklySlotsForEnrollment(teacherId, enrollmentId)
    - Implement getActiveWeeklySlots(enrollmentId) - filter by valid dates and status
    - Return array sorted by weekday ASC
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 5.4 Implement weekly slot update function
    - Implement updateWeeklySlot(teacherId, slotId, updates: Partial<WeeklySlot>)
    - Allow updates to: weekday, startTime, endTime, validFrom, validUntil, status
    - Validate all constraints
    - Do NOT modify existing lessons
    - Return updated WeeklySlot
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x]* 5.5 Write property test for slot update validation
    - **Property 6: Weekly Slot Time Validation**
    - **Validates: Requirements 5.1, 5.2**
    - Test that any invalid time constraint is rejected

  - [x] 5.6 Implement slot pause/activate functions
    - Implement pauseWeeklySlot(teacherId, slotId)
    - Implement activateWeeklySlot(teacherId, slotId)
    - Update status field, preserve existing lessons
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 5.7 Implement slot deletion with safety check
    - Implement deleteWeeklySlot(teacherId, slotId)
    - Check for existing lessons with matching times and enrollment
    - Return 409 if lessons exist with suggestions to pause instead
    - Use transaction to prevent race conditions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [x]* 5.8 Write property test for slot deletion safety
    - **Property 11: Slot Deletion Prevention**
    - **Validates: Requirements 7.2, 7.3**
    - Test that attempting to delete slot with lessons returns conflict

- [x] 6. Service layer - Lesson generation service
  - [x] 6.1 Implement lesson generation from slots
    - Create `lib/services/lesson-generation.service.ts`
    - Implement generateLessonsFromSlots(teacherId, fromDate, toDate, enrollmentIds?, dryRun=true)
    - For each active slot within date range:
      - Calculate all occurrences for weekday
      - Apply teacher's timezone to create TIMESTAMPTZ lessons
      - Detect conflicts with existing lessons
    - Return { generatedLessons, conflicts, summary }
    - Set dryRun=true by default (don't persist)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

  - [x]* 6.2 Write property test for lesson generation
    - **Property 3: Lesson Generation Consistency**
    - **Validates: Requirements 3.1, 3.2**
    - Test that any slot generates correct number of occurrences

  - [x] 6.2 Implement conflict detection logic
    - Implement detectConflicts(teacherId, lesson: Partial<Lesson>)
    - Check for overlapping lessons with status='scheduled' (ignore completed/cancelled/no_show)
    - Consider starts_at and ends_at ranges
    - Return array of conflicting lessons
    - _Requirements: 29.1, 29.2, 29.3, 29.6_

  - [x]* 6.3 Write property test for conflict detection
    - **Property 9: Conflict Detection Accuracy**
    - **Validates: Requirements 29.1, 29.2**
    - Test that any overlapping time is detected

  - [x] 6.3 Implement lesson creation from generation
    - Implement confirmLessonGeneration(teacherId, generatedLessons: LessonInput[])
    - Create all lessons in single transaction
    - Validate each lesson before creation
    - Return created Lesson[]
    - _Requirements: 3.5_

- [x] 7. Service layer - Lesson service
  - [x] 7.1 Implement individual lesson creation
    - Create `lib/services/lesson.service.ts`
    - Implement createLesson(teacherId, enrollmentId, startsAt, endsAt, planDayId?, sharedNotes?, privateNotes?)
    - Validate all inputs, check ownership
    - Detect conflicts and return warning in response (not error)
    - Create lesson with status='scheduled'
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 29.5_

  - [x]* 7.2 Write property test for lesson creation
    - **Property 2: Individual Lesson Creation**
    - **Validates: Requirements 1.1, 1.4, 1.5**
    - Test that any valid input creates lesson with scheduled status

  - [x] 7.3 Implement lesson retrieval functions
    - Implement getLessonById(teacherId, lessonId)
    - Implement getLessonsForEnrollment(teacherId, enrollmentId, filters: {status, fromDate, toDate, page, pageSize})
    - Implement getLessonsForTeacher(teacherId, filters)
    - Include full details: enrollment info, plan day, video count
    - _Requirements: 13.1, 15.1, 15.3, 15.4, 15.5, 15.6, 16.1_

  - [x] 7.4 Implement lesson update function
    - Implement updateLesson(teacherId, lessonId, updates: Partial<Lesson>)
    - Allow updates to: startsAt, endsAt, planDayId, sharedNotes, privateNotes
    - Prevent time/plan updates if status='completed' (throw 409)
    - Allow note updates on any status
    - Detect conflicts for time changes
    - _Requirements: 17.1, 17.2, 17.3, 17.6, 18.1_

  - [x]* 7.5 Write property test for lesson update restrictions
    - **Property 7: Completed Lesson Immutability**
    - **Validates: Requirements 17.6, 19.6, 27.1**
    - Test that any attempt to modify times on completed lesson fails

  - [x] 7.6 Implement lesson status transition function
    - Implement changeLesson Status(teacherId, lessonId, newStatus, reason?)
    - Validate status transitions: scheduled Ã¢â€ â€™ (completed|cancelled|no_show), no other transitions allowed
    - Allow completed only if not too far in future (7 days), warn if >30 days past
    - Set completedAt timestamp when completing
    - _Requirements: 19.1, 19.2, 19.3, 20.1, 20.2, 20.6, 21.1, 21.2, 22.1, 22.2_

  - [x]* 7.7 Write property test for status transitions
    - **Property 8: Valid Status Transitions**
    - **Validates: Requirements 22.1, 22.2, 22.4, 22.6**
    - Test that only valid transitions are allowed, invalid return 409

  - [x] 7.8 Implement lesson time and timezone handling
    - Store all timestamps as TIMESTAMPTZ (UTC)
    - Accept ISO 8601 with timezone info
    - Apply teacher's timezone for display (in API response metadata)
    - Return all timestamps in ISO 8601 UTC format
    - _Requirements: 30.1, 30.2, 30.3, 30.5, 30.7_

  - [x]* 7.9 Write property test for timezone handling
    - **Property 10: UTC Timestamp Storage**
    - **Validates: Requirements 30.1, 30.2, 30.5**
    - Test that any lesson time stored in UTC regardless of input timezone

  - [x] 7.10 Implement lesson duration validation
    - Check ends_at > starts_at
    - Check duration <= 8 hours
    - Throw validation error otherwise
    - _Requirements: 1.3, 17.2, 33.2, 33.3_

- [x] 8. Service layer - Lesson video service
  - [x] 8.1 Implement video association to lesson
    - Create `lib/services/lesson-video.service.ts`
    - Implement associateVideoToLesson(teacherId, lessonId, videoId, source='manual', sortOrder?)
    - Validate lesson and video belong to teacher
    - Validate video status='ready' (not archived/processing)
    - Check for duplicates (409 conflict)
    - Check lesson status != 'completed' (409 conflict)
    - Default sortOrder to max existing + 1
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.7, 27.2_

  - [x]* 8.2 Write property test for video association
    - **Property 12: Video Association Validation**
    - **Validates: Requirements 10.3, 10.6**
    - Test that duplicate video association is rejected

  - [x] 8.3 Implement bulk copy videos from plan day
    - Implement copyVideosFromPlanDay(teacherId, lessonId)
    - Lesson must have plan_day_id set
    - Copy all video associations from plan_day_videos with source='plan'
    - Preserve sort_order from plan day
    - Skip duplicates (video already in lesson)
    - Check lesson status != 'completed' (409)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 27.2_

  - [x]* 8.4 Write property test for plan copy
    - **Property 13: Plan Video Copy**
    - **Validates: Requirements 9.1, 9.4**
    - Test that copying plan videos preserves sort order and marks source

  - [x] 8.5 Implement video removal from lesson
    - Implement removeVideoFromLesson(teacherId, lessonId, videoId)
    - Check lesson status != 'completed' (409)
    - Delete lesson_videos record
    - Auto-reorder remaining videos (fix sort_order gaps)
    - Do NOT affect video library or plan associations
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.7_

  - [x] 8.6 Implement video reordering
    - Implement reorderVideos(teacherId, lessonId, updates: Array<{lessonVideoId, sortOrder}>)
    - Validate all records belong to same lesson
    - Check lesson status != 'completed' (409)
    - Update all sort_order values in transaction
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 27.2_

  - [x]* 8.7 Write property test for video reordering
    - **Property 14: Video Reorder Immutability on Completed Lesson**
    - **Validates: Requirements 12.6, 27.2**
    - Test that reordering completed lesson videos fails

- [x] 9. Service layer - Student lesson access
  - [x] 9.1 Implement student upcoming lessons retrieval
    - Create `lib/services/student-lesson.service.ts`
    - Implement getStudentUpcomingLessons(studentId)
    - Query lessons where: enrollment links to student, status='scheduled', starts_at > now
    - Return first lesson only (ordered by starts_at ASC)
    - Exclude private_notes, return StudentLessonView format
    - _Requirements: 24.1, 24.2, 24.3_

  - [x]* 9.2 Write property test for student upcoming access
    - **Property 15: Student Upcoming Lesson Filtering**
    - **Validates: Requirements 24.1, 24.2**
    - Test that only scheduled future lessons are returned

  - [x] 9.2 Implement student lesson history retrieval
    - Implement getStudentLessonHistory(studentId, page=1, pageSize=20)
    - Query lessons where: enrollment links to student, status='completed', starts_at <= now
    - Sort by starts_at DESC (most recent first)
    - Pagination support
    - Exclude private_notes
    - _Requirements: 25.1, 25.2, 25.3, 25.5, 25.7_

  - [x]* 9.3 Write property test for student history access
    - **Property 16: Student History Filtering and Ordering**
    - **Validates: Requirements 25.2, 25.5**
    - Test that only completed past lessons returned in correct order

  - [x] 9.3 Implement student lesson detail retrieval
    - Implement getStudentLessonDetail(studentId, lessonId)
    - Verify lesson belongs to student's enrollment (RLS)
    - Include: times, teacher name, plan day (title, objective), shared_notes, videos with playback URLs
    - Exclude: private_notes, video source field
    - For completed lessons: include Mux signed playback URLs
    - For future lessons: include thumbnail URLs
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 9.4 Add student enrollment RLS filtering
    - Verify all student queries go through enrollments table
    - Test direct RLS rejection of unauthorized access
    - _Requirements: 24.4, 25.4, 26.4, 31.2_

- [x] 10. Service layer - Teacher agenda views
  - [x] 10.1 Implement weekly agenda retrieval
    - Create `lib/services/agenda.service.ts`
    - Implement getWeeklyAgenda(teacherId, weekStartDate?)
    - Calculate week boundaries (Monday-Sunday or Sunday-Saturday)
    - Query all lessons for that week
    - Include: enrollment details, plan day reference, video count
    - Sort by starts_at ASC
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7_

  - [x] 10.2 Implement daily agenda retrieval
    - Implement getDailyAgenda(teacherId, date?)
    - Query all lessons for that date
    - Include: full enrollment details, status, video information
    - Sort by starts_at ASC
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

  - [x] 10.3 Implement lesson statistics calculation
    - Implement getLessonStats(teacherId, enrollmentId?, fromDate?, toDate?)
    - Calculate counts per status: scheduled, completed, cancelled, no_show
    - Calculate completion rate: completed / (completed + no_show)
    - Support date range filtering
    - _Requirements: 32.1, 32.2, 32.3, 32.5, 32.6_

  - [x]* 10.4 Write property test for statistics
    - **Property 17: Statistics Accuracy**
    - **Validates: Requirements 32.5**
    - Test that stats calculated from actual lesson records match queries

- [x] 11. Checkpoint - Service layer complete
  - Run all unit tests for services
  - Run all property tests
  - Verify database interactions with local Supabase
  - Verify RLS policies enforce correctly
  - Ask user if questions arise

- [x] 12. API Routes - Weekly slot endpoints
  - [x] 12.1 Create POST /api/weekly-slots endpoint
    - Create `app/api/weekly-slots/route.ts`
    - Validate request body with weeklySlotSchema
    - Call weekly-slots.service createWeeklySlot
    - Return WeeklySlot with 201 status
    - Handle validation errors (400) and authorization errors
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 12.2 Write unit test for POST /api/weekly-slots
    - Test valid slot creation returns 201
    - Test invalid weekday returns 400
    - Test invalid time range returns 400
    - Test unauthenticated request returns 401

  - [x] 12.3 Create GET /api/weekly-slots endpoint
    - Query params: enrollmentId (required)
    - Call weekly-slots.service getActiveWeeklySlots
    - Return array sorted by weekday
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 12.4 Write unit test for GET /api/weekly-slots
    - Test enrollment filter
    - Test unauthorized access returns empty (RLS)
    - Test sorting by weekday

  - [x] 12.5 Create PATCH /api/weekly-slots/[id] endpoint
    - Allow updates to: weekday, startTime, endTime, validFrom, validUntil, status
    - Call weekly-slots.service updateWeeklySlot
    - Return updated WeeklySlot
    - Handle 404 if not found
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 12.6 Create POST /api/weekly-slots/[id]/pause endpoint
    - Call weekly-slots.service pauseWeeklySlot
    - Return WeeklySlot with status='paused'
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 12.7 Create POST /api/weekly-slots/[id]/activate endpoint
    - Call weekly-slots.service activateWeeklySlot
    - Return WeeklySlot with status='active'
    - _Requirements: 6.1, 6.3_

  - [x] 12.8 Create DELETE /api/weekly-slots/[id] endpoint
    - Call weekly-slots.service deleteWeeklySlot
    - Return 409 if lessons exist with detailed error message
    - Return 204 on success
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 13. API Routes - Lesson generation endpoints
  - [x] 13.1 Create POST /api/lessons/generate-from-slots endpoint
    - Create `app/api/lessons/generate-from-slots/route.ts`
    - Body: {fromDate, toDate, enrollmentIds?, dryRun=true}
    - Call lesson-generation.service generateLessonsFromSlots with dryRun=true (preview mode)
    - Return {generatedLessons, conflicts, summary, requiresConfirmation}
    - Handle date range validation (max 90 days)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x]* 13.2 Write unit test for lesson generation
    - Test valid date range generates lessons
    - Test date range > 90 days returns 400
    - Test conflict detection works

  - [x] 13.2 Create POST /api/lessons/confirm-generation endpoint
    - Create `app/api/lessons/confirm-generation/route.ts`
    - Body: {generatedLessons: LessonInput[]}
    - Call lesson-generation.service confirmLessonGeneration
    - Persist all lessons to database
    - Return created lessons
    - _Requirements: 3.5_

- [x] 14. API Routes - Lesson management endpoints
  - [x] 14.1 Create POST /api/lessons endpoint
    - Create `app/api/lessons/route.ts`
    - Body: {enrollmentId, startsAt, endsAt, planDayId?, sharedNotes?, privateNotes?}
    - Call lesson.service createLesson
    - Return {data: Lesson, meta: {conflictWarning?: ...}} with 201
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 29.4, 29.5_

  - [x]* 14.2 Write unit test for POST /api/lessons
    - Test valid lesson creation returns 201
    - Test conflict warning in response (not error)
    - Test invalid time range returns 400
    - Test unauthorized enrollment returns 400

  - [x] 14.3 Create GET /api/lessons endpoint
    - Query params: enrollmentId?, status?, fromDate?, toDate?, page?, pageSize?
    - Call lesson.service getLessonsForTeacher
    - Return paginated Lesson[]
    - _Requirements: 13.1, 15.1, 15.3, 15.4, 15.5_

  - [x] 14.4 Create GET /api/lessons/[id] endpoint
    - Call lesson.service getLessonById
    - Return LessonDetail with all relationships
    - Return 404 if not found or unauthorized
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x]* 14.5 Write unit test for GET /api/lessons/[id]
    - Test authorized access returns full details
    - Test unauthorized access returns 404
    - Test video list included

  - [x] 14.6 Create PATCH /api/lessons/[id] endpoint
    - Body: {startsAt?, endsAt?, planDayId?, sharedNotes?, privateNotes?}
    - Call lesson.service updateLesson
    - Return updated Lesson
    - Return 409 if trying to modify times on completed lesson
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 18.1, 18.2_

  - [x] 14.7 Create PATCH /api/lessons/[id]/status endpoint
    - Body: {status: 'completed'|'cancelled'|'no_show', reason?}
    - Call lesson.service changeLesson Status
    - Return updated Lesson with new status
    - Return 409 on invalid status transition
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 20.1, 20.2, 20.6, 21.1, 21.2, 22.1, 22.5, 22.6_

  - [x]* 14.8 Write unit test for status changes
    - Test scheduled Ã¢â€ â€™ completed succeeds
    - Test completed Ã¢â€ â€™ cancelled returns 409
    - Test invalid status returns 400

- [x] 15. API Routes - Lesson video endpoints
  - [x] 15.1 Create POST /api/lessons/[id]/videos endpoint
    - Body: {videoId, sortOrder?}
    - Call lesson-video.service associateVideoToLesson
    - Return LessonVideo with 201
    - Return 409 if duplicate or completed lesson
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 15.2 Write unit test for POST /api/lessons/[id]/videos
    - Test valid video association returns 201
    - Test duplicate video returns 409
    - Test completed lesson returns 409

  - [x] 15.3 Create POST /api/lessons/[id]/copy-videos-from-plan endpoint
    - Body: {} (lesson must have plan_day_id)
    - Call lesson-video.service copyVideosFromPlanDay
    - Return array of created LessonVideo[]
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 15.4 Create DELETE /api/lessons/[id]/videos/[videoId] endpoint
    - Call lesson-video.service removeVideoFromLesson
    - Return 204 on success
    - Return 409 if lesson is completed
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 15.5 Create PATCH /api/lessons/[id]/videos/reorder endpoint
    - Body: {updates: Array<{lessonVideoId, sortOrder}>}
    - Call lesson-video.service reorderVideos
    - Return updated LessonVideo[]
    - Return 409 if lesson is completed
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 16. API Routes - Agenda endpoints
  - [x] 16.1 Create GET /api/agenda/weekly endpoint
    - Query: weekStartDate?
    - Call agenda.service getWeeklyAgenda
    - Return lessons with enrollment details and video count
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 16.2 Create GET /api/agenda/daily endpoint
    - Query: date?
    - Call agenda.service getDailyAgenda
    - Return lessons with full details
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 16.3 Create GET /api/lessons/stats endpoint
    - Query: enrollmentId?, fromDate?, toDate?
    - Call agenda.service getLessonStats
    - Return array with counts and completion rates
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7_

- [x] 17. API Routes - Student endpoints
  - [x] 17.1 Create GET /api/student/lessons/upcoming endpoint
    - Create `app/api/student/lessons/upcoming/route.ts`
    - Call student-lesson.service getStudentUpcomingLessons
    - Return StudentLessonView (first lesson only, or null)
    - No authentication check needed (RLS handles it via enrollments)
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [x]* 17.2 Write unit test for GET /api/student/lessons/upcoming
    - Test returns first scheduled future lesson
    - Test returns null if none exist

  - [x] 17.3 Create GET /api/student/lessons/history endpoint
    - Query: page?, pageSize?
    - Call student-lesson.service getStudentLessonHistory
    - Return paginated StudentLessonView[]
    - Sort by starts_at DESC
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [x]* 17.4 Write unit test for GET /api/student/lessons/history
    - Test returns only completed lessons
    - Test pagination works
    - Test sorted descending

  - [x] 17.5 Create GET /api/student/lessons/[id] endpoint
    - Call student-lesson.service getStudentLessonDetail
    - Return StudentLessonView
    - Return 404 if not found or unauthorized
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_

- [x] 18. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify authentication and authorization on all routes
  - Test RLS policies block unauthorized access
  - Verify pagination works on list endpoints
  - Verify error responses follow standard format
  - Ask user if questions arise

- [x] 19. Frontend - shadcn/ui component setup
  - [x] 19.1 Install required shadcn/ui components
    - Run `npx shadcn-ui@latest add button input label form card alert dialog tabs select`
    - Verify components installed to `components/ui/`
    - Run `npx shadcn-ui@latest add calendar popover time-picker`

  - [x] 19.2 Create date/time picker utilities
    - Create `lib/utils/date-picker.ts`
    - Helper functions for formatting dates and times with timezone context
    - Use date-fns library for date manipulation
    - Apply teacher timezone for display

- [x] 20. Frontend - Lesson components for teachers
  - [x] 20.1 Create LessonCard component
    - Create `components/lessons/LessonCard.tsx` as server component
    - Display: time, student name, status badge, video count
    - Links to detail modal or edit form
    - Visual status indicators (completed=green, scheduled=blue, etc.)
    - _Requirements: 13.3, 13.4_

  - [x] 20.2 Create LessonForm component
    - Create `components/lessons/LessonForm.tsx` as client component
    - Fields: enrollment (dropdown), start time, end time, plan day (optional), shared_notes, private_notes
    - Date/time pickers with timezone context
    - Client-side Zod validation
    - Call POST /api/lessons on submit
    - Show conflict warning with override option
    - _Requirements: 1.1, 17.1, 29.4_

  - [x] 20.3 Create LessonDetailModal component
    - Create `components/lessons/LessonDetailModal.tsx` as client component
    - Display full lesson details
    - Editable fields: sharedNotes, privateNotes (always)
    - Editable fields: times, planDayId (if not completed)
    - Status change buttons
    - Video list with add/remove/reorder options
    - _Requirements: 16.4, 17.1, 18.1, 18.2, 19.1_

  - [x] 20.4 Create LessonStatusChangeDialog component
    - Create `components/lessons/LessonStatusChangeDialog.tsx` as client component
    - Modal for changing status: completed, cancelled, no_show
    - Reason/notes text area
    - Call PATCH /api/lessons/[id]/status on submit
    - Show warning if completing future lesson
    - _Requirements: 19.1, 20.1, 21.1_

  - [x] 20.5 Create WeeklySlotForm component
    - Create `components/scheduling/WeeklySlotForm.tsx` as client component
    - Fields: enrollment, weekday (radio), start time, end time, valid date range
    - Call POST /api/weekly-slots on submit
    - _Requirements: 2.1, 2.2_

  - [x] 20.6 Create WeeklySlotList component
    - Create `components/scheduling/WeeklySlotList.tsx` as client component
    - Fetch from GET /api/weekly-slots
    - Display table with: weekday, times, valid dates, status
    - Edit/Pause/Delete/Activate buttons
    - _Requirements: 4.1, 4.2, 5.1, 6.1_

  - [x] 20.7 Create LessonGenerationWizard component
    - Create `components/scheduling/LessonGenerationWizard.tsx` as client component
    - Step 1: Date range picker (max 90 days)
    - Step 2: Enrollment filter (optional, show all if not filtered)
    - Step 3: Preview with conflict warnings
    - Step 4: Confirm and generate
    - Call POST /api/lessons/generate-from-slots then POST /api/lessons/confirm-generation
    - _Requirements: 3.1, 3.4, 3.5_

- [x] 21. Frontend - Video management components
  - [x] 21.1 Create VideoSelector component
    - Create `components/lessons/VideoSelector.tsx` as client component
    - Dropdown/modal for selecting from teacher's video library
    - Search/filter by title or technique
    - Call POST /api/lessons/[id]/videos on select
    - Show toast notification on success
    - _Requirements: 10.1, 10.2_

  - [x] 21.2 Create LessonVideoList component
    - Create `components/lessons/LessonVideoList.tsx` as client component
    - Display all videos for a lesson with source indicator (plan/manual)
    - Drag-and-drop reordering
    - Call PATCH /api/lessons/[id]/videos/reorder on drop
    - Delete buttons for each video (disabled if completed)
    - Copy from plan button (if plan_day_id set and not completed)
    - _Requirements: 9.1, 12.1, 12.2_

  - [x] 21.3 Create VideoPlayer component
    - Create `components/video/VideoPlayer.tsx` as client component
    - Embed Mux player with signed URL
    - Display title, duration, thumbnail
    - Full-screen option
    - _Requirements: 26.3_

- [x] 22. Frontend - Agenda views
  - [x] 22.1 Create TeacherScheduleView component
    - Create `components/agenda/TeacherScheduleView.tsx` as server component
    - Tab selector: Week/Day view
    - Date navigation (prev/next)
    - Fetch from GET /api/agenda/weekly or GET /api/agenda/daily
    - Render LessonCard for each lesson
    - _Requirements: 13.1, 14.1_

  - [x] 22.2 Create WeeklyAgendaCalendar component
    - Create `components/agenda/WeeklyAgendaCalendar.tsx` as client component
    - Calendar grid showing 7 days
    - Lessons displayed as blocks in time slots
    - Click to see details or edit
    - _Requirements: 13.1, 13.3_

  - [x] 22.3 Create DailyAgendaList component
    - Create `components/agenda/DailyAgendaList.tsx` as client component
    - Vertical timeline showing all lessons for day
    - Sorted by time
    - Edit/mark complete buttons inline
    - _Requirements: 14.1, 14.3_

- [x] 23. Frontend - Teacher pages
  - [x] 23.1 Create teacher schedule page
    - Create `app/(teacher)/schedule/page.tsx` as server component
    - Render TeacherScheduleView component
    - Protected by middleware (teacher role)
    - _Requirements: 13.1_

  - [x] 23.2 Create lesson details page (optional)
    - Create `app/(teacher)/lessons/[id]/page.tsx` as server component
    - Fetch lesson details from GET /api/lessons/[id]
    - Render LessonDetailModal or full-page view
    - Edit and manage content
    - _Requirements: 16.1_

  - [x] 23.3 Create weekly slots management page
    - Create `app/(teacher)/settings/schedule/page.tsx` as server component
    - Enrollment selector dropdown
    - WeeklySlotList component
    - WeeklySlotForm component
    - LessonGenerationWizard component
    - _Requirements: 4.1, 2.1_

- [x] 24. Frontend - Student pages
  - [x] 24.1 Create student agenda page
    - Create `app/(student)/my-agenda/page.tsx` as server component
    - Display StudentUpcomingLesson (next class)
    - Display StudentLessonHistory (past classes)
    - Link to view full details
    - _Requirements: 24.1, 25.1_

  - [x] 24.2 Create student lesson detail page
    - Create `app/(student)/lessons/[id]/page.tsx` as server component
    - Fetch from GET /api/student/lessons/[id]
    - Display times, teacher, plan day reference, shared_notes
    - Embed VideoPlayer components for each video
    - Read-only view
    - _Requirements: 26.1, 26.2, 26.3_

  - [x] 24.3 Create student lesson history page
    - Create `app/(student)/history/page.tsx` as server component
    - Paginated list of completed lessons
    - Each row: date, teacher, video count, preview of shared_notes
    - Link to full lesson details
    - _Requirements: 25.1, 25.5, 25.7_

- [x] 25. Custom hooks for client state
  - [x] 25.1 Create useLessons hook
    - Create `hooks/useLessons.ts`
    - Fetch lessons with filtering (status, date range)
    - Provide createLesson, updateLesson, changeLessonStatus functions
    - Handle loading and error states
    - _Requirements: 1.1, 17.1, 19.1_

  - [x] 25.2 Create useWeeklySlots hook
    - Create `hooks/useWeeklySlots.ts`
    - Fetch slots for enrollment
    - Provide createSlot, updateSlot, pauseSlot, deleteSlot functions
    - _Requirements: 2.1, 5.1_

  - [x] 25.3 Create useAgenda hook
    - Create `hooks/useAgenda.ts`
    - Fetch weekly or daily agenda
    - Handle date navigation
    - _Requirements: 13.1, 14.1_

  - [x] 25.4 Create useStudentLessons hook
    - Create `hooks/useStudentLessons.ts`
    - Fetch upcoming and history lessons
    - Pagination for history
    - _Requirements: 24.1, 25.1_

- [x] 26. Property-based tests for scheduling
  - [x]* 26.1 Write property test for lesson time validity
    - **Property 1: Lesson Time Validity**
    - **Validates: Requirements 1.3, 1.7, 33.2, 33.3**
    - Test that any lesson with end_time <= start_time is rejected

  - [x]* 26.2 Write property test for weekday validation
    - **Property 4: Weekday Validation**
    - **Validates: Requirements 2.3, 2.4**
    - Test that any weekday outside 0-6 is rejected

  - [x]* 26.3 Write property test for time format validation
    - **Property 5: Time Format Validation**
    - **Validates: Requirements 2.4, 4.7**
    - Test that any invalid HH:MM:SS format is rejected

- [x] 27. Property-based tests for data integrity
  - [x]* 27.1 Write property test for status transitions
    - **Property 8: Valid Status Transitions Only**
    - **Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5**
    - Test that only valid transitions are allowed

  - [x]* 27.2 Write property test for lesson immutability
    - **Property 15: Completed Lesson Immutability**
    - **Validates: Requirements 19.6, 27.1, 27.2, 27.3**
    - Test that completed lessons cannot be modified

  - [x]* 27.3 Write property test for video immutability
    - **Property 19: Video Association Immutability**
    - **Validates: Requirements 27.1, 27.2, 27.3, 27.4**
    - Test that videos cannot be modified on completed lessons

- [x] 28. Property-based tests for authorization
  - [x]* 28.1 Write property test for teacher data isolation
    - **Property 20: Teacher Data Isolation**
    - **Validates: Requirements 31.1, 31.2, 31.3, 31.4**
    - Test that any two teachers cannot access each other's lessons

  - [x]* 28.2 Write property test for student access control
    - **Property 21: Student Access Control**
    - **Validates: Requirements 24.4, 25.4, 26.4, 31.2, 31.7**
    - Test that students only see their own lessons without private_notes

  - [x]* 28.3 Write property test for RLS enforcement
    - **Property 22: RLS Enforcement on Queries**
    - **Validates: Requirements 31.5, 31.6, 31.7**
    - Test that direct database queries respect RLS policies

- [x] 29. Integration tests for complete workflows
  - [x]* 29.1 Write integration test for weekly slot to lessons workflow
    - Test: create slots Ã¢â€ â€™ generate lessons Ã¢â€ â€™ review Ã¢â€ â€™ confirm
    - Verify all lessons created with correct times
    - Verify conflict detection worked

  - [x]* 29.2 Write integration test for lesson with videos workflow
    - Test: create lesson Ã¢â€ â€™ add videos Ã¢â€ â€™ reorder Ã¢â€ â€™ complete
    - Verify videos immutable after completion

  - [x]* 29.3 Write integration test for student view workflow
    - Test: student sees upcoming lesson Ã¢â€ â€™ views history Ã¢â€ â€™ accesses specific lesson
    - Verify no private_notes visible

  - [x]* 29.4 Write integration test for status transition workflow
    - Test: scheduled Ã¢â€ â€™ completed/cancelled/no_show
    - Verify completedAt timestamp set
    - Verify immutability after completion

- [x] 30. Unit tests for edge cases
  - [x]* 30.1 Write unit tests for validation edge cases
    - Test timezone validation (valid IANA timezones)
    - Test max/min date ranges
    - Test boundary lesson durations (0s, 8hrs, 8hrs+1s)
    - Test fields at max length (5000 chars for notes)

  - [x]* 30.2 Write unit tests for conflict detection
    - Test overlapping lessons detected
    - Test touching lessons NOT detected (back-to-back)
    - Test different days NOT detected
    - Test completed/cancelled lessons ignored in conflict check

  - [x]* 30.3 Write unit tests for lesson generation
    - Test generating for 0 slots returns empty
    - Test generating for multiple slots returns all occurrences
    - Test paused slots excluded
    - Test date range boundaries handled correctly

- [x] 31. RLS policy verification tests
  - [x]* 31.1 Write direct database test for teacher lesson RLS
    - Create two teachers with lessons
    - Attempt teacher A to query teacher B's lessons with authenticated client
    - Verify no data returned (RLS blocks)
    - _Requirements: 31.1, 31.2_

  - [x]* 31.2 Write direct database test for student lesson RLS
    - Create teacher, two students with different enrollments
    - Attempt student A to query student B's lessons
    - Verify no data returned (RLS blocks)
    - _Requirements: 31.2, 31.7_

  - [x]* 31.3 Write direct database test for private_notes exposure
    - Query lesson from student role
    - Verify private_notes field not returned (RLS column filter)
    - _Requirements: 31.7_

- [x] 32. Final checkpoint - Complete implementation verification
  - Run full test suite (unit + property + integration + RLS)
  - Verify all property tests pass
  - Verify test coverage Ã¢â€°Â¥ 80%
  - Test complete workflows manually:
    - Create weekly slots Ã¢â€ â€™ generate lessons Ã¢â€ â€™ add videos Ã¢â€ â€™ mark complete Ã¢â€ â€™ view student history
    - Create individual lesson Ã¢â€ â€™ conflict detection Ã¢â€ â€™ status transitions
    - Student views upcoming and history
  - Verify error messages are user-friendly and non-leaky
  - Verify timezone handling is correct (UTC storage, teacher display)
  - Verify all RLS policies block unauthorized access
  - Ask user if questions arise

- [x] 33. Documentation and cleanup
  - [x] 33.1 Add code comments to complex functions
    - JSDoc comments on all exported functions
    - Document timezone handling in comments
    - Document RLS policy expectations
    - Document status transition rules

  - [x] 33.2 Create database schema documentation
    - Document each table purpose
    - Document status enums and valid transitions
    - Document RLS policies in code comments

  - [x] 33.3 Update README with lessons and scheduling docs
    - Document new API endpoints
    - Document status transition flows
    - Document timezone configuration

  - [x] 33.4 Clean up temporary test files
    - Remove any console.logs from production code
    - Verify no debug endpoints remain

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- All timestamps stored in UTC regardless of teacher timezone
- Student views never expose private_notes or video source field
- Completed lessons are immutable except for notes
- Status transitions follow state machine pattern (scheduled Ã¢â€ â€™ terminal state)
- Weekly slots do not delete lessons when modified/paused (preserves history)
- Conflict detection only considers scheduled lessons (ignores completed/cancelled/no_show)
- Pagination maximum 100 items per page
- Date range generation maximum 90 days
- Lesson duration maximum 8 hours
- Notes fields maximum 5000 characters each

