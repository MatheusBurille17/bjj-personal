import type { Metadata } from "next";
import Link from "next/link";
import { InviteSignupForm } from "@/components/auth/invite-signup-form";
import { verifyInviteToken } from "@/lib/services/invitation.service";
import { ApiError } from "@/lib/middleware/errors";

export const metadata: Metadata = { title: "Convite de aluno" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const invite = verifyInviteToken(token);
    return (
      <InviteSignupForm
        token={token}
        studentEmail={invite.student_email}
        teacherName={invite.teacher_name}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Convite inválido ou expirado.";
    return (
      <div className="surface p-6 text-center">
        <h2 className="text-lg font-semibold">Não foi possível abrir o convite</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Peça ao seu professor para reenviar o convite.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }
}
