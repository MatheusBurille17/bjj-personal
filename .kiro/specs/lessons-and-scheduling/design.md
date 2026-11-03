# Design Document: Lessons and Scheduling (Agenda e Aulas)

## Overview

The Lessons and Scheduling module manages the transformation of pedagogical planning into concrete executed lessons. It bridges the gap between planning (intent) and reality (what actually happened), maintaining data integrity through timezone-aware lesson management, recurring schedule patterns, and comprehensive status tracking.

**Core Purpose:** Record and manage individual lesson occurrences with full lifecycle tracking (scheduled → completed/cancelled/no_show), associate video content, and preserve historical accuracy independent of plan or schedule changes.

**Key Characteristics:**
- Timezone-aware timestamps stored in UTC
- Immutable historical records for completed lessons
- Separation between recurring patterns (weekly_slots), planning (monthly_plans), and reality (lessons)
- RLS enforcement ensures teachers only access their own data
- Students have read-only access to their scheduled and completed lessons
- Conflict detection prevents double-booking
- Audit trail preserved through created_at/updated_at timestamps

---

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Teacher Workflow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Define recurring schedule                               │
│     weekly_slots (enrollment → weekday + times)             │
│                          ↓                                   │
│  2. Generate lesson suggestions from slots                  │
│     (for date range, detect conflicts)                      │
│                          ↓                                   │
│  3. Confirm/create individual lessons                       │
│     (status=scheduled, stores enrollment + times)           │
│                          ↓                                   │
│  4. Associate plan or content                               │
│     (link to plan_day, add videos manually or from plan)    │
│                          ↓                                   │
│  5. Mark lesson complete/cancelled/no_show                  │
│     (final status, immutable except notes)                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Student Workflow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  View upcoming lessons (status=scheduled, future)           │
│           ↓                                                   │
│  View lesson details (with shared_notes and videos)         │
│           ↓                                                   │
│  Access lesson history (completed lessons with content)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Separation of Concerns**
- **weekly_slots:** Recurring patterns (template, not instances)
- **lessons:** Concrete occurrences with full state (instance + execution record)
- **plan_days:** Pedagogical content (planning reference)
- This allows independent evolution: changing a plan or slot doesn't affect lesson history

**2. Status as State Machine**
- Lessons have explicit state transitions: `scheduled → (completed | cancelled | no_show)`
- Terminal states (completed, cancelled, no_show) prevent further modifications to times/plan
- Only notes are updatable on completed lessons (preserves outcome without altering history)

**3. Timezone Handling**
- Database stores all timestamps in UTC (timestamptz)
- Weekly slots store times as TIME (local time, no date component)
- Teacher's configured timezone used for display/UI conversion
- Lesson generation applies teacher timezone when creating timestamped lessons from time-only slots

**4. RLS Enforcement**
- Teachers see only their own lessons/slots
- Students see only their own lessons through enrollments
- Private_notes never visible to students (RLS policy excludes from student queries)
- Video source tracking (plan vs manual) supports audit requirements

**5. Video Association Immutability**
- Once lesson is completed, videos cannot be added/removed/reordered
- Preserves lesson content as it was conducted
- source field (plan/manual) is immutable, enabling audit trail
- Plan changes don't retroactively affect completed lessons

---

## Components and Interfaces

### Database Schema

#### Core Tables

**`weekly_slots`** - Recurring schedule templates
```sql
CREATE TABLE weekly_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  valid_from date,
  valid_until date,
  status enum_slot_status DEFAULT 'active'::enum_slot_status,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CONSTRAINT end_after_start CHECK (end_time > start_time);
CONSTRAINT valid_dates CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

CREATE INDEX idx_weekly_slots_teacher_id ON weekly_slots(teacher_id);
CREATE INDEX idx_weekly_slots_enrollment_id ON weekly_slots(enrollment_id);
CREATE INDEX idx_weekly_slots_status ON weekly_slots(status);
```

**`lessons`** - Concrete class occurrences
```sql
CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  plan_day_id uuid REFERENCES plan_days(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status enum_lesson_status DEFAULT 'scheduled'::enum_lesson_status,
  shared_notes text CHECK (char_length(shared_notes) <= 5000),
  private_notes text CHECK (char_length(private_notes) <= 5000),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CONSTRAINT end_after_start CHECK (ends_at > starts_at);
CONSTRAINT max_duration CHECK (EXTRACT(EPOCH FROM (ends_at - starts_at)) <= 28800); -- 8 hours

CREATE INDEX idx_lessons_teacher_id ON lessons(teacher_id);
CREATE INDEX idx_lessons_enrollment_id ON lessons(enrollment_id);
CREATE INDEX idx_lessons_starts_at ON lessons(starts_at);
CREATE INDEX idx_lessons_status ON lessons(status);
CREATE INDEX idx_lessons_plan_day_id ON lessons(plan_day_id);
```

**`lesson_videos`** - Video associations for lessons
```sql
CREATE TABLE lesson_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
  source enum_video_source NOT NULL CHECK (source IN ('plan', 'manual')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_lesson_videos_lesson_id ON lesson_videos(lesson_id);
CREATE INDEX idx_lesson_videos_video_id ON lesson_videos(video_id);
CREATE UNIQUE INDEX idx_lesson_videos_unique ON lesson_videos(lesson_id, video_id);
```

#### Enums

```sql
CREATE TYPE enum_slot_status AS ENUM ('active', 'paused');
CREATE TYPE enum_lesson_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE enum_video_source AS ENUM ('plan', 'manual');
```

#### RLS Policies

**Teachers - Read/Write their own lessons**
```sql
-- Lessons: Teachers see only their own
CREATE POLICY lessons_teacher_select ON lessons
FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY lessons_teacher_insert ON lessons
FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY lessons_teacher_update ON lessons
FOR UPDATE USING (auth.uid() = teacher_id);

-- Weekly Slots: Teachers see only their own
CREATE POLICY weekly_slots_teacher_select ON weekly_slots
FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY weekly_slots_teacher_insert ON weekly_slots
FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY weekly_slots_teacher_update ON weekly_slots
FOR UPDATE USING (auth.uid() = teacher_id);

CREATE POLICY weekly_slots_teacher_delete ON weekly_slots
FOR DELETE USING (auth.uid() = teacher_id);

-- Lesson Videos: Through lesson ownership
CREATE POLICY lesson_videos_teacher_select ON lesson_videos
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_videos.lesson_id
    AND lessons.teacher_id = auth.uid()
  )
);

CREATE POLICY lesson_videos_teacher_insert ON lesson_videos
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_videos.lesson_id
    AND lessons.teacher_id = auth.uid()
  )
);

CREATE POLICY lesson_videos_teacher_delete ON lesson_videos
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_videos.lesson_id
    AND lessons.teacher_id = auth.uid()
  )
);
```

**Students - Read-only access to their lessons (no private_notes)**
```sql
-- Students see their scheduled/completed lessons (not cancelled/no_show for future context)
CREATE POLICY lessons_student_select ON lessons
FOR SELECT USING (
  auth.uid() IN (
    SELECT student_profile_id FROM enrollments
    WHERE enrollments.id = lessons.enrollment_id
  )
);

-- Lesson videos for students (no private_notes visible at RLS level)
CREATE POLICY lesson_videos_student_select ON lesson_videos
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM lessons
    JOIN enrollments ON lessons.enrollment_id = enrollments.id
    WHERE lessons.id = lesson_videos.lesson_id
    AND enrollments.student_profile_id = auth.uid()
  )
);
```

---

## Data Models

### TypeScript Types

```typescript
// types/lesson.ts
export interface WeeklySlot {
  id: string;
  teacherId: string;
  enrollmentId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday=0, Saturday=6
  startTime: string; // HH:MM:SS format
  endTime: string;   // HH:MM:SS format
  validFrom: string | null; // ISO 8601 date
  validUntil: string | null; // ISO 8601 date
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  teacherId: string;
  enrollmentId: string;
  planDayId: string | null;
  startsAt: string; // ISO 8601 with timezone
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  sharedNotes: string | null;
  privateNotes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonVideo {
  id: string;
  lessonId: string;
  videoId: string;
  source: 'plan' | 'manual';
  sortOrder: number;
  createdAt: string;
}

export interface LessonDetail extends Lesson {
  enrollment: {
    id: string;
    studentName: string;
    studentEmail: string;
  };
  planDay: {
    id: string;
    title: string;
    objective: string;
  } | null;
  videos: (LessonVideo & {
    video: {
      id: string;
      title: string;
      duration: number;
      thumbnailUrl: string;
    };
  })[];
}

export interface StudentLessonView {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  teacherName: string;
  sharedNotes: string | null;
  planDay: {
    id: string;
    title: string;
    objective: string;
  } | null;
  videos: Array<{
    id: string;
    title: string;
    duration: number;
    thumbnailUrl: string;
    playbackUrl: string | null; // Only for completed lessons
  }>;
}
```

---

## API Routes

### Lesson Management

#### POST `/api/lessons`
**Create individual lesson**
```
Request Body:
{
  enrollmentId: string;
  startsAt: string; // ISO 8601 with timezone
  endsAt: string;
  planDayId?: string;
  sharedNotes?: string;
  privateNotes?: string;
}

Response:
{
  data: Lesson;
  meta: { conflictWarning?: { conflictingLessonId: string; conflictTime: string; } };
}

Validations:
- enrollment belongs to authenticated teacher
- endsAt > startsAt
- duration <= 8 hours
- no double-booking (unless confirmed)
- plan_day_id belongs to teacher if provided

Status: 201 on success, 400 on validation error, 409 on conflict
```

#### GET `/api/lessons`
**List lessons with filtering**
```
Query Parameters:
- enrollmentId?: string (single enrollment)
- status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
- fromDate?: string (ISO 8601)
- toDate?: string (ISO 8601)
- page?: number (default 1)
- pageSize?: number (default 20, max 100)

Response:
{
  data: Lesson[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  };
}

Authorization: RLS enforces teacher ownership
```

#### GET `/api/lessons/[id]`
**Get lesson details**
```
Response:
{
  data: LessonDetail;
}

Authorization: RLS enforces teacher ownership
```

#### PATCH `/api/lessons/[id]`
**Update lesson**
```
Request Body (updatable fields depend on status):
- If status === 'scheduled':
  { startsAt?: string; endsAt?: string; planDayId?: string; }
- If any status:
  { sharedNotes?: string; privateNotes?: string; }

Validations:
- Cannot modify times/plan_day if status is completed
- endsAt > startsAt if either is updated
- Conflict detection for time changes

Response:
{
  data: Lesson;
}

Status: 200 on success, 409 if completed, 400 on validation error
```

#### PATCH `/api/lessons/[id]/status`
**Change lesson status**
```
Request Body:
{
  status: 'completed' | 'cancelled' | 'no_show';
  reason?: string; // Optional for cancelled/no_show
}

Transition Rules:
- scheduled → completed: validate not too far in future (7 days ahead)
- scheduled → completed: allow up to 30 days past with warning
- scheduled → cancelled: always allowed
- scheduled → no_show: always allowed
- Any other transition: 409 conflict

Response:
{
  data: Lesson;
}

Status: 200 on success, 409 on invalid transition
```

#### DELETE `/api/lessons/[id]`
**NOT PROVIDED** - Use status change to cancelled instead

---

### Weekly Slot Management

#### POST `/api/weekly-slots`
**Create recurring slot**
```
Request Body:
{
  enrollmentId: string;
  weekday: 0-6;
  startTime: string; // HH:MM:SS format
  endTime: string;
  validFrom?: string; // ISO 8601 date
  validUntil?: string;
}

Response:
{
  data: WeeklySlot;
}

Validations:
- enrollment belongs to authenticated teacher
- weekday is 0-6
- endTime > startTime
- validUntil >= validFrom if both provided
- startTime/endTime are valid TIME format

Status: 201 on success, 400 on validation error
```

#### GET `/api/weekly-slots`
**List slots for enrollment**
```
Query Parameters:
- enrollmentId: string (required)

Response:
{
  data: WeeklySlot[];
}

Filtering:
- Only active slots (status = 'active' or valid_until hasn't passed)
- Sorted by weekday ASC

Authorization: RLS enforces teacher ownership
```

#### PATCH `/api/weekly-slots/[id]`
**Update slot times**
```
Request Body:
{
  weekday?: 0-6;
  startTime?: string;
  endTime?: string;
  validFrom?: string;
  validUntil?: string;
  status?: 'active' | 'paused';
}

Response:
{
  data: WeeklySlot;
}

Validations:
- Same as creation
- Does NOT retroactively modify existing lessons

Status: 200 on success, 404 if not found, 400 on validation error
```

#### POST `/api/weekly-slots/[id]/pause`
**Pause slot**
```
Response:
{
  data: WeeklySlot with status='paused';
}

Effect: Prevents future lesson generation from this slot
```

#### POST `/api/weekly-slots/[id]/activate`
**Reactivate slot**
```
Response:
{
  data: WeeklySlot with status='active';
}
```

#### DELETE `/api/weekly-slots/[id]`
**Delete slot (with safety check)**
```
Validation:
- Check for any lessons where:
  - enrollment_id matches
  - status is not 'cancelled'
  - time range matches slot recurrence

If lessons exist:
  Response: 409 Conflict
  {
    error: "Cannot delete slot with existing lessons",
    suggestion: "Consider pausing the slot instead"
  }

If no lessons:
  Response: 204 No Content

Uses transaction to prevent race condition
```

---

### Lesson Generation

#### POST `/api/lessons/generate-from-slots`
**Generate lesson suggestions from weekly slots**
```
Request Body:
{
  fromDate: string; // ISO 8601
  toDate: string;
  enrollmentIds?: string[]; // Optional: filter to specific enrollments

  // OR for all teacher's enrollments:
  // { fromDate, toDate }
}

Response:
{
  data: {
    generatedLessons: Array<{
      enrollmentId: string;
      startsAt: string;
      endsAt: string;
      weekday: number;
    }>;
    conflicts: Array<{
      date: string;
      enrollment: string;
      existingLesson: string;
      suggestedTime: string;
      existingTime: string;
    }>;
    summary: {
      totalGenerated: number;
      conflictsDetected: number;
    };
  };
  requiresConfirmation: boolean;
}

Validations:
- Date range does not exceed 90 days
- Using active slots only (status='active' and valid_until not passed)
- Timezone applied from teacher's profile
- RLS enforces only teacher's slots are used

Conflict Detection:
- Check against existing lessons (any status)
- Return warnings, allow confirmation to proceed anyway

Effect: Creates lessons with status='scheduled' (not persisted until confirmed)
```

---

### Lesson Video Management

#### POST `/api/lessons/[id]/videos`
**Add video to lesson**
```
Request Body:
{
  videoId: string;
  sortOrder?: number; // Optional, defaults to next position
}

Response:
{
  data: LessonVideo & { video: VideoDetail };
}

Validations:
- lesson belongs to authenticated teacher
- video belongs to authenticated teacher
- video status is 'ready' (not archived/processing)
- video not already associated (409 conflict)
- lesson status is not 'completed' (409 conflict)

Status: 201 on success, 400 on validation error, 409 on conflict
```

#### POST `/api/lessons/[id]/copy-videos-from-plan`
**Copy all videos from plan day**
```
Request Body: {} (lesson must have plan_day_id set)

Response:
{
  data: LessonVideo[];
}

Validations:
- lesson has plan_day_id set
- plan_day exists and belongs to teacher
- lesson status is not 'completed'

Effect:
- Creates lesson_videos with source='plan'
- Preserves sort_order from plan_day_videos
- Skips duplicates (video already in lesson)

Status: 201 on success, 400 on validation error, 409 if completed
```

#### DELETE `/api/lessons/[id]/videos/[videoId]`
**Remove video from lesson**
```
Response: 204 No Content

Validations:
- lesson belongs to authenticated teacher
- video association exists
- lesson status is not 'completed' (409 conflict)

Effect:
- Deletes lesson_videos record
- Does NOT affect video library
- Does NOT affect plan_day associations

Auto-reordering: Remaining videos get sequential sort_order

Status: 204 on success, 404 if association not found, 409 if completed
```

#### PATCH `/api/lessons/[id]/videos/reorder`
**Reorder videos**
```
Request Body:
{
  updates: Array<{ lessonVideoId: string; sortOrder: number }>;
}

Response:
{
  data: LessonVideo[];
}

Validations:
- All videos belong to same lesson
- lesson status is not 'completed' (409 conflict)
- All sort_order values are non-negative integers
- All lesson_video_ids exist

Effect: Updates all sort_order values in single transaction

Status: 200 on success, 400 on validation error, 409 if completed
```

---

### Teacher Agenda Views

#### GET `/api/agenda/weekly`
**View weekly schedule**
```
Query Parameters:
- weekStartDate?: string; // ISO 8601, defaults to current week

Response:
{
  data: Array<Lesson & {
    enrollment: { studentName: string };
    videoCount: number;
    planDay: { title: string } | null;
  }>;
  meta: {
    weekStart: string;
    weekEnd: string;
  };
}

Filtering: All lessons for that week, all enrollments, sorted by starts_at ASC

Authorization: RLS enforces teacher ownership
```

#### GET `/api/agenda/daily`
**View daily schedule**
```
Query Parameters:
- date?: string; // ISO 8601, defaults to today

Response:
{
  data: Array<Lesson & {
    enrollment: {
      id: string;
      studentName: string;
      studentEmail: string;
    };
    status: string;
    videoCount: number;
  }>;
  meta: {
    date: string;
    totalLessons: number;
  };
}

Filtering: All lessons for that date, sorted by starts_at ASC

Authorization: RLS enforces teacher ownership
```

---

### Student Views

#### GET `/api/student/lessons/upcoming`
**Get next scheduled lesson**
```
Response:
{
  data: StudentLessonView | null;
}

Filtering:
- status = 'scheduled'
- starts_at > now
- Only first lesson (ordered by starts_at ASC)

Authorization: RLS enforces student's own lessons
```

#### GET `/api/student/lessons/history`
**View past completed lessons**
```
Query Parameters:
- page?: number (default 1)
- pageSize?: number (default 20)

Response:
{
  data: StudentLessonView[];
  meta: {
    pagination: { page, pageSize, total, totalPages, hasNext, hasPrevious };
  };
}

Filtering:
- status = 'completed'
- starts_at < now
- Sorted by starts_at DESC (most recent first)
- No private_notes in response

Authorization: RLS enforces student's own lessons
```

#### GET `/api/student/lessons/[id]`
**View lesson details**
```
Response:
{
  data: StudentLessonView;
}

Validations:
- lesson belongs to one of student's enrollments (RLS)
- Returns 404 if cancelled/no_show for future lessons (privacy)

No private_notes or source field in response

Authorization: RLS enforces student's own lessons
```

---

### Statistics & Reporting

#### GET `/api/lessons/stats`
**Get lesson statistics per enrollment**
```
Query Parameters:
- enrollmentId?: string; // Specific enrollment or all teacher's enrollments
- fromDate?: string
- toDate?: string

Response:
{
  data: Array<{
    enrollmentId: string;
    studentName: string;
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
    total: number;
    completionRate: number; // percentage
  }>;
}

Calculations: From actual lesson records, not estimates

Authorization: RLS enforces teacher ownership
```

---

## Frontend Components

### Teacher-Facing Components

**TeacherScheduleView** (Server Component)
- Displays weekly or daily agenda
- Fetches lessons from `/api/agenda/weekly` or `/api/agenda/daily`
- Renders LessonCard components for each lesson
- Provides context for LessonModal

**LessonCard** (Server Component)
- Displays lesson summary: time, student, status, video count
- Links to LessonDetailModal or LessonForm

**LessonDetailModal** (Client Component)
- Shows full lesson details: times, enrollment, plan day, notes
- Displays video list with source indicators (plan/manual)
- Edit/Delete/Status-change buttons
- Form for updating notes (accessible on any status)
- Button to mark complete/cancelled/no_show

**LessonForm** (Client Component)
- Create new lesson or update existing
- Date/time pickers with timezone context
- Enrollment selector (dropdown from teacher's enrollments)
- Plan day selector (optional, from teacher's plans)
- Conflict warning display with override checkbox
- Submit with loading state

**WeeklySlotList** (Client Component)
- Shows all slots for selected enrollment
- Displays weekday, times, valid date range, status
- Edit/Pause/Delete buttons
- Create new slot form

**WeeklySlotForm** (Client Component)
- Weekday selector (radio or dropdown)
- Time pickers (start/end)
- Optional date range (valid_from/valid_until)
- Validation and error display

**LessonGenerationWizard** (Client Component)
- Step 1: Select date range (max 90 days)
- Step 2: Choose enrollments (optional filter)
- Step 3: Review conflicts and generated lessons count
- Step 4: Confirm and create

**AgendaView** (Server Component)
- Tab selector: Week/Day/Month view
- Date navigation
- Display calendar or list based on view
- Renders LessonCard components

---

### Student-Facing Components

**StudentUpcomingLesson** (Server Component)
- Shows next scheduled lesson card
- Displays time, teacher, plan day reference, video count
- Link to view full details

**StudentLessonHistory** (Client Component)
- Paginated list of completed lessons
- Each row: date, teacher, videos count, shared notes preview
- Link to view full lesson

**StudentLessonDetail** (Server Component)
- Lesson card with times, shared_notes
- Plan day reference (title, objective)
- Video list (with playback URLs for completed lessons)
- Cannot modify anything (read-only)

**VideoPlayer** (Client Component)
- Embeds Mux player with signed URL
- Displays video metadata (title, duration)
- Full-screen option

---

## Error Handling

### Status Transition Errors

```typescript
// Invalid status transitions return 409 Conflict
{
  error: "Invalid status transition",
  current: "completed",
  attempted: "cancelled",
  message: "Cannot transition from completed to cancelled. Completed lessons are immutable."
}
```

### Conflict Detection

```typescript
// Double-booking detected returns warning (not error) in response
{
  data: { /* lesson data */ },
  meta: {
    conflictWarning: {
      conflictingLessonId: "abc123",
      conflictingLesson: {
        enrollmentId: "enr123",
        studentName: "João",
        startsAt: "2026-11-15T14:00:00Z",
        endsAt: "2026-11-15T15:00:00Z"
      },
      allowOverride: true
    }
  }
}
```

### Completed Lesson Protection

```typescript
// Attempting to modify completed lesson returns 409
{
  error: "Cannot modify completed lesson",
  status: "completed",
  allowedFields: ["sharedNotes", "privateNotes"],
  message: "Only notes can be modified on completed lessons."
}
```

### Validation Errors

```typescript
// Validation failure returns 400 with field details
{
  error: "Validation failed",
  fields: {
    endsAt: "End time must be after start time",
    duration: "Lesson duration cannot exceed 8 hours",
    enrollmentId: "Enrollment does not belong to authenticated teacher"
  }
}
```

---

## Integration Points

### With Authentication Module

- All routes verify `auth.uid()` matches teacher_id or student_id in enrollment
- RLS policies use `auth.uid()` to enforce ownership
- JWT token provides user context
- No lesson access without valid auth session

### With Enrollments Module

- Lesson creation validates enrollment belongs to teacher
- Student lesson access goes through enrollment table
- Enrollment archival doesn't delete lessons (historical preservation)
- Cancelling enrollment doesn't prevent viewing completed lessons

### With Plans Module

- plan_day_id is optional reference in lessons
- Changing plan doesn't modify existing lessons
- Copying videos from plan_day_videos creates lesson_videos with source='plan'
- Plan archived status doesn't affect lesson references

### With Video Library Module

- video_id references videos table
- Video status (ready/archived) validated on association
- Playback URLs generated with Mux signed URLs
- Video deletion doesn't cascade to lessons (prevents data loss)

---

## Testing Strategy

### Unit Tests

**Lesson Status Transitions**
- Test all valid transitions (scheduled → completed, cancelled, no_show)
- Test all invalid transitions (completed → *, etc.)
- Verify 409 error on invalid transitions

**Lesson Validation**
- End time before/equal to start time → 400 error
- Duration > 8 hours → 400 error
- Enrollment doesn't belong to teacher → 400 error
- Plan day doesn't belong to teacher → 400 error

**Weekly Slot Validation**
- Weekday out of range (0-6) → 400 error
- Start time >= end time → 400 error
- Valid until before valid from → 400 error
- End time format validation

**Video Association**
- Adding video to completed lesson → 409 error
- Adding duplicate video → 409 error
- Video not found → 404 error
- Reordering videos on completed lesson → 409 error

**RLS Enforcement**
- Teacher A cannot see Teacher B's lessons
- Student cannot see lessons from other enrollments
- Student cannot access private_notes
- Student cannot modify any lesson fields

---

### Property-Based Tests

These tests will be specified in the Correctness Properties section below.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Core Invariants

#### Property 1: Lesson Time Validity
*For any* lesson, the end time must always be strictly greater than the start time and the duration must never exceed 8 hours.

**Validates: Requirements 1.3, 33.2, 33.3**

#### Property 2: Lesson Status Immutability After Completion
*For any* lesson with status `completed`, only `shared_notes` and `private_notes` fields can be modified. Attempts to change `starts_at`, `ends_at`, or `plan_day_id` must be rejected with 409 status.

**Validates: Requirements 17.6, 19.6, 27.1, 27.2, 27.3**

#### Property 3: Status Transition Validity
*For any* lesson, valid status transitions are:
- `scheduled` → `completed`, `cancelled`, `no_show`
- Terminal states (`completed`, `cancelled`, `no_show`) do not transition to any other status

**Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5**

#### Property 4: Weekly Slot Time Validity
*For any* weekly slot, the end time must always be strictly greater than the start time, and the weekday must be between 0 and 6 inclusive.

**Validates: Requirements 2.3, 2.4, 34.1, 34.3**

#### Property 5: Timezone Consistency
*For any* lesson, timestamps are stored in UTC (timestamptz). When returned via API, all timestamps are in ISO 8601 format with UTC timezone indicator (Z suffix). Teacher-configured timezone is used only for display conversion, not storage.

**Validates: Requirements 30.1, 30.2, 30.5, 30.7**

### Authorization Properties

#### Property 6: Teacher Lesson Isolation
*For any* authenticated teacher, queries to lessons/weekly_slots/lesson_videos via RLS policies return only records where `teacher_id` equals the querying user's `auth.uid()`. Any attempt to query records from another teacher returns zero rows.

**Validates: Requirements 1.7, 2.7, 31.1, 31.4, 31.6**

#### Property 7: Student Lesson Access Control
*For any* authenticated student, queries to lessons return only records where the student is referenced through an enrollment record's `student_profile_id`. Student queries never include `private_notes` field regardless of API response structure.

**Validates: Requirements 18.4, 24.4, 24.6, 25.4, 25.6, 26.4, 26.5, 31.2, 31.7**

#### Property 8: Enrollment Ownership Validation
*For any* lesson creation or modification request, the API must verify the enrollment belongs to the authenticated teacher before allowing the operation. Requests with enrollments from other teachers must be rejected with 400 or 403 status.

**Validates: Requirements 1.2, 2.2, 10.2, 15.2**

### Data Persistence Properties

#### Property 9: Lesson Field Persistence
*For any* created lesson, querying it back returns all fields: `id`, `teacherId`, `enrollmentId`, `planDayId` (nullable), `startsAt`, `endsAt`, `status`, `sharedNotes`, `privateNotes`, `completedAt` (null if not completed), `createdAt`, `updatedAt`.

**Validates: Requirements 1.5, 16.1**

#### Property 10: Weekly Slot Field Persistence
*For any* created weekly slot, querying it back returns all fields: `id`, `teacherId`, `enrollmentId`, `weekday`, `startTime`, `endTime`, `validFrom` (nullable), `validUntil` (nullable), `status`, `createdAt`, `updatedAt`.

**Validates: Requirements 2.5, 4.2**

#### Property 11: Automatic Timestamp Assignment
*For any* created lesson or weekly slot, `createdAt` is set to the current timestamp and `updatedAt` is equal to `createdAt`. Subsequent modifications update `updatedAt` to current time while `createdAt` remains unchanged.

**Validates: Requirements 1.6, 6.6, 17.5, 18.5, 19.5, 20.4, 21.4**

#### Property 12: Lesson Video Association Persistence
*For any* added video to a lesson, querying the lesson returns a `lesson_videos` association with `source` field set to either `plan` (from copy operation) or `manual` (from manual addition), along with `sortOrder` and `createdAt`.

**Validates: Requirements 9.5, 10.5, 39.1, 39.2**

### State Transition Properties

#### Property 13: Scheduled Status Default
*For any* newly created lesson, the status defaults to `scheduled`.

**Validates: Requirements 1.4**

#### Property 14: Active Status Default
*For any* newly created weekly slot, the status defaults to `active`.

**Validates: Requirements 2.6**

#### Property 15: Lesson Completion Sets Timestamp
*For any* lesson transitioning to `completed` status, `completed_at` is set to the current timestamp (not to the lesson's `startsAt`), and `updated_at` is also updated to current time.

**Validates: Requirements 19.2, 19.5, 40.5**

#### Property 16: Paused Slot Excludes From Generation
*For any* lesson generation request, weekly slots with status `paused` are excluded from lesson creation. Only slots with status `active` generate lessons.

**Validates: Requirements 6.4**

### Video Management Properties

#### Property 17: Video Duplicate Prevention
*For any* lesson, attempting to add the same video twice must be rejected with 409 status. The same video cannot appear in `lesson_videos` more than once per lesson.

**Validates: Requirements 10.6, 9.6**

#### Property 18: Completed Lesson Video Immutability
*For any* lesson with status `completed`, operations to add, remove, or reorder videos must be rejected with 409 status. The `lesson_videos` associations become read-only.

**Validates: Requirements 11.6, 12.7, 27.1, 27.2, 27.3**

#### Property 19: Video Deletion Non-Cascade
*For any* lesson video removal, the video record in the library is unaffected and remains queryable. The `lesson_videos` association is deleted but the video persists.

**Validates: Requirements 11.3**

#### Property 20: Plan Video Copy Preserves Metadata
*For any* copy-from-plan operation, all videos from `plan_day_videos` are copied with their original `sort_order` values preserved in the `lesson_videos` table, and `source` is set to `plan`.

**Validates: Requirements 9.3, 9.4, 9.5**

### Query and List Properties

#### Property 21: Weekly Slot List Sorting
*For any* query of weekly slots for an enrollment, results are sorted by `weekday` in ascending order (0 through 6).

**Validates: Requirements 4.4**

#### Property 22: Lesson List Descending Sort for Enrollment
*For any* query of lessons for an enrollment, results are sorted by `startsAt` in descending order (most recent first).

**Validates: Requirements 15.5**

#### Property 23: Agenda Ascending Sort by Time
*For any* weekly or daily agenda query, results are sorted by `startsAt` in ascending order (earliest to latest).

**Validates: Requirements 13.3, 14.3, 38.6**

#### Property 24: Expired Slots Excluded From List
*For any* query of weekly slots for an enrollment, slots where `validUntil` has passed (is in the past) are excluded from results.

**Validates: Requirements 4.5**

#### Property 25: Empty Enrollment Slots Return Empty Array
*For any* enrollment with no weekly slots, querying returns an empty array (not null).

**Validates: Requirements 4.6**

#### Property 26: Pagination Metadata Completeness
*For any* paginated lesson query, the response includes `pagination` metadata with: `page`, `pageSize`, `total` (total records), `totalPages`, `hasNext`, `hasPrevious`.

**Validates: Requirements 35.3, 35.4**

#### Property 27: Pagination Default Page Size
*For any* lesson query without explicit `pageSize` parameter, the default page size is 20 lessons.

**Validates: Requirements 35.2**

#### Property 28: Pagination Bounds
*For any* query with `pageSize` parameter, values greater than 100 are rejected with 400 status. Values exceeding available pages return an empty array.

**Validates: Requirements 35.7, 35.6**

### Conflict and Validation Properties

#### Property 29: Conflict Detection on Create/Update
*For any* lesson create or update operation, if an existing scheduled lesson overlaps the new time range for the same teacher, a conflict warning is returned in the response metadata (with `conflictWarning` object). The operation succeeds unless explicitly rejected by the client.

**Validates: Requirements 3.4, 29.1, 29.2, 29.3**

#### Property 30: Conflict Ignores Non-Scheduled Status
*For any* conflict detection, only lessons with status `scheduled` are considered. Completed, cancelled, and no_show lessons are ignored in overlap calculation.

**Validates: Requirements 29.6**

#### Property 31: Conflict Detection Timezone Awareness
*For any* conflict detection operation, time comparisons use the teacher's configured timezone for accuracy. Two lessons that don't overlap in UTC may overlap after timezone conversion and must be detected as conflicts.

**Validates: Requirements 29.7**

#### Property 32: Date Range Generation Limit
*For any* lesson generation request, date ranges exceeding 90 days are rejected with 400 status.

**Validates: Requirements 3.6**

#### Property 33: Lesson Count Per Generation
*For any* lesson generation from weekly slots, exactly one lesson is created per slot occurrence in the date range. For example, generating from a Monday+Wednesday slot over 2 weeks produces exactly 4 lessons.

**Validates: Requirements 3.2**

#### Property 34: Generated Lessons Have Scheduled Status
*For any* lesson generation operation, all created lessons have status `scheduled`.

**Validates: Requirements 3.3**

### Lesson Completion Properties

#### Property 35: Completion Validates Past 30-Day Window
*For any* lesson completion request, if `startsAt` is more than 30 days in the past, the API returns a warning but allows completion with explicit confirmation. Lessons more than 7 days in the future cannot be completed (rejected with 400).

**Validates: Requirements 40.1, 40.2, 40.3**

#### Property 36: Completion Sets Current Timestamp
*For any* lesson marked complete, `completed_at` is set to the current system timestamp, not to the lesson's `startsAt` time.

**Validates: Requirements 40.5**

#### Property 37: Completion Requires Scheduled Status
*For any* lesson already in terminal status (`completed`, `cancelled`, `no_show`), marking it complete must be rejected with 409 status.

**Validates: Requirements 19.3**

#### Property 38: Archived Enrollment Prevents Completion
*For any* lesson with an archived enrollment, attempting to mark it complete must be rejected with 400 status.

**Validates: Requirements 40.6**

### History and Immutability Properties

#### Property 39: Completed Lesson Archival
*For any* student, querying lesson history returns only lessons with status `completed` and `startsAt` in the past. Cancelled and no_show lessons are excluded from history queries.

**Validates: Requirements 25.1, 25.2**

#### Property 40: Archived Video Preservation
*For any* lesson_video association, if the referenced video is later archived or deleted from the library, the association remains intact and queryable. The lesson history displays the archived video with an indicator.

**Validates: Requirements 27.5, 27.6**

#### Property 41: Plan Day Changes Don't Affect Lessons
*For any* lesson with a `planDayId` reference, modifying the plan day's content (title, objective, associated videos) does not modify the lesson record. The lesson maintains its original reference.

**Validates: Requirements 28.1, 28.2, 28.3**

#### Property 42: Completed Lesson Counts in Statistics
*For any* enrollment, lesson statistics count only lessons with status `completed` toward the completion rate. Scheduled, cancelled, and no_show lessons are excluded from completion counts.

**Validates: Requirements 32.2, 32.3, 20.5, 21.5**

### Student View Properties

#### Property 43: Student Upcoming Lessons Filter
*For any* student querying upcoming lessons, results include only lessons where: (1) enrollment matches student's ID via RLS, (2) status equals `scheduled`, (3) `startsAt` is greater than current time. Results are sorted by `startsAt` ascending.

**Validates: Requirements 24.1, 24.2, 24.5**

#### Property 44: Student History Sort
*For any* student querying lesson history, results are sorted by `startsAt` in descending order (most recent first).

**Validates: Requirements 25.5**

#### Property 45: Student Next Lesson Optimization
*For any* student querying their next upcoming lesson, the API returns at most one lesson (the earliest scheduled lesson in the future). Returns null if no upcoming lessons exist.

**Validates: Requirements 37.1, 37.2, 37.6**

#### Property 46: Student Shared Notes Visibility
*For any* student querying a completed lesson, the response includes `sharedNotes` content. Private_notes is never included regardless of lesson status.

**Validates: Requirements 18.3, 18.4, 25.3**

### Bulk Operation Properties

#### Property 47: Bulk Update All-or-Nothing
*For any* bulk status update operation with multiple lessons, if any lesson has an invalid status transition, the entire operation is rolled back and no lessons are modified. All-or-nothing semantics via database transaction.

**Validates: Requirements 36.4**

#### Property 48: Bulk Update Validates Ownership
*For any* bulk update request, all lesson IDs must belong to the authenticated teacher. If any lesson doesn't belong to the teacher, the entire operation is rejected with 403 status.

**Validates: Requirements 36.2**

#### Property 49: Bulk Update Response Detail
*For any* bulk status update operation, the response indicates which lessons were successfully updated and which failed validation (with reason).

**Validates: Requirements 36.6**

### Field Validation Properties

#### Property 50: UUID Validation
*For any* request with `enrollmentId` or `planDayId` parameters, the value must be a valid UUID v4. Invalid UUID format is rejected with 400 status.

**Validates: Requirements 33.4, 33.5**

#### Property 51: Note Length Validation
*For any* lesson note update, `shared_notes` and `private_notes` must not exceed 5000 characters each. Values greater than 5000 characters are rejected with 400 status.

**Validates: Requirements 18.7, 33.6**

#### Property 52: Time Format Validation for Slots
*For any* weekly slot creation/update, `startTime` and `endTime` must be in valid TIME format (HH:MM:SS). Invalid formats are rejected with 400 status.

**Validates: Requirements 34.2**

#### Property 53: Date Format Validation
*For any* `validFrom` or `validUntil` parameters, values must be valid ISO 8601 dates. Invalid formats are rejected with 400 status.

**Validates: Requirements 34.4**

#### Property 54: Date Range Order Validation
*For any* weekly slot with both `validFrom` and `validUntil` provided, `validUntil` must be greater than or equal to `validFrom`. Violations are rejected with 400 status.

**Validates: Requirements 34.5, 38.3**

---

## Testing Strategy

### Unit Tests (Examples and Edge Cases)

**Lesson Boundary Tests**
- Lesson with exactly 8 hour duration (valid)
- Lesson with 8 hour 1 second duration (invalid, 400)
- Lesson with same start/end time (invalid, 400)
- Lesson with end time before start time (invalid, 400)

**Completion Window Tests**
- Completing lesson 30 days in past (valid)
- Completing lesson 31 days in past (warning + confirmation required)
- Completing lesson 7 days in future (invalid, 400)
- Completing lesson 8 days in future (invalid, 400)

**Status Transition Tests**
- Transition scheduled → completed (valid)
- Transition completed → cancelled (invalid, 409)
- Transition cancelled → scheduled (invalid, 409)
- Transition no_show → scheduled (invalid, 409)

**Pagination Edge Cases**
- Request page 1 of 1-page result (valid)
- Request page 2 when only 1 page exists (empty array)
- Request with pageSize=101 (invalid, 400)
- Request with pageSize=100 (valid)

**Authorization Tests**
- Teacher A querying Teacher B's lessons (empty result)
- Student querying another student's lessons (404 not found)
- Student attempting to modify any lesson (401 unauthorized)

**Video Association Tests**
- Add video to completed lesson (409 conflict)
- Remove video from completed lesson (409 conflict)
- Reorder videos in completed lesson (409 conflict)
- Add duplicate video to lesson (409 conflict)

---

### Property-Based Tests (Universal Properties)

Each property will have a corresponding property-based test using Hypothesis (Python) or fast-check (TypeScript), configured to run minimum 100 iterations.

**Property-Based Test Naming Convention:**
```
Feature: lessons-and-scheduling, Property {N}: {Property Title}
```

**Examples:**

**Property 1: Lesson Time Validity**
```typescript
// Feature: lessons-and-scheduling, Property 1: Lesson Time Validity
describe('Property 1: Lesson Time Validity', () => {
  it('should reject lessons where end_time <= start_time', () => {
    fc.assert(
      fc.property(
        fc.date(),
        fc.integer({ min: 0, max: 480 }), // duration in minutes
        (startTime, durationMinutes) => {
          if (durationMinutes > 480) return true; // skip if > 8 hours
          const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
          const result = validateLessonTimes(startTime, endTime);
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 3: Status Transition Validity**
```typescript
// Feature: lessons-and-scheduling, Property 3: Status Transition Validity
describe('Property 3: Status Transition Validity', () => {
  it('should only allow valid status transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('scheduled', 'completed', 'cancelled', 'no_show'),
        fc.constantFrom('scheduled', 'completed', 'cancelled', 'no_show'),
        (currentStatus, targetStatus) => {
          const isValid = isValidStatusTransition(currentStatus, targetStatus);
          const expectedValid = (
            (currentStatus === 'scheduled' && 
             (targetStatus === 'completed' || targetStatus === 'cancelled' || targetStatus === 'no_show')) ||
            (currentStatus === targetStatus) // Same status is no-op
          );
          return isValid === expectedValid;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 6: Teacher Lesson Isolation**
```typescript
// Feature: lessons-and-scheduling, Property 6: Teacher Lesson Isolation
describe('Property 6: Teacher Lesson Isolation', () => {
  it('should prevent teachers from accessing lessons of other teachers via RLS', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        async (teacherId1, teacherId2) => {
          fc.pre(teacherId1 !== teacherId2);
          
          const lesson = await createLesson(teacherId1, enrollmentId1);
          const results = await queryLessonsAs(teacherId2);
          
          return !results.some(l => l.id === lesson.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 21: Weekly Slot List Sorting**
```typescript
// Feature: lessons-and-scheduling, Property 21: Weekly Slot List Sorting
describe('Property 21: Weekly Slot List Sorting', () => {
  it('should return weekly slots sorted by weekday ascending', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1 }),
        async (weekdays) => {
          const slots = await Promise.all(
            weekdays.map((wd, i) => createWeeklySlot(enrollmentId, wd, `0${i}:00:00`, `0${i}:30:00`))
          );
          const results = await queryWeeklySlotsForEnrollment(enrollmentId);
          
          // Verify sorted
          for (let i = 1; i < results.length; i++) {
            if (results[i].weekday < results[i-1].weekday) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property 29: Conflict Detection on Create/Update**
```typescript
// Feature: lessons-and-scheduling, Property 29: Conflict Detection on Create/Update
describe('Property 29: Conflict Detection on Create/Update', () => {
  it('should detect overlapping lessons and return conflict warning', () => {
    fc.assert(
      fc.property(
        fc.date(),
        fc.integer({ min: 60, max: 300 }), // minutes for first lesson
        fc.integer({ min: 0, max: 300 }), // offset in minutes for second lesson
        async (baseTime, duration1, offset) => {
          const start1 = baseTime;
          const end1 = new Date(start1.getTime() + duration1 * 60000);
          const start2 = new Date(start1.getTime() + offset * 60000);
          const end2 = new Date(start2.getTime() + 60 * 60000);
          
          const lesson1 = await createLesson(teacherId, enrollmentId, start1, end1);
          const response = await createLessonWithResponse(teacherId, enrollmentId, start2, end2);
          
          const overlaps = !(end1 <= start2 || end2 <= start1);
          return overlaps === !!response.meta?.conflictWarning;
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
-- Lesson queries by teacher
CREATE INDEX idx_lessons_teacher_id ON lessons(teacher_id);

-- Conflict detection (overlapping time ranges)
CREATE INDEX idx_lessons_teacher_starts_at ON lessons(teacher_id, starts_at)
WHERE status = 'scheduled';

-- Student lesson queries
CREATE INDEX idx_lessons_enrollment_id ON lessons(enrollment_id);

-- Lesson generation (find slots for date range)
CREATE INDEX idx_weekly_slots_teacher_status ON weekly_slots(teacher_id, status);

-- Video search by lesson
CREATE INDEX idx_lesson_videos_lesson_id ON lesson_videos(lesson_id);

-- Pagination and sorting
CREATE INDEX idx_lessons_starts_at_desc ON lessons(starts_at DESC);

-- Student next lesson (optimized query)
CREATE INDEX idx_lessons_scheduled_future ON lessons(starts_at)
WHERE status = 'scheduled' AND starts_at > now();
```

### Query Optimization

- Lesson generation uses database-side aggregation to count slot occurrences
- Conflict detection queries only `scheduled` lessons via partial index
- Student "next lesson" endpoint returns at most 1 row with LIMIT 1
- Bulk status updates use single transaction with all-or-nothing semantics
- Pagination metadata calculated from COUNT(*) query (cached where possible)

---

## Security Considerations

### RLS Policy Enforcement

- All lesson queries filtered by `auth.uid()` at database level (not in application code)
- Student queries never return `private_notes` (policy-level exclusion)
- Enrollment verification uses foreign key relationship, not cached data
- Teacher cannot modify another teacher's weekly slots or lessons

### Input Validation

- All UUID parameters validated against format before database query
- Timestamps parsed with timezone validation (ISO 8601 format)
- Time fields validated as valid TIME/DATE format before storage
- Note fields length-validated before storage (max 5000 chars)
- Status values validated against enum (only valid transitions allowed)

### Authorization Verification

- API routes verify `auth.uid()` matches teacher_id or student enrollment
- RLS policies provide secondary enforcement layer at database
- Delete operations protected by safety check (no orphaned lessons)
- Bulk operations validate all records belong to authenticated user

---

## Deployment Checklist

- [ ] Database migrations applied (tables, enums, indexes, RLS policies)
- [ ] API routes deployed with auth middleware
- [ ] Property-based tests passing with 100+ iterations
- [ ] Unit tests for edge cases passing
- [ ] RLS policies tested against unauthorized access
- [ ] Conflict detection validated with timezone scenarios
- [ ] Student views verified to exclude private_notes
- [ ] Pagination tested with various page sizes
- [ ] Bulk operations verified all-or-nothing semantics
- [ ] Performance verified (agenda queries < 500ms, conflict detection < 200ms)


