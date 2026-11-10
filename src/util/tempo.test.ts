import { describe, expect, it } from "vitest";
import { editadoHa } from "./tempo";

const agora = Date.parse("2026-11-09T12:00:00Z");
const antes = (ms: number) => new Date(agora - ms).toISOString();

describe("editadoHa", () => {
  it("descreve o tempo em pt-BR", () => {
    expect(editadoHa(antes(10_000), agora)).toBe("editado agora");
    expect(editadoHa(antes(5 * 60_000), agora)).toBe("editado há 5 minutos");
    expect(editadoHa(antes(3 * 3600_000), agora)).toBe("editado há 3 horas");
    expect(editadoHa(antes(24 * 3600_000), agora)).toBe("editado ontem");
    expect(editadoHa("2026-03-03T12:00:00Z", agora)).toMatch(/^editado em 3 de mar/);
    expect(editadoHa("lixo", agora)).toBe("data desconhecida");
  });
});
