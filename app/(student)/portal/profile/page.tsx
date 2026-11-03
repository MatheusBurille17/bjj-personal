import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getStudentProfile,
  getStudentStatistics,
  getStudentTeachers,
} from "@/lib/services/portal.service";
import { PageHeader, StatCard } from "@/components/common/layout-pieces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Avatar } from "@/components/ui/feedback";
import { ProfileForm } from "@/components/auth/profile-form";
import { AvatarUpload } from "@/components/auth/avatar-upload";
import { GoogleAccountSection } from "@/components/account/google-account-section";
import { GoogleDriveStatus } from "@/components/google-drive/google-drive-status";
import { PersonalVideosSection } from "@/components/video/personal-videos-section";
import { getGoogleOAuthStatus } from "@/lib/services/google-auth.service";
import { getDriveConnectionStatus } from "@/lib/services/google-drive-token.service";
import { CheckCircle2, Users } from "lucide-react";
import { formatDate } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; error?: string; drive?: string; drive_error?: string }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const profile = getStudentProfile(session.user.id);
  const teachers = getStudentTeachers(session.user.id);
  const stats = getStudentStatistics(session.user.id);
  const googleStatus = getGoogleOAuthStatus(session.user.id);
  const driveStatus = await getDriveConnectionStatus(session.user.id);

  return (
    <div>
      <PageHeader
        title="Meu perfil"
        description="Mantenha seus dados atualizados. Seu professor vê apenas as informações do vínculo."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Aulas realizadas"
          value={stats.total_completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="success"
        />
        <StatCard
          label="Professores"
          value={teachers.length}
          icon={<Users className="h-4 w-4" />}
          hint={
            stats.first_completed_at
              ? `Primeira aula em ${formatDate(stats.first_completed_at, "dd/MM/yyyy")}`
              : "Nenhuma aula concluída ainda"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AvatarUpload name={profile.profile.full_name} currentUrl={profile.profile.avatar_url} />
            <ProfileForm data={profile} teacherMode={false} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Meus professores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum vínculo ativo.</p>
              ) : (
                teachers.map((teacher) => (
                  <div key={teacher.enrollment_id} className="flex items-center gap-2 rounded-lg border p-3">
                    <Avatar src={teacher.avatar_url} name={teacher.display_name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{teacher.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {teacher.completed_lessons} aula(s) realizada(s)
                      </p>
                    </div>
                  </div>
                ))
              )}
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
            redirectPath="/portal/profile"
            initialError={params.error ?? null}
          />

          {params.drive === "connected" ? (
            <Alert variant="success">
              <p className="font-medium">Google Drive conectado</p>
              <p className="mt-1 text-xs">
                Sua pasta de vídeos pessoais está pronta para receber uploads.
              </p>
            </Alert>
          ) : null}
          {params.drive_error ? (
            <Alert variant="destructive">
              <p className="font-medium">Não foi possível conectar o Google Drive</p>
              <p className="mt-1 text-xs">{params.drive_error}</p>
            </Alert>
          ) : null}

          <GoogleDriveStatus redirectPath="/portal/profile" initialStatus={driveStatus} />

          {stats.by_teacher.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Progresso por professor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {stats.by_teacher.map((item) => (
                  <div key={item.enrollment_id} className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{item.teacher_name}</span>
                    <span className="font-medium">{item.completed} aula(s)</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <PersonalVideosSection
            driveConnected={driveStatus.connected}
            redirectPath="/portal/profile"
          />

          <Alert>
            <p className="font-medium">Privacidade</p>
            <p className="mt-1 text-xs">
              Observações privadas do professor, dados administrativos e informações de outros
              alunos nunca são exibidos aqui.
            </p>
          </Alert>
        </div>
      </div>
    </div>
  );
}
