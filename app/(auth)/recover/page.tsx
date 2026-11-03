import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { OutboxDialog } from "@/components/auth/outbox-dialog";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <div>
      <PasswordRecoveryForm />
      <OutboxDialog />
    </div>
  );
}
