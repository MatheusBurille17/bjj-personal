# Technology Stack & Build System

## Overview

Full-stack web application using Next.js with TypeScript. Single codebase for frontend and backend (API routes). All services externalized: database (Supabase), auth (Supabase Auth), video hosting (Mux), file storage (Supabase Storage), email (Resend).

## Full-Stack Runtime

**Framework:**
- Next.js 14+ with TypeScript
- App Router for routing and API routes
- Server Components and Client Components
- API Routes for backend logic (`/app/api/`)

**Language:**
- TypeScript for type safety across entire codebase
- Strict mode enabled

**Environment:**
- Environment variables via `.env.local` and `.env.production`
- Development and production configurations
- Vercel automatic environment management

## Database & Authentication

**Database:**
- PostgreSQL via Supabase
- Row Level Security (RLS) policies for authorization
- Real-time subscriptions where applicable
- Supabase client SDK for queries

**Authentication:**
- Supabase Auth (email/password, social providers)
- JWT tokens via Supabase session management
- Server-side session verification in API routes

## External Services

**Video Hosting:**
- Mux for video upload, processing, and playback
- Secure signed URLs for protected playback
- Adaptive bitrate streaming

**File Storage:**
- Supabase Storage for non-video files (images, documents)
- Signed URLs for temporary access
- Public/private bucket configuration

**Email Service:**
- Resend for transactional emails
- Email templates for invitations, notifications, confirmations
- Tracking and analytics

## Frontend Stack

**Framework:**
- Next.js App Router with Server Components
- Client Components with React hooks for interactivity
- Responsive design with mobile-first approach

**State & Data:**
- React hooks (useState, useContext, etc.)
- Server-side data fetching with async components
- Client-side caching where appropriate
- SWR or React Query for client-side mutations

**Styling:**
- Tailwind CSS for utility-first styling
- Responsive layout patterns for mobile, tablet, desktop
- CSS modules for component-scoped styles

**UI Components:**
- shadcn/ui for pre-built accessible components
- Pull components and blocks from https://ui.shadcn.com
- Customize components as needed within `/components/ui/`
- Use blocks as templates for complex layouts

**Key Libraries:**
- Next.js built-in routing and API routes
- shadcn/ui components (Button, Form, Dialog, etc.)
- Radix UI primitives (underlying shadcn/ui)
- Form validation library (Zod with React Hook Form)
- Date/time handling (date-fns or similar for timezone support)

## Security & Authorization

- Server-side validation in API routes
- Row Level Security (RLS) policies in PostgreSQL
- Supabase Auth session verification in middleware
- Never trust client-provided identifiers
- Secure video playback with Mux signed URLs (temporary)
- Protected file access via Supabase Storage signed URLs
- API routes verify user context before database operations

## Build & Development

### Development Server
```bash
npm run dev        # Start Next.js dev server with hot reload
```

### Build for Production
```bash
npm run build      # Compile Next.js and TypeScript
npm run type-check # Verify TypeScript correctness
```

### Testing
```bash
npm test           # Run test suite
npm run test:watch # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Linting & Formatting
```bash
npm run lint       # Check code style (ESLint)
npm run lint:fix   # Auto-fix linting issues
npm run format     # Format code (Prettier)
```

### Database Migrations
```bash
npm run migrate    # Apply pending migrations
npm run migrate:create # Create new migration
npm run migrate:rollback # Revert last migration
```

### Local Supabase
```bash
npm run supabase:start # Start local Supabase instance
npm run supabase:stop  # Stop local Supabase
```

## Code Organization

**API Routes** (`/app/api/`):
- Route handlers for each domain
- Server-side only (no client code)
- Session verification middleware
- Delegate to services/lib for business logic

**App Routes** (`/app/`):
- Page components (public, authenticated layouts)
- Route groups for organization
- Middleware for auth checks
- Loading states and error boundaries

**Components** (`/components/`):
- Reusable UI components
- Client or Server marked explicitly
- Organized by feature area

**Hooks** (`/hooks/`):
- Custom React hooks (client-only)
- Data fetching, form state, auth context
- Reusable business logic

**Services/Lib** (`/lib/`):
- Supabase client initialization
- Business logic functions
- API client functions for client components
- Email service integration (Resend)
- Video service integration (Mux)
- Storage service integration (Supabase Storage)
- Utilities and helpers

**Types** (`/types/`):
- TypeScript interfaces and types
- Shared across entire codebase

**Styles** (`/styles/`):
- Global styles
- CSS modules for component scoping
- Tailwind configuration

## Database Conventions

**Naming:**
- Tables in snake_case (e.g., `monthly_plans`)
- Columns in snake_case
- Foreign keys follow pattern: `{table_singular}_id`
- Boolean columns prefixed with `is_` or `has_`

**Timestamps:**
- `created_at` - Immutable creation time (UTC)
- `updated_at` - Auto-updated on any change (UTC)
- `archived_at` - Soft delete timestamp
- All timestamps in UTC

**IDs:**
- Use UUID v4 for all primary keys
- `id` column name consistently

**Status Fields:**
- Use ENUM types where possible
- Examples: lesson status (scheduled, completed, cancelled, no_show)
- Document valid values in code comments

## API Route Conventions

**Endpoint Pattern:**
```
/app/api/[resource]/route.ts
/app/api/[resource]/[id]/route.ts
```

**Response Format:**
```json
{
  "data": { /* resource or array */ },
  "error": null,
  "meta": { /* pagination, timestamps, etc */ }
}
```

**Error Handling:**
- 400: Bad request (validation failure)
- 401: Unauthorized (auth required)
- 403: Forbidden (insufficient permissions)
- 404: Not found
- 409: Conflict (business rule violation)
- 500: Server error

**Authorization Pattern in API Routes:**
```typescript
// Get current user session
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response(null, { status: 401 });

// Verify resource ownership via RLS policies
// RLS handles the enforcement at database layer
```

## External Service Integration

**Supabase:**
- Database queries with type-safety
- Auth session management
- Realtime subscriptions
- Storage for files

**Mux:**
- Video upload endpoint
- Signed playback URLs
- Video metadata (duration, thumbnail)

**Resend:**
- Email templates
- Transactional emails (invitations, notifications)
- Batch sending support

**Supabase Storage:**
- Bucket configuration (public/private)
- Signed URLs for temporary access
- CORS configuration

## Deployment

**Platform:**
- Vercel for automatic deployment from GitHub
- Environment variables managed in Vercel dashboard
- Automatic preview deployments on pull requests
- Production deployments on merge to main

**Docker:**
- Optional for local development or alternative deployment
- `Dockerfile` for containerization
- `docker-compose.yml` for local services (Supabase)

**Database:**
- Managed Supabase instance
- Automatic backups
- Database migrations run before app start

**CDN & Caching:**
- Vercel Edge Network for static assets
- Cache headers for images and videos
- ISR (Incremental Static Regeneration) for dynamic pages

## Common Commands Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Build production | `npm run build` |
| Start production build | `npm run start` |
| Run tests | `npm run test` |
| Type check | `npm run type-check` |
| Lint code | `npm run lint` |
| Format code | `npm run format` |
| Database migrate | `npm run migrate` |
| Create migration | `npm run migrate:create` |
| Start local Supabase | `npm run supabase:start` |
| Stop local Supabase | `npm run supabase:stop` |
| Deploy to Vercel | `git push origin main` |
