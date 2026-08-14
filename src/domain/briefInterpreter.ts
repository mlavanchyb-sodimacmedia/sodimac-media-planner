export function interpretBrief(
  brief: string,
) {

  const normalized =
    brief.toLowerCase();

  const findings: string[] = [];

  if (
    normalized.includes("cyber")
  ) {
    findings.push(
      "Evento comercial",
    );
  }

  if (
    normalized.includes("ventas")
  ) {
    findings.push(
      "Conversión",
    );
  }

  if (
    normalized.includes("tráfico")
  ) {
    findings.push(
      "Consideración",
    );
  }

  if (
    normalized.includes("lanzamiento")
  ) {
    findings.push(
      "Awareness",
    );
  }

  return findings;
}