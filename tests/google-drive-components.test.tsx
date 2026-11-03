// @vitest-environment jsdom

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

const toastState = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const videoApi = vi.hoisted(() => ({
  beginDriveAuthorization: vi.fn(),
  disconnectDrive: vi.fn(),
  fetchDriveStatus: vi.fn(),
  requestPlayback: vi.fn(),
  fetchVideoAudit: vi.fn(),
  shareVideo: vi.fn(),
  uploadVideoWithProgress: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerState }));
vi.mock("sonner", () => ({ toast: toastState }));
vi.mock("@/lib/api/videos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/videos")>();
  return { ...actual, ...videoApi };
});

import { GoogleDriveConnectButton } from "@/components/google-drive/google-drive-connect-button";
import { GoogleDriveStatus } from "@/components/google-drive/google-drive-status";
import { VideoUploadProgress } from "@/components/video/video-upload-progress";
import { VideoUploadError } from "@/components/video/video-upload-error";
import { VideoUploadDialog } from "@/components/video/video-upload-dialog";
import { VideoPlayer } from "@/components/video/video-player";

beforeEach(() => {
  Object.values(videoApi).forEach((mock) => mock.mockReset());
  videoApi.fetchDriveStatus.mockResolvedValue({
    connected: false,
    userEmail: null,
    driveId: null,
    lastSync: null,
    expiresAt: null,
    scope: null,
    storage: null,
  });
  toastState.success.mockReset();
  toastState.error.mockReset();
  routerState.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GoogleDriveConnectButton", () => {
  it("inicia autorização e chama onRedirect", async () => {
    videoApi.beginDriveAuthorization.mockResolvedValue(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
    const onRedirect = vi.fn();
    render(
      <GoogleDriveConnectButton
        redirectPath="/settings"
        onRedirect={onRedirect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Conectar ao Google Drive/i }));
    await waitFor(() =>
      expect(videoApi.beginDriveAuthorization).toHaveBeenCalledWith("/settings"),
    );
    expect(onRedirect).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
  });

  it("mostra status conectado com e-mail", () => {
    render(
      <GoogleDriveConnectButton
        connected
        userEmail="prof@example.com"
        redirectPath="/settings"
      />,
    );
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.getByText("(prof@example.com)")).toBeInTheDocument();
  });
});

describe("GoogleDriveStatus", () => {
  it("exibe quota e desconecta após confirmação", async () => {
    videoApi.disconnectDrive.mockResolvedValue({ success: true });
    videoApi.fetchDriveStatus.mockResolvedValue({
      connected: false,
      userEmail: null,
      driveId: null,
      lastSync: null,
      expiresAt: null,
      scope: null,
      storage: null,
    });

    render(
      <GoogleDriveStatus
        redirectPath="/settings"
        initialStatus={{
          connected: true,
          userEmail: "prof@example.com",
          driveId: "drive-1",
          lastSync: "2026-11-03T10:00:00.000Z",
          expiresAt: "2026-11-03T11:00:00.000Z",
          scope: "drive.file",
          storage: { limit: 1000, usage: 250, usageInDrive: 200, usageInDriveTrash: 50 },
        }}
      />,
    );

    expect(screen.getByText(/prof@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/utilizados/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Desconectar Drive/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Desconectar" }));

    await waitFor(() => expect(videoApi.disconnectDrive).toHaveBeenCalled());
    await waitFor(() => expect(routerState.refresh).toHaveBeenCalled());
    expect(toastState.success).toHaveBeenCalled();
  });

  it("exibe botão de conexão quando desconectado", () => {
    render(
      <GoogleDriveStatus
        redirectPath="/portal/profile"
        initialStatus={{
          connected: false,
          userEmail: null,
          driveId: null,
          lastSync: null,
          expiresAt: null,
          scope: null,
          storage: null,
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Conectar ao Google Drive/i }),
    ).toBeInTheDocument();
  });
});

describe("VideoUploadProgress e VideoUploadError", () => {
  it("mostra percentual, bytes e tempo restante", () => {
    render(
      <VideoUploadProgress
        loaded={500}
        total={1000}
        percentage={50}
        startedAt={Date.now() - 1000}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText(/500 B de 1000 B/)).toBeInTheDocument();
    expect(screen.getByText(/restantes/)).toBeInTheDocument();
  });

  it("mapeia erro de quota e permite retry", () => {
    const onRetry = vi.fn();
    render(
      <VideoUploadError
        message="Falhou"
        code="quota_exceeded"
        onRetry={onRetry}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Espaço insuficiente no Google Drive/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("VideoUploadDialog", () => {
  it("valida, envia arquivo e chama onUploaded", async () => {
    videoApi.uploadVideoWithProgress.mockReturnValue({
      promise: Promise.resolve({ video_id: "v1" }),
      abort: vi.fn(),
    });
    const onUploaded = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <VideoUploadDialog
        open
        onOpenChange={onOpenChange}
        destination="library"
        modules={[
          {
            id: "m1",
            name: "Fundamentos",
            technique_id: "t1",
            technique_name: "Passagem",
          },
        ]}
        onUploaded={onUploaded}
      />,
    );

    const file = new File([new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])], "video.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(screen.getByLabelText(/Arraste um vídeo/i), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Módulo/), {
      target: { value: "m1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    await waitFor(() =>
      expect(videoApi.uploadVideoWithProgress).toHaveBeenCalled(),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejeita extensão não suportada antes do upload", () => {
    render(
      <VideoUploadDialog open onOpenChange={vi.fn()} destination="personal" />,
    );
    const invalid = new File([new Uint8Array([1])], "arquivo.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText(/Arraste um vídeo/i), {
      target: { files: [invalid] },
    });
    expect(screen.getByText(/Formato não suportado/i)).toBeInTheDocument();
    expect(videoApi.uploadVideoWithProgress).not.toHaveBeenCalled();
  });
});

describe("VideoPlayer", () => {
  it("renderiza iframe para Google Drive", async () => {
    videoApi.requestPlayback.mockResolvedValue({
      playback_url: "http://localhost:3000/api/google-drive/embed/token",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      expires_in: 3600,
      provider: "google_drive",
    });

    const { container } = render(
      <VideoPlayer videoId="v1" title="Vídeo" description="Descrição" />,
    );
    await waitFor(() =>
      expect(container.querySelector("iframe")).toBeTruthy(),
    );
    expect(screen.getByText("Vídeo")).toBeInTheDocument();
  });

  it("mostra erro e permite retry", async () => {
    videoApi.requestPlayback
      .mockRejectedValueOnce(new Error("Sem permissão"))
      .mockResolvedValueOnce({
        playback_url: "https://stream.mux.com/x.m3u8",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        expires_in: 3600,
        provider: "mux",
      });

    const { container } = render(<VideoPlayer videoId="v1" title="Vídeo" />);
    await waitFor(() => expect(screen.getByText(/Sem permissão/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    await waitFor(() => expect(container.querySelector("video")).toBeTruthy());
  });
});
