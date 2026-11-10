const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** "editado agora", "editado há 5 minutos", "editado ontem", "editado em 3 de mar. de 2026". */
export function editadoHa(iso: string, agora: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "data desconhecida";
  const seg = Math.round((agora - t) / 1000);
  if (seg < 45) return "editado agora";
  const min = Math.round(seg / 60);
  if (min < 60) return `editado ${rtf.format(-min, "minute")}`;
  const h = Math.round(min / 60);
  if (h < 24) return `editado ${rtf.format(-h, "hour")}`;
  const d = Math.round(h / 24);
  if (d < 7) return `editado ${rtf.format(-d, "day")}`;
  return `editado em ${new Date(t).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
}
