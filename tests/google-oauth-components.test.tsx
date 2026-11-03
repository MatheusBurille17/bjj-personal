// @vitest-environment jsdom

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const googleApi = vi.hoisted(() => ({
  beginGoogleAuthorization: vi.fn(),
  disconnectGoogleAccount: vi.fn(),
  googleErrorCodeFrom: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
}));

vi.mock("sonner", () => ({
  toast: toastState,
}));

vi.mock("@/lib/api/google-auth", () => ({
  beginGoogleAuthorization: googleApi.beginGoogleAuthorization,
  disconnectGoogleAccount: googleApi.disconnectGoogleAccount,
  googleErrorCodeFrom: googleApi.googleErrorCodeFrom,
  refreshGoogleToken: vi.fn(),
}));

import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { GoogleErrorAlert } from "@/components/auth/google-error-alert";
import { GoogleAccountStatus } from "@/components/account/google-account-status";
import { GoogleDisconnectDialog } from "@/components/account/google-disconnect-dialog";
import { GoogleAccountSection } from "@/components/account/google-account-section";

beforeEach(() => {
  googleApi.beginGoogleAuthorization.mockReset();
  googleApi.disconnectGoogleAccount.mockReset();
  googleApi.googleErrorCodeFrom.mockReset();
  toastState.success.mockReset();
  toastState.error.mockReset();
  routerState.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GoogleAuthButton", () => {
  it.each([
    ["login", "Continuar com Google"],
    ["signup", "Cadastrar com Google"],
    ["connect", "Conectar conta Google"],
  ] as const)("renderiza o texto do modo %s", (mode, label) => {
    render(<GoogleAuthButton mode={mode} />);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("mostra spinner, inicia a autorização e redireciona", async () => {
    let resolveUrl: (url: string) => void = () => {};
    googleApi.beginGoogleAuthorization.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveUrl = resolve;
      }),
    );

    const onRedirect = vi.fn();
    const onSuccess = vi.fn();
    render(
      <GoogleAuthButton
        mode="login"
        redirectPath="/dashboard"
        onRedirect={onRedirect}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
    expect(googleApi.beginGoogleAuthorization).toHaveBeenCalledWith({
      redirectPath: "/dashboard",
      connectMode: false,
    });

    await act(async () => {
      resolveUrl("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    });

    await waitFor(() =>
      expect(onRedirect).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      ),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("exibe erro amigável e chama onError quando a autorização falha", async () => {
    googleApi.beginGoogleAuthorization.mockRejectedValue(new Error("falhou"));
    googleApi.googleErrorCodeFrom.mockReturnValue("server_error");
    const onError = vi.fn();

    render(<GoogleAuthButton mode="login" onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/O Google encontrou um erro/i)).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("server_error");
    expect(toastState.error).toHaveBeenCalled();
  });
});

describe("GoogleErrorAlert", () => {
  it("mapeia códigos de erro, permite tentar novamente e dispensar", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <GoogleErrorAlert
        error="access_denied"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Você recusou a autorização do Google/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("não renderiza sem erro", () => {
    const { container } = render(<GoogleErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GoogleAccountStatus", () => {
  it("mostra perfil e botão de desconectar quando conectado", () => {
    const onDisconnectClick = vi.fn();
    render(
      <GoogleAccountStatus
        connected
        googleEmail="professor@gmail.com"
        googleName="Prof. Google"
        picture={null}
        lastTokenRefreshAt="2026-01-01T12:00:00.000Z"
        onConnectClick={vi.fn()}
        onDisconnectClick={onDisconnectClick}
      />,
    );

    expect(screen.getByText("Conectada")).toBeInTheDocument();
    expect(screen.getByText("Prof. Google")).toBeInTheDocument();
    expect(screen.getByText("professor@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/01\/01\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desconectar Google/i }));
    expect(onDisconnectClick).toHaveBeenCalled();
  });

  it("mostra botão de conectar quando desconectado", () => {
    const onConnectClick = vi.fn();
    render(
      <GoogleAccountStatus
        connected={false}
        onConnectClick={onConnectClick}
        onDisconnectClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Não conectada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conectar Google/i }));
    expect(onConnectClick).toHaveBeenCalled();
  });
});

describe("GoogleDisconnectDialog", () => {
  it("bloqueia confirmação por 2 segundos e chama onConfirm", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <GoogleDisconnectDialog
        open
        googleEmail="professor@gmail.com"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Aguarde 2s" });
    expect(confirmButton).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: "Aguarde 1s" })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const enabled = screen.getByRole("button", { name: "Desconectar" });
    expect(enabled).not.toBeDisabled();
    fireEvent.click(enabled);
    expect(onConfirm).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("não renderiza conteúdo quando fechado", () => {
    render(
      <GoogleDisconnectDialog
        open={false}
        googleEmail="a@b.com"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("GoogleAccountSection", () => {
  it("desconecta após confirmação e atualiza a interface", async () => {
    googleApi.disconnectGoogleAccount.mockResolvedValue({ success: true });

    render(
      <GoogleAccountSection
        connected
        googleEmail="professor@gmail.com"
        googleName="Prof. Google"
        picture={null}
        lastTokenRefreshAt={null}
        redirectPath="/settings"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Desconectar Google/i }));

    const confirm = await screen.findByRole("button", { name: "Aguarde 2s" });
    expect(confirm).toBeDisabled();

    const enabled = await screen.findByRole(
      "button",
      { name: "Desconectar" },
      { timeout: 3500 },
    );
    fireEvent.click(enabled);

    await waitFor(() => expect(googleApi.disconnectGoogleAccount).toHaveBeenCalled());
    await waitFor(() => expect(toastState.success).toHaveBeenCalled());
    expect(routerState.refresh).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Conectar Google/i })).toBeInTheDocument();
  });

  it("exibe erro ao falhar a desconexão", async () => {
    googleApi.disconnectGoogleAccount.mockRejectedValue(new Error("falhou"));
    googleApi.googleErrorCodeFrom.mockReturnValue("network_error");

    render(
      <GoogleAccountSection
        connected
        googleEmail="professor@gmail.com"
        googleName="Prof. Google"
        picture={null}
        lastTokenRefreshAt={null}
        redirectPath="/settings"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Desconectar Google/i }));
    const enabled = await screen.findByRole(
      "button",
      { name: "Desconectar" },
      { timeout: 3500 },
    );
    fireEvent.click(enabled);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Erro de conexão/i)).toBeInTheDocument();
    expect(toastState.error).toHaveBeenCalled();
  });
});
