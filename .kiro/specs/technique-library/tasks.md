# Implementation Plan: Technique Library (Biblioteca de TÃƒÂ©cnicas)

## Overview

This implementation plan establishes the technique library module for the Jiu-Jitsu lessons platform, enabling teachers to organize instructional content in a three-tier hierarchy (Techniques Ã¢â€ â€™ Modules Ã¢â€ â€™ Videos). Videos are hosted externally on Mux with only metadata stored in the database, enabling scalable video delivery. The module provides CRUD operations, drag-and-drop reordering, archiving, Mux integration for upload and playback, and efficient search. Implementation follows a bottom-up approach: database layer Ã¢â€ â€™ service layer Ã¢â€ â€™ API layer Ã¢â€ â€™ frontend components.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- PostgreSQL with RLS policies for data isolation
- Supabase Auth for session management
- Mux for video hosting, processing, and delivery
- shadcn/ui for UI components (Table, Card, Dialog, Badge, Skeleton, Tabs)
- fast-check for property-based testing (100 iterations minimum per property)

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create techniques table migration
    - Create `supabase/migrations/[timestamp]_create_techniques_table.sql`
    - Define techniques table: id (UUID PK), teacher_id (UUID FK to teachers ON DELETE CASCADE), name (TEXT CHECK LENGTH 2-200), description (TEXT CHECK LENGTH Ã¢â€°Â¤2000 nullable), sort_order (INTEGER CHECK Ã¢â€°Â¥0 DEFAULT 0), status (TEXT CHECK 'active'|'archived' DEFAULT 'active'), created_at, updated_at
    - Add indexes: idx_techniques_teacher_id, idx_techniques_status, idx_techniques_sort_order (teacher_id, sort_order)
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 27.1_

  - [x] 1.2 Create modules table migration
    - Create `supabase/migrations/[timestamp]_create_modules_table.sql`
    - Define modules table: id (UUID PK), technique_id (UUID FK to techniques ON DELETE CASCADE), name (TEXT CHECK LENGTH 2-200), description (TEXT CHECK LENGTH Ã¢â€°Â¤2000 nullable), sort_order (INTEGER CHECK Ã¢â€°Â¥0 DEFAULT 0), status (TEXT CHECK 'active'|'archived' DEFAULT 'active'), created_at, updated_at
    - Add indexes: idx_modules_technique_id, idx_modules_status, idx_modules_sort_order (technique_id, sort_order)
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 27.1_

  - [x] 1.3 Create videos table migration
    - Create `supabase/migrations/[timestamp]_create_videos_table.sql`
    - Define videos table: id (UUID PK), teacher_id (UUID FK to teachers ON DELETE CASCADE), module_id (UUID FK to modules ON DELETE CASCADE), title (TEXT CHECK LENGTH 2-200), description (TEXT CHECK LENGTH Ã¢â€°Â¤2000 nullable), provider (TEXT CHECK 'mux' DEFAULT 'mux'), provider_video_id (TEXT NOT NULL), thumbnail_url (TEXT nullable), duration_seconds (INTEGER CHECK Ã¢â€°Â¥0 nullable), status (TEXT CHECK 'uploading'|'processing'|'ready'|'error'|'archived' DEFAULT 'uploading'), created_at, updated_at
    - Add UNIQUE constraint on (provider, provider_video_id)
    - Add indexes: idx_videos_teacher_id, idx_videos_module_id, idx_videos_status, idx_videos_provider_video_id, idx_videos_title_search (GIN to_tsvector)
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.7, 21.1, 21.2, 27.1_

  - [x] 1.4 Create RLS policies for techniques table
    - Create `supabase/migrations/[timestamp]_add_techniques_rls_policies.sql`
    - Enable RLS on techniques table
    - Policy: Teachers can SELECT their own techniques (teacher_id = auth.uid())
    - Policy: Teachers can INSERT techniques for themselves (WITH CHECK teacher_id = auth.uid())
    - Policy: Teachers can UPDATE their own techniques (USING teacher_id = auth.uid(), WITH CHECK teacher_id = auth.uid())
    - Policy: Teachers can DELETE their own techniques (USING teacher_id = auth.uid())
    - _Requirements: 1.6, 2.1, 24.1, 24.4, 24.5_

  - [x] 1.5 Create RLS policies for modules table
    - Create `supabase/migrations/[timestamp]_add_modules_rls_policies.sql`
    - Enable RLS on modules table
    - Policy: Teachers can SELECT modules from their own techniques (EXISTS subquery checking techniques.teacher_id = auth.uid())
    - Policy: Teachers can INSERT modules in their own techniques (WITH CHECK EXISTS subquery)
    - Policy: Teachers can UPDATE modules in their own techniques (USING EXISTS subquery, WITH CHECK EXISTS subquery)
    - Policy: Teachers can DELETE modules from their own techniques (USING EXISTS subquery)
    - _Requirements: 7.6, 8.1, 8.4, 24.2, 24.4, 24.5_

  - [x] 1.6 Create RLS policies for videos table
    - Create `supabase/migrations/[timestamp]_add_videos_rls_policies.sql`
    - Enable RLS on videos table
    - Policy: Teachers can SELECT videos where teacher_id = auth.uid()
    - Policy: Teachers can INSERT videos where teacher_id = auth.uid()
    - Policy: Teachers can UPDATE videos where teacher_id = auth.uid()
    - Policy: Teachers can DELETE videos where teacher_id = auth.uid()
    - Policy: Students can SELECT videos with access_control permission (EXISTS subquery on video_access_control table - separate spec)
    - _Requirements: 14.3, 17.1, 17.3, 24.3, 24.4, 24.5_

  - [x] 1.7 Add database trigger function for updated_at
    - Add update_updated_at_column() trigger function if not exists
    - Function sets NEW.updated_at = NOW() before any UPDATE
    - Test trigger function works correctly on all three tables
    - _Requirements: 27.1, 27.2, 27.5_

- [x] 2. TypeScript type definitions
  - [x] 2.1 Create library types
    - Create `types/library.ts`
    - Define TechniqueStatus type: 'active' | 'archived'
    - Define ModuleStatus type: 'active' | 'archived'
    - Define VideoStatus type: 'uploading' | 'processing' | 'ready' | 'error' | 'archived'
    - Define VideoProvider type: 'mux'
    - Define Technique interface with all database fields
    - Define TechniqueWithCount interface extending Technique with module_count
    - Define Module interface with all database fields
    - Define ModuleWithCount interface extending Module with video_count
    - Define Video interface with all database fields
    - Define VideoSearchResult interface extending Video with module_name, technique_name
    - Export all types from `types/index.ts`
    - _Requirements: 1.5, 2.7, 5.1, 8.7, 14.2, 17.4, 20.1, 21.1_

  - [x] 2.2 Create library data transfer types
    - Add to `types/library.ts`
    - Define CreateTechniqueData interface (name, description optional, sort_order optional)
    - Define UpdateTechniqueData interface (all fields optional)
    - Define CreateModuleData interface (technique_id, name, description optional, sort_order optional)
    - Define UpdateModuleData interface (all fields optional)
    - Define CreateVideoData interface (module_id, title, description optional, provider_video_id)
    - Define UpdateVideoData interface (title optional, description optional)
    - Define VideoMetadata interface (title, description optional)
    - Define ReorderItem interface (id, sort_order)
    - _Requirements: 1.1, 3.1, 6.1, 7.1, 9.1, 14.1, 15.1_

  - [x] 2.3 Create Mux integration types
    - Add to `types/library.ts`
    - Define MuxUploadResponse interface (upload_url, upload_id)
    - Define MuxWebhookEvent interface (type, data with id, playback_ids, duration)
    - Define MuxAsset interface (id, playback_ids, duration, status)
    - Define PlaybackUrlResponse interface (playback_url, expires_at)
    - _Requirements: 13.1, 13.2, 16.1, 18.1, 18.2_



- [x] 3. Validation utilities and schemas
  - [x] 3.1 Create technique validation schemas
    - Create `lib/utils/library-validation.ts`
    - Define createTechniqueSchema with Zod: name (min 2, max 200 chars, trim), description (optional, max 2000 chars, trim, nullable), sort_order (optional, positive integer)
    - Define updateTechniqueSchema with all fields optional but same validation rules
    - _Requirements: 1.2, 1.8, 3.2, 29.1, 29.2, 29.5_

  - [x] 3.2 Create module validation schemas
    - Add to `lib/utils/library-validation.ts`
    - Define createModuleSchema with Zod: technique_id (UUID format), name (min 2, max 200 chars, trim), description (optional, max 2000 chars, trim, nullable), sort_order (optional, positive integer)
    - Define updateModuleSchema with all fields optional but same validation rules
    - _Requirements: 7.1, 7.2, 9.3, 29.1, 29.2, 29.5_

  - [x] 3.3 Create video validation schemas
    - Add to `lib/utils/library-validation.ts`
    - Define createVideoSchema with Zod: module_id (UUID format), title (min 2, max 200 chars, trim), description (optional, max 2000 chars, trim, nullable), provider_video_id (string, not empty)
    - Define updateVideoSchema with title and description optional but same validation rules
    - Define searchVideosSchema with Zod: q (string, trim), page (optional, positive integer, default 1), pageSize (optional, positive integer, max 100, default 20)
    - _Requirements: 14.4, 15.2, 20.1, 29.1, 29.2, 29.3, 29.5, 30.1, 30.7_

  - [x] 3.4 Create reorder validation schemas
    - Add to `lib/utils/library-validation.ts`
    - Define reorderSchema with Zod: array of objects with id (UUID) and sort_order (positive integer)
    - Validate minimum 1 item in array
    - Validate all sort_order values are positive integers
    - _Requirements: 4.2, 4.4, 10.2, 10.4_

- [x] 4. Service layer - Library service for techniques and modules
  - [x] 4.1 Create technique CRUD functions
    - Create `lib/services/library.service.ts`
    - Implement createTechnique(teacherId, data: CreateTechniqueData): Promise<Technique>
    - Validate data with createTechniqueSchema
    - Insert into techniques table with teacher_id, name, description, sort_order (default max+1 if not provided), status 'active'
    - Return created technique with all fields
    - _Requirements: 1.1, 1.5, 1.8_

  - [x]* 4.2 Write property test for technique creation
    - **Property 1: Valid Technique Creation**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.7**
    - Test that any valid name (2-200 chars) and optional description (Ã¢â€°Â¤2000 chars) creates technique with status 'active' and timestamps

  - [x] 4.3 Implement getTechniques function
    - Implement getTechniques(teacherId, includeArchived: boolean = false): Promise<TechniqueWithCount[]>
    - Query techniques WHERE teacher_id = teacherId
    - Filter by status 'active' unless includeArchived is true
    - LEFT JOIN modules to count module_count (WHERE modules.status != 'archived' for accurate count)
    - Sort by sort_order ASC
    - Return array of techniques with module_count
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [x]* 4.4 Write property test for technique isolation
    - **Property 3: Technique Isolation**
    - **Validates: Requirements 1.6, 2.1, 2.5, 24.1**
    - Test that any two different teachers querying techniques only see their own

  - [x] 4.5 Implement updateTechnique function
    - Implement updateTechnique(techniqueId, teacherId, data: UpdateTechniqueData): Promise<Technique>
    - Verify technique belongs to teacher (query with WHERE id = techniqueId AND teacher_id = teacherId)
    - If not found, throw 404 error
    - Validate data with updateTechniqueSchema
    - Update allowed fields: name, description, sort_order (exclude status from updates)
    - Return updated technique
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

  - [x]* 4.6 Write property test for timestamp updates
    - **Property 8: Timestamp Update on Modification**
    - **Validates: Requirements 3.4, 9.4, 12.4, 15.4, 27.1, 27.2, 27.6**
    - Test that any update increases updated_at and leaves created_at unchanged

  - [x] 4.7 Implement reorderTechniques function
    - Implement reorderTechniques(teacherId, reorders: ReorderItem[]): Promise<number>
    - Validate reorders array with reorderSchema
    - Verify all techniques belong to teacher (SELECT WHERE id IN (...) AND teacher_id = teacherId)
    - If any don't belong, throw 403 error
    - Use transaction to UPDATE sort_order for all items in batch
    - Return count of updated techniques
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 4.8 Write property test for batch reorder atomicity
    - **Property 10: Batch Reorder Atomicity**
    - **Validates: Requirements 4.6, 4.7, 10.6, 10.7**
    - Test that if any item fails, all sort_order values rollback to original

  - [x] 4.9 Implement archiveTechnique function
    - Implement archiveTechnique(techniqueId, teacherId): Promise<Technique>
    - Verify technique belongs to teacher
    - Use transaction to:
      - UPDATE techniques SET status = 'archived' WHERE id = techniqueId
      - UPDATE modules SET status = 'archived' WHERE technique_id = techniqueId
      - UPDATE videos SET status = 'archived' WHERE module_id IN (SELECT id FROM modules WHERE technique_id = techniqueId)
    - Return updated technique
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x]* 4.10 Write property test for archive cascade
    - **Property 13: Archive Cascades to Children**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Test that archiving technique sets status 'archived' for technique, all modules, and all videos

  - [x] 4.11 Implement unarchiveTechnique function
    - Implement unarchiveTechnique(techniqueId, teacherId): Promise<Technique>
    - Verify technique belongs to teacher
    - Check current status is 'archived' (if not, throw 409 Conflict error)
    - UPDATE techniques SET status = 'active' WHERE id = techniqueId
    - Do NOT unarchive child modules or videos
    - Return updated technique
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 4.12 Write property test for unarchive validation
    - **Property 17: Unarchive Status Validation**
    - **Validates: Requirements 6.4, 6.6**
    - Test that unarchiving active technique returns 409 error

  - [x] 4.13 Implement module CRUD functions
    - Implement createModule(teacherId, data: CreateModuleData): Promise<Module>
    - Verify technique_id exists and belongs to teacher
    - Validate data with createModuleSchema
    - Insert into modules table with technique_id, name, description, sort_order (default max+1), status 'active'
    - Return created module
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 4.14 Write property test for module creation ownership
    - **Property 18: Module Creation Requires Technique Ownership**
    - **Validates: Requirements 7.2, 7.6**
    - Test that creating module with technique_id from different teacher returns 403

  - [x] 4.15 Implement getModulesForTechnique function
    - Implement getModulesForTechnique(techniqueId, teacherId, includeArchived: boolean = false): Promise<ModuleWithCount[]>
    - Verify technique belongs to teacher
    - Query modules WHERE technique_id = techniqueId
    - Filter by status 'active' unless includeArchived is true
    - LEFT JOIN videos to count video_count (WHERE videos.status != 'archived')
    - Sort by sort_order ASC
    - Return array of modules with video_count
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

  - [x]* 4.16 Write property test for module list ownership
    - **Property 20: Module List Ownership Verification**
    - **Validates: Requirements 8.4, 9.3**
    - Test that querying modules for technique from different teacher returns 403

  - [x] 4.17 Implement updateModule function
    - Implement updateModule(moduleId, teacherId, data: UpdateModuleData): Promise<Module>
    - Verify module's parent technique belongs to teacher (JOIN with techniques table)
    - If not found, throw 404 or 403 error
    - Validate data with updateModuleSchema
    - Update allowed fields: name, description, sort_order (exclude status)
    - Return updated module
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

  - [x] 4.18 Implement reorderModules function
    - Implement reorderModules(teacherId, reorders: ReorderItem[]): Promise<number>
    - Validate reorders array with reorderSchema
    - Verify all modules belong to teacher's techniques (JOIN modules with techniques)
    - If any don't belong, throw 403 error
    - Use transaction to UPDATE sort_order for all items
    - Return count of updated modules
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 4.19 Implement archiveModule function
    - Implement archiveModule(moduleId, teacherId): Promise<Module>
    - Verify module's parent technique belongs to teacher
    - Use transaction to:
      - UPDATE modules SET status = 'archived' WHERE id = moduleId
      - UPDATE videos SET status = 'archived' WHERE module_id = moduleId
    - Return updated module
    - _Requirements: 11.1, 11.2, 11.3_

  - [x]* 4.20 Write property test for module archive cascade
    - **Property 23: Archive Module Cascades to Videos**
    - **Validates: Requirements 11.1, 11.2**
    - Test that archiving module sets status 'archived' for module and all its videos

  - [x] 4.21 Implement moveModule function
    - Implement moveModule(moduleId, targetTechniqueId, teacherId): Promise<Module>
    - Verify module's current technique belongs to teacher
    - Verify target technique exists and belongs to teacher
    - If either check fails, throw 403 error
    - UPDATE modules SET technique_id = targetTechniqueId WHERE id = moduleId
    - Preserve all other fields (status, sort_order, videos)
    - Return updated module
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x]* 4.22 Write property test for module move ownership
    - **Property 26: Move Module Ownership Verification**
    - **Validates: Requirements 12.2, 12.6**
    - Test that moving module to technique from different teacher returns 403

- [x] 5. Service layer - Video service
  - [x] 5.1 Create video metadata functions
    - Create `lib/services/video.service.ts`
    - Implement createVideo(teacherId, data: CreateVideoData): Promise<Video>
    - Verify module_id exists and belongs to teacher (JOIN modules with techniques)
    - If not found, throw 403 or 404 error
    - Validate data with createVideoSchema
    - Insert into videos table with teacher_id, module_id, title, description, provider 'mux', provider_video_id, status 'uploading'
    - Return created video
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x]* 5.2 Write property test for video creation ownership
    - **Property 29: Video Creation Module Ownership**
    - **Validates: Requirements 14.3**
    - Test that creating video with module_id from different teacher returns 403

  - [x] 5.3 Implement getVideosForModule function
    - Implement getVideosForModule(moduleId, teacherId, includeArchived: boolean = false): Promise<Video[]>
    - Verify module's parent technique belongs to teacher (JOIN modules with techniques)
    - Query videos WHERE module_id = moduleId
    - Filter by status != 'archived' unless includeArchived is true
    - Include all processing statuses (uploading, processing, ready, error)
    - Return array of videos
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.7_

  - [x]* 5.4 Write property test for video list includes all statuses
    - **Property 38: Video List Includes All Processing States**
    - **Validates: Requirements 17.7**
    - Test that videos with any non-archived status appear in list

  - [x] 5.5 Implement updateVideo function
    - Implement updateVideo(videoId, teacherId, data: UpdateVideoData): Promise<Video>
    - Verify video belongs to teacher (WHERE id = videoId AND teacher_id = teacherId)
    - If not found, throw 404 or 403 error
    - Validate data with updateVideoSchema
    - Update ONLY title and description fields (ignore provider, provider_video_id, status)
    - Return updated video
    - _Requirements: 15.1, 15.2, 15.3, 15.6, 15.7_

  - [x]* 5.6 Write property test for video field immutability
    - **Property 32: Video Field Immutability**
    - **Validates: Requirements 15.7**
    - Test that attempting to update provider, provider_video_id, or status is ignored

  - [x] 5.7 Implement archiveVideo function
    - Implement archiveVideo(videoId, teacherId): Promise<Video>
    - Verify video belongs to teacher
    - UPDATE videos SET status = 'archived' WHERE id = videoId
    - Allow archiving regardless of current processing status
    - Return updated video
    - _Requirements: 19.1, 19.2, 19.3, 19.6_

  - [x]* 5.8 Write property test for video archive status
    - **Property 42: Video Archive Status Change**
    - **Validates: Requirements 19.1, 19.3, 19.6**
    - Test that archiving any video sets status to 'archived' regardless of previous status

  - [x] 5.9 Implement deleteVideo function
    - Implement deleteVideo(videoId, teacherId): Promise<void>
    - Verify video belongs to teacher
    - Check for references in lessons table (COUNT WHERE video_id = videoId)
    - Check for references in plan_days table (COUNT WHERE video_id = videoId)
    - If any references exist, throw 409 Conflict error with message "Cannot delete video with existing lesson or plan references. Archive instead."
    - If no references, DELETE FROM videos WHERE id = videoId
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [x]* 5.10 Write property test for deletion reference check
    - **Property 47: Video Deletion Reference Check**
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.5**
    - Test that video with lesson/plan references returns 409 and is not deleted

  - [x] 5.11 Implement searchVideos function
    - Implement searchVideos(teacherId, query: string, page: number = 1, pageSize: number = 20): Promise<{ videos: VideoSearchResult[]; total: number }>
    - Validate with searchVideosSchema
    - Trim whitespace from query
    - If query empty, return all non-archived videos
    - Query videos WHERE teacher_id = teacherId AND status != 'archived' AND title ILIKE '%{query}%'
    - JOIN modules and techniques to get module_name and technique_name
    - Calculate pagination: offset = (page - 1) * pageSize
    - Return videos array and total count
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

  - [x]* 5.12 Write property test for search functionality
    - **Property 43: Video Search Case-Insensitive Partial Match**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4**
    - Test that search finds videos containing query substring case-insensitively

- [x] 6. Service layer - Mux integration service
  - [x] 6.1 Create Mux client initialization
    - Create `lib/mux/client.ts`
    - Initialize Mux SDK with MUX_TOKEN_ID and MUX_TOKEN_SECRET from environment
    - Export Mux client singleton
    - _Requirements: 13.1, 28.7_

  - [x] 6.2 Implement upload URL generation
    - Create `lib/services/mux.service.ts`
    - Implement createDirectUpload(): Promise<MuxUploadResponse>
    - Call Mux API to create direct upload
    - Return upload_url and upload_id (asset_id or upload_id)
    - Handle Mux API errors and return descriptive error messages
    - Implement timeout (30 seconds)
    - Implement retry logic (up to 3 times with exponential backoff)
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 28.1, 28.2, 28.4_

  - [x]* 6.3 Write property test for upload URL generation
    - **Property 27: Upload URL Generation**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.6, 25.1**
    - Test that any authenticated teacher requesting upload URL receives upload_url and upload_id

  - [x] 6.4 Implement playback URL generation
    - Implement generateSignedPlaybackUrl(playbackId: string, expirationSeconds: number = 86400): Promise<string>
    - Use Mux SDK to generate signed playback URL
    - Set expiration to 24 hours (86400 seconds)
    - Use secure playback policy
    - Return signed URL string
    - _Requirements: 18.2, 18.7_

  - [x]* 6.5 Write property test for playback URL generation
    - **Property 41: Playback URL Generation**
    - **Validates: Requirements 18.2**
    - Test that any ready video owned by teacher generates signed URL with expiration

  - [x] 6.6 Implement webhook signature verification
    - Implement verifyWebhookSignature(body: string, signature: string): Promise<boolean>
    - Use Mux SDK webhook verification function
    - Verify signature matches webhook secret
    - Return true if valid, false otherwise
    - _Requirements: 16.1, 16.7_

  - [x]* 6.7 Write property test for webhook signature validation
    - **Property 33: Webhook Signature Validation**
    - **Validates: Requirements 16.1, 16.7**
    - Test that invalid signature returns 401 without processing

  - [x] 6.8 Implement webhook event processing
    - Implement processWebhookEvent(event: MuxWebhookEvent): Promise<void>
    - Extract provider_video_id from event.data.id
    - Query videos table to find matching record
    - If not found, log warning and return (no error)
    - If event.type === 'video.asset.ready':
      - Update status to 'ready'
      - Update thumbnail_url from event.data.playback_ids[0]
      - Update duration_seconds from event.data.duration
    - If event.type === 'video.asset.errored':
      - Update status to 'error'
    - Handle errors gracefully, log but don't throw
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6, 25.5, 28.3_

  - [x]* 6.9 Write property test for webhook status updates
    - **Property 34: Webhook Status Update**
    - **Property 35: Webhook Error Status Update**
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 16.6**
    - Test that video.asset.ready sets status 'ready' and populates metadata
    - Test that video.asset.errored sets status 'error'

- [x] 7. Checkpoint - Service layer complete
  - Ensure all service functions implemented
  - Run property tests and unit tests for services
  - Verify database interactions with local Supabase
  - Test Mux integration with test credentials
  - Ask the user if questions arise



- [x] 8. API Routes - Technique endpoints
  - [x] 8.1 Create POST /api/library/techniques endpoint
    - Create `app/api/library/techniques/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Parse and validate request body with createTechniqueSchema
    - Call library.service createTechnique
    - Return 201 with created technique
    - Handle validation errors (400)
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [x]* 8.2 Write unit test for technique creation endpoint
    - Test successful creation returns 201
    - Test invalid name returns 400
    - Test unauthenticated request returns 401

  - [x] 8.3 Create GET /api/library/techniques endpoint
    - Add GET handler to `app/api/library/techniques/route.ts`
    - Extract authenticated user from session (teacher_id)
    - Return 401 if not authenticated
    - Parse query parameter: include_archived (boolean, default false)
    - Call library.service getTechniques
    - Return 200 with techniques array and data envelope
    - _Requirements: 2.1, 2.2, 2.4, 2.6_

  - [x]* 8.4 Write property test for technique list authorization
    - **Property 3: Technique Isolation**
    - **Validates: Requirements 1.6, 2.1, 2.5, 24.1**
    - Test that any tea

- [x] 8. API Routes - Technique endpoints
  - [x] 8.1 Create POST /api/library/techniques endpoint
    - Create `app/api/library/techniques/route.ts`
    - Extract authenticated user from session, return 401 if not authenticated
    - Parse and validate request body with createTechniqueSchema
    - Call library.service createTechnique, return 201 with created technique
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [x] 8.2 Create GET /api/library/techniques endpoint
    - Add GET handler, parse include_archived query parameter
    - Call library.service getTechniques, return 200 with techniques array
    - _Requirements: 2.1, 2.2, 2.4, 2.6_

  - [x] 8.3 Create PATCH /api/library/techniques/[id] endpoint
    - Extract ID from params, validate body, call updateTechnique
    - Handle 404 if not found, 403 if wrong teacher
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [x] 8.4 Create POST /api/library/techniques/reorder endpoint
    - Validate reorder array, call reorderTechniques
    - Return 200 with updated_count
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 8.5 Create archive and unarchive endpoints
    - POST /api/library/techniques/[id]/archive - call archiveTechnique
    - POST /api/library/techniques/[id]/unarchive - call unarchiveTechnique
    - _Requirements: 5.1-5.5, 6.1-6.7_

- [x] 9. API Routes - Module endpoints
  - [x] 9.1 Create module CRUD endpoints
    - POST /api/library/modules - create module
    - GET /api/library/techniques/[techniqueId]/modules - list modules
    - PATCH /api/library/modules/[id] - update module
    - _Requirements: 7.1-7.7, 8.1-8.7, 9.1-9.7_

  - [x] 9.2 Create module action endpoints
    - POST /api/library/modules/reorder - batch reorder
    - POST /api/library/modules/[id]/move - move to different technique
    - POST /api/library/modules/[id]/archive - archive module
    - _Requirements: 10.1-10.5, 11.1-11.4, 12.1-12.7_

- [x] 10. API Routes - Video endpoints
  - [x] 10.1 Create video CRUD endpoints
    - POST /api/library/videos - create video metadata
    - GET /api/library/modules/[moduleId]/videos - list videos
    - PATCH /api/library/videos/[id] - update video metadata
    - POST /api/library/videos/[id]/archive - archive video
    - DELETE /api/library/videos/[id] - delete if no references
    - _Requirements: 14.1-14.8, 15.1-15.7, 17.1-17.7, 19.1-19.7, 23.1-23.7_

- [x] 11. API Routes - Mux integration endpoints
  - [x] 11.1 Create POST /api/library/videos/upload endpoint
    - Call mux.service createDirectUpload
    - Return upload_url and upload_id
    - Handle 503 if Mux unavailable
    - _Requirements: 13.1, 13.2, 13.4, 13.7, 28.5_

  - [x] 11.2 Create GET /api/library/videos/[id]/playback endpoint
    - Verify video belongs to teacher and status is 'ready'
    - Call mux.service generateSignedPlaybackUrl
    - Return playback_url and expires_at
    - Handle 409 if not ready, 403 if wrong teacher
    - _Requirements: 18.1-18.7_

  - [x] 11.3 Create POST /api/library/videos/webhook endpoint
    - Verify webhook signature, return 401 if invalid
    - Call mux.service processWebhookEvent
    - Return 200 even if processing fails (prevent Mux retries)
    - _Requirements: 16.1-16.7, 28.3, 28.6_

- [x] 12. API Routes - Search endpoint
  - [x] 12.1 Create GET /api/library/search endpoint
    - Parse query parameters: q, page, pageSize
    - Call video.service searchVideos
    - Return videos array with pagination metadata
    - _Requirements: 20.1-20.7, 30.1-30.7_

- [x] 13. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify RLS policies enforce authorization
  - Test Mux integration (upload, webhook, playback)
  - Ask the user if questions arise

- [x] 14. Frontend - shadcn/ui setup
  - [x] 14.1 Install components
    - Run `npx shadcn-ui@latest add table card dialog badge input button form select skeleton tabs alert dropdown-menu`
    - _Requirements: None (infrastructure)_

- [x] 15. Frontend - Technique and module components
  - [x] 15.1 Create TechniqueTree component
    - Client component with techniques list, create/edit/archive actions
    - Use Card for items, drag-drop reordering, status badges
    - _Requirements: 2.1, 2.2, 4.1, 5.1_

  - [x] 15.2 Create ModuleList component
    - Client component with modules list, CRUD actions
    - Display video count, drag-drop reordering
    - _Requirements: 8.1, 8.2, 10.1, 11.1_

  - [x] 15.3 Create TechniqueForm and ModuleForm components
    - Use shadcn/ui Form with Zod validation
    - Fields: name (required), description (optional, char counter)
    - _Requirements: 1.1, 3.1, 7.1, 9.1_

- [x] 16. Frontend - Video components
  - [x] 16.1 Create VideoList component
    - Card grid with thumbnails, status indicators, action menu
    - Status badges: uploading/processing/ready/error/archived
    - _Requirements: 17.1, 17.2, 21.1-21.4_

  - [x] 16.2 Create VideoUploader component
    - Drag-drop file selection, progress bar
    - Three-step: get upload URL Ã¢â€ â€™ upload to Mux Ã¢â€ â€™ create record
    - Title/description form fields
    - _Requirements: 13.1-13.3, 14.1_

  - [x] 16.3 Create VideoPlayer component
    - Fetch playback URL, integrate @mux/mux-player-react
    - Full-screen support, loading/error states
    - _Requirements: 18.1-18.3_

  - [x] 16.4 Create VideoForm component
    - Edit title and description only
    - _Requirements: 15.1, 15.2_

- [x] 17. Frontend - Search component
  - [x] 17.1 Create LibrarySearch component
    - Search input with debounce, result list with hierarchy breadcrumb
    - Pagination controls
    - _Requirements: 20.1-20.3, 30.1_

- [x] 18. Frontend - Custom hooks
  - [x] 18.1 Create useLibrary hook
    - State: techniques, loading, error
    - Functions: createTechnique, updateTechnique, reorderTechniques, archiveTechnique, unarchiveTechnique, refresh
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 18.2 Create useModules hook
    - State: modules, loading, error
    - Functions: createModule, updateModule, moveModule, reorderModules, archiveModule, refresh
    - _Requirements: 7.1, 8.1, 9.1, 10.1, 11.1, 12.1_

  - [x] 18.3 Create useVideos hook
    - State: videos, loading, error, upload progress
    - Functions: uploadVideo (multi-step), updateVideo, getPlaybackUrl, archiveVideo, deleteVideo, refresh
    - _Requirements: 13.1, 14.1, 15.1, 17.1, 18.1, 19.1, 23.1_

  - [x] 18.4 Create useVideoSearch hook
    - State: results, loading, error, pagination
    - Functions: search (debounced), goToPage
    - _Requirements: 20.1, 30.1_

- [x] 19. Frontend - Pages
  - [x] 19.1 Create library main page
    - Server component at `app/(teacher)/library/page.tsx`
    - Render TechniqueTree with "Add Technique" dialog
    - _Requirements: 1.1, 2.1_

  - [x] 19.2 Create technique detail page
    - Server component at `app/(teacher)/library/techniques/[id]/page.tsx`
    - Show technique info and ModuleList
    - _Requirements: 7.1, 8.1_

  - [x] 19.3 Create module detail page
    - Server component at `app/(teacher)/library/modules/[id]/page.tsx`
    - Show module info and VideoList with upload button
    - _Requirements: 14.1, 17.1_

  - [x] 19.4 Create search page
    - Client component at `app/(teacher)/library/search/page.tsx`
    - Render LibrarySearch with video player modal
    - _Requirements: 20.1, 20.2_

- [x] 20. Frontend - API client functions
  - [x] 20.1 Create library API client
    - File: `lib/api/library.ts`
    - Functions for all technique and module operations
    - _Requirements: All technique and module operations_

  - [x] 20.2 Create video API client
    - File: `lib/api/videos.ts`
    - Functions for all video operations including Mux integration
    - _Requirements: All video operations_

- [x] 21. Property-based tests (59 properties total)
  - [x]* 21.1 Technique properties (Properties 1-5)
    - Valid creation, name validation, isolation, filtering, sort order
    - _Requirements: 1.1-2.7_

  - [x]* 21.2 Technique operations (Properties 8-17)
    - Timestamp updates, status immutability, reorder atomicity, archive cascade, unarchive validation
    - _Requirements: 3.1-6.7_

  - [x]* 21.3 Module properties (Properties 18-26)
    - Creation ownership, list verification, archive cascade, move operations
    - _Requirements: 7.1-12.7_

  - [x]* 21.4 Video properties (Properties 27-48)
    - Upload, creation, validation, playback, search, reusability, deletion checks
    - _Requirements: 13.1-23.7_

  - [x]* 21.5 System properties (Properties 49-59)
    - RLS enforcement, timestamps, pagination, error handling
    - _Requirements: 24.1-30.7_

- [x] 22. Integration tests
  - [x]* 22.1 Hierarchy creation test
    - Create technique Ã¢â€ â€™ module Ã¢â€ â€™ video Ã¢â€ â€™ verify relationships
  
  - [x]* 22.2 Archive cascade test
    - Create full hierarchy, archive technique, verify all archived
  
  - [x]* 22.3 Video upload flow test
    - Request upload URL Ã¢â€ â€™ upload to Mux Ã¢â€ â€™ create record Ã¢â€ â€™ webhook Ã¢â€ â€™ playback URL
  
  - [x]* 22.4 Module move test
    - Move module between techniques, verify videos moved
  
  - [x]* 22.5 Search and pagination test
    - Create videos, search, verify results and pagination
  
  - [x]* 22.6 Video reusability test
    - Associate video with lessons/plans, try deleting, verify blocked

- [x] 23. Unit tests for edge cases
  - [x]* 23.1 Validation boundaries
    - Name lengths, description limits, sort_order values
  
  - [x]* 23.2 Empty results
    - Empty lists, no matches, out-of-range pagination
  
  - [x]* 23.3 Status filtering
    - Active vs archived, include_archived parameter
  
  - [x]* 23.4 Webhook edge cases
    - Unknown video, invalid signature, missing fields, idempotency

- [x] 24. RLS policy verification tests
  - [x]* 24.1 Technique RLS test
    - Two teachers, verify zero rows for other teacher's queries
  
  - [x]* 24.2 Module RLS test
    - Verify module access blocked for different teacher
  
  - [x]* 24.3 Video RLS test
    - Verify video access blocked for different teacher
  
  - [x]* 24.4 Update/delete restrictions test
    - Attempt UPDATE/DELETE on other teacher's data, verify blocked

- [x] 25. Final checkpoint
  - Run full test suite (unit + property + integration + RLS)
  - Verify all 59 correctness properties pass
  - Verify test coverage Ã¢â€°Â¥ 80%
  - Test complete flows in browser
  - Test Mux webhook integration
  - Verify RLS blocks unauthorized access
  - Ask the user if questions arise

- [x] 26. Documentation
  - [x] 26.1 Add JSDoc comments to service functions
  - [x] 26.2 Document database migrations
  - [x] 26.3 Create API documentation with examples
  - [x] 26.4 Document Mux integration flow

## Notes

- Tasks marked with `*` are optional testing tasks (can be skipped for faster MVP)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use fast-check with minimum 100 iterations per property
- All 59 correctness properties must pass for complete validation
- Video upload is three-step: get upload URL Ã¢â€ â€™ upload to Mux Ã¢â€ â€™ create metadata
- Webhook processing must return 200 even on errors (prevent Mux retries)
- Archive cascades down but unarchive does NOT cascade up
- Status field NOT modifiable through update endpoints
- All timestamps stored in UTC
- Search is case-insensitive partial match
- Default lists exclude archived unless explicitly requested
- Pagination: default 20 items, max 100
- Playback URLs expire after 24 hours
- Videos reusable across lessons/plans without duplication
- Deletion only allowed for videos without lesson/plan references
