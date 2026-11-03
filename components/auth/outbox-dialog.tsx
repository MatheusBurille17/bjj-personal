"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CopyButton } from "@/components/common/copy-button";

interface OutboxItem {
  id: string;
  to: string;
  subject: string;
  kind: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export function OutboxDialog() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<OutboxItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/dev/outbox")
      .then((response) => response.json())
      .then((payload) => setItems(payload.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-3 w-full text-xs"
        onClick={() => setOpen(true)}
      >
        <Inbox className="h-3.5 w-3.5" />
        Abrir caixa de saída de demonstração
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Caixa de saída de demonstração"
        description="E-mails de convite e recuperação gerados localmente. Em produção, seriam enviados pelo Resend."
        size="lg"
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum e-mail gerado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const link =
                typeof item.payload?.invite_url === "string"
                  ? item.payload.invite_url
                  : typeof item.payload?.reset_url === "string"
                    ? item.payload.reset_url
                    : null;
              return (
                <li key={item.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    Para {item.to} · {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                  {link ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-[11px]">
                        {link}
                      </code>
                      <CopyButton value={link} label="Copiar link" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
