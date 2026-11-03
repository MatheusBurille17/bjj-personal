# Implementation Plan: Monthly Plans (Planos Mensais)

## Overview

This implementation plan establishes the Monthly Plans module for the Jiu-Jitsu lessons platform. Monthly plans enable teachers to create pedagogical planning documents that define intended content for specific periods, organizing training content by day/week with associated videos. Plans represent **planning intent**, separate from actual lesson execution (reality). This module provides CRUD operations on plans, plan days, and video associations; enrollment-based access control; lifecycle management (draft Ã¢â€ â€™ published Ã¢â€ â€™ archived); plan duplication for reusability; and strict teacher-based data isolation via RLS policies. Implementation follows a bottom-up approach: database layer Ã¢â€ â€™ service layer Ã¢â€ â€™ API layer Ã¢â€ â€™ frontend components.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- PostgreSQL with RLS policies for data isolation
- Supabase Auth for session management
- shadcn/ui for UI components (Card, Form, Dialog, Badge, Calendar, Table, Pagination)
- Zod for validation schemas
- fast-check for property-based testing (minimum 100 iterations)
- Mux for video playback URL generation (integration with existing video library)

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create monthly_plans table migration
    - Create `supabase/migrations/[timestamp]_create_monthly_plans_table.sql`
    - Define monthly_plans table: id (UUID PK), teacher_id (UUID FK to teachers ON DELETE CASCADE), title (VARCHAR 200 NOT NULL CHECK LENGTH >= 3), description (TEXT nullable), period_start (DATE NOT NULL), period_end (DATE NOT NULL CHECK >= period_start), status (VARCHAR 20 DEFAULT 'draft' CHECK IN ('draft','published','archived')), published_at (TIMESTAMPTZ nullable), archived_at (TIMESTAMPTZ nullable), created_at, updated_at
    - Add indexes: idx_monthly_plans_teacher_id, idx_monthly_plans_status, idx_monthly_plans_period (period_start, period_end)
    - Create trigger for auto-updating updated_at timestamp using update_updated_at_column()
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 31.1, 31.2, 31.5, 31.6_

  - [x] 1.2 Create plan_days table migration
    - Create `supabase/migrations/[timestamp]_create_plan_days_table.sql`
    - Define plan_days table: id (UUID PK), monthly_plan_id (UUID FK to monthly_plans ON DELETE CASCADE), weekday (INTEGER nullable CHECK >= 0 AND <= 6), planned_date (DATE nullable), title (VARCHAR 200 NOT NULL CHECK LENGTH >= 2), objective (TEXT nullable CHECK LENGTH <= 1000), notes (TEXT nullable CHECK LENGTH <= 2000), sort_order (INTEGER NOT NULL DEFAULT 0), created_at, updated_at
    - Add CHECK constraint: (weekday IS NOT NULL OR planned_date IS NOT NULL)
    - Add indexes: idx_plan_days_monthly_plan_id, idx_plan_days_sort_order (monthly_plan_id, sort_order), idx_plan_days_weekday WHERE weekday IS NOT NULL, idx_plan_days_planned_date WHERE planned_date IS NOT NULL
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 31.1, 31.2, 31.7_

  - [x] 1.3 Create plan_day_videos table migration
    - Create `supabase/migrations/[timestamp]_create_plan_day_videos_table.sql`
    - Define plan_day_videos table: id (UUID PK), plan_day_id (UUID FK to plan_days ON DELETE CASCADE), video_id (UUID FK to videos NOT NULL), sort_order (INTEGER NOT NULL DEFAULT 0), created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
    - Add UNIQUE constraint on (plan_day_id, video_id)
    - Add indexes: idx_plan_day_videos_plan_day_id, idx_plan_day_videos_video_id, idx_plan_day_videos_sort_order (plan_day_id, sort_order)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [x] 1.4 Create plan_enrollments table migration
    - Create `supabase/migrations/[timestamp]_create_plan_enrollments_table.sql`
    - Define plan_enrollments table: id (UUID PK), monthly_plan_id (UUID FK to monthly_plans ON DELETE CASCADE), enrollment_id (UUID FK to enrollments ON DELETE CASCADE), published_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
    - Add UNIQUE constraint on (monthly_plan_id, enrollment_id)
    - Add indexes: idx_plan_enrollments_monthly_plan_id, idx_plan_enrollments_enrollment_id
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x] 1.5 Create RLS policies for monthly_plans table
    - Create `supabase/migrations/[timestamp]_add_monthly_plans_rls_policies.sql`
    - Enable RLS on monthly_plans table
    - Policy: Teachers SELECT own plans (WHERE teacher_id = auth.uid())
    - Policy: Teachers INSERT plans (WITH CHECK teacher_id = auth.uid())
    - Policy: Teachers UPDATE own plans (USING teacher_id = auth.uid(), WITH CHECK teacher_id = auth.uid())
    - Policy: Teachers DELETE own plans (USING teacher_id = auth.uid())
    - Policy: Students SELECT published plans with access (WHERE status = 'published' AND EXISTS plan_enrollments JOIN enrollments WHERE student_profile_id = auth.uid() AND enrollment status = 'active')
    - _Requirements: 1.7, 2.1, 2.5, 5.5, 27.1, 27.4, 27.5, 27.6, 27.7_

  - [x] 1.6 Create RLS policies for plan_days table
    - Create `supabase/migrations/[timestamp]_add_plan_days_rls_policies.sql`
    - Enable RLS on plan_days table
    - Policy: Teachers SELECT plan days from own plans (EXISTS subquery checking monthly_plans.teacher_id = auth.uid())
    - Policy: Teachers INSERT plan days in own plans (WITH CHECK EXISTS subquery)
    - Policy: Teachers UPDATE plan days in own plans (USING EXISTS subquery, WITH CHECK EXISTS subquery)
    - Policy: Teachers DELETE plan days from own plans (USING EXISTS subquery)
    - Policy: Students SELECT plan days for accessible published plans (EXISTS subquery joining monthly_plans, plan_enrollments, enrollments)
    - _Requirements: 8.1, 8.2, 9.1, 9.7, 11.1, 11.7, 27.2, 27.5, 27.7_

  - [x] 1.7 Create RLS policies for plan_day_videos table
    - Create `supabase/migrations/[timestamp]_add_plan_day_videos_rls_policies.sql`
    - Enable RLS on plan_day_videos table
    - Policy: Teachers SELECT video associations from own plans (EXISTS subquery through plan_days to monthly_plans)
    - Policy: Teachers INSERT video associations in own plans (WITH CHECK EXISTS subquery)
    - Policy: Teachers DELETE video associations from own plans (USING EXISTS subquery)
    - Policy: Students SELECT video associations for accessible plans (EXISTS subquery checking published plans with enrollment)
    - _Requirements: 12.2, 12.3, 13.1, 13.2, 13.6, 27.3, 27.5, 27.7_

  - [x] 1.8 Create RLS policies for plan_enrollments table
    - Create `supabase/migrations/[timestamp]_add_plan_enrollments_rls_policies.sql`
    - Enable RLS on plan_enrollments table
    - Policy: Teachers SELECT enrollment associations for own plans OR own enrollments
    - Policy: Teachers INSERT associations (WITH CHECK monthly_plan teacher_id = auth.uid() AND enrollment teacher_id = auth.uid())
    - Policy: Teachers DELETE associations (USING both plan and enrollment belong to auth.uid())
    - _Requirements: 17.2, 17.3, 18.2, 18.6, 19.1, 19.6, 27.1, 27.7_

- [x] 2. TypeScript type definitions
  - [x] 2.1 Create plan types
    - Create `types/plan.ts`
    - Define PlanStatus type: 'draft' | 'published' | 'archived'
    - Define MonthlyPlan interface with all database fields
    - Define PlanWithDetails interface extending MonthlyPlan with plan_day_count, enrollment_count
    - Define CreatePlanData interface (title, description optional, period_start, period_end)
    - Define UpdatePlanData interface (all fields optional)
    - Define PlanFilters interface (search optional, status array optional, from_date optional, to_date optional)
    - Define DuplicateOptions interface (new_title optional, new_period_start optional, new_period_end optional)
    - Export all types from `types/index.ts`
    - _Requirements: 1.1, 1.5, 2.1, 2.7, 3.1, 3.2, 3.3, 3.4, 4.1, 4.7, 5.1, 21.1, 21.2, 21.3_

  - [x] 2.2 Create plan day types
    - Add to `types/plan.ts`
    - Define PlanDay interface with all database fields
    - Define PlanDayWithVideos interface extending PlanDay with videos array
    - Define CreatePlanDayData interface (weekday optional, planned_date optional, title, objective optional, notes optional, sort_order optional)
    - Define UpdatePlanDayData interface (all fields optional including nullable)
    - Define ReorderItem interface (id, sort_order)
    - _Requirements: 6.1, 6.3, 7.1, 7.4, 7.6, 8.1, 8.4, 9.1, 10.1, 10.2_

  - [x] 2.3 Create plan association types
    - Add to `types/plan.ts`
    - Define PlanDayVideoAssociation interface (id, plan_day_id, video_id, sort_order, created_at)
    - Define PlanDayVideoWithMetadata interface extending association with video metadata (title, status, duration, thumbnail_url)
    - Define PlanEnrollmentAssociation interface (id, monthly_plan_id, enrollment_id, published_at)
    - Define PlanEnrollmentWithDetails interface extending association with student info (student_name, student_email, enrollment_status)
    - _Requirements: 12.1, 12.5, 13.1, 14.1, 17.1, 17.5, 19.1, 19.7_

  - [x] 2.4 Create student-facing plan types
    - Add to `types/plan.ts`
    - Define StudentAccessiblePlan interface (subset of MonthlyPlan excluding teacher-only fields, plus teacher_name, plan_days array with videos but no notes field)
    - Define PaginationMeta interface (total, page, pageSize, totalPages, hasNext, hasPrevious)
    - _Requirements: 20.1, 20.4, 20.5, 20.7, 30.1, 30.2, 30.3, 30.4_

- [x] 3. Validation utilities and schemas
  - [x] 3.1 Create plan validation schemas
    - Create `lib/utils/plan-validation.ts`
    - Define createPlanSchema with Zod: title (string, trim, min 3, max 200), description (optional, string, trim, max 2000, nullable), period_start (string, ISO date format), period_end (string, ISO date format), custom refinement (period_end >= period_start)
    - Define updatePlanSchema with all fields optional but same validation rules
    - Define searchPlansSchema: search (optional string trim), status (optional array of PlanStatus), from_date (optional ISO date), to_date (optional ISO date), page (optional positive integer default 1), pageSize (optional positive integer max 100 default 20)
    - _Requirements: 1.2, 1.3, 2.6, 3.1, 3.2, 3.3, 3.5, 4.1, 4.5, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 30.1, 30.6, 30.7, 32.1, 32.6_

  - [x] 3.2 Create plan day validation schemas
    - Add to `lib/utils/plan-validation.ts`
    - Define createPlanDaySchema with Zod: weekday (optional integer >= 0 and <= 6), planned_date (optional ISO date), title (string, trim, min 2, max 200), objective (optional string, trim, max 1000, nullable), notes (optional string, trim, max 2000, nullable), sort_order (optional non-negative integer), custom refinement (at least one of weekday or planned_date required)
    - Define updatePlanDaySchema with all fields optional but same validation rules
    - Define reorderSchema with Zod: array of objects with id (UUID), sort_order (non-negative integer), minimum 1 item
    - _Requirements: 6.2, 7.5, 9.2, 10.2, 10.4, 10.5, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7_

  - [x] 3.3 Create plan association validation schemas
    - Add to `lib/utils/plan-validation.ts`
    - Define associateVideoSchema with Zod: video_id (UUID), sort_order (optional non-negative integer)
    - Define grantEnrollmentAccessSchema with Zod: enrollment_id (UUID)
    - Define duplicatePlanSchema with Zod: new_title (optional string trim min 3 max 200), new_period_start (optional ISO date), new_period_end (optional ISO date), custom refinement (if both new dates provided, end >= start)
    - _Requirements: 12.1, 12.7, 14.2, 14.4, 17.1, 21.1, 21.2_

- [x] 4. Service layer - Plan service
  - [x] 4.1 Implement createPlan function
    - Create `lib/services/plan.service.ts`
    - Implement createPlan(teacherId: string, data: CreatePlanData): Promise<MonthlyPlan>
    - Validate data with createPlanSchema
    - Insert into monthly_plans with teacher_id, title, description, period_start, period_end, status 'draft'
    - Return created plan with all fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 4.2 Write property test for plan creation
    - **Property 1: Plan Creation Stores All Required Fields**
    - **Validates: Requirements 1.1, 1.4, 1.5**
    - Test that any valid title (3-200 chars) and period dates create plan with status 'draft' and timestamps

  - [x] 4.3 Implement listPlans function
    - Implement listPlans(teacherId: string, filters: PlanFilters, pagination: PaginationOptions): Promise<{ plans: PlanWithDetails[], meta: PaginationMeta }>
    - Apply search filter (case-insensitive partial match on title) if provided
    - Apply status filter (default exclude archived unless in status array)
    - Apply date range filters (period_start >= from_date, period_end <= to_date)
    - LEFT JOIN to count plan_days (WHERE status != 'archived')
    - LEFT JOIN to count plan_enrollments
    - Calculate pagination offset and limit
    - Sort by period_start DESC
    - Return plans array and pagination metadata
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.3, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7_

  - [x]* 4.4 Write property test for search functionality
    - **Property 2: Search Matches Partial Titles Case-Insensitively**
    - **Validates: Requirements 32.1, 32.2, 32.3**
    - Test that search query finds all plans containing substring regardless of case

  - [x] 4.5 Implement getPlanDetail function
    - Implement getPlanDetail(planId: string, teacherId: string): Promise<PlanWithDetails>
    - Query plan WHERE id = planId AND teacher_id = teacherId
    - If not found, throw 404 error
    - Include plan_days summary (LEFT JOIN with video count per day)
    - Include enrollments list with student info
    - Return complete plan details
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 4.6 Implement updatePlan function
    - Implement updatePlan(planId: string, teacherId: string, data: UpdatePlanData): Promise<MonthlyPlan>
    - Verify plan belongs to teacher (WHERE id = planId AND teacher_id = teacherId)
    - If not found, throw 404 error
    - Validate data with updatePlanSchema
    - Update allowed fields: title, description, period_start, period_end
    - Do NOT allow status changes (use dedicated functions)
    - Return updated plan
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 4.7 Write property test for timestamp updates
    - **Property 3: Update Modifies updated_at Timestamp**
    - **Validates: Requirements 5.6, 31.2**
    - Test that any plan update increases updated_at and preserves created_at

  - [x] 4.8 Implement plan status transition functions
    - Implement publishPlan(planId: string, teacherId: string): Promise<MonthlyPlan>
    - Verify plan belongs to teacher and status is 'draft'
    - Update status to 'published', set published_at to NOW()
    - Return updated plan
    - Implement unpublishPlan(planId: string, teacherId: string): Promise<MonthlyPlan>
    - Verify status is 'published', update to 'draft', preserve published_at
    - Implement archivePlan(planId: string, teacherId: string): Promise<MonthlyPlan>
    - Verify status not already 'archived', update to 'archived', set archived_at
    - Implement unarchivePlan(planId: string, teacherId: string): Promise<MonthlyPlan>
    - Verify status is 'archived', update to 'draft', preserve archived_at
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 31.3, 31.4_

  - [x]* 4.9 Write property test for status transitions
    - **Property 4: Status Transitions Follow Valid State Machine**
    - **Validates: Requirements 15.4, 15.5, 16.4, 16.5, 23.3, 23.4**
    - Test that only valid transitions succeed (draftÃ¢â€ â€™published, publishedÃ¢â€ â€™draft, anyÃ¢â€ â€™archived, archivedÃ¢â€ â€™draft)

  - [x] 4.10 Implement hasLessonReferences function
    - Implement hasLessonReferences(planId: string): Promise<boolean>
    - Query lessons table: SELECT EXISTS WHERE plan_day_id IN (SELECT id FROM plan_days WHERE monthly_plan_id = planId)
    - Return true if any references exist, false otherwise
    - _Requirements: 24.1, 24.2_

  - [x] 4.11 Implement deletePlan function
    - Implement deletePlan(planId: string, teacherId: string): Promise<void>
    - Verify plan belongs to teacher
    - Call hasLessonReferences(planId)
    - If references exist, throw 409 error with message "Cannot delete plan with lesson references. Archive instead."
    - Use transaction to DELETE FROM monthly_plans WHERE id = planId
    - Cascades to plan_days, plan_day_videos, plan_enrollments
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_

  - [x]* 4.12 Write property test for deletion protection
    - **Property 5: Plans With Lesson References Cannot Be Deleted**
    - **Validates: Requirements 24.1, 24.2, 24.5**
    - Test that plan with lesson references returns 409 and is not deleted

  - [x] 4.13 Implement duplicatePlan function
    - Implement duplicatePlan(planId: string, teacherId: string, options?: DuplicateOptions): Promise<MonthlyPlan>
    - Verify source plan belongs to teacher
    - Create new plan with status 'draft', title from options or original + " (Copy)", dates from options or original
    - Query plan_days for source plan
    - Insert copied plan_days with same titles, objectives, notes, sort_order
    - Query plan_day_videos for source plan days
    - Insert copied associations with same video_id and sort_order
    - Do NOT copy plan_enrollments
    - Return new plan with plan_day_count
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [x]* 4.14 Write property test for plan duplication
    - **Property 6: Duplication Copies Structure Without Enrollments**
    - **Validates: Requirements 21.4, 21.5, 21.6**
    - Test that duplicated plan has same day count and video associations but no enrollments

- [x] 5. Service layer - Plan day service
  - [x] 5.1 Implement createPlanDay function
    - Create `lib/services/plan-day.service.ts`
    - Implement createPlanDay(planId: string, teacherId: string, data: CreatePlanDayData): Promise<PlanDay>
    - Verify plan belongs to teacher
    - Validate data with createPlanDaySchema
    - If planned_date provided, validate falls within plan's period (query monthly_plans for period_start/period_end)
    - If sort_order not provided, set to MAX(sort_order) + 1
    - Insert into plan_days
    - Return created plan day
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 5.2 Write property test for plan day organization models
    - **Property 7: Plan Day Accepts Weekday or Date Model**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Test that plan day can be created with weekday only, date only, or both

  - [x] 5.3 Implement listPlanDays function
    - Implement listPlanDays(planId: string, teacherId: string): Promise<PlanDayWithVideos[]>
    - Verify plan belongs to teacher
    - Query plan_days WHERE monthly_plan_id = planId
    - LEFT JOIN plan_day_videos with video metadata
    - Sort by sort_order ASC, then weekday/planned_date
    - Return array with video associations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 5.4 Implement updatePlanDay function
    - Implement updatePlanDay(dayId: string, teacherId: string, data: UpdatePlanDayData): Promise<PlanDay>
    - Verify parent plan belongs to teacher (JOIN with monthly_plans)
    - Validate data with updatePlanDaySchema
    - If planned_date being updated, validate within plan period
    - Update allowed fields
    - Return updated plan day
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 5.5 Implement reorderPlanDays function
    - Implement reorderPlanDays(reorders: ReorderItem[], teacherId: string): Promise<number>
    - Validate reorders array with reorderSchema
    - Verify all plan days belong to teacher's plans (JOIN with monthly_plans)
    - If any don't belong, throw 403 error
    - Use transaction to UPDATE sort_order for all items
    - Return count of updated plan days
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 5.6 Write property test for reorder atomicity
    - **Property 8: Reorder Updates All or None**
    - **Validates: Requirements 10.6, 10.7**
    - Test that if any item fails authorization, all sort_order values rollback

  - [x] 5.7 Implement deletePlanDay function
    - Implement deletePlanDay(dayId: string, teacherId: string): Promise<void>
    - Verify parent plan belongs to teacher
    - DELETE FROM plan_days WHERE id = dayId
    - Cascades to plan_day_videos
    - Does NOT affect lessons (lesson references preserved)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x]* 5.8 Write property test for deletion cascades
    - **Property 9: Plan Day Deletion Cascades to Videos**
    - **Validates: Requirements 11.1, 11.2**
    - Test that deleting plan day removes all video associations but preserves video records

- [x] 6. Service layer - Plan video service
  - [x] 6.1 Implement associateVideo function
    - Create `lib/services/plan-video.service.ts`
    - Implement associateVideo(dayId: string, videoId: string, teacherId: string, sortOrder?: number): Promise<PlanDayVideoAssociation>
    - Verify plan day's parent plan belongs to teacher
    - Verify video belongs to teacher (query videos table)
    - Verify video status is not 'archived'
    - Check for existing association (UNIQUE constraint)
    - If sort_order not provided, set to MAX(sort_order) + 1 for this plan day
    - Insert into plan_day_videos
    - Return association
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x]* 6.2 Write property test for video association
    - **Property 10: Video Association Prevents Duplicates**
    - **Validates: Requirements 12.6**
    - Test that associating same video twice to same plan day returns error

  - [x] 6.3 Implement listPlanDayVideos function
    - Implement listPlanDayVideos(dayId: string, teacherId: string): Promise<PlanDayVideoWithMetadata[]>
    - Verify plan day's parent plan belongs to teacher
    - Query plan_day_videos WHERE plan_day_id = dayId
    - JOIN videos to get metadata (title, status, duration, thumbnail_url)
    - Include archived videos with indicator
    - Sort by sort_order ASC
    - Return array with video metadata
    - _Requirements: 12.5, 13.1, 13.3, 13.7_

  - [x] 6.4 Implement removeVideoAssociation function
    - Implement removeVideoAssociation(assocId: string, teacherId: string): Promise<void>
    - Verify plan day's parent plan belongs to teacher (JOIN through plan_days to monthly_plans)
    - DELETE FROM plan_day_videos WHERE id = assocId
    - Does NOT delete video record from library
    - Does NOT affect lessons that used this plan day
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 6.5 Implement reorderVideos function
    - Implement reorderVideos(reorders: ReorderItem[], teacherId: string): Promise<number>
    - Validate reorders array
    - Verify all associations belong to same plan_day_id
    - Verify plan day's parent plan belongs to teacher
    - Use transaction to UPDATE sort_order
    - Return count of updated associations
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x]* 6.6 Write property test for video reusability
    - **Property 11: Same Video in Multiple Plan Days**
    - **Validates: Requirements 25.1, 25.2, 25.3**
    - Test that same video can be associated with multiple plan days independently

- [x] 7. Service layer - Plan enrollment service
  - [x] 7.1 Implement grantEnrollmentAccess function
    - Create `lib/services/plan-enrollment.service.ts`
    - Implement grantEnrollmentAccess(planId: string, enrollmentId: string, teacherId: string): Promise<PlanEnrollmentAssociation>
    - Verify plan belongs to teacher and status is 'published'
    - If not published, throw 400 error
    - Verify enrollment belongs to teacher
    - Check for existing association (UNIQUE constraint)
    - Insert into plan_enrollments
    - Return association
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

  - [x]* 7.2 Write property test for access control
    - **Property 12: Only Published Plans Can Grant Access**
    - **Validates: Requirements 17.4**
    - Test that attempting to grant access to draft or archived plan returns error

  - [x] 7.3 Implement revokeEnrollmentAccess function
    - Implement revokeEnrollmentAccess(assocId: string, teacherId: string): Promise<void>
    - Verify both plan and enrollment belong to teacher (JOIN checks)
    - DELETE FROM plan_enrollments WHERE id = assocId
    - Does NOT affect plan or enrollment records
    - Does NOT affect lessons
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [x] 7.4 Implement listPlanEnrollments function
    - Implement listPlanEnrollments(planId: string, teacherId: string, includeArchived: boolean = false): Promise<PlanEnrollmentWithDetails[]>
    - Verify plan belongs to teacher
    - Query plan_enrollments WHERE monthly_plan_id = planId
    - JOIN enrollments to get student details
    - Exclude archived enrollments unless includeArchived
    - Return array with student info
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [x] 7.5 Implement getStudentAccessiblePlans function
    - Implement getStudentAccessiblePlans(studentProfileId: string, teacherId?: string): Promise<StudentAccessiblePlan[]>
    - Query monthly_plans WHERE status = 'published'
    - JOIN plan_enrollments WHERE enrollment has student_profile_id
    - JOIN enrollments WHERE status = 'active'
    - Filter by teacher_id if provided
    - Include plan_days with videos (exclude notes field for student view)
    - Join teachers to get teacher_name
    - Return student-safe plan data
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x]* 7.6 Write property test for student data isolation
    - **Property 13: Students Only See Authorized Plans**
    - **Validates: Requirements 20.2, 20.6, 27.4**
    - Test that student query only returns plans with enrollment association

- [x] 8. Checkpoint - Service layer complete
  - Ensure all service functions implemented
  - Run property tests and unit tests
  - Verify database interactions with local Supabase
  - Test RLS policies prevent unauthorized access
  - Ask the user if questions arise



- [x] 9. API Routes - Plan collection endpoints
  - [x] 9.1 Create POST /api/plans endpoint
    - Create `app/api/plans/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Parse and validate request body with createPlanSchema
    - Call plan.service createPlan
    - Return 201 with created plan
    - Handle validation errors (400)
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 28.1, 28.7_

  - [x]* 9.2 Write unit test for plan creation endpoint
    - Test successful creation returns 201
    - Test invalid title returns 400
    - Test period_end before period_start returns 400
    - Test unauthenticated request returns 401

  - [x] 9.3 Create GET /api/plans endpoint
    - Add GET handler to `app/api/plans/route.ts`
    - Extract authenticated user from session
    - Parse query parameters: search, status (parse array), from_date, to_date, page, pageSize
    - Validate with searchPlansSchema
    - Call plan.service listPlans with filters and pagination
    - Return 200 with data envelope: { data: { plans }, meta: pagination }
    - Handle validation errors (400)
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 3.1, 3.3, 3.5, 4.1, 4.2, 4.4, 30.1, 30.3, 30.6, 32.1_

  - [x]* 9.4 Write property test for list endpoint authorization
    - **Property 14: Teachers Only See Own Plans**
    - **Validates: Requirements 2.5, 27.1**
    - Test that any teacher query only returns their own plans

- [x] 10. API Routes - Plan item endpoints
  - [x] 10.1 Create GET /api/plans/[id] endpoint
    - Create `app/api/plans/[id]/route.ts`
    - Extract authenticated user and plan ID from params
    - Call plan.service getPlanDetail
    - Return 200 with complete plan details
    - Return 404 if not found, 403 if wrong teacher
    - _Requirements: 5.1, 5.5, 27.1_

  - [x] 10.2 Create PATCH /api/plans/[id] endpoint
    - Add PATCH handler to `app/api/plans/[id]/route.ts`
    - Extract user and plan ID
    - Parse and validate body with updatePlanSchema
    - Call plan.service updatePlan
    - Return 200 with updated plan
    - Handle 400 validation, 404 not found, 403 forbidden
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 28.5_

  - [x] 10.3 Create DELETE /api/plans/[id] endpoint
    - Add DELETE handler to `app/api/plans/[id]/route.ts`
    - Extract user and plan ID
    - Call plan.service deletePlan
    - Return 200 with success message
    - Return 409 if lesson references exist with message suggesting archive
    - _Requirements: 24.1, 24.2, 24.3, 24.6_

- [x] 11. API Routes - Plan status action endpoints
  - [x] 11.1 Create POST /api/plans/[id]/publish endpoint
    - Create `app/api/plans/[id]/publish/route.ts`
    - Extract user and plan ID
    - Call plan.service publishPlan
    - Return 200 with updated plan (status published, published_at set)
    - Return 409 if not in draft status
    - _Requirements: 15.1, 15.2, 15.4, 15.5, 15.6_

  - [x] 11.2 Create POST /api/plans/[id]/unpublish endpoint
    - Create `app/api/plans/[id]/unpublish/route.ts`
    - Extract user and plan ID
    - Call plan.service unpublishPlan
    - Return 200 with updated plan (status draft, published_at preserved)
    - Return 409 if not in published status
    - _Requirements: 16.1, 16.2, 16.4, 16.5_

  - [x] 11.3 Create POST /api/plans/[id]/archive endpoint
    - Create `app/api/plans/[id]/archive/route.ts`
    - Extract user and plan ID
    - Call plan.service archivePlan
    - Return 200 with updated plan (status archived, archived_at set)
    - Return 409 if already archived
    - _Requirements: 22.1, 22.2, 22.4, 22.7_

  - [x] 11.4 Create POST /api/plans/[id]/unarchive endpoint
    - Create `app/api/plans/[id]/unarchive/route.ts`
    - Extract user and plan ID
    - Call plan.service unarchivePlan
    - Return 200 with updated plan (status draft, archived_at preserved)
    - Return 409 if not archived
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6_

  - [x] 11.5 Create POST /api/plans/[id]/duplicate endpoint
    - Create `app/api/plans/[id]/duplicate/route.ts`
    - Extract user and plan ID
    - Parse and validate body with duplicatePlanSchema (optional fields)
    - Call plan.service duplicatePlan
    - Return 200 with new plan
    - _Requirements: 21.1, 21.7_

- [x] 12. API Routes - Plan day endpoints
  - [x] 12.1 Create POST /api/plans/[id]/days endpoint
    - Create `app/api/plans/[id]/days/route.ts`
    - Extract user and plan ID
    - Parse and validate body with createPlanDaySchema
    - Call plan-day.service createPlanDay
    - Return 201 with created plan day
    - Handle 400 validation, 404 plan not found
    - _Requirements: 6.1, 6.2, 7.7, 29.7_

  - [x] 12.2 Create GET /api/plans/[id]/days endpoint
    - Add GET handler to `app/api/plans/[id]/days/route.ts`
    - Extract user and plan ID
    - Call plan-day.service listPlanDays
    - Return 200 with plan days array including video associations
    - _Requirements: 8.1, 8.3_

  - [x] 12.3 Create PATCH /api/plans/days/[dayId] endpoint
    - Create `app/api/plans/days/[dayId]/route.ts`
    - Extract user and day ID
    - Parse and validate body with updatePlanDaySchema
    - Call plan-day.service updatePlanDay
    - Return 200 with updated plan day
    - _Requirements: 9.1, 9.2, 9.6, 9.7_

  - [x] 12.4 Create DELETE /api/plans/days/[dayId] endpoint
    - Add DELETE handler to `app/api/plans/days/[dayId]/route.ts`
    - Extract user and day ID
    - Call plan-day.service deletePlanDay
    - Return 200 with success message
    - _Requirements: 11.1, 11.7_

  - [x] 12.5 Create POST /api/plans/days/reorder endpoint
    - Create `app/api/plans/days/reorder/route.ts`
    - Extract user from session
    - Parse and validate body with reorderSchema
    - Call plan-day.service reorderPlanDays
    - Return 200 with updated_count
    - Return 403 if any day belongs to different teacher
    - _Requirements: 10.1, 10.2, 10.5_

- [x] 13. API Routes - Plan video association endpoints
  - [x] 13.1 Create POST /api/plans/days/[dayId]/videos endpoint
    - Create `app/api/plans/days/[dayId]/videos/route.ts`
    - Extract user and day ID
    - Parse and validate body with associateVideoSchema
    - Call plan-video.service associateVideo
    - Return 201 with association
    - Return 400 if video archived, 409 if duplicate
    - _Requirements: 12.1, 12.4, 12.6_

  - [x] 13.2 Create GET /api/plans/days/[dayId]/videos endpoint
    - Add GET handler to `app/api/plans/days/[dayId]/videos/route.ts`
    - Extract user and day ID
    - Call plan-video.service listPlanDayVideos
    - Return 200 with videos array including metadata
    - _Requirements: 12.5, 13.1_

  - [x] 13.3 Create DELETE /api/plans/days/videos/[assocId] endpoint
    - Create `app/api/plans/days/videos/[assocId]/route.ts`
    - Extract user and association ID
    - Call plan-video.service removeVideoAssociation
    - Return 200 with success message
    - _Requirements: 13.1, 13.6_

  - [x] 13.4 Create POST /api/plans/days/videos/reorder endpoint
    - Create `app/api/plans/days/videos/reorder/route.ts`
    - Extract user from session
    - Parse and validate body with reorderSchema
    - Call plan-video.service reorderVideos
    - Return 200 with updated_count
    - Return 400 if associations from different plan days
    - _Requirements: 14.1, 14.4_

- [x] 14. API Routes - Plan enrollment endpoints
  - [x] 14.1 Create POST /api/plans/[id]/enrollments endpoint
    - Create `app/api/plans/[id]/enrollments/route.ts`
    - Extract user and plan ID
    - Parse and validate body with grantEnrollmentAccessSchema
    - Call plan-enrollment.service grantEnrollmentAccess
    - Return 201 with association
    - Return 400 if plan not published, 409 if duplicate
    - _Requirements: 17.1, 17.4, 17.7_

  - [x] 14.2 Create GET /api/plans/[id]/enrollments endpoint
    - Add GET handler to `app/api/plans/[id]/enrollments/route.ts`
    - Extract user and plan ID
    - Parse query parameter: include_archived (boolean, default false)
    - Call plan-enrollment.service listPlanEnrollments
    - Return 200 with enrollments array
    - _Requirements: 19.1, 19.4, 19.5_

  - [x] 14.3 Create DELETE /api/plans/enrollments/[assocId] endpoint
    - Create `app/api/plans/enrollments/[assocId]/route.ts`
    - Extract user and association ID
    - Call plan-enrollment.service revokeEnrollmentAccess
    - Return 200 with success message
    - _Requirements: 18.1, 18.6_

  - [x] 14.4 Create GET /api/plans/student endpoint
    - Create `app/api/plans/student/route.ts`
    - Extract authenticated user (student profile ID)
    - Parse query parameter: teacher_id (optional filter)
    - Call plan-enrollment.service getStudentAccessiblePlans
    - Return 200 with student-safe plan data
    - _Requirements: 20.1, 20.5, 20.7_

- [x] 15. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify RLS policies enforce authorization
  - Test status transition validation
  - Verify error responses follow standard format
  - Test pagination and filtering
  - Ask the user if questions arise

- [x] 16. Frontend - shadcn/ui components setup
  - [x] 16.1 Install required shadcn/ui components
    - Run `npx shadcn-ui@latest add card form input button dialog badge calendar table pagination skeleton select tabs alert`
    - Verify components installed to `components/ui/`

- [x] 17. Frontend - Plan list components
  - [x] 17.1 Create PlanList component
    - Create `components/plans/PlanList.tsx` as client component
    - Props: plans (PlanWithDetails[]), onSearch, onFilterStatus, onFilterDateRange, onPaginate, pagination, loading
    - Use shadcn/ui Card for each plan display
    - Show title, description excerpt, period dates, status badge, day count, enrollment count
    - Search input with debounce (300ms)
    - Status filter chips (draft, published, archived) using Badge
    - Date range picker using Calendar
    - Pagination controls using Pagination component
    - Quick action buttons: View, Edit, Publish/Unpublish, Archive, Duplicate
    - Empty state when no plans
    - Skeleton loading state
    - _Requirements: 2.1, 2.2, 3.1, 4.1_

  - [x] 17.2 Create PlanForm component
    - Create `components/plans/PlanForm.tsx` as client component
    - Props: plan (optional for edit), onSave, onCancel
    - Use shadcn/ui Form with React Hook Form and Zod validation
    - Fields: title (required), description (textarea, optional), period_start (date picker), period_end (date picker with validation)
    - Client-side validation matching server schema
    - Display field-specific error messages
    - Save and Cancel buttons with loading state
    - _Requirements: 1.1, 5.1, 28.1, 28.7_

  - [x] 17.3 Create PlanStatusBadge component
    - Create `components/plans/PlanStatusBadge.tsx`
    - Props: status (PlanStatus), published_at, archived_at (optional timestamps)
    - Use shadcn/ui Badge with contextual colors: draft (gray), published (green), archived (red)
    - Show tooltip with status transition timestamp
    - _Requirements: 2.2, 15.1, 16.1, 22.1_

- [x] 18. Frontend - Plan day editor components
  - [x] 18.1 Create PlanDayEditor component
    - Create `components/plans/PlanDayEditor.tsx` as client component
    - Props: planId, planPeriod (start/end dates), planDays, onAddDay, onUpdateDay, onDeleteDay, onReorder
    - List of plan days with drag-drop reordering using sort_order
    - Add day button with inline form
    - Organization model toggle (weekday vs date-specific)
    - Weekday selector (dropdown with day names for 0-6)
    - Date picker for specific dates (validate within plan period)
    - Title, objective, notes inputs
    - Video count indicator per day
    - Expand/collapse day details
    - Delete confirmation dialog
    - _Requirements: 6.1, 7.1, 8.1, 9.1, 10.1_

  - [x] 18.2 Create PlanDayForm component
    - Create `components/plans/PlanDayForm.tsx`
    - Props: planPeriod, planDay (optional for edit), onSave, onCancel
    - Use shadcn/ui Form
    - Tabs for organization model selection
    - Weekday mode: Select component with day names
    - Date mode: Calendar component with period validation
    - Title input (required), objective textarea (optional, 1000 char max with counter), notes textarea (optional, 2000 char max with counter)
    - Validation feedback
    - _Requirements: 6.2, 7.4, 7.6, 29.1, 29.4_

  - [x] 18.3 Create VideoSelector component
    - Create `components/plans/VideoSelector.tsx` as client component
    - Props: planDayId, currentVideos (with associations), onAddVideo, onRemoveVideo, onReorderVideos
    - Browse technique library hierarchy (query from technique library API)
    - Search videos by title
    - Filter by module/technique
    - Video thumbnail preview with status indicator
    - Already associated indicator (prevent duplicates)
    - Drag-drop reordering of associated videos
    - Remove video button
    - Video status badge (ready, processing, archived)
    - _Requirements: 12.1, 12.4, 12.6, 13.1, 14.1_

- [x] 19. Frontend - Plan enrollment manager components
  - [x] 19.1 Create PlanEnrollmentManager component
    - Create `components/plans/PlanEnrollmentManager.tsx` as client component
    - Props: planId, planStatus, currentEnrollments, onGrantAccess, onRevokeAccess
    - List of students with access (table with student name, email, enrollment status, published date)
    - Add student selector (dropdown of teacher's active enrollments)
    - Remove access button with confirmation
    - Publication status indicator (disabled if plan not published)
    - Empty state when no students have access
    - _Requirements: 17.1, 17.4, 18.1, 19.1_

  - [x] 19.2 Create StudentPlanViewer component
    - Create `components/plans/StudentPlanViewer.tsx` as client component
    - Props: plans (StudentAccessiblePlan[]), loading
    - Read-only plan display
    - Plan period dates prominent
    - Plan days organized by weekday/date with expand/collapse
    - Video list per day with playback links (use Mux signed URLs)
    - Teacher name display
    - Filter by teacher if student has multiple
    - No edit capabilities, no private notes visible
    - _Requirements: 20.1, 20.4, 20.5, 20.7_

- [x] 20. Frontend - Custom hooks for client state
  - [x] 20.1 Create usePlans hook
    - Create `hooks/usePlans.ts`
    - Manage state: plans, loading, error, pagination, filters
    - Provide createPlan(data) function calling POST /api/plans
    - Provide updatePlan(id, data) calling PATCH /api/plans/[id]
    - Provide deletePlan(id) calling DELETE /api/plans/[id]
    - Provide publishPlan(id) calling POST /api/plans/[id]/publish
    - Provide unpublishPlan(id) calling POST /api/plans/[id]/unpublish
    - Provide archivePlan(id) calling POST /api/plans/[id]/archive
    - Provide unarchivePlan(id) calling POST /api/plans/[id]/unarchive
    - Provide duplicatePlan(id, options) calling POST /api/plans/[id]/duplicate
    - Provide setSearch(query) with debounce
    - Provide setStatusFilter(statuses)
    - Provide setDateRangeFilter(from, to)
    - Provide setPage(page)
    - Provide refetch()
    - Handle optimistic updates and rollback on error
    - _Requirements: 1.1, 2.1, 5.1, 15.1, 16.1, 21.1, 22.1, 23.1_

  - [x] 20.2 Create usePlanDays hook
    - Create `hooks/usePlanDays.ts`
    - Manage state: planDays, loading, error
    - Provide addPlanDay(data) calling POST /api/plans/[id]/days
    - Provide updatePlanDay(id, data) calling PATCH /api/plans/days/[dayId]
    - Provide deletePlanDay(id) calling DELETE /api/plans/days/[dayId]
    - Provide reorderPlanDays(reorders) calling POST /api/plans/days/reorder
    - Provide addVideo(dayId, videoId) calling POST /api/plans/days/[dayId]/videos
    - Provide removeVideo(assocId) calling DELETE /api/plans/days/videos/[assocId]
    - Provide reorderVideos(dayId, reorders) calling POST /api/plans/days/videos/reorder
    - Provide refetch()
    - _Requirements: 6.1, 8.1, 9.1, 10.1, 11.1, 12.1, 13.1, 14.1_

  - [x] 20.3 Create usePlanEnrollments hook
    - Create `hooks/usePlanEnrollments.ts`
    - Manage state: enrollments, availableEnrollments, loading, error
    - Provide grantAccess(enrollmentId) calling POST /api/plans/[id]/enrollments
    - Provide revokeAccess(assocId) calling DELETE /api/plans/enrollments/[assocId]
    - Provide refetch()
    - Fetch available enrollments from GET /api/enrollments
    - _Requirements: 17.1, 18.1, 19.1_

- [x] 21. Frontend - Teacher pages for plan management
  - [x] 21.1 Create plans list page
    - Create `app/(teacher)/plans/page.tsx` as server component
    - Fetch initial plans server-side from GET /api/plans
    - Pass data to PlanList client component
    - Include "Create Plan" button opening dialog with PlanForm
    - Protected by middleware (teacher role required)
    - Handle empty state with call-to-action
    - _Requirements: 2.1_

  - [x] 21.2 Create plan detail page
    - Create `app/(teacher)/plans/[id]/page.tsx` as server component
    - Fetch plan detail server-side from GET /api/plans/[id]
    - Display plan metadata with edit capability
    - Render PlanDayEditor component
    - Tabs: Overview, Days, Videos, Students
    - Overview tab: metadata, status actions, duplicate button
    - Days tab: PlanDayEditor
    - Videos tab: consolidated video associations across all days
    - Students tab: PlanEnrollmentManager
    - Protected by middleware
    - Handle 404 if plan not found
    - _Requirements: 5.1, 8.1, 19.1_

  - [x] 21.3 Create plan duplicate confirmation dialog
    - Add dialog to plan detail page using shadcn/ui Dialog
    - Form with optional new title, new period dates
    - Show warning about enrollments not being copied
    - Call POST /api/plans/[id]/duplicate on confirm
    - Redirect to new plan detail page on success
    - _Requirements: 21.1, 21.6_

- [x] 22. Frontend - Student pages for plan viewing
  - [x] 22.1 Create student plans page
    - Create `app/(student)/my-plan/page.tsx` as server component
    - Fetch accessible plans server-side from GET /api/plans/student
    - Render StudentPlanViewer component
    - Protected by middleware (student role required)
    - Show message if no plans published to student
    - _Requirements: 20.1, 20.4_

- [x] 23. Frontend - API client functions
  - [x] 23.1 Create plan API client
    - Create `lib/api/plans.ts`
    - Implement getPlans(params) calling GET /api/plans
    - Implement getPlan(id) calling GET /api/plans/[id]
    - Implement createPlan(data) calling POST /api/plans
    - Implement updatePlan(id, data) calling PATCH /api/plans/[id]
    - Implement deletePlan(id) calling DELETE /api/plans/[id]
    - Implement publishPlan(id) calling POST /api/plans/[id]/publish
    - Implement unpublishPlan(id) calling POST /api/plans/[id]/unpublish
    - Implement archivePlan(id) calling POST /api/plans/[id]/archive
    - Implement unarchivePlan(id) calling POST /api/plans/[id]/unarchive
    - Implement duplicatePlan(id, options) calling POST /api/plans/[id]/duplicate
    - Handle errors and return typed responses
    - _Requirements: All plan operations_

  - [x] 23.2 Create plan day API client
    - Create `lib/api/plan-days.ts`
    - Implement getPlanDays(planId) calling GET /api/plans/[id]/days
    - Implement createPlanDay(planId, data) calling POST /api/plans/[id]/days
    - Implement updatePlanDay(dayId, data) calling PATCH /api/plans/days/[dayId]
    - Implement deletePlanDay(dayId) calling DELETE /api/plans/days/[dayId]
    - Implement reorderPlanDays(reorders) calling POST /api/plans/days/reorder
    - Implement getPlanDayVideos(dayId) calling GET /api/plans/days/[dayId]/videos
    - Implement addVideoToPlanDay(dayId, videoId) calling POST /api/plans/days/[dayId]/videos
    - Implement removeVideoFromPlanDay(assocId) calling DELETE /api/plans/days/videos/[assocId]
    - Implement reorderPlanDayVideos(reorders) calling POST /api/plans/days/videos/reorder
    - _Requirements: All plan day and video operations_

  - [x] 23.3 Create plan enrollment API client
    - Create `lib/api/plan-enrollments.ts`
    - Implement getPlanEnrollments(planId, includeArchived) calling GET /api/plans/[id]/enrollments
    - Implement grantPlanAccess(planId, enrollmentId) calling POST /api/plans/[id]/enrollments
    - Implement revokePlanAccess(assocId) calling DELETE /api/plans/enrollments/[assocId]
    - Implement getStudentPlans(teacherId) calling GET /api/plans/student
    - _Requirements: All enrollment operations_

- [x] 24. Property-based tests for plan operations
  - [x]* 24.1 Write property test for plan validation
    - **Property 15: Plan Period Validation**
    - **Validates: Requirements 1.3, 28.5**
    - Test that any plan with period_end < period_start is rejected

  - [x]* 24.2 Write property test for plan day date validation
    - **Property 16: Plan Day Date Within Period**
    - **Validates: Requirements 7.6**
    - Test that planned_date outside plan period is rejected

  - [x]* 24.3 Write property test for status preservation
    - **Property 17: Plan Updates Preserve Status**
    - **Validates: Requirements 5.4**
    - Test that updating metadata does not change status field

  - [x]* 24.4 Write property test for cascade behavior
    - **Property 18: Plan Deletion Cascades to Children**
    - **Validates: Requirements 24.7**
    - Test that deleting plan removes all plan_days and plan_day_videos

  - [x]* 24.5 Write property test for lesson history preservation
    - **Property 19: Plan Changes Preserve Lesson History**
    - **Validates: Requirements 26.1, 26.2, 26.3**
    - Test that editing or deleting plan day does not modify lesson records

- [x] 25. Integration tests for complete workflows
  - [x]* 25.1 Write integration test for plan creation to publication workflow
    - Test: create plan Ã¢â€ â€™ add days Ã¢â€ â€™ associate videos Ã¢â€ â€™ publish Ã¢â€ â€™ grant enrollment access Ã¢â€ â€™ student views
    - Verify all associations created correctly
    - Verify student sees complete plan with videos

  - [x]* 25.2 Write integration test for plan duplication workflow
    - Test: create plan with days and videos Ã¢â€ â€™ duplicate with new dates Ã¢â€ â€™ verify structure copied
    - Verify new plan has same day count and video associations
    - Verify enrollments not copied

  - [x]* 25.3 Write integration test for plan archival workflow
    - Test: create plan Ã¢â€ â€™ publish Ã¢â€ â€™ grant access Ã¢â€ â€™ archive Ã¢â€ â€™ verify student no longer sees
    - Verify plan not in default list
    - Verify unarchive returns to draft (not published)

  - [x]* 25.4 Write integration test for video reusability
    - Test: create two plan days Ã¢â€ â€™ associate same video to both Ã¢â€ â€™ remove from one Ã¢â€ â€™ verify other retains
    - Verify video record not deleted

  - [x]* 25.5 Write integration test for deletion protection
    - Test: create plan Ã¢â€ â€™ create lesson referencing plan day Ã¢â€ â€™ attempt delete Ã¢â€ â€™ verify 409
    - Verify error message suggests archiving

- [x] 26. Unit tests for edge cases and boundaries
  - [x]* 26.1 Write unit tests for validation boundaries
    - Test title exactly 3 chars (valid), 2 chars (invalid)
    - Test description exactly 2000 chars (valid), 2001 chars (invalid)
    - Test plan day title exactly 2 chars (valid), 1 char (invalid)
    - Test weekday 0 and 6 (valid), -1 and 7 (invalid)

  - [x]* 26.2 Write unit tests for status transition errors
    - Test publish from published returns 409
    - Test unpublish from draft returns 409
    - Test unarchive from active returns 409

  - [x]* 26.3 Write unit tests for authorization failures
    - Test teacher A cannot view teacher B's plan
    - Test teacher A cannot update teacher B's plan
    - Test student without enrollment cannot view published plan

- [x] 27. RLS policy verification tests
  - [x]* 27.1 Write direct database test for plan RLS
    - Create two teachers with plans
    - Query with authenticated client for teacher A
    - Verify only teacher A's plans returned

  - [x]* 27.2 Write direct database test for student plan access
    - Create teacher, plan, student with enrollment
    - Publish plan and grant access
    - Query with student authenticated client
    - Verify student sees only granted published plans

  - [x]* 27.3 Write direct database test for plan day RLS
    - Create plan days for two teachers
    - Query with authenticated client
    - Verify only own plan days returned through parent plan ownership

- [x] 28. Final checkpoint - Complete implementation verification
  - Run full test suite (unit + property + integration)
  - Verify all RLS policies enforce authorization correctly
  - Test complete workflows manually in browser
  - Verify error messages are user-friendly and consistent
  - Verify no security issues (data leakage, unauthorized access)
  - Test pagination, filtering, and search functionality
  - Verify status transitions work correctly with UI feedback
  - Verify video associations display correctly with Mux playback URLs
  - Test drag-drop reordering in UI
  - Ask the user if questions arise

- [x] 29. Documentation and cleanup
  - [x] 29.1 Add code comments to complex functions
    - Add JSDoc comments to all exported service functions
    - Document expected input/output and validation rules
    - Document error scenarios and status codes
    - Document RLS policy logic

  - [x] 29.2 Update README with plan module information
    - Document plan lifecycle (draft Ã¢â€ â€™ published Ã¢â€ â€™ archived)
    - Document plan day organization models (weekday vs date)
    - Document enrollment-based access control
    - Document video association reusability

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples, edge cases, and boundary conditions
- RLS policies are the ultimate security boundary and tested through direct database queries
- Plans represent intent (what teacher plans to teach), separate from lessons (what actually happened)
- Video associations are references, not copies - same video can be in multiple plan days
- Deletion protection ensures historical integrity when plans are referenced by lessons
- Status transitions follow strict state machine (draft Ã¢â€ â€ published, any Ã¢â€ â€™ archived, archived Ã¢â€ â€™ draft only)
- Enrollment-based access ensures students only see plans explicitly shared with them
- All timestamps stored in UTC regardless of user timezone
- Sort order enables drag-drop reordering in UI for better UX
