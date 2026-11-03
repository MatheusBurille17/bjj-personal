# Project Structure

## Directory Organization

```
.
├── .kiro/                          # Kiro configuration
│   ├── steering/                   # Steering rules (this folder)
│   └── specs/                      # Feature specifications and tasks
├── app/                            # Next.js app directory
│   ├── api/                        # API routes (server-only)
│   │   ├── auth/                   # Authentication endpoints
│   │   │   ├── login/route.ts
│   │   │   ├── signup/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── refresh/route.ts
│   │   ├── teachers/               # Teacher endpoints
│   │   │   ├── route.ts            # GET teachers, POST create
│   │   │   ├── [id]/route.ts       # GET, PATCH, DELETE teacher
│   │   │   └── [id]/students/route.ts # GET teacher's students
│   │   ├── enrollments/            # Student enrollment endpoints
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── lessons/                # Lesson endpoints
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── [id]/videos/route.ts
│   │   ├── plans/                  # Monthly plan endpoints
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── [id]/days/route.ts
│   │   ├── library/                # Technique/module/video endpoints
│   │   │   ├── techniques/route.ts
│   │   │   ├── modules/route.ts
│   │   │   ├── videos/route.ts
│   │   │   ├── videos/upload/route.ts # Mux upload endpoint
│   │   │   └── videos/webhook/route.ts # Mux webhook
│   │   ├── storage/                # Supabase storage endpoints
│   │   │   ├── upload/route.ts
│   │   │   └── signed-url/route.ts
│   │   └── health/route.ts         # Health check
│   ├── (auth)/                     # Auth route group
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (teacher)/                  # Teacher protected routes
│   │   ├── layout.tsx              # Teacher layout
│   │   ├── dashboard/page.tsx
│   │   ├── students/page.tsx
│   │   ├── students/[id]/page.tsx
│   │   ├── plans/page.tsx
│   │   ├── plans/[id]/page.tsx
│   │   ├── schedule/page.tsx
│   │   ├── library/page.tsx
│   │   └── settings/page.tsx
│   ├── (student)/                  # Student protected routes
│   │   ├── layout.tsx              # Student layout
│   │   ├── dashboard/page.tsx
│   │   ├── my-agenda/page.tsx
│   │   ├── my-plan/page.tsx
│   │   ├── library/page.tsx
│   │   ├── history/page.tsx
│   │   └── profile/page.tsx
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home page
│   └── not-found.tsx               # 404 page
├── components/                     # Reusable React components
│   ├── ui/                         # shadcn/ui components (generated)
│   │   ├── button.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── dialog.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   ├── select.tsx
│   │   ├── checkbox.tsx
│   │   ├── calendar.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── popover.tsx
│   │   ├── toast.tsx
│   │   ├── table.tsx
│   │   ├── pagination.tsx
│   │   ├── badge.tsx
│   │   ├── alert.tsx
│   │   ├── skeleton.tsx
│   │   └── ... (other shadcn/ui components)
│   ├── blocks/                     # shadcn/ui blocks (adapted for app)
│   │   ├── auth-forms/
│   │   │   ├── LoginForm.tsx       # From shadcn/ui blocks
│   │   │   └── SignupForm.tsx      # From shadcn/ui blocks
│   │   ├── dashboard/
│   │   │   ├── TeacherDashboard.tsx # Custom layout using blocks
│   │   │   ├── StudentDashboard.tsx # Custom layout using blocks
│   │   │   └── StatCard.tsx
│   │   ├── tables/
│   │   │   ├── StudentTable.tsx    # From shadcn/ui blocks
│   │   │   ├── LessonTable.tsx     # From shadcn/ui blocks
│   │   │   └── LibraryTable.tsx    # From shadcn/ui blocks
│   │   ├── forms/
│   │   │   ├── StudentForm.tsx
│   │   │   ├── PlanForm.tsx
│   │   │   └── LessonForm.tsx
│   │   └── navigation/
│   │       ├── Sidebar.tsx         # From shadcn/ui blocks
│   │       └── TopNav.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx           # Uses shadcn/ui components
│   │   └── SignupForm.tsx          # Uses shadcn/ui components
│   ├── dashboard/
│   │   ├── TeacherDashboard.tsx    # Uses shadcn/ui blocks
│   │   ├── StudentDashboard.tsx    # Uses shadcn/ui blocks
│   │   └── StatCard.tsx            # Uses shadcn/ui card
│   ├── students/
│   │   ├── StudentList.tsx         # Uses shadcn/ui table
│   │   ├── StudentCard.tsx         # Uses shadcn/ui card
│   │   └── StudentForm.tsx         # Uses shadcn/ui form
│   ├── plans/
│   │   ├── PlanList.tsx            # Uses shadcn/ui card
│   │   ├── PlanForm.tsx            # Uses shadcn/ui form
│   │   ├── PlanDayEditor.tsx
│   │   └── VideoSelector.tsx
│   ├── schedule/
│   │   ├── CalendarView.tsx        # Uses shadcn/ui calendar
│   │   ├── WeeklyView.tsx
│   │   ├── DailyView.tsx
│   │   ├── LessonForm.tsx          # Uses shadcn/ui form
│   │   └── RecurrenceForm.tsx
│   ├── library/
│   │   ├── TechniqueTree.tsx
│   │   ├── ModuleList.tsx
│   │   ├── VideoList.tsx           # Uses shadcn/ui table
│   │   ├── VideoUploader.tsx
│   │   └── VideoPlayer.tsx
│   ├── lessons/
│   │   ├── LessonDetail.tsx        # Uses shadcn/ui card, dialog
│   │   ├── LessonHistory.tsx       # Uses shadcn/ui table
│   │   └── LessonForm.tsx          # Uses shadcn/ui form
│   └── common/
│       ├── Header.tsx              # Uses shadcn/ui components
│       ├── Navigation.tsx          # Uses shadcn/ui dropdown-menu
│       ├── Loading.tsx             # Uses shadcn/ui skeleton
│       ├── ErrorBoundary.tsx
│       ├── Modal.tsx               # Uses shadcn/ui dialog
│       └── Button.tsx              # Uses shadcn/ui button
├── hooks/                          # Custom React hooks
│   ├── useAuth.ts
│   ├── useTeacher.ts
│   ├── useStudent.ts
│   ├── useLessons.ts
│   ├── usePlans.ts
│   ├── useLibrary.ts
│   └── useForm.ts
├── lib/                            # Utilities and services
│   ├── supabase/
│   │   ├── client.ts               # Client-side Supabase instance
│   │   ├── server.ts               # Server-side Supabase instance
│   │   ├── admin.ts                # Admin Supabase client
│   │   └── rls.ts                  # RLS policy helpers
│   ├── services/
│   │   ├── auth.service.ts         # Auth business logic
│   │   ├── teacher.service.ts
│   │   ├── enrollment.service.ts
│   │   ├── lesson.service.ts
│   │   ├── plan.service.ts
│   │   └── library.service.ts
│   ├── mux/
│   │   ├── client.ts               # Mux SDK client
│   │   ├── upload.ts               # Video upload logic
│   │   └── playback.ts             # Signed URL generation
│   ├── resend/
│   │   ├── client.ts               # Resend SDK client
│   │   ├── templates.ts            # Email templates
│   │   └── send.ts                 # Email sending logic
│   ├── storage/
│   │   ├── supabase.ts             # Supabase Storage helper
│   │   └── signed-urls.ts          # Signed URL generation
│   ├── api/
│   │   ├── client.ts               # Client-side API calls
│   │   ├── auth.ts
│   │   ├── teachers.ts
│   │   ├── lessons.ts
│   │   ├── plans.ts
│   │   └── library.ts
│   ├── middleware/
│   │   ├── auth.ts                 # Auth middleware
│   │   ├── validation.ts           # Request validation
│   │   └── errors.ts               # Error handling
│   ├── utils/
│   │   ├── date.ts                 # Date/time helpers
│   │   ├── format.ts               # Formatting utilities
│   │   ├── validation.ts           # Validation helpers
│   │   ├── constants.ts
│   │   └── types.ts                # Helper types
│   └── env.ts                      # Environment validation
├── types/                          # TypeScript interfaces
│   ├── auth.ts
│   ├── teacher.ts
│   ├── enrollment.ts
│   ├── lesson.ts
│   ├── plan.ts
│   ├── library.ts
│   ├── video.ts
│   ├── api.ts
│   └── index.ts                    # Main types export
├── styles/                         # Global styles
│   ├── globals.css
│   ├── variables.css               # CSS variables/theme
│   └── responsive.css
├── public/                         # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
├── tests/                          # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml              # Local Supabase and services
├── Dockerfile                      # Production container
├── middleware.ts                   # Next.js middleware for auth
├── next.config.ts                  # Next.js configuration
├── tsconfig.json                   # TypeScript configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── .env.example                    # Environment variables template
├── .env.local                      # Local environment (git ignored)
├── package.json
├── README.md
└── .gitignore
```

## Key Concepts

### API Routes Structure

API routes are server-only code in `/app/api/`. Each resource has:

```
/app/api/[resource]/route.ts      # Collection endpoints (GET all, POST create)
/app/api/[resource]/[id]/route.ts # Item endpoints (GET, PATCH, DELETE)
```

### Route Groups

Route groups (folders in parentheses) organize pages without affecting URL structure:

- `(auth)` - Login, signup pages
- `(teacher)` - Teacher dashboard and management pages (protected)
- `(student)` - Student portal pages (protected)

### Middleware

Next.js middleware (`middleware.ts`) runs on every request:
- Verify user session
- Redirect unauthenticated users
- Route role-based access (teacher vs student)

### Client vs Server Components

**Server Components (default):**
- Database queries
- API calls to external services
- Secrets and API keys
- Large dependencies

**Client Components (`'use client'`):**
- Event listeners and interactivity
- React hooks (useState, useEffect, etc.)
- Custom hooks that depend on client context
- Small interactive UI elements

## Important Patterns

1. **API routes return JSON** — All `/api/` routes return standardized JSON responses
2. **RLS policies enforce security** — Database layer is the security boundary
3. **Services contain business logic** — API routes are thin routing layers
4. **Hooks manage client state** — Keep components focused on rendering
5. **Types are source of truth** — Single source for TypeScript interfaces
6. **Environment variables validated at startup** — Use `lib/env.ts`
7. **External services initialized once** — Singleton patterns for Mux, Resend, Supabase
8. **Middleware handles auth redirect** — Protect routes before component renders
9. **No direct database code in components** — Always go through services or API routes
10. **Server actions optional** — Consider for mutations where simpler than API routes

## Database Migrations

Migrations stored in `supabase/migrations/` as SQL files.

Naming convention: `YYYYMMDD_HHmmss_description.sql`

Examples:
- `20261028_120000_create_profiles_table.sql`
- `20261028_130000_create_teachers_table.sql`
- `20261028_140000_add_rls_policies.sql`

Run migrations:
```bash
npm run migrate
# or locally
supabase db push
```

## Environment Files

- `.env.example` - Template (committed to repo)
- `.env.local` - Local development (not committed)
- `.env.production` - Production values in Vercel

Required variables:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
NEXT_PUBLIC_RESEND_API_KEY=
RESEND_API_KEY=
```

## Testing

Tests colocated with source or in `tests/` folder:

- `lib/services/lesson.service.ts` → `tests/lesson.service.test.ts`
- `hooks/useLessons.ts` → `tests/useLessons.test.ts`
- `components/LessonDetail.tsx` → `tests/LessonDetail.test.tsx`

## Monorepo Alternative

This is a **single app** structure. If splitting into separate packages later, use:

```
/packages/app         # Next.js app
/packages/api         # API types and utilities
/packages/types       # Shared types
/packages/lib         # Shared utilities
```

But start with single app for simplicity.

## shadcn/ui Integration

### Component Structure

**Folder hierarchy:**

```
components/
├── ui/              # shadcn/ui generated components (auto-generated)
├── blocks/          # shadcn/ui blocks adapted for app
└── [feature]/       # Feature-specific components that use ui/ and blocks/
```

### Adding shadcn/ui Components

Use the CLI to add components:

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add form
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add table
npx shadcn-ui@latest add calendar
# etc...
```

Components are installed to `/components/ui/` and are customizable.

### Adding shadcn/ui Blocks

Blocks are templates for complex layouts. Copy from https://ui.shadcn.com/blocks:

1. Visit https://ui.shadcn.com/blocks
2. Find desired block (e.g., authentication form, dashboard table, navigation)
3. Copy the component code
4. Paste into `/components/blocks/[category]/[BlockName].tsx`
5. Customize for your app needs
6. Use in your pages

Example block structure:
```
components/
└── blocks/
    ├── auth-forms/
    │   ├── LoginForm.tsx        # From shadcn/ui blocks
    │   └── SignupForm.tsx
    ├── dashboard/
    │   ├── DashboardLayout.tsx
    │   └── StatCard.tsx
    ├── tables/
    │   ├── StudentTable.tsx
    │   └── LessonTable.tsx
    └── navigation/
        └── Sidebar.tsx
```

### Best Practices

1. **Keep `/components/ui/` untouched** — These are shadcn/ui generated files
2. **Customize in `/components/blocks/`** — Copy blocks here and adapt
3. **Feature components use both** — Your components use ui/ and blocks/
4. **Extend via Tailwind** — Customize styling with Tailwind classes
5. **Follow shadcn/ui conventions** — Use the same patterns as shadcn/ui
6. **Version control blocks** — Keep blocks in git unlike generated ui components

### Component Usage Example

```tsx
// components/blocks/students/StudentTable.tsx
'use client'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function StudentTable({ students }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id}>
            <TableCell>{student.name}</TableCell>
            <TableCell>{student.status}</TableCell>
            <TableCell>
              <Button size="sm">Edit</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Recommended shadcn/ui Components for This App

Core UI:
- `button`, `input`, `label`, `form` — Forms and inputs
- `card`, `dialog`, `popover` — Containers and overlays
- `table`, `pagination` — Data display
- `tabs`, `select`, `checkbox` — Selections
- `calendar` — Date/time selection
- `toast`, `alert` — Notifications
- `skeleton` — Loading states

Blocks to adapt:
- Dashboard layouts
- Authentication forms
- Data tables with filters/sorting
- Navigation sidebars
- Form templates
- Modal/dialog patterns

This makes building consistent, accessible UI fast and maintainable.
