import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDatabase, DEMO_IDS } from "@/lib/db/seed";
import { getDb, mutate, resetDb } from "@/lib/db/store";
import { listUserVideos } from "@/lib/services/video-storage.service";
import { buildPlaybackUrl } from "@/lib/services/playback-token.service";

beforeEach(() => {
  resetDb(createDemoDatabase());
});

describe("performance — Google Drive Video Storage", () => {
  it("lista 1000 vídeos em menos de 1s", async () => {
    mutate((db) => {
      for (let index = 0; index < 1000; index += 1) {
        db.videos.push({
          id: `perf-${index}`,
          teacher_id: DEMO_IDS.teacher,
          module_id: DEMO_IDS.moduleGuardFundamentals,
          technique_id: DEMO_IDS.guardPass,
          title: `Vídeo ${index}`,
          description: null,
          provider: "google_drive",
          provider_video_id: `drive-${index}`,
          thumbnail_url: null,
          playback_url: null,
          duration_seconds: 60,
          status: "ready",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          owner_id: DEMO_IDS.teacher,
          owner_role: "teacher",
          visibility: "library",
        });
      }
    });

    const started = performance.now();
    const result = await listUserVideos(DEMO_IDS.teacher, "teacher", {
      limit: 1000,
      offset: 0,
    });
    const elapsed = performance.now() - started;

    expect(result.videos.length).toBeGreaterThanOrEqual(1000);
    expect(elapsed).toBeLessThan(1000);
  });

  it("gera URL de reprodução assinada em menos de 200ms", () => {
    const started = performance.now();
    const result = buildPlaybackUrl({
      videoId: "perf-video",
      userId: "perf-user",
      provider: "google_drive",
      driveFileId: "perf-drive-file",
      expiresIn: 3600,
    });
    const elapsed = performance.now() - started;

    expect(result.playback_url).toContain("/api/google-drive/embed/");
    expect(elapsed).toBeLessThan(200);
    expect(getDb()).toBeTruthy();
  });
});
