export interface Benefit {
  code: string;
  title: string;
  value: number;
  description: string;
}

interface IncentiveRule extends Benefit {
  minimumBudget: number;
}

const incentiveRules: IncentiveRule[] = [
  {
    code: "BONUS_PUSH",
    title: "Push adicional",
    minimumBudget: 1_000_000,
    value: 150_000,
    description:
      "Comunicación Push adicional incluida como beneficio del plan.",
  },
  {
    code: "BONUS_EMAIL_MULTI",
    title: "Email Multimarca",
    minimumBudget: 3_000_000,
    value: 400_000,
    description:
      "Email Multimarca adicional para ampliar la cobertura de la campaña.",
  },
  {
    code: "BONUS_EMAIL_EXCLUSIVE",
    title: "Email Exclusivo",
    minimumBudget: 5_000_000,
    value: 1_500_000,
    description:
      "Email dedicado a la marca como beneficio del plan recomendado.",
  },
  {
    code: "BONUS_PREMIUM_REPORT",
    title: "Reporte Premium",
    minimumBudget: 7_000_000,
    value: 500_000,
    description:
      "Reporte avanzado con insights y recomendaciones de optimización.",
  },
  {
    code: "BONUS_LANDING",
    title: "Landing Bonificada",
    minimumBudget: 10_000_000,
    value: 950_000,
    description:
      "Landing bonificada para potenciar la experiencia y conversión.",
  },
];

export function buildBenefits(
  budget: number,
): Benefit[] {
  const eligible = incentiveRules
    .filter(
      (rule) =>
        budget >= rule.minimumBudget,
    )
    .sort(
      (first, second) =>
        second.minimumBudget -
        first.minimumBudget,
    );

  /*
   * Para el MVP se entrega un único
   * incentivo principal por propuesta.
   */
  const selected = eligible[0];

  if (!selected) {
    return [];
  }

  return [
    {
      code: selected.code,
      title: selected.title,
      value: selected.value,
      description: selected.description,
    },
  ];
}