import type {
  ForecastResult,
} from "./forecast";

export interface ScenarioInput {
  budget: number;
  forecast: ForecastResult;
}

export interface Scenario {
  name: string;
  budget: number;
  description: string;
  estimatedSales: number;
  estimatedReach: number;
}

const roundToFiftyThousand = (
  value: number,
) => Math.round(value / 50_000) * 50_000;

export function buildScenarios({
  budget,
  forecast,
}: ScenarioInput): Scenario[] {
  if (budget <= 0) {
    return [];
  }

  const recommendedIncrease = Math.min(
    1_000_000,
    budget * 0.25,
  );

  const maximumIncrease = Math.min(
    2_000_000,
    budget * 0.4,
  );

  const recommendedBudget =
    budget +
    roundToFiftyThousand(
      recommendedIncrease,
    );

  const maximumBudget =
    budget +
    roundToFiftyThousand(
      maximumIncrease,
    );

  const salesRatio =
    forecast.sales / budget;

  const reachRatio =
    forecast.reach / budget;

  return [
    {
      name: "Opción actual",
      budget,
      description:
        "Mantiene la inversión y el mix recomendado.",
      estimatedSales: forecast.sales,
      estimatedReach: forecast.reach,
    },
    {
      name: "Opción recomendada",
      budget: recommendedBudget,
      description:
        "Amplía cobertura y frecuencia con un incremento comercial realista.",
      estimatedSales: Math.round(
        recommendedBudget * salesRatio,
      ),
      estimatedReach: Math.round(
        recommendedBudget * reachRatio,
      ),
    },
    {
      name: "Máximo potencial",
      budget: maximumBudget,
      description:
        "Maximiza el potencial sin superar un incremento cercano al 40%.",
      estimatedSales: Math.round(
        maximumBudget * salesRatio,
      ),
      estimatedReach: Math.round(
        maximumBudget * reachRatio,
      ),
    },
  ];
}