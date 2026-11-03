import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { OutboxDialog } from "@/components/auth/outbox-dialog";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div>
      <LoginForm redirectTo={params.next} googleError={params.error} />
      <OutboxDialog />
    </div>
  );
}
