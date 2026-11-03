# Design Document: Student Portal

## Overview

The Student Portal module is a read-only, student-centric aggregation layer that consolidates data from multiple modules (lessons, plans, library, enrollments) into coherent student-facing views. It provides enrolled students with comprehensive visibility into their training across multiple teachers while enforcing strict data isolation, authorization, and privacy constraints.

**Core Purpose:** Deliver a secure, real-time view of a student's training journey—upcoming lessons, lesson history, published plans, authorized library content, and aggregate statistics—while maintaining absolute separation between multi-teacher contexts and protecting all teacher-private information.

**Key Characteristics:**
- Complete read-only access for students (no writes allowed)
- Multi-teacher awareness with clear content separation
- Strict RLS policies that prevent private_notes exposure (security critical)
- Real-time data consistency via Supabase subscriptions
- Enrollment-based authorization (students see only their data)
- Comprehensive pagination for large datasets
- Timezone-aware display of lesson times (UTC storage, local display)
- Aggregation across enrollments for portfolio views (total stats, all teachers)

---

## Architecture

### High-Level Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                  Student Portal Data Flow                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Authenticated Student (auth.uid())                              │
│         ↓                                                          │
│  1. Query through enrollment_id relationships                     │
│     (RLS enforces: only your enrollments)                         │
│         ↓                                                          │
│  2. Filter by status, dates, teacher                              │
│     (RLS enforces: private_notes never visible)                   │
│         ↓                                                          │
│  3. Aggregate across multiple teachers                            │
│     (statistics, lesson counts, techniques)                       │
│         ↓                                                          │
│  4. Real-time subscriptions to critical data                      │
│     (lessons, plans, technique access)                            │
│         ↓                                                          │
│  5. Return paginated, formatted responses                         │
│     (no write operations allowed)                                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

Data Domains Accessed by Student Portal:
  ├─ enrollments (student's relationships)
  ├─ lessons (through enrollment)
  ├─ monthly_plans (through plan_enrollments)
  ├─ plan_days (through plans)
  ├─ techniques (through student_technique_access)
  ├─ modules (through techniques)
  ├─ videos (through lesson_videos or module_videos)
  ├─ profiles (teachers and own profile)
  └─ shared_notes / private_notes (shared_notes only for students!)
```

### Authorization Model

**Three-Layer Authorization Enforcement:**

1. **API Route Layer** - Verify `auth.uid()` for user context
2. **RLS Policy Layer** - Enforce enrollment-based data access at database
3. **Query Layer** - Apply business logic filters (status, dates, archived)

**Data Access Paths:**

For student accessing lessons:
```
Student (auth.uid()) 
  → enrollments.student_profile_id = auth.uid()
  → lessons.enrollment_id IN (student's enrollment IDs)
  → RLS policy enforces this relationship
  → private_notes excluded at RLS level
```

For student accessing plans:
```
Student (auth.uid())
  → enrollments.student_profile_id = auth.uid()
  → plan_enrollments.enrollment_id IN (student's enrollment IDs)
  → monthly_plans.id from plan_enrollments
  → RLS enforces: status = 'published'
```

For student accessing library:
```
Student (auth.uid())
  → enrollments.student_profile_id = auth.uid()
  → student_technique_access.enrollment_id IN (student's enrollment IDs)
  → techniques.id from student_technique_access
  → videos through: lesson_videos OR module_videos
```

### Multi-Teacher Data Separation

Students with multiple teachers see all content aggregated, but with clear teacher identification:

```typescript
// Dashboard example with 2 teachers:
{
  upcomingLessons: [
    { id: "L1", startsAt: "...", teacherName: "João", enrollmentId: "E1" },
    { id: "L2", startsAt: "...", teacherName: "Maria", enrollmentId: "E2" }
  ],
  completedCount: 47,
  perTeacher: [
    { teacherId: "T1", teacherName: "João", lessons: 30 },
    { teacherId: "T2", teacherName: "Maria", lessons: 17 }
  ]
}
```

Every response includes teacher identification so students always know which teacher each item belongs to.

### Real-Time Consistency

Student portal uses Supabase real-time subscriptions for critical data:

```typescript
// Subscribe to student's lessons
supabase
  .channel('lessons')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'lessons', 
      filter: `enrollment_id=in.(${enrollmentIds})` },
    (payload) => {
      // Update local cache when teacher modifies lessons
      // Cancellation: lesson disappears immediately
      // Completion: moves to history
      // Schedule change: reflects immediately
    })
  .subscribe();

// Subscribe to plans
supabase
  .channel('plans')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'plan_enrollments',
      filter: `enrollment_id=in.(${enrollmentIds})` },
    (payload) => {
      // Update when teacher publishes new plan
    })
  .subscribe();
```

---

## Components and Interfaces

### Database Schema (Student Portal Views)

The student portal doesn't create new tables—it provides RLS-protected views of existing tables through controlled queries.

**Key RLS Policies for Students:**

```sql
-- Lessons: Students see only their own lessons (no private_notes)
CREATE POLICY lessons_student_select ON lessons
FOR SELECT
USING (
  auth.uid() IN (
    SELECT student_profile_id FROM enrollments
    WHERE enrollments.id = lessons.enrollment_id
  )
);

-- Note: private_notes column is excluded at RLS level
-- (uses row security with column-level filtering)

-- Monthly Plans: Students see only published plans from their enrollments
CREATE POLICY monthly_plans_student_select ON monthly_plans
FOR SELECT
USING (
  monthly_plans.status = 'published' AND
  monthly_plans.id IN (
    SELECT plan_id FROM plan_enrollments
    WHERE enrollment_id IN (
      SELECT id FROM enrollments
      WHERE student_profile_id = auth.uid()
    )
  )
);

-- Techniques: Students see only authorized techniques
CREATE POLICY techniques_student_select ON techniques
FOR SELECT
USING (
  techniques.id IN (
    SELECT technique_id FROM student_technique_access
    WHERE enrollment_id IN (
      SELECT id FROM enrollments
      WHERE student_profile_id = auth.uid()
    )
  )
  AND techniques.status != 'archived'
);

-- Videos: Through lesson associations or technique authorization
CREATE POLICY videos_student_select ON videos
FOR SELECT
USING (
  (
    -- Videos associated with student's lessons
    videos.id IN (
      SELECT video_id FROM lesson_videos
      WHERE lesson_id IN (
        SELECT id FROM lessons
        WHERE enrollment_id IN (
          SELECT id FROM enrollments
          WHERE student_profile_id = auth.uid()
        )
      )
    )
  ) OR (
    -- Videos in authorized techniques
    videos.id IN (
      SELECT video_id FROM module_videos
      WHERE module_id IN (
        SELECT id FROM modules
        WHERE technique_id IN (
          SELECT technique_id FROM student_technique_access
          WHERE enrollment_id IN (
            SELECT id FROM enrollments
            WHERE student_profile_id = auth.uid()
          )
        )
      )
    )
  )
) AND videos.status != 'archived';

-- NO DIRECT POLICY FOR private_notes (column excluded from selects)
-- Teachers updating private_notes doesn't affect student views
```

**Column-Level Security (private_notes exclusion):**

```sql
-- Ensure private_notes is never returned to students
-- Option 1: Row Level Security with column masking
-- Option 2: API layer never includes private_notes in SELECT
-- Option 3: Use views that exclude private_notes column

-- Recommended: Combine RLS with view approach
CREATE VIEW lessons_student_view AS
SELECT 
  id, teacher_id, enrollment_id, plan_day_id, 
  starts_at, ends_at, status, 
  shared_notes,  -- Include shared_notes
  -- private_notes EXCLUDED intentionally
  completed_at, created_at, updated_at
FROM lessons;

-- Student RLS policy references the view
CREATE POLICY lessons_student_select ON lessons_student_view
FOR SELECT
USING (
  auth.uid() IN (
    SELECT student_profile_id FROM enrollments
    WHERE enrollments.id = lessons.enrollment_id
  )
);
```

### TypeScript Types

```typescript
// types/student-portal.ts

export interface StudentDashboard {
  upcomingLessons: StudentLessonSummary[];
  recentLessons: StudentLessonSummary[];
  completedCount: number;
  teachers: TeacherSummary[];
  statistics: AggregateStatistics;
}

export interface StudentLessonSummary {
  id: string;
  startsAt: string; // ISO 8601 UTC
  endsAt: string;
  teacherName: string;
  enrollmentId: string;
  status: 'scheduled' | 'completed';
  videoCount: number;
  planDay?: {
    title: string;
  };
}

export interface StudentLessonDetail {
  id: string;
  startsAt: string;
  endsAt: string;
  teacherName: string;
  teacherId: string;
  enrollmentId: string;
  status: 'scheduled' | 'completed';
  sharedNotes: string | null;
  // private_notes: NEVER included
  videos: StudentVideo[];
  planDay?: {
    id: string;
    title: string;
    objective: string;
  };
  completedAt: string | null;
}

export interface StudentVideo {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  duration: number; // seconds
  playbackUrl?: string; // Only for completed lessons, or when student requests
}

export interface StudentPlan {
  id: string;
  title: string;
  description: string;
  periodStart: string; // ISO 8601 date
  periodEnd: string;
  teacherName: string;
  teacherId: string;
  enrollmentId: string;
}

export interface StudentPlanDay {
  id: string;
  weekday?: number; // 0-6 if recurring
  plannedDate?: string; // ISO 8601 date if specific
  title: string;
  objective: string;
  notes: string | null;
  videos: StudentVideo[];
}

export interface StudentTechnique {
  id: string;
  name: string;
  description: string;
  moduleCount: number;
  sortOrder: number;
  teacherName: string;
  enrollmentId: string;
}

export interface StudentModule {
  id: string;
  techniqueId: string;
  name: string;
  description: string;
  sortOrder: number;
  videoCount: number;
}

export interface StudentLibraryView {
  techniques: StudentTechnique[];
  modules: StudentModule[];
  videos: StudentVideo[];
}

export interface TeacherSummary {
  id: string;
  name: string;
  enrollmentId: string;
  enrollmentStatus: 'active' | 'archived';
  startedAt: string; // ISO 8601
  nextLessonDate?: string; // ISO 8601 date, if any
}

export interface AggregateStatistics {
  totalCompletedLessons: number;
  firstLessonDate?: string; // ISO 8601
  perTeacher: Array<{
    teacherId: string;
    teacherName: string;
    enrollmentId: string;
    completedLessons: number;
  }>;
}

export interface StudentProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface StudentLessonHistoryResponse {
  data: StudentLessonDetail[];
  meta: {
    pagination: PaginationMeta;
  };
}
```

---

## API Routes

### Dashboard Endpoints

#### GET `/api/student/dashboard`
**Fetch student's dashboard summary**

```
Query Parameters: None (uses authenticated student)

Response:
{
  data: {
    upcomingLessons: StudentLessonSummary[], // Next 3
    recentLessons: StudentLessonSummary[],   // Recent 3
    completedCount: number,
    teachers: TeacherSummary[],
    statistics: AggregateStatistics
  },
  meta: {
    fetchedAt: string; // ISO 8601
  }
}

Performance: Must complete within 2 seconds (optimized single query)
Real-time: Subscribe to changes via Supabase

Authorization: RLS enforces student's own enrollments
```

**Implementation Details:**
- Single aggregated query joins enrollments, lessons, plans, teachers
- Uses database indexes on enrollment_id, starts_at, status
- Caches teacher names to reduce JOIN complexity
- Upcoming: status='scheduled' AND starts_at > now(), LIMIT 3
- Recent: status='completed' AND starts_at < now(), ORDER BY starts_at DESC, LIMIT 3
- Never includes private_notes (view excludes it)

---

### Agenda Endpoints

#### GET `/api/student/agenda`
**View upcoming lessons with filters**

```
Query Parameters:
- enrollmentId?: string (filter by specific teacher, optional)
- fromDate?: string (ISO 8601 date)
- toDate?: string (ISO 8601 date)

Response:
{
  data: StudentLessonSummary[],
  meta: {
    pagination?: { page, pageSize, total, totalPages, hasNext, hasPrevious }
  }
}

Filtering:
- status = 'scheduled'
- starts_at >= now() (future lessons only)
- Sorted by starts_at ASC (earliest first)
- Filtered by enrollmentId if provided
- Filtered by date range if provided

Authorization: RLS enforces student's enrollments, no access to other students' data
```

---

### Lesson History Endpoints

#### GET `/api/student/lessons/history`
**View completed lessons with pagination**

```
Query Parameters:
- enrollmentId?: string (optional teacher filter)
- fromDate?: string (ISO 8601 date)
- toDate?: string (ISO 8601 date)
- page?: number (default 1)
- pageSize?: number (default 20, max 100)

Response:
{
  data: StudentLessonDetail[],
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    }
  }
}

Filtering:
- status = 'completed'
- starts_at < now() (past lessons only)
- Sorted by completed_at DESC (most recent first)
- Filtered by enrollmentId if provided
- Filtered by date range if provided

Pagination:
- Default page size: 20
- Max page size: 100
- Page 0 invalid (start at 1)
- Exceeding available pages returns empty array

Authorization: RLS enforces student's enrollments
Note: Cancelled and no_show lessons excluded entirely from history
```

**Response Never Includes:**
- private_notes (excluded at RLS level)
- video source field (internal detail)

---

#### GET `/api/student/lessons/[id]`
**View single completed lesson details**

```
URL Parameter: lessonId

Response:
{
  data: StudentLessonDetail
}

Validations:
- Lesson belongs to one of student's enrollments (RLS)
- Lesson status is 'completed'
- If any validation fails: 403 Forbidden

Authorization: RLS enforces enrollment ownership
```

---

### Training Plans Endpoints

#### GET `/api/student/plans`
**View published plans**

```
Query Parameters:
- enrollmentId?: string (optional teacher filter)

Response:
{
  data: StudentPlan[],
  meta: {}
}

Filtering:
- status = 'published'
- Through plan_enrollments for this student's enrollments
- Sorted by periodStart DESC (most recent first)
- Excludes plans from archived enrollments

Response includes:
- Plan title, description, period dates
- Teacher name and ID
- Enrollment ID for filtering other content

Authorization: RLS enforces plan_enrollments relationship
```

---

#### GET `/api/student/plans/[id]/days`
**View plan days within a published plan**

```
URL Parameter: planId

Response:
{
  data: StudentPlanDay[],
  meta: {}
}

Filtering:
- Plan must be published
- Plan must be accessible through student's enrollments
- Sorted by sort_order ASC

Response includes:
- Each plan day: weekday/date, title, objective, notes
- Associated videos with titles, thumbnails, durations
- NO private notes or teacher-only fields

Authorization: RLS enforces plan_enrollments relationship
Error: 403 if plan not published or not accessible
```

---

### Library Endpoints

#### GET `/api/student/library/techniques`
**View authorized techniques**

```
Query Parameters:
- enrollmentId?: string (optional teacher filter)

Response:
{
  data: StudentTechnique[],
  meta: {}
}

Filtering:
- Through student_technique_access relationship
- status != 'archived'
- Sorted by sort_order ASC
- Excludes from archived enrollments

Response includes:
- Technique name, description, module count
- Teacher who granted access
- Enrollment ID

Authorization: RLS enforces student_technique_access relationship
```

---

#### GET `/api/student/library/techniques/[id]/videos`
**View videos in authorized technique**

```
URL Parameter: techniqueId

Response:
{
  data: StudentVideo[],
  meta: {}
}

Organization:
- Grouped by module (returns all modules)
- Each module contains: id, name, description, videos
- Videos sorted by sort_order within module

Authorization:
- Student must have access via student_technique_access (RLS)
- Error: 403 if not authorized

Exclusions:
- Videos with status='archived' excluded
- Videos with status != 'ready' excluded from results
```

---

#### GET `/api/student/videos/[id]/playback-url`
**Generate signed playback URL for video**

```
URL Parameter: videoId

Response:
{
  data: {
    playbackUrl: string; // Mux signed URL with 24-hour expiration
    expiresAt: string;   // ISO 8601 timestamp
    videoTitle: string;
  }
}

Authorization:
- Student must have access through:
  - Lesson association (video in lesson_videos), OR
  - Technique authorization (video in module of authorized technique)
- RLS policies enforce both conditions

Validations:
- Video status must be 'ready' (not processing, archived, etc.)
- If status != 'ready': 409 Conflict error

Response:
- Signed URL uses Mux secure playback policy
- URL expires in 24 hours
- Expiration timestamp included for client tracking

Error Responses:
- 403 if student doesn't have access
- 404 if video not found
- 409 if video not ready
```

---

### Profile Endpoints

#### GET `/api/student/profile`
**View own profile**

```
Response:
{
  data: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  }
}

Authorization: RLS enforces student can only see own profile
Response Format: ISO 8601 timestamps with UTC
```

---

#### PATCH `/api/student/profile`
**Update own profile**

```
Request Body:
{
  fullName?: string;    // 2-255 characters, required if provided
  avatarUrl?: string;   // Valid URL or null
}

Restrictions:
- Email CANNOT be modified via this endpoint
- Only fullName and avatarUrl are updatable

Validations:
- fullName: 2-255 characters, non-empty after trimming
- avatarUrl: valid URL format (if provided)
- Trim whitespace before validation

Response:
{
  data: StudentProfile;
}

Error Responses:
- 400 if validation fails (with field-specific errors)
- 401 if not authenticated

Side Effects:
- updated_at timestamp auto-updated by database
- NO enrollment data returned with profile response

Authorization: RLS enforces student can only modify own profile
```

---

### Teachers List Endpoint

#### GET `/api/student/teachers`
**View all teachers (active enrollments)**

```
Response:
{
  data: Array<{
    id: string;              // Teacher ID
    name: string;            // Teacher display name
    enrollmentId: string;    // For filtering other content
    enrollmentStatus: 'active' | 'archived';
    startedAt: string;       // ISO 8601
    nextLessonDate?: string; // ISO 8601 date if upcoming lesson exists
  }>
}

Filtering:
- Only active enrollments (by default)
- Includes teacher information from profile
- Next lesson date calculated from lessons table

Authorization: RLS enforces student can only see own enrollments
```

---

### Statistics Endpoint

#### GET `/api/student/statistics`
**View aggregate statistics across all enrollments**

```
Response:
{
  data: {
    totalCompletedLessons: number;
    firstLessonDate?: string;  // ISO 8601, null if no completed lessons
    perTeacher: Array<{
      teacherId: string;
      teacherName: string;
      enrollmentId: string;
      completedLessons: number;
    }>;
  }
}

Calculations:
- Total: SUM of completed lessons across all active enrollments
- Excludes: cancelled, no_show lessons
- Excludes: lessons from archived enrollments
- Per-teacher: Breakdown by enrollment

Real-time:
- Updates when teacher marks lesson complete
- Updates when lesson marked as cancelled (decrements)
- Updates when enrollment archived (removes from total)

Authorization: RLS enforces calculations use only student's enrollments
```

---

## Frontend Components

### Teacher-Facing Components

**StudentDashboard** (Server Component)
- Fetches `/api/student/dashboard`
- Displays 3 upcoming lessons + 3 recent lessons
- Shows total completed count + per-teacher breakdown
- Renders teacher summary cards with next lesson dates
- Real-time updates via Supabase subscription

**StudentAgendaView** (Server Component)
- Fetches `/api/student/agenda`
- Displays upcoming lessons list
- Supports date range filter and teacher/enrollment filter
- Links to lesson details

**StudentHistoryView** (Client Component)
- Fetches `/api/student/lessons/history` with pagination
- Displays completed lessons in paginated table
- Supports date range and teacher filters
- Lazy-loads as user scrolls or changes page

**StudentLessonDetailModal** (Client Component)
- Fetches `/api/student/lessons/[id]`
- Shows full lesson details with videos
- Video list with play buttons
- Related plan day information

**StudentPlansView** (Server Component)
- Fetches `/api/student/plans`
- Displays published plans as cards
- Lists plan days with preview
- Links to expand and view full plan day details

**StudentLibraryBrowser** (Client Component)
- Fetches `/api/student/library/techniques`
- Shows techniques tree/list
- On technique select: Fetches `/api/student/library/techniques/[id]/videos`
- Displays modules with videos
- Video player with `/api/student/videos/[id]/playback-url`

**StudentProfileEditor** (Client Component)
- Fetches `/api/student/profile`
- Form to update fullName and avatarUrl
- PATCH to `/api/student/profile`
- Validation and error display

**StudentTeachersView** (Server Component)
- Fetches `/api/student/teachers`
- Displays list of teachers with enrollment status
- Shows next lesson date for each

---

## Error Handling

### HTTP Status Codes

```typescript
// 401 Unauthorized - Not authenticated or session invalid
{
  error: "Authentication required",
  code: "AUTH_REQUIRED"
}

// 403 Forbidden - Authenticated but not authorized for this resource
{
  error: "Access denied",
  code: "ACCESS_DENIED"
  // Does NOT expose reason (could leak data)
}

// 404 Not Found - Resource doesn't exist
{
  error: "Resource not found",
  code: "NOT_FOUND"
}

// 400 Bad Request - Validation failed
{
  error: "Validation failed",
  fields: {
    fromDate: "Invalid ISO 8601 format",
    pageSize: "Must be between 1 and 100"
  }
}

// 409 Conflict - Business rule violation (video not ready)
{
  error: "Video is still processing",
  code: "VIDEO_PROCESSING"
}

// 500 Internal Server Error - Unexpected error
{
  error: "Internal server error",
  code: "INTERNAL_ERROR"
  // Never expose stack trace or internal details
}
```

### Security-Conscious Error Messages

**DO:**
- "Access denied" - Generic, no details
- "Resource not found" - Doesn't indicate why
- "Authentication required" - Clear action needed
- "Video is still processing" - Non-sensitive business reason

**DON'T:**
- "Enrollment E123 doesn't belong to student S456" - Leaks IDs
- "Teacher's private note: 'Student struggling'" - Exposes private data
- "Plan not published to enrollment E789" - Leaks enrollment info
- Stack traces or database query details

---

## Integration Points

### With Enrollments Module

- Student portal depends on active enrollments to scope data access
- Enrollment archival: lessons remain queryable but not counted in aggregate
- Enrollment with status='archived' excluded from "Teachers" list

### With Lessons Module

- Fetches lessons through enrollment relationships
- Filters by status (scheduled, completed only for students)
- Cancelled/no_show lessons hidden from all student views
- Respects private_notes exclusion (RLS enforces)
- Uses completed_at timestamp for history sorting

### With Plans Module

- Accesses through plan_enrollments relationship
- Only published plans visible (RLS enforces)
- Plan day video associations included in responses
- Plan changes don't retroactively affect lesson references

### With Library Module

- Techniques accessed through student_technique_access
- Videos accessed through lesson_videos or module_videos
- Video playback URLs generated via Mux integration
- Archived videos excluded from results

### With Video/Mux Integration

- Playback URLs generated on-demand with 24-hour expiration
- Signed URLs ensure only authorized students can access
- Video ready status checked before URL generation

---

## Testing Strategy

### Unit Tests (Examples and Edge Cases)

**Authorization Tests**
- Student cannot query lessons from other students (RLS)
- Student cannot view private_notes (RLS column exclusion)
- Student cannot access unshared techniques (RLS)
- Student cannot access videos without authorization (RLS)

**Data Completeness Tests**
- Dashboard response includes all required fields
- Lesson detail response includes teacher name
- History response excludes cancelled/no_show lessons
- Statistics correctly calculate per-teacher breakdown

**Pagination Tests**
- Default page size is 20
- Max page size is 100
- Page size > 100 rejected with 400
- Exceeding available pages returns empty array

**Filtering Tests**
- Date range filter works correctly (from_date, to_date)
- Teacher/enrollment filter restricts to single teacher
- Filters combine correctly (both date and teacher)
- Empty results return empty array (not null)

**Timestamp Tests**
- All timestamps in ISO 8601 format with Z suffix (UTC)
- completed_at set accurately when lesson marked complete
- created_at immutable after creation
- updated_at updated on profile changes

**Error Response Tests**
- 403 for unauthorized resource access
- 404 for non-existent resources
- 409 for video not ready
- 400 for validation failures
- Error messages don't expose sensitive details

**Real-Time Tests**
- Cancelled lessons disappear from student views within 5 seconds
- Completed lessons move to history within 5 seconds
- New lessons appear in agenda within 5 seconds
- Revoked techniques disappear from library immediately

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Data Access & Authorization Properties

#### Property 1: Student Dashboard Shows Only Own Lessons
*For any* student with multiple enrollments, the dashboard response includes only lessons where the enrollment_id matches one of the student's enrollments (verified through the enrollments table). No lessons from other students appear regardless of content.

**Validates: Requirements 1.5, 3.5, 10.5, 26.1, 26.4**

#### Property 2: Private Notes Never Exposed
*For any* student querying any endpoint, the response never contains the private_notes field, regardless of the lesson's status (scheduled or completed). RLS policies exclude private_notes at the database level before data reaches the API.

**Validates: Requirements 4.6, 10.6, 13.6, 18.1, 18.2, 18.3, 18.4, 18.5**

#### Property 3: Cancelled and No-Show Lessons Excluded
*For any* student querying agenda or history, lessons with status='cancelled' or status='no_show' never appear in results. Only lessons with status='scheduled' appear in agenda, and only status='completed' appear in history.

**Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.6**

#### Property 4: Multi-Teacher Data Includes Teacher Identification
*For any* lesson, plan, or technique in a response to a student with multiple teachers, the response includes the teacher's name or ID (enrollmentId for filtering). No ambiguity about which teacher content belongs to.

**Validates: Requirements 1.6, 3.6, 5.5, 6.6, 24.1, 24.2, 24.3, 24.4**

#### Property 5: Enrollment-Based Access Control
*For any* student attempting to access a resource with enrollmentId parameter, if that enrollmentId does not belong to the student's active enrollments, the API returns 403 Forbidden. The RLS policy enforces this at the database level.

**Validates: Requirements 3.5, 5.2, 12.2, 12.3, 12.5, 26.1, 26.2, 26.5, 26.6, 26.7**

#### Property 6: Read-Only Access for Students
*For any* write operation (POST, PATCH, DELETE) on lessons, plans, library content, or enrollments attempted by a student (non-teacher role), the API returns 403 Forbidden. Students have read-only access to all resources.

**Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6**

#### Property 7: RLS Prevents Cross-Enrollment Data Leakage
*For any* two students with different enrollments, if Student A attempts to query data through Student B's enrollment, the RLS policy returns zero rows. No error is thrown (to avoid information disclosure), but data access is prevented.

**Validates: Requirements 26.4, 26.6**

#### Property 8: Video Access Authorization—Dual-Path
*For any* student requesting a video playback URL, the authorization check verifies the student has access through ONE of two paths: (1) lesson association (video in student's completed/scheduled lesson), OR (2) technique authorization (video in module of authorized technique). If neither condition is met, 403 is returned.

**Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5, 23.7, 9.1, 9.4, 9.5**

#### Property 9: Technique Access Through Authorization Relationship
*For any* student querying techniques, results include only techniques where a student_technique_access record exists for one of the student's enrollments. Archived techniques excluded. All returned techniques have an associated teacher (enrollmentId).

**Validates: Requirements 7.1, 7.3, 7.6, 21.7**

#### Property 10: Plans Only Visible When Published
*For any* student querying plans or plan days, only plans with status='published' appear in results. If a teacher unpublishes a plan, it immediately disappears from the student's view (via RLS + real-time subscription).

**Validates: Requirements 5.2, 5.3, 6.2, 6.7, 20.7**

### Data Aggregation & Filtering Properties

#### Property 11: Dashboard Aggregates Across Enrollments
*For any* student with multiple enrollments, the dashboard statistics field includes both total count and per-teacher breakdown. The total is the SUM of all completed lessons across all active enrollments.

**Validates: Requirements 1.2, 2.1, 2.6, 17.1, 17.2, 17.3**

#### Property 12: Completed Count Excludes Cancelled and No-Show
*For any* aggregation of lesson counts (dashboard, statistics, per-teacher), the count includes only lessons with status='completed'. Cancelled, no_show, and scheduled lessons are excluded.

**Validates: Requirements 2.2, 2.5, 17.6, 42.5**

#### Property 13: Archived Enrollments Excluded from Aggregates
*For any* aggregation (dashboard statistics, total counts, per-teacher breakdown), lessons from enrollments with status='archived' are excluded. Active enrollments only are included.

**Validates: Requirements 2.3, 5.6, 16.5, 17.7**

#### Property 14: Dashboard Shows Next 3 and Recent 3 Lessons
*For any* student, the dashboard response includes at most 3 upcoming lessons and at most 3 completed lessons. If fewer than 3 exist, returns however many are available. Upcoming sorted by starts_at ASC, completed sorted by starts_at DESC.

**Validates: Requirements 1.3, 1.4, 30.6**

#### Property 15: Date Range Filtering Works Correctly
*For any* history or agenda query with date range parameters (from_date, to_date), results include only lessons where the lesson's date falls within the inclusive range. Partial ranges (only from_date or only to_date) work correctly.

**Validates: Requirements 3.4, 11.1, 11.2, 11.3, 11.4, 11.7**

#### Property 16: Teacher Filter Isolates Single Enrollment
*For any* history or agenda query with enrollmentId parameter, results include only lessons from that specific enrollment. Other enrollments' lessons are excluded.

**Validates: Requirements 12.1, 12.4, 12.6**

#### Property 17: Filtering Preserves Sort Order
*For any* query with filters applied (date range, teacher, etc.), the response maintains correct sort order: agenda sorted by starts_at ASC, history sorted by completed_at DESC, plans sorted by period_start DESC.

**Validates: Requirements 3.3, 5.4, 10.3, 12.7, 22.7**

#### Property 18: Empty Results Return Empty Array
*For any* student with no upcoming lessons, no completed lessons, no authorized techniques, or no active teachers, the respective endpoint returns an empty array (not null, not error).

**Validates: Requirements 1.7, 3.7, 5.7, 7.7, 16.7**

### Pagination Properties

#### Property 19: Pagination Default Page Size Is 20
*For any* paginated endpoint (history) without explicit pageSize parameter, the default page size is 20 lessons per page.

**Validates: Requirements 10.7, 27.2**

#### Property 20: Pagination Metadata Complete
*For any* paginated response, the meta.pagination object includes: page (current), pageSize, total (total records), totalPages, hasNext (boolean), hasPrevious (boolean).

**Validates: Requirements 27.3, 27.4**

#### Property 21: Page Size Validation
*For any* pageSize parameter > 100, the API returns 400 Bad Request. Values between 1-100 are accepted. Default is 20.

**Validates: Requirements 27.7**

#### Property 22: Out-of-Bounds Page Returns Empty Array
*For any* page number that exceeds the available pages, the API returns an empty data array and correct pagination metadata (showing the page is beyond range).

**Validates: Requirements 27.6**

#### Property 23: Pagination Works With Filters
*For any* history query with both pagination parameters (page, pageSize) and filters (enrollmentId, date range), the filters are applied first, then pagination. Total count reflects filtered dataset.

**Validates: Requirements 27.5, 11.7, 12.4**

### Response Structure & Content Properties

#### Property 24: Lesson Detail Response Complete
*For any* lesson detail response (dashboard, history detail, agenda detail), the response includes: id, startsAt, endsAt, teacherName, enrollmentId, status, sharedNotes (nullable), videos (array), planDay (optional), completedAt (nullable). NEVER includes private_notes.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 13.1, 13.2, 13.3, 13.4**

#### Property 25: Teacher Identification Always Present
*For any* multi-enrollment response (multiple teachers), each record includes teacher identification (teacherName, teacherId, or enrollmentId). No record is ambiguous about which teacher it belongs to.

**Validates: Requirements 3.2, 5.3, 16.2, 24.4**

#### Property 26: Video Data Includes All Fields
*For any* video in a response, the video object includes: id, title, description (nullable), thumbnailUrl (nullable), duration (seconds). Playback URLs only included when explicitly requested or available.

**Validates: Requirements 4.3, 8.2, 10.4, 13.3**

#### Property 27: Timestamps In ISO 8601 UTC Format
*For any* timestamp in an API response (startsAt, endsAt, createdAt, completedAt, etc.), the format is ISO 8601 with Z suffix indicating UTC (e.g., "2026-11-15T14:30:00Z").

**Validates: Requirements 14.7, 29.1, 29.4, 29.5, 29.7**

#### Property 28: Profile Response Excludes Enrollment Data
*For any* profile endpoint response (/api/student/profile), the response includes only: id, fullName, email, avatarUrl, createdAt, updatedAt. NO enrollment data, teacher references, or statistics.

**Validates: Requirements 14.4**

#### Property 29: Plan Day Response Excludes Private Fields
*For any* plan day response, the response includes: id, weekday/plannedDate, title, objective, notes (nullable), videos. NEVER includes teacher-private annotations or editing metadata.

**Validates: Requirements 6.6**

### Timestamp & Completion Properties

#### Property 30: Dashboard Next Lesson Only Future Lessons
*For any* dashboard "upcoming lessons" field, all lessons have starts_at > current_time. No lesson with starts_at in the past appears in upcoming.

**Validates: Requirements 1.1, 3.3**

#### Property 31: Dashboard Recent Lessons Only Past Lessons
*For any* dashboard "recent lessons" field, all lessons have starts_at < current_time AND status='completed'. No future lessons or non-completed lessons appear.

**Validates: Requirements 1.3, 10.1**

#### Property 32: Completed-At Timestamp Set on Completion
*For any* lesson marked complete via teacher portal, the completed_at timestamp is set to the current system time (not the lesson's starts_at). Remains immutable after setting.

**Validates: Requirements 15.5, 36.5, 36.6**

#### Property 33: History Sorted by Completed-At Descending
*For any* lesson history query, results are sorted by completed_at in descending order (most recent first). If completed_at is NULL for any reason, such lessons are excluded.

**Validates: Requirements 10.3, 44.1**

#### Property 34: Created-At Immutable After Creation
*For any* resource (lesson, enrollment, etc.) visible in student portal, the createdAt timestamp never changes after initial creation, regardless of subsequent updates.

**Validates: Requirements 11.6, 11.7**

### Real-Time Consistency Properties

#### Property 35: Cancelled Lesson Disappears Immediately
*For any* lesson that is marked cancelled by a teacher, the lesson disappears from the student's agenda view within 5 seconds. RLS policy enforces status filtering + real-time subscription triggers update.

**Validates: Requirements 22.7, 25.7**

#### Property 36: Completed Lesson Moves to History
*For any* lesson marked complete by a teacher, the lesson moves from agenda (scheduled view) to history (completed view) within 5 seconds. Appears in history with completed_at timestamp.

**Validates: Requirements 25.3**

#### Property 37: New Lesson Appears in Agenda
*For any* new lesson scheduled by a teacher for a student, the lesson appears in the student's agenda within 5 seconds (via real-time subscription or polling).

**Validates: Requirements 25.2**

#### Property 38: Revoked Technique Access Immediate
*For any* student_technique_access record deleted (teacher revokes access), the technique and its videos disappear from student library immediately via real-time update.

**Validates: Requirements 23.6, 25.4**

#### Property 39: API Response Uses Current Database State
*For any* API route response, data is queried from current database state (not cached). No stale data is returned. If teacher just created a lesson 1 second ago, agenda query includes it.

**Validates: Requirements 25.6**

### Profile Update Properties

#### Property 40: Full Name Validation—Minimum Length
*For any* profile update with fullName parameter, values with < 2 characters (after trimming) are rejected with 400 Bad Request and field-specific error message.

**Validates: Requirements 15.2**

#### Property 41: Full Name Trimmed Before Validation
*For any* profile update with fullName containing leading/trailing whitespace, the whitespace is trimmed before validation. A value like "  John  " is treated as "John".

**Validates: Requirements 15.7**

#### Property 42: Email NOT Updatable
*For any* profile update request including an email parameter, the update is rejected or the email parameter is ignored. Email cannot be changed via this endpoint.

**Validates: Requirements 15.4**

#### Property 43: Updated-At Timestamp Auto-Updated
*For any* profile update via PATCH /api/student/profile, the updated_at timestamp is automatically set to the current time by the database.

**Validates: Requirements 15.5**

#### Property 44: Profile Update Response Includes All Fields
*For any* profile update response, the response includes the updated profile with all fields: id, fullName, email, avatarUrl, createdAt, updatedAt.

**Validates: Requirements 14.2, 15.1**

### Error Response Properties

#### Property 45: 403 Error Returned For Access Denied
*For any* student attempting to access a lesson from another enrollment, the API returns 403 Forbidden with generic message "Access denied". No details about why access was denied.

**Validates: Requirements 28.1, 4.7, 12.5, 13.7, 20.4, 21.4**

#### Property 46: 404 Error For Non-Existent Resource
*For any* student requesting a non-existent lesson, plan, or video (valid UUID format but resource doesn't exist), the API returns 404 Not Found with message "Resource not found".

**Validates: Requirements 28.2**

#### Property 47: 409 Error For Video Not Ready
*For any* playback URL request for a video with status != 'ready' (processing, archived, etc.), the API returns 409 Conflict with message "Video is still processing".

**Validates: Requirements 9.6, 28.3**

#### Property 48: 400 Error For Validation Failure
*For any* request with invalid parameters (invalid date format, pageSize > 100, etc.), the API returns 400 Bad Request with field-specific error messages in the fields object.

**Validates: Requirements 28.4**

#### Property 49: 401 Error When Not Authenticated
*For any* unauthenticated request to a protected endpoint, the API returns 401 Unauthorized with message "Authentication required".

**Validates: Requirements 28.5, 14.6**

#### Property 50: Error Messages Don't Expose Sensitive Data
*For any* error response, the error message and fields do not expose: internal IDs (unless necessary for client action), teacher information, private data, database query details, or system internals.

**Validates: Requirements 28.6**

#### Property 51: Security Logging for Auth/Access Errors
*For any* 401 or 403 error, the server logs the event including timestamp, student ID, endpoint, and reason (for future security audit).

**Validates: Requirements 28.7, 18.6**

### Performance Properties

#### Property 52: Dashboard Completes Within 2 Seconds
*For any* student loading the dashboard endpoint, the response is delivered within 2 seconds from request to response, including database query, aggregations, and serialization.

**Validates: Requirements 30.1**

#### Property 53: Single Optimized Query For Dashboard
*For any* dashboard endpoint, the backend executes a single optimized database query (possibly with efficient subqueries/JOINs) rather than N+1 queries. Teacher names are cached or efficiently joined.

**Validates: Requirements 30.2, 30.3**

#### Property 54: Database Indexes on Key Columns
*For any* student portal query, the database includes indexes on: enrollment_id, student_profile_id, starts_at, status, period_start. Query planner can use these indexes to optimize lookups.

**Validates: Requirements 30.4**

#### Property 55: Teacher Names Cached For Efficiency
*For any* response including multiple lessons from the same teacher, the teacher name is included in each record without multiplying database lookups. Teacher names are either: (1) cached, (2) joined efficiently, or (3) included in view definition.

**Validates: Requirements 30.5**

### Specialized Edge Cases

#### Property 56: Statistics First Lesson Date Nullable
*For any* new student with no completed lessons, the statistics response includes totalCompletedLessons=0 and firstLessonDate=null (not undefined, not omitted). Returns well-formed response even for new students.

**Validates: Requirements 17.4**

#### Property 57: Next Lesson Optional in Teachers List
*For any* teacher in the teachers list response, the nextLessonDate field is optional. If no upcoming lesson exists for that teacher, the field is omitted or null.

**Validates: Requirements 16.3**

#### Property 58: Video Playback URL 24-Hour Expiration
*For any* signed playback URL generated, the URL is valid for exactly 24 hours from generation time. After 24 hours, the URL is invalid and a new request must be made to generate a fresh URL.

**Validates: Requirements 9.2**

#### Property 59: Playback URL Uses Mux Secure Policy
*For any* playback URL generated, the URL is a Mux signed URL using Mux's secure playback policy (not an unsigned public URL). The signature ensures only authorized students can play the video.

**Validates: Requirements 9.7**

#### Property 60: Date Validation Accepts ISO 8601
*For any* date parameter (fromDate, toDate), values must be in ISO 8601 date format (YYYY-MM-DD). Invalid formats like "2026/11/15" or "15-11-2026" are rejected with 400 Bad Request.

**Validates: Requirements 11.5**

---

## Testing Strategy

### Unit Tests (Examples and Edge Cases)

**Dashboard Tests**
- Student with no lessons: returns empty upcomingLessons/recentLessons
- Student with 1 upcoming lesson: returns single lesson, not multiplied
- Student with 10 completed lessons: returns only recent 3, sorted correctly
- Dashboard complete within 2 seconds (performance)

**Authorization Tests**
- Student A cannot see Student B's lessons (RLS)
- Student cannot see private_notes (RLS column exclusion)
- Student cannot modify any lesson (read-only)
- Unauthenticated requests return 401

**Data Completeness Tests**
- Lesson response includes all required fields
- Teacher name always present in multi-teacher response
- Private_notes field absent from all responses
- Pagination metadata present and correct

**Filtering Tests**
- Date range filter works (from_date, to_date, combinations)
- Teacher filter restricts to single enrollment
- Cancelled/no_show lessons excluded from all views
- Empty filters return all available data

**Pagination Tests**
- Default page size is 20
- Max page size is 100, pageSize=101 rejected
- Out-of-bounds page returns empty array
- Pagination metadata accurate for any page

**Timestamp Tests**
- All timestamps in ISO 8601 UTC format (Z suffix)
- completed_at set accurately on lesson completion
- created_at immutable after creation
- updated_at updated on profile changes

**Error Tests**
- 403 for unauthorized access (generic message)
- 404 for non-existent resource
- 409 for video not ready
- 400 for validation failure with field details
- Error messages don't expose sensitive data

**Real-Time Tests**
- Cancelled lesson disappears within 5 seconds
- Completed lesson moves to history within 5 seconds
- New lesson appears in agenda within 5 seconds
- Revoked technique access disappears immediately

---

### Property-Based Tests (Universal Properties)

Each property will have a corresponding property-based test using Hypothesis (Python) or fast-check (TypeScript), configured to run minimum 100 iterations.

**Property-Based Test Naming Convention:**
```
Feature: student-portal, Property {N}: {Property Title}
```

**Examples:**

**Property 1: Student Dashboard Shows Only Own Lessons**
```typescript
// Feature: student-portal, Property 1: Student Dashboard Shows Only Own Lessons
describe('Property 1: Student Dashboard Shows Only Own Lessons', () => {
  it('should exclude lessons from other enrollments', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student1
        fc.uuid(),      // student2
        fc.array(fc.uuid(), { minLength: 1 }), // lessons for student1
        async (student1Id, student2Id, lessonIds) => {
          fc.pre(student1Id !== student2Id);
          
          // Create enrollments for both students
          const enr1 = await createEnrollment(teacher1Id, student1Id);
          const enr2 = await createEnrollment(teacher2Id, student2Id);
          
          // Create lessons for each enrollment
          const lessons1 = await Promise.all(
            lessonIds.map(lid => createLesson(teacher1Id, enr1.id))
          );
          
          // Student1 dashboard should not include lessons from enr2
          const dashboard = await getDashboardAs(student1Id);
          
          return !dashboard.data.upcomingLessons.some(
            l => !lessons1.some(l2 => l2.id === l.id)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 2: Private Notes Never Exposed**
```typescript
// Feature: student-portal, Property 2: Private Notes Never Exposed
describe('Property 2: Private Notes Never Exposed', () => {
  it('should never include private_notes in any response', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student
        fc.string(),    // private note content
        async (studentId, privateNote) => {
          const enrollment = await createEnrollment(teacherId, studentId);
          const lesson = await createLesson(
            teacherId, 
            enrollment.id, 
            { privateNotes: privateNote }
          );
          
          // Query through student endpoints
          const dashboard = await getDashboardAs(studentId);
          const detail = await getLessonDetailAs(studentId, lesson.id);
          const history = await getHistoryAs(studentId);
          
          // Check no response includes private_notes
          const allData = JSON.stringify({
            dashboard,
            detail,
            history
          });
          
          return !allData.includes(privateNote);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 5: Enrollment-Based Access Control**
```typescript
// Feature: student-portal, Property 5: Enrollment-Based Access Control
describe('Property 5: Enrollment-Based Access Control', () => {
  it('should deny access when enrollmentId does not belong to student', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student1
        fc.uuid(),      // student2
        async (student1Id, student2Id) => {
          fc.pre(student1Id !== student2Id);
          
          const enr1 = await createEnrollment(teacher1Id, student1Id);
          const enr2 = await createEnrollment(teacher2Id, student2Id);
          
          // Student1 tries to use Student2's enrollmentId
          try {
            await getAgendaAs(student1Id, { enrollmentId: enr2.id });
            return false; // Should have thrown 403
          } catch (err) {
            return err.status === 403;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 11: Dashboard Aggregates Across Enrollments**
```typescript
// Feature: student-portal, Property 11: Dashboard Aggregates Across Enrollments
describe('Property 11: Dashboard Aggregates Across Enrollments', () => {
  it('should sum completed lessons from all active enrollments', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student
        fc.array(fc.integer({ min: 0, max: 10 }), { 
          minLength: 2, 
          maxLength: 4 
        }), // lessons per teacher
        async (studentId, lessonCounts) => {
          // Create multiple enrollments
          const enrollments = await Promise.all(
            lessonCounts.map((_, i) => 
              createEnrollment(fc.sample(fc.uuid(), 1)[0], studentId)
            )
          );
          
          // Create lessons for each enrollment
          let totalCreated = 0;
          await Promise.all(
            enrollments.map((enr, i) => {
              const count = lessonCounts[i];
              totalCreated += count;
              return Promise.all(
                Array(count).fill(0).map(() => 
                  createAndCompleteLesson(teachers[i], enr.id)
                )
              );
            })
          );
          
          const dashboard = await getDashboardAs(studentId);
          return dashboard.data.statistics.totalCompletedLessons === totalCreated;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 19: Pagination Default Page Size Is 20**
```typescript
// Feature: student-portal, Property 19: Pagination Default Page Size Is 20
describe('Property 19: Pagination Default Page Size Is 20', () => {
  it('should use page size of 20 when not specified', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student
        fc.array(fc.uuid(), { minLength: 30, maxLength: 50 }),
        async (studentId, lessonIds) => {
          const enrollment = await createEnrollment(teacherId, studentId);
          
          // Create many completed lessons
          await Promise.all(
            lessonIds.map(id => createAndCompleteLesson(teacherId, enrollment.id))
          );
          
          // Query without explicit page size
          const response = await getHistoryAs(studentId, { page: 1 });
          
          // Should return 20 items or fewer if total < 20
          return (
            response.data.length <= 20 &&
            response.meta.pagination.pageSize === 20
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 27: Timestamps In ISO 8601 UTC Format**
```typescript
// Feature: student-portal, Property 27: Timestamps In ISO 8601 UTC Format
describe('Property 27: Timestamps In ISO 8601 UTC Format', () => {
  it('should return all timestamps in ISO 8601 with Z suffix', () => {
    fc.assert(
      fc.property(
        fc.uuid(),      // student
        async (studentId) => {
          const enrollment = await createEnrollment(teacherId, studentId);
          const lesson = await createAndCompleteLesson(teacherId, enrollment.id);
          
          const dashboard = await getDashboardAs(studentId);
          const detail = await getLessonDetailAs(studentId, lesson.id);
          
          // Regex for ISO 8601 with Z: YYYY-MM-DDTHH:mm:ssZ
          const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
          
          const timestamps = [
            dashboard.data.upcomingLessons[0]?.startsAt,
            detail.data.startsAt,
            detail.data.completedAt
          ].filter(Boolean);
          
          return timestamps.every(ts => iso8601Regex.test(ts));
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Configuration

- **Framework:** Hypothesis (Python) / fast-check (TypeScript)
- **Minimum iterations:** 100 per property
- **Shrinking:** Enabled (to find minimal failing examples)
- **Seed:** Random by default, fixed for reproducibility in CI
- **Timeout:** 30 seconds per property test

---

## Performance Considerations

### Database Indexing

```sql
-- Student enrollment-based queries
CREATE INDEX idx_enrollments_student_id ON enrollments(student_profile_id);

-- Lessons by enrollment (fastest path)
CREATE INDEX idx_lessons_enrollment_id ON lessons(enrollment_id);

-- Dashboard aggregations
CREATE INDEX idx_lessons_enrollment_status ON lessons(enrollment_id, status);

-- History queries
CREATE INDEX idx_lessons_completed_at ON lessons(completed_at DESC)
WHERE status = 'completed';

-- Upcoming lessons
CREATE INDEX idx_lessons_scheduled_future ON lessons(starts_at ASC)
WHERE status = 'scheduled' AND starts_at > now();

-- Plan enrollments
CREATE INDEX idx_plan_enrollments_enrollment_id ON plan_enrollments(enrollment_id);

-- Technique access
CREATE INDEX idx_student_technique_access_enrollment ON student_technique_access(enrollment_id);

-- Multi-table joins
CREATE INDEX idx_lessons_teacher_enrollment_status ON lessons(teacher_id, enrollment_id, status);
```

### Query Optimization

- Dashboard uses single JOIN query across enrollments, lessons, plans
- Pagination metadata calculated from COUNT(*) on filtered dataset
- Teacher names fetched/cached once, not repeated per lesson
- Upcoming lessons uses LIMIT 3 for dashboard, not fetching all then slicing
- History pagination uses OFFSET/LIMIT efficiently with indexed columns

---

## Security Considerations

### RLS Policy Enforcement

- All student queries filtered by `auth.uid()` at database level
- private_notes column excluded from student-accessible views
- Enrollment verification uses foreign key relationships
- Status filtering (published, completed, etc.) enforced at RLS level
- No application-level authorization bypasses (RLS is primary defense)

### Input Validation

- All UUID parameters validated before database query
- Date parameters parsed and validated as ISO 8601 format
- Page size parameters validated (1-100 range)
- Enrollment IDs verified to belong to student before use
- Note content length validated (max 5000 chars, for profile updates)

### Error Response Safety

- 403 errors return generic message (no details about why)
- 404 errors don't indicate if resource exists but user lacks access
- Validation errors include field names but no internal details
- Stack traces never exposed in error responses
- Sensitive data (IDs, private content) never appears in errors

---

## Deployment Checklist

- [ ] RLS policies created and tested for all tables
- [ ] Column-level security ensured for private_notes
- [ ] Database indexes created on all key columns
- [ ] API routes deployed with auth middleware
- [ ] Property-based tests passing with 100+ iterations
- [ ] Unit tests for edge cases passing
- [ ] Authorization testing completed (cross-student isolation)
- [ ] Real-time subscriptions tested (Supabase)
- [ ] Pagination tested with various page sizes
- [ ] Error responses validated (no sensitive data exposed)
- [ ] Performance verified (dashboard < 2 seconds)
- [ ] Timestamp format validation (ISO 8601 UTC)
- [ ] Multi-teacher data separation verified
- [ ] Private notes exclusion verified in all endpoints

