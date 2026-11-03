/** Templates de e-mail em HTML, em português brasileiro. */

function layout(title: string, content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f6f7f4;font-family:Arial,sans-serif;color:#1f2937">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px">
      <div style="background:#323a2a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <strong style="font-size:18px">Jiu-Jitsu App</strong>
      </div>
      <div style="background:#fff;padding:28px 24px;border-radius:0 0 12px 12px">
        <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
        ${content}
        <p style="margin-top:28px;font-size:12px;color:#6b7280">
          Este é um e-mail automático. Em caso de dúvidas, fale com seu professor.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export function invitationEmail(params: {
  teacherName: string;
  studentName: string;
  inviteUrl: string;
  expiresAt: string;
}): { subject: string; html: string } {
  const expiration = new Date(params.expiresAt).toLocaleDateString("pt-BR");
  return {
    subject: `${params.teacherName} convidou você para o Jiu-Jitsu App`,
    html: layout(
      "Você recebeu um convite!",
      `<p>Olá, ${params.studentName}!</p>
       <p><strong>${params.teacherName}</strong> criou um vínculo de acompanhamento com você na plataforma.</p>
       <p>Crie sua conta para acessar sua agenda, plano de treinamento e vídeos liberados.</p>
       <p style="margin:24px 0">
         <a href="${params.inviteUrl}" style="background:#5a6b43;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
           Aceitar convite
         </a>
       </p>
       <p style="font-size:13px;color:#6b7280">O link expira em ${expiration}.</p>`,
    ),
  };
}

export function passwordRecoveryEmail(params: {
  fullName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Recuperação de senha — Jiu-Jitsu App",
    html: layout(
      "Redefinir sua senha",
      `<p>Olá, ${params.fullName}!</p>
       <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
       <p style="margin:24px 0">
         <a href="${params.resetUrl}" style="background:#5a6b43;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
           Criar nova senha
         </a>
       </p>
       <p style="font-size:13px;color:#6b7280">O link expira em 1 hora. Se você não fez este pedido, ignore este e-mail.</p>`,
    ),
  };
}

export function notificationEmail(params: {
  title: string;
  message: string;
}): { subject: string; html: string } {
  return {
    subject: params.title,
    html: layout(params.title, `<p>${params.message}</p>`),
  };
}
