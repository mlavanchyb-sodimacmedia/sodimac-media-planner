import type { Benefit } from "./benefits";
import type {
  ForecastResult,
} from "./forecast";
import type { Scenario } from "./scenarios";

export interface ProposalEmailInput {
  brand: string;
  family: string;
  event: string;
  focus: string;
  objective: string;
  budget: number;
  brief: string;

  formats: Array<{
    displayName: string;
    budget: number;
  }>;

  forecast: ForecastResult;
  scenarios: Scenario[];
  benefits: Benefit[];
}

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const number = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(value);

export function buildProposalEmail({
  brand,
  family,
  event,
  focus,
  objective,
  budget,
  brief,
  formats,
  forecast,
  scenarios,
  benefits,
}: ProposalEmailInput): string {
  const mixText = formats
    .map(
      (format) =>
        `• ${format.displayName}: ${money(
          format.budget,
        )}`,
    )
    .join("\n");

  const scenarioText = scenarios
    .map(
      (scenario) =>
        `• ${scenario.name}: ${money(
          scenario.budget,
        )}`,
    )
    .join("\n");

  const benefitText =
    benefits.length > 0
      ? benefits
          .map(
            (benefit) =>
              `• ${benefit.title}: ${money(
                benefit.value,
              )}`,
          )
          .join("\n")
      : "• No existe un beneficio aplicable para este presupuesto.";

  return `Asunto: Propuesta Sodimac Media | ${brand} | ${event}

Hola,

Te comparto la propuesta recomendada de Sodimac Media para ${brand}.

Brief:
${brief || `Campaña ${event} con foco ${focus}.`}

Familia:
${family}

Objetivo:
${objective}

Inversión:
${money(budget)}

Mix recomendado:
${mixText}

Resultados esperados referenciales:
• Alcance: ${number(forecast.reach)}
• Impresiones: ${number(forecast.impressions)}
• Clicks: ${number(forecast.clicks)}
• CTR: ${forecast.ctr}%
• Ventas estimadas: ${money(forecast.sales)}
• ROAS estimado: ${forecast.roas}x

Beneficio Sodimac Media:
${benefitText}

Escenarios de crecimiento:
${scenarioText}

La propuesta incorpora un formato CRM real y mantiene los presupuestos de Google y Meta agrupados para que la agencia realice la optimización táctica.

Las métricas presentadas son estimaciones referenciales basadas en históricos comparables. Sodimac Media no garantiza ni se compromete a obtener los resultados proyectados.

Saludos,
Sodimac Media`;
}