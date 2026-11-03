"use client";

import * as React from "react";
import { toast } from "sonner";
import { Clock3, Eye, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { fetchVideoAudit, shareVideo } from "@/lib/api/videos";

export interface VideoAccessProps {
  videoId: string;
  canShare?: boolean;
}

/** Histórico de acessos e compartilhamento nativo do Drive. */
export function VideoAccess({ videoId, canShare = false }: VideoAccessProps) {
  const [logs, setLogs] = React.useState<Array<Record<string, unknown>>>([]);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const result = await fetchVideoAudit(videoId);
      setLogs(result.logs ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar acessos");
    }
  }, [videoId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submitShare(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await shareVideo(videoId, email.trim());
      toast.success("Vídeo compartilhado no Google Drive");
      setEmail("");
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao compartilhar";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Acessos ao vídeo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {canShare ? (
          <form onSubmit={submitShare} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email.do.aluno@exemplo.com"
              aria-label="E-mail para compartilhar"
              required
            />
            <Button type="submit" loading={loading} className="shrink-0">
              <Share2 className="h-4 w-4" />
              Compartilhar
            </Button>
          </form>
        ) : null}

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum acesso registrado ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {logs.slice(0, 10).map((log, index) => {
              const user = String(
                (log.user as { full_name?: string } | undefined)?.full_name ??
                  log.user_id ??
                  "Usuário",
              );
              const accessedAt = String(log.accessed_at ?? "");
              return (
                <li key={String(log.id ?? index)} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{user}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    {accessedAt
                      ? new Date(accessedAt).toLocaleString("pt-BR")
                      : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
