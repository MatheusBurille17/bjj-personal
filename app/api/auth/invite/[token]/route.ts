import { createStudentAccount, verifyInviteToken } from "@/lib/services/invitation.service";
import { inviteSignupSchema } from "@/lib/validation/auth";
import { jsonCreated, jsonSuccess, parseJson, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

export const GET = route<{ token: string }>(async (_request, context) => {
  const { token } = await context.params;
  const invite = await verifyInviteToken(token);
  return jsonSuccess({
    valid: true,
    teacher_name: invite.teacher_name,
    student_email: invite.student_email,
    student_name: invite.student_name,
    expires_at: invite.expires_at,
  });
});

export const POST = route<{ token: string }>(async (request, context) => {
  const { token } = await context.params;
  const body = await parseJson(request);
  const data = inviteSignupSchema.parse(body);
  const result = await createStudentAccount(token, data.password, data.fullName);
  return jsonCreated(result);
});
