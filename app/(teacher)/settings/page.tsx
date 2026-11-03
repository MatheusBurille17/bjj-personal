import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session";
import { getProfileView } from "@/lib/services/profile.service";
import { PageHeader } from "@/components/common/layout-pieces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { ProfileForm } from "@/components/auth/profile-form";
import { AvatarUpload } from "@/components/auth/avatar-upload";
import { GoogleAccountSection } from "@/components/account/google-account-section";
import { GoogleDriveStatus } from "@/components/google-drive/google-drive-status";
import { getGoogleOAuthStatus } from "@/lib/services/google-auth.service";
import { getDriveConnectionStatus } from "@/lib/services/google-drive-token.service";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; error?: string; drive?: string; drive_error?: string }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const data = await getProfileView(session.user.id);
  const googleStatus = getGoogleOAuthStatus(session.user.id);
  const driveStatus = await getDriveConnectionStatus(session.user.id);

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Atualize seus dados, identidade no portal e preferências de fuso horário."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Perfil do professor</CardTitle>
            <p className="text-sm text-muted-foreground">
              Estas informações aparecem para os alunos vinculados a você.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <AvatarUpload name={data.profile.full_name} currentUrl={data.profile.avatar_url} />
            <ProfileForm data={data} teacherMode />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">E-mail:</span> {data.profile.email}
              </p>
              <p>
                <span className="text-muted-foreground">Perfil:</span>{" "}
                {data.roles.is_teacher ? "Professor" : "Aluno"}
                {data.roles.is_student ? " e aluno" : ""}
              </p>
              <p>
                <span className="text-muted-foreground">Criado em:</span>{" "}
                {new Date(data.profile.created_at).toLocaleDateString("pt-BR")}
              </p>
              <Link href="/recover" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                Alterar senha
              </Link>
            </CardContent>
          </Card>

          {params.google === "connected" ? (
            <Alert variant="success">
              <p className="font-medium">Conta Google conectada</p>
              <p className="mt-1 text-xs">
                O acesso ao Google Drive está ativo para armazenamento de vídeos.
              </p>
            </Alert>
          ) : null}

          <GoogleAccountSection
            {...googleStatus}
            redirectPath="/settings"
            initialError={params.error ?? null}
          />

          {params.drive === "connected" ? (
            <Alert variant="success">
              <p className="font-medium">Google Drive conectado</p>
              <p className="mt-1 text-xs">
                A estrutura de pastas foi criada e os vídeos já podem ser enviados.
              </p>
            </Alert>
          ) : null}
          {params.drive_error ? (
            <Alert variant="destructive">
              <p className="font-medium">Não foi possível conectar o Google Drive</p>
              <p className="mt-1 text-xs">{params.drive_error}</p>
            </Alert>
          ) : null}

          <GoogleDriveStatus
            redirectPath="/settings"
            initialStatus={driveStatus}
            readOnly
          />

          <Alert>
            <p className="font-medium">Ambiente de demonstração</p>
            <p className="mt-1 text-xs">
              Os dados são persistidos localmente em <code>.data/db.json</code>. Em produção, o
              Supabase Auth e as políticas RLS assumem esta responsabilidade.
            </p>
          </Alert>
        </div>
      </div>
    </div>
  );
}
