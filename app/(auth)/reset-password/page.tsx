import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="surface p-6 text-center">
        <h2 className="text-lg font-semibold">Link inválido</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O link de recuperação está incompleto ou expirou.
        </p>
        <Link href="/recover" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
