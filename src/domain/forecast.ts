import type { Line } from "./types";

import type {
  ForecastBaseline,
  ForecastBaselinesFile,
  ForecastConfidence,
} from "./forecastBaselines";

export interface ForecastResult {
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  sales: number;
  roas: number;

  confidence: ForecastConfidence;
  source: string;
  sampleSize: number;
  historicalLines: number;
  fallbackLines: number;
}

interface BuildForecastInput {
  family: string;
  plan: Line[];
  baselinesFile: ForecastBaselinesFile;
  configBenchmark?: {
    roas?: number;
    ctr?: number;
  };
}

const normalize = (value: string | null) =>
  (value ?? "").trim().toUpperCase();

const groupFromLine = (
  line: Line,
): string => {
  const displayName =
    line.displayName.toLowerCase();

  const layer =
    line.layer.toLowerCase();

  if (displayName === "google") {
    return "Google";
  }

  if (displayName === "meta") {
    return "Meta";
  }

  if (
    displayName.includes("sponsored")
  ) {
    return "Sponsored Products";
  }

  if (
    layer.includes("crm") ||
    layer.includes("mensaj")
  ) {
    return "CRM";
  }

  if (
    layer.includes("onsite") ||
    displayName.includes("banner") ||
    displayName.includes("home") ||
    displayName.includes("vitrina")
  ) {
    return "Retail Display";
  }

  return line.displayName;
};

const selectBaseline = (
  family: string,
  commercialGroup: string,
  baselines: ForecastBaseline[],
): ForecastBaseline | undefined => {
  const familyKey = normalize(family);
  const groupKey = normalize(
    commercialGroup
  );

  const familyGroup =
    baselines.find(
      (baseline) =>
        baseline.level ===
          "family_group" &&
        normalize(baseline.family) ===
          familyKey &&
        normalize(
          baseline.commercialGroup
        ) === groupKey &&
        baseline.sampleSize >= 5,
    );

  if (familyGroup) {
    return familyGroup;
  }

  const groupBaseline =
    baselines.find(
      (baseline) =>
        baseline.level === "group" &&
        normalize(
          baseline.commercialGroup
        ) === groupKey &&
        baseline.sampleSize >= 5,
    );

  if (groupBaseline) {
    return groupBaseline;
  }

  return baselines.find(
    (baseline) =>
      baseline.level === "global" &&
      baseline.sampleSize >= 5,
  );
};

const confidenceRank: Record<
  ForecastConfidence,
  number
> = {
  Alta: 3,
  Media: 2,
  Baja: 1,
  Referencial: 0,
};

const minimumConfidence = (
  values: ForecastConfidence[],
): ForecastConfidence => {
  if (values.length === 0) {
    return "Referencial";
  }

  return values.reduce(
    (lowest, current) =>
      confidenceRank[current] <
      confidenceRank[lowest]
        ? current
        : lowest,
    "Alta",
  );
};

export function buildForecast({
  family,
  plan,
  baselinesFile,
  configBenchmark,
}: BuildForecastInput): ForecastResult {
  let totalBudget = 0;
  let totalImpressions = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalSales = 0;

  let historicalLines = 0;
  let fallbackLines = 0;

  const confidences:
    ForecastConfidence[] = [];

  for (const line of plan) {
    const budget = line.budget;

    if (budget <= 0) {
      continue;
    }

    totalBudget += budget;

const group =
  groupFromLine(line);
    const defaultReachRate =
    
  group === "CRM"
    ? 1
    : 0.55;

    const baseline =
      selectBaseline(
        family,
        group,
        baselinesFile.baselines,
      );

    const historicalRoas =
      baseline?.salesForecastEnabled
        ? baseline.medianRoas
        : null;

    const roas =
      historicalRoas ??
      configBenchmark?.roas ??
      4;

    const ctr =
      baseline?.medianCtr ??
      configBenchmark?.ctr ??
      1.2;

    const cpm =
      baseline?.medianCpm;

    const reachRate =
      baseline?.medianReachRate;

    const impressions =
      cpm && cpm > 0
        ? (budget / cpm) * 1000
        : 0;

    const clicks =
      impressions > 0
        ? impressions *
          (ctr / 100)
        : 0;

    const reach =
  impressions > 0
    ? impressions *
      (
        reachRate ??
        0.55
      )
    : 0;

    const sales =
      budget * roas;

    totalImpressions += impressions;
    totalClicks += clicks;
    totalReach += reach;
    totalSales += sales;

    if (baseline) {
      historicalLines += 1;
      confidences.push(
        baseline.confidence,
      );
    } else {
      fallbackLines += 1;
      confidences.push(
        "Referencial",
      );
    }
  }

  const totalCtr =
    totalImpressions > 0
      ? (totalClicks /
          totalImpressions) *
        100
      : 0;

  const totalRoas =
    totalBudget > 0
      ? totalSales / totalBudget
      : 0;

  const selectedSamples =
    plan
      .map((line) =>
        selectBaseline(
          family,
          groupFromLine(line),
          baselinesFile.baselines,
        ),
      )
      .filter(
        (
          baseline,
        ): baseline is ForecastBaseline =>
          Boolean(baseline),
      )
      .reduce(
        (sum, baseline) =>
          sum + baseline.sampleSize,
        0,
      );

  return {
    reach: Math.round(totalReach),
    impressions: Math.round(
      totalImpressions
    ),
    clicks: Math.round(totalClicks),
    ctr: Number(
      totalCtr.toFixed(2)
    ),
    sales: Math.round(totalSales),
    roas: Number(
      totalRoas.toFixed(2)
    ),

    confidence:
      minimumConfidence(confidences),

    source:
      historicalLines > 0
        ? "Histórico real"
        : "Benchmark referencial",

    sampleSize: selectedSamples,
    historicalLines,
    fallbackLines,
  };
}