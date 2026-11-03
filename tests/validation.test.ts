import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  isValidEmail,
  isValidImageSize,
  isValidImageType,
  isValidPassword,
  isValidPhoneNumber,
  isValidTime,
  isValidTimezone,
  MAX_AVATAR_BYTES,
} from "@/lib/utils/validation";
import {
  canTransitionStatus,
  validateStatusTransition,
} from "@/lib/validation/enrollment";
import type { EnrollmentStatus } from "@/types/enrollment";

const STATUSES: EnrollmentStatus[] = ["pending", "active", "paused", "archived"];

const VALID_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

describe("validação de autenticação e perfil", () => {
  it("aceita e-mails com formato válido", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => isValidEmail(email)),
      { numRuns: 100 },
    );
  });

  it("rejeita e-mails sem formato válido", () => {
    const invalid = ["", "sem-arroba", "@exemplo.com", "a@b", "a b@c.com", "a@b."];
    for (const value of invalid) expect(isValidEmail(value)).toBe(false);
  });

  it("exige pelo menos 8 caracteres na senha", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7 }), (length) =>
        !isValidPassword("x".repeat(length)),
      ),
      { numRuns: 20 },
    );
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 64 }), (length) =>
        isValidPassword("x".repeat(length)),
      ),
      { numRuns: 50 },
    );
  });

  it("valida fusos IANA", () => {
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Marte/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("valida tipos e limites de avatar", () => {
    expect(isValidImageType("image/jpeg")).toBe(true);
    expect(isValidImageType("image/webp")).toBe(true);
    expect(isValidImageType("application/pdf")).toBe(false);
    expect(isValidImageSize(MAX_AVATAR_BYTES)).toBe(true);
    expect(isValidImageSize(MAX_AVATAR_BYTES + 1)).toBe(false);
  });

  it("valida telefone brasileiro opcional", () => {
    expect(isValidPhoneNumber(null)).toBe(true);
    expect(isValidPhoneNumber("(11) 98765-4321")).toBe(true);
    expect(isValidPhoneNumber("1198765432")).toBe(true);
    expect(isValidPhoneNumber("123")).toBe(false);
    expect(isValidPhoneNumber("119876543210")).toBe(false);
  });

  it("valida horários HH:MM", () => {
    expect(isValidTime("18:00")).toBe(true);
    expect(isValidTime("18:00:00")).toBe(true);
    expect(isValidTime("25:00")).toBe(false);
    expect(isValidTime("18:75")).toBe(false);
  });
});

describe("transições de status do vínculo", () => {
  it("permite exatamente as transições documentadas", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const expected = VALID_TRANSITIONS[from].includes(to);
        expect(canTransitionStatus(from, to)).toBe(expected);
        const result = validateStatusTransition(from, to);
        expect(result.valid).toBe(expected);
        if (!result.valid) {
          expect(result.message).toContain(from);
          expect(result.message).toContain(to);
        }
      }
    }
  });

  it("arquivado é um estado terminal", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUSES),
        (target) => canTransitionStatus("archived", target) === false,
      ),
      { numRuns: 20 },
    );
  });
});

describe("regra de período do plano", () => {
  it("aceita períodos válidos e rejeita invertidos", async () => {
    const { createPlanSchema } = await import("@/lib/validation/plan");
    const base = {
      title: "Plano de teste",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
    };
    expect(createPlanSchema.safeParse(base).success).toBe(true);
    expect(
      createPlanSchema.safeParse({ ...base, period_end: "2026-09-30" }).success,
    ).toBe(false);
    expect(createPlanSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
});
