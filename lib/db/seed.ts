import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { DEMO_CREDENTIALS, DEMO_PASSWORD } from "@/lib/demo";
import type { Database } from "./schema";
import { emptyDatabase } from "./schema";

/** IDs determinísticos para o ambiente de demonstração. */
export const DEMO_IDS = {
  teacherProfile: "11111111-1111-4111-8111-111111111111",
  teacher: "11111111-1111-4111-8111-111111111111",
  lucas: "22222222-2222-4222-8222-222222222222",
  mariana: "33333333-3333-4333-8333-333333333333",
  lucasEnrollment: "aaaaaaa1-1111-4111-8111-111111111111",
  marianaEnrollment: "aaaaaaa2-2222-4222-8222-222222222222",
  pedroEnrollment: "aaaaaaa3-3333-4333-8333-333333333333",
  archivedEnrollment: "aaaaaaa4-4444-4444-8444-444444444444",
  guardPass: "bbbbbbb1-1111-4111-8111-111111111111",
  submissions: "bbbbbbb2-2222-4222-8222-222222222222",
  closedGuard: "bbbbbbb3-3333-4333-8333-333333333333",
  moduleGuardFundamentals: "ccccccc1-1111-4111-8111-111111111111",
  moduleGuardExecution: "ccccccc2-2222-4222-8222-222222222222",
  moduleGuardErrors: "ccccccc3-3333-4333-8333-333333333333",
  moduleArmlock: "ccccccc4-4444-4444-8444-444444444444",
  moduleTriangle: "ccccccc5-5555-4555-8555-555555555555",
  moduleClosedFundamentals: "ccccccc6-6666-4666-8666-666666666666",
  moduleClosedSweeps: "ccccccc7-7777-4777-8777-777777777777",
  planOctober: "ddddddd1-1111-4111-8111-111111111111",
  planNovember: "ddddddd2-2222-4222-8222-222222222222",
  planArchived: "ddddddd3-3333-4333-8333-333333333333",
} as const;

const DEMO_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4";

function isoDate(date: Date): string {
  return date.toISOString();
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function at(dayOffset: number, hour: number, minute = 0): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  );
}

function monthStart(offset = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function monthEnd(offset = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
}

/**
 * Cria a base de demonstração utilizada quando o arquivo local ainda não existe.
 * Permite explorar todos os módulos sem configurar serviços externos.
 */
export function createDemoDatabase(): Database {
  const db = emptyDatabase();
  const createdAt = isoDate(at(-60, 9));
  const passwordHash = hashPassword(DEMO_PASSWORD);

  db.users = [
    {
      id: DEMO_IDS.teacher,
      email: "professor@bjj.app",
      password_hash: passwordHash,
      email_confirmed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.lucas,
      email: "aluno@bjj.app",
      password_hash: passwordHash,
      email_confirmed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.mariana,
      email: "mariana@bjj.app",
      password_hash: passwordHash,
      email_confirmed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  db.profiles = [
    {
      id: DEMO_IDS.teacher,
      full_name: "Rafael Mendes",
      email: "professor@bjj.app",
      avatar_url: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.lucas,
      full_name: "Lucas Almeida",
      email: "aluno@bjj.app",
      avatar_url: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.mariana,
      full_name: "Mariana Costa",
      email: "mariana@bjj.app",
      avatar_url: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  db.teachers = [
    {
      id: DEMO_IDS.teacher,
      display_name: "Prof. Rafael",
      timezone: "America/Sao_Paulo",
      bio: "Faixa-preta de Jiu-Jitsu, especialista em fundamentos e passagem de guarda.",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  db.enrollments = [
    {
      id: DEMO_IDS.lucasEnrollment,
      teacher_id: DEMO_IDS.teacher,
      student_profile_id: DEMO_IDS.lucas,
      student_name: "Lucas Almeida",
      student_email: "aluno@bjj.app",
      student_phone: "(11) 98765-4321",
      status: "active",
      started_at: isoDate(at(-60, 9)),
      archived_at: null,
      private_notes:
        "Evoluindo bem na passagem de guarda. Reforçar base e postura nas próximas aulas.",
      invite_token: null,
      invite_expires_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.marianaEnrollment,
      teacher_id: DEMO_IDS.teacher,
      student_profile_id: DEMO_IDS.mariana,
      student_name: "Mariana Costa",
      student_email: "mariana@bjj.app",
      student_phone: "(11) 91234-5678",
      status: "active",
      started_at: isoDate(at(-30, 9)),
      archived_at: null,
      private_notes: "Focar em raspagens da guarda fechada.",
      invite_token: null,
      invite_expires_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.pedroEnrollment,
      teacher_id: DEMO_IDS.teacher,
      student_profile_id: null,
      student_name: "Pedro Santos",
      student_email: "pedro@bjj.app",
      student_phone: "(11) 95555-1234",
      status: "pending",
      started_at: isoDate(at(-3, 9)),
      archived_at: null,
      private_notes: "Aguardando aceite do convite.",
      invite_token: "demo-invite-pedro-1234567890abcdef",
      invite_expires_at: isoDate(at(4, 9)),
      created_at: isoDate(at(-3, 9)),
      updated_at: isoDate(at(-3, 9)),
    },
    {
      id: DEMO_IDS.archivedEnrollment,
      teacher_id: DEMO_IDS.teacher,
      student_profile_id: null,
      student_name: "João Pereira",
      student_email: "joao@bjj.app",
      student_phone: null,
      status: "archived",
      started_at: isoDate(at(-200, 9)),
      archived_at: isoDate(at(-40, 9)),
      private_notes: "Mudou de cidade.",
      invite_token: null,
      invite_expires_at: null,
      created_at: isoDate(at(-200, 9)),
      updated_at: isoDate(at(-40, 9)),
    },
  ];

  db.techniques = [
    {
      id: DEMO_IDS.guardPass,
      teacher_id: DEMO_IDS.teacher,
      name: "Passagem de Guarda",
      description: "Fundamentos, entradas, execução e estabilização da passagem.",
      category: "Passagem",
      sort_order: 1,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.submissions,
      teacher_id: DEMO_IDS.teacher,
      name: "Finalizações",
      description: "Chaves e estrangulamentos a partir das posições principais.",
      category: "Finalização",
      sort_order: 2,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.closedGuard,
      teacher_id: DEMO_IDS.teacher,
      name: "Guarda Fechada",
      description: "Controle, raspagens e finalizações da guarda fechada.",
      category: "Guarda",
      sort_order: 3,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  db.modules = [
    {
      id: DEMO_IDS.moduleGuardFundamentals,
      technique_id: DEMO_IDS.guardPass,
      teacher_id: DEMO_IDS.teacher,
      name: "Fundamentos",
      description: "Base, postura e conceitos essenciais.",
      sort_order: 1,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleGuardExecution,
      technique_id: DEMO_IDS.guardPass,
      teacher_id: DEMO_IDS.teacher,
      name: "Execução",
      description: "A passagem passo a passo.",
      sort_order: 2,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleGuardErrors,
      technique_id: DEMO_IDS.guardPass,
      teacher_id: DEMO_IDS.teacher,
      name: "Erros Comuns",
      description: "O que evitar durante a passagem.",
      sort_order: 3,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleArmlock,
      technique_id: DEMO_IDS.submissions,
      teacher_id: DEMO_IDS.teacher,
      name: "Armlock",
      description: "Finalização de braço da guarda e de cima.",
      sort_order: 1,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleTriangle,
      technique_id: DEMO_IDS.submissions,
      teacher_id: DEMO_IDS.teacher,
      name: "Triângulo",
      description: "Estrangulamento triangular.",
      sort_order: 2,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleClosedFundamentals,
      technique_id: DEMO_IDS.closedGuard,
      teacher_id: DEMO_IDS.teacher,
      name: "Fundamentos",
      description: "Controle e quebra de postura.",
      sort_order: 1,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: DEMO_IDS.moduleClosedSweeps,
      technique_id: DEMO_IDS.closedGuard,
      teacher_id: DEMO_IDS.teacher,
      name: "Raspagens",
      description: "Raspagens mais utilizadas.",
      sort_order: 2,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  const videoSeeds: Array<{
    id: string;
    module_id: string;
    technique_id: string;
    title: string;
    description: string;
    status: "ready" | "processing" | "error";
    duration: number;
  }> = [
    {
      id: "eeeeeee1-1111-4111-8111-111111111111",
      module_id: DEMO_IDS.moduleGuardFundamentals,
      technique_id: DEMO_IDS.guardPass,
      title: "Base e postura na passagem",
      description: "Como manter base sólida antes de iniciar a passagem.",
      status: "ready",
      duration: 312,
    },
    {
      id: "eeeeeee2-2222-4222-8222-222222222222",
      module_id: DEMO_IDS.moduleGuardExecution,
      technique_id: DEMO_IDS.guardPass,
      title: "Passagem de guarda — execução completa",
      description: "Sequência completa com detalhes de pegada e pressão.",
      status: "ready",
      duration: 486,
    },
    {
      id: "eeeeeee3-3333-4333-8333-333333333333",
      module_id: DEMO_IDS.moduleGuardErrors,
      technique_id: DEMO_IDS.guardPass,
      title: "Erros comuns ao passar a guarda",
      description: "Os três erros que mais comprometem a passagem.",
      status: "ready",
      duration: 254,
    },
    {
      id: "eeeeeee4-4444-4444-8444-444444444444",
      module_id: DEMO_IDS.moduleArmlock,
      technique_id: DEMO_IDS.submissions,
      title: "Armlock da guarda fechada",
      description: "Ajuste do quadril e controle do braço.",
      status: "ready",
      duration: 371,
    },
    {
      id: "eeeeeee5-5555-4555-8555-555555555555",
      module_id: DEMO_IDS.moduleTriangle,
      technique_id: DEMO_IDS.submissions,
      title: "Triângulo — detalhes de encaixe",
      description: "Como fechar o triângulo sem perder o controle.",
      status: "processing",
      duration: null as unknown as number,
    },
    {
      id: "eeeeeee6-6666-4666-8666-666666666666",
      module_id: DEMO_IDS.moduleClosedFundamentals,
      technique_id: DEMO_IDS.closedGuard,
      title: "Quebra de postura na guarda fechada",
      description: "Pegadas e ângulos para quebrar a postura.",
      status: "ready",
      duration: 298,
    },
    {
      id: "eeeeeee7-7777-4777-8777-777777777777",
      module_id: DEMO_IDS.moduleClosedSweeps,
      technique_id: DEMO_IDS.closedGuard,
      title: "Raspagem de gancho",
      description: "Raspagem clássica com gancho e controle da manga.",
      status: "ready",
      duration: 342,
    },
    {
      id: "eeeeeee8-8888-4888-8888-888888888888",
      module_id: DEMO_IDS.moduleClosedSweeps,
      technique_id: DEMO_IDS.closedGuard,
      title: "Raspagem de tesoura",
      description: "Vídeo em processamento no provedor de mídia.",
      status: "error",
      duration: null as unknown as number,
    },
  ];

  db.videos = videoSeeds.map((video, index) => ({
    id: video.id,
    teacher_id: DEMO_IDS.teacher,
    module_id: video.module_id,
    technique_id: video.technique_id,
    title: video.title,
    description: video.description,
    provider: "demo",
    provider_video_id: `demo-${index + 1}`,
    thumbnail_url: null,
    playback_url: video.status === "ready" ? DEMO_VIDEO_URL : null,
    duration_seconds: video.duration ?? null,
    status: video.status,
    created_at: isoDate(at(-30 + index, 9)),
    updated_at: isoDate(at(-30 + index, 9)),
  }));

  db.student_technique_access = [
    {
      id: randomUUID(),
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.lucasEnrollment,
      technique_id: DEMO_IDS.guardPass,
      module_id: null,
      video_id: null,
      granted_at: isoDate(at(-20, 9)),
      revoked_at: null,
    },
    {
      id: randomUUID(),
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.lucasEnrollment,
      technique_id: DEMO_IDS.submissions,
      module_id: null,
      video_id: null,
      granted_at: isoDate(at(-10, 9)),
      revoked_at: null,
    },
    {
      id: randomUUID(),
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.marianaEnrollment,
      technique_id: DEMO_IDS.closedGuard,
      module_id: null,
      video_id: null,
      granted_at: isoDate(at(-15, 9)),
      revoked_at: null,
    },
  ];

  db.monthly_plans = [
    {
      id: DEMO_IDS.planOctober,
      teacher_id: DEMO_IDS.teacher,
      title: "Fundamentos do mês",
      description:
        "Plano com foco em passagem de guarda e manutenção de posição.",
      objective: "Consolidar base, pressão e finalizações básicas.",
      period_start: dateOnly(monthStart(0)),
      period_end: dateOnly(monthEnd(0)),
      status: "published",
      published_at: isoDate(at(-10, 10)),
      archived_at: null,
      created_at: isoDate(at(-20, 10)),
      updated_at: isoDate(at(-10, 10)),
    },
    {
      id: DEMO_IDS.planNovember,
      teacher_id: DEMO_IDS.teacher,
      title: "Finalizações do próximo mês",
      description: "Introdução às finalizações a partir da guarda fechada.",
      objective: "Desenvolver controle e timing nas finalizações.",
      period_start: dateOnly(monthStart(1)),
      period_end: dateOnly(monthEnd(1)),
      status: "draft",
      published_at: null,
      archived_at: null,
      created_at: isoDate(at(-5, 10)),
      updated_at: isoDate(at(-2, 10)),
    },
    {
      id: DEMO_IDS.planArchived,
      teacher_id: DEMO_IDS.teacher,
      title: "Fundamentos de agosto",
      description: "Plano arquivado para consulta histórica.",
      objective: "Revisão de conceitos básicos.",
      period_start: dateOnly(monthStart(-2)),
      period_end: dateOnly(monthEnd(-2)),
      status: "archived",
      published_at: isoDate(monthStart(-2)),
      archived_at: isoDate(at(-40, 9)),
      created_at: isoDate(monthStart(-3)),
      updated_at: isoDate(at(-40, 9)),
    },
  ];

  const planDays = [
    {
      id: "fffffff1-1111-4111-8111-111111111111",
      plan_id: DEMO_IDS.planOctober,
      weekday: 2,
      title: "Base e postura",
      objective: "Entender base, postura e distância na passagem.",
      notes: "Trabalhar deslocamento lateral e pressão constante.",
      order: 1,
      videoIds: ["eeeeeee1-1111-4111-8111-111111111111"],
    },
    {
      id: "fffffff2-2222-4222-8222-222222222222",
      plan_id: DEMO_IDS.planOctober,
      weekday: 4,
      title: "Passagem completa",
      objective: "Executar a passagem com controle e estabilização.",
      notes: "Revisar detalhes da pegada e da troca de base.",
      order: 2,
      videoIds: [
        "eeeeeee2-2222-4222-8222-222222222222",
        "eeeeeee3-3333-4333-8333-333333333333",
      ],
    },
    {
      id: "fffffff3-3333-4333-8333-333333333333",
      plan_id: DEMO_IDS.planOctober,
      weekday: 6,
      title: "Erros e correções",
      objective: "Identificar erros comuns e corrigir a execução.",
      notes: "Fazer rounds de posição com feedback.",
      order: 3,
      videoIds: ["eeeeeee3-3333-4333-8333-333333333333"],
    },
    {
      id: "fffffff4-4444-4444-8444-444444444444",
      plan_id: DEMO_IDS.planNovember,
      weekday: 2,
      title: "Armlock da guarda",
      objective: "Ajustar o quadril e controlar o braço.",
      notes: null,
      order: 1,
      videoIds: ["eeeeeee4-4444-4444-8444-444444444444"],
    },
    {
      id: "fffffff5-5555-4555-8555-555555555555",
      plan_id: DEMO_IDS.planNovember,
      weekday: 4,
      title: "Triângulo",
      objective: "Encaixar o triângulo com segurança.",
      notes: null,
      order: 2,
      videoIds: [],
    },
  ];

  db.plan_days = planDays.map((day) => ({
    id: day.id,
    monthly_plan_id: day.plan_id,
    teacher_id: DEMO_IDS.teacher,
    weekday: day.weekday,
    planned_date: null,
    title: day.title,
    objective: day.objective,
    notes: day.notes,
    sort_order: day.order,
    created_at: isoDate(at(-20, 10)),
    updated_at: isoDate(at(-20, 10)),
  }));

  db.plan_day_videos = planDays.flatMap((day) =>
    day.videoIds.map((videoId, index) => ({
      id: randomUUID(),
      plan_day_id: day.id,
      video_id: videoId,
      sort_order: index + 1,
      created_at: isoDate(at(-20, 10)),
    })),
  );

  db.plan_enrollments = [
    {
      id: randomUUID(),
      monthly_plan_id: DEMO_IDS.planOctober,
      enrollment_id: DEMO_IDS.lucasEnrollment,
      published_at: isoDate(at(-10, 10)),
    },
    {
      id: randomUUID(),
      monthly_plan_id: DEMO_IDS.planOctober,
      enrollment_id: DEMO_IDS.marianaEnrollment,
      published_at: isoDate(at(-10, 10)),
    },
  ];

  db.weekly_slots = [
    {
      id: "99999991-1111-4111-8111-111111111111",
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.lucasEnrollment,
      weekday: 2,
      start_time: "18:00:00",
      end_time: "19:00:00",
      valid_from: dateOnly(at(-60, 9)),
      valid_until: null,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: "99999992-2222-4222-8222-222222222222",
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.lucasEnrollment,
      weekday: 4,
      start_time: "18:00:00",
      end_time: "19:00:00",
      valid_from: dateOnly(at(-60, 9)),
      valid_until: null,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: "99999993-3333-4333-8333-333333333333",
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.marianaEnrollment,
      weekday: 1,
      start_time: "19:00:00",
      end_time: "20:00:00",
      valid_from: dateOnly(at(-30, 9)),
      valid_until: null,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: "99999994-4444-4444-8444-444444444444",
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: DEMO_IDS.marianaEnrollment,
      weekday: 3,
      start_time: "19:00:00",
      end_time: "20:00:00",
      valid_from: dateOnly(at(-30, 9)),
      valid_until: null,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  const lessonDefs = [
    {
      id: "88888881-1111-4111-8111-111111111111",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(-16, 18),
      status: "completed" as const,
      planDay: "fffffff1-1111-4111-8111-111111111111",
      title: "Base e postura",
      objective: "Entender base, postura e distância na passagem.",
      sharedNotes: "Excelente evolução na base. Manter a pressão lateral.",
      privateNotes: "Ainda abre a base ao tentar passar. Reforçar exercício 2.",
      videos: ["eeeeeee1-1111-4111-8111-111111111111"],
    },
    {
      id: "88888882-2222-4222-8222-222222222222",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(-9, 18),
      status: "completed" as const,
      planDay: "fffffff2-2222-4222-8222-222222222222",
      title: "Passagem completa",
      objective: "Executar a passagem com controle e estabilização.",
      sharedNotes: "Boa sequência. Foco em estabilizar antes de avançar.",
      privateNotes: "Melhorar o controle do quadril.",
      videos: [
        "eeeeeee2-2222-4222-8222-222222222222",
        "eeeeeee3-3333-4333-8333-333333333333",
      ],
    },
    {
      id: "88888883-3333-4333-8333-333333333333",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(-2, 18),
      status: "completed" as const,
      planDay: "fffffff3-3333-4333-8333-333333333333",
      title: "Erros e correções",
      objective: "Identificar erros comuns e corrigir a execução.",
      sharedNotes: "Corrigimos a pegada e a troca de base. Ótima aula!",
      privateNotes: "Próxima etapa: passagem de guarda de joelho.",
      videos: ["eeeeeee3-3333-4333-8333-333333333333"],
    },
    {
      id: "88888884-4444-4444-8444-444444444444",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(0, 18),
      status: "scheduled" as const,
      planDay: "fffffff1-1111-4111-8111-111111111111",
      title: "Base e postura",
      objective: "Entender base, postura e distância na passagem.",
      sharedNotes: null,
      privateNotes: "Revisar conteúdo da aula anterior.",
      videos: ["eeeeeee1-1111-4111-8111-111111111111"],
    },
    {
      id: "88888885-5555-4555-8555-555555555555",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(2, 18),
      status: "scheduled" as const,
      planDay: "fffffff2-2222-4222-8222-222222222222",
      title: "Passagem completa",
      objective: "Executar a passagem com controle e estabilização.",
      sharedNotes: null,
      privateNotes: null,
      videos: ["eeeeeee2-2222-4222-8222-222222222222"],
    },
    {
      id: "88888886-6666-4666-8666-666666666666",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(6, 18),
      status: "scheduled" as const,
      planDay: "fffffff3-3333-4333-8333-333333333333",
      title: "Erros e correções",
      objective: "Identificar erros comuns e corrigir a execução.",
      sharedNotes: null,
      privateNotes: null,
      videos: [],
    },
    {
      id: "88888887-7777-4777-8777-777777777777",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(-5, 18),
      status: "cancelled" as const,
      planDay: null,
      title: null,
      objective: null,
      sharedNotes: "Aula cancelada por imprevisto do aluno.",
      privateNotes: null,
      videos: [],
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      enrollment: DEMO_IDS.lucasEnrollment,
      start: at(-12, 18),
      status: "no_show" as const,
      planDay: null,
      title: null,
      objective: null,
      sharedNotes: null,
      privateNotes: "Aluno não compareceu e não avisou.",
      videos: [],
    },
    {
      id: "88888889-9999-4999-8999-999999999999",
      enrollment: DEMO_IDS.marianaEnrollment,
      start: at(-7, 19),
      status: "completed" as const,
      planDay: null,
      title: "Raspagens da guarda fechada",
      objective: "Praticar raspagem de gancho e tesoura.",
      sharedNotes: "Boa consistência nas raspagens.",
      privateNotes: "Evoluir o controle da manga.",
      videos: ["eeeeeee7-7777-4777-8777-777777777777"],
    },
    {
      id: "8888888a-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      enrollment: DEMO_IDS.marianaEnrollment,
      start: at(1, 19),
      status: "scheduled" as const,
      planDay: null,
      title: "Quebra de postura",
      objective: "Aperfeiçoar a quebra de postura.",
      sharedNotes: null,
      privateNotes: null,
      videos: ["eeeeeee6-6666-4666-8666-666666666666"],
    },
    {
      id: "8888888b-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      enrollment: DEMO_IDS.marianaEnrollment,
      start: at(3, 19),
      status: "scheduled" as const,
      planDay: null,
      title: "Raspagem de gancho",
      objective: "Refinar timing da raspagem.",
      sharedNotes: null,
      privateNotes: null,
      videos: [],
    },
  ];

  db.lessons = lessonDefs.map((lesson) => {
    const startsAt = isoDate(lesson.start);
    const endsAt = isoDate(new Date(lesson.start.getTime() + 60 * 60 * 1000));
    return {
      id: lesson.id,
      teacher_id: DEMO_IDS.teacher,
      enrollment_id: lesson.enrollment,
      plan_day_id: lesson.planDay,
      starts_at: startsAt,
      ends_at: endsAt,
      status: lesson.status,
      completed_at:
        lesson.status === "completed" ? isoDate(new Date(lesson.start.getTime() + 60 * 60 * 1000)) : null,
      shared_notes: lesson.sharedNotes,
      private_notes: lesson.privateNotes,
      title_snapshot: lesson.title,
      objective_snapshot: lesson.objective,
      rescheduled_from_id: null,
      created_at: startsAt,
      updated_at: startsAt,
    };
  });

  db.lesson_videos = lessonDefs.flatMap((lesson) =>
    lesson.videos.map((videoId, index) => ({
      id: randomUUID(),
      lesson_id: lesson.id,
      video_id: videoId,
      source: (lesson.planDay ? "plan" : "manual") as "plan" | "manual",
      sort_order: index + 1,
      created_at: isoDate(lesson.start),
    })),
  );

  db.password_resets = [];
  db.email_outbox = [];

  return db;
}

export { DEMO_CREDENTIALS, DEMO_PASSWORD, DEMO_VIDEO_URL, nowIso };

function nowIso(): string {
  return new Date().toISOString();
}
