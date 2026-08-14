import type {
  ForecastBaseline,
  ForecastBaselinesFile,
  ForecastConfidence,
} from "./forecastBaselines";
import type { Strategy } from "./types";

export interface IntelligentMixInput {
  family: string;
  objective: string;
  brief: string;
  baseWeights: Strategy;
  baselinesFile: ForecastBaselinesFile;
}

export interface PreferredGroup {
  group: string;
  score: number;
  sampleSize: number;
  medianRoas: number | null;
  confidence: ForecastConfidence;
}

export interface IntelligentMixResult {
  weights: Strategy;
  preferredGroups: PreferredGroup[];
  justification: string;
  historicalSampleSize: number;
  confidence: ForecastConfidence;
  signals: string[];
  source: "family_history" | "group_history" | "objective_only";
}

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const confidenceFactor: Record<ForecastConfidence, number> = {
  Alta: 1,
  Media: 0.8,
  Baja: 0.55,
  Referencial: 0.3,
};

const confidenceRank: Record<ForecastConfidence, number> = {
  Alta: 4,
  Media: 3,
  Baja: 2,
  Referencial: 1,
};

const groupStrategyLayer: Record<string, keyof Strategy> = {
  CRM: "consideration",
  Google: "performance",
  Meta: "awareness",
  "Retail Display": "awareness",
  "Sponsored Products": "performance",
};

const awarenessTerms = [
  "awareness",
  "conocimiento",
  "lanzamiento",
  "posicionamiento",
  "visibilidad",
  "branding",
  "recordacion",
  "alcance",
  "notoriedad",
  "nuevo producto",
];

const considerationTerms = [
  "consideracion",
  "trafico",
  "visitas",
  "interes",
  "comparacion",
  "contenido",
  "evaluacion",
];

const performanceTerms = [
  "venta",
  "ventas",
  "conversion",
  "convertir",
  "roas",
  "compra",
  "compras",
  "transaccion",
  "performance",
  "resultado",
  "ingreso",
];

const containsAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(normalizeText(term)));

const cloneStrategy = (strategy: Strategy): Strategy => ({
  awareness: strategy.awareness,
  consideration: strategy.consideration,
  performance: strategy.performance,
});

function normalizeWeights(weights: Strategy): Strategy {
  const awarenessValue = Math.max(0, weights.awareness);
  const considerationValue = Math.max(0, weights.consideration);
  const performanceValue = Math.max(0, weights.performance);
  const total = awarenessValue + considerationValue + performanceValue;

  if (total <= 0) {
    return { awareness: 10, consideration: 20, performance: 70 };
  }

  const awareness = Math.round((awarenessValue / total) * 100);
  const consideration = Math.round((considerationValue / total) * 100);

  return {
    awareness,
    consideration,
    performance: 100 - awareness - consideration,
  };
}

function selectBaselines(
  family: string,
  baselines: ForecastBaseline[],
): {
  baselines: ForecastBaseline[];
  source: IntelligentMixResult["source"];
} {
  const familyKey = normalizeText(family);
  const familyBaselines = baselines.filter(
    (baseline) =>
      baseline.level === "family_group" &&
      normalizeText(baseline.family) === familyKey &&
      baseline.sampleSize >= 5,
  );

  if (familyBaselines.length > 0) {
    return { baselines: familyBaselines, source: "family_history" };
  }

  const groupBaselines = baselines.filter(
    (baseline) => baseline.level === "group" && baseline.sampleSize >= 5,
  );

  if (groupBaselines.length > 0) {
    return { baselines: groupBaselines, source: "group_history" };
  }

  return { baselines: [], source: "objective_only" };
}

function baselineScore(baseline: ForecastBaseline) {
  const roas =
    baseline.salesForecastEnabled && baseline.medianRoas !== null
      ? Math.min(baseline.medianRoas, 15)
      : 0;
  const sampleFactor = Math.min(Math.log10(baseline.sampleSize + 1), 2.5);
  return roas * sampleFactor * confidenceFactor[baseline.confidence];
}

function rankGroups(baselines: ForecastBaseline[]): PreferredGroup[] {
  return baselines
    .filter((baseline) => baseline.commercialGroup !== null)
    .map((baseline) => ({
      group: baseline.commercialGroup as string,
      score: Number(baselineScore(baseline).toFixed(2)),
      sampleSize: baseline.sampleSize,
      medianRoas: baseline.medianRoas,
      confidence: baseline.confidence,
    }))
    .sort((first, second) => second.score - first.score);
}

function applyBriefSignals(weights: Strategy, brief: string) {
  const next = cloneStrategy(weights);
  const signals: string[] = [];
  const normalizedBrief = normalizeText(brief);

  if (containsAny(normalizedBrief, awarenessTerms)) {
    next.awareness += 15;
    signals.push("señales de awareness en el brief");
  }
  if (containsAny(normalizedBrief, considerationTerms)) {
    next.consideration += 15;
    signals.push("señales de consideración en el brief");
  }
  if (containsAny(normalizedBrief, performanceTerms)) {
    next.performance += 20;
    signals.push("señales de conversión en el brief");
  }

  return { weights: next, signals };
}

function applyHistoricalSignals(
  weights: Strategy,
  preferredGroups: PreferredGroup[],
) {
  const next = cloneStrategy(weights);
  const bonuses = [14, 9, 5];

  preferredGroups.slice(0, 3).forEach((group, index) => {
    const strategyLayer = groupStrategyLayer[group.group];
    if (strategyLayer) {
      next[strategyLayer] += bonuses[index] ?? 0;
    }
  });

  return next;
}

function determineConfidence(groups: PreferredGroup[]): ForecastConfidence {
  if (groups.length === 0) return "Referencial";

  return groups
    .map((group) => group.confidence)
    .reduce(
      (lowest, current) =>
        confidenceRank[current] < confidenceRank[lowest] ? current : lowest,
      "Alta",
    );
}

function buildJustification({
  objective,
  family,
  signals,
  preferredGroups,
  historicalSampleSize,
  source,
}: {
  objective: string;
  family: string;
  signals: string[];
  preferredGroups: PreferredGroup[];
  historicalSampleSize: number;
  source: IntelligentMixResult["source"];
}) {
  const objectiveSentence = `La recomendación parte del objetivo "${objective}".`;
  const signalsSentence =
    signals.length > 0
      ? ` Además, se identificaron ${signals.join(" y ")}.`
      : "";

  if (source === "objective_only" || preferredGroups.length === 0) {
    return (
      objectiveSentence +
      signalsSentence +
      " No existe una muestra histórica suficiente para esta familia, por lo que se mantienen los pesos estratégicos del objetivo y los benchmarks referenciales."
    );
  }

  const names = preferredGroups.slice(0, 3).map((group) => group.group);
  const groupSentence =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  const historyLevel =
    source === "family_history" ? `la familia ${family}` : "los grupos comerciales disponibles";

  return (
    objectiveSentence +
    signalsSentence +
    ` El histórico de ${historyLevel} proporciona mayor respaldo para ${groupSentence}.` +
    ` La recomendación considera ${historicalSampleSize} observaciones históricas asociadas a los baselines seleccionados.`
  );
}

export function recommendIntelligentMix({
  family,
  objective,
  brief,
  baseWeights,
  baselinesFile,
}: IntelligentMixInput): IntelligentMixResult {
  const selected = selectBaselines(family, baselinesFile.baselines);
  const preferredGroups = rankGroups(selected.baselines);
  const briefAdjustment = applyBriefSignals(baseWeights, brief);
  const historicallyAdjusted = applyHistoricalSignals(
    briefAdjustment.weights,
    preferredGroups,
  );
  const weights = normalizeWeights(historicallyAdjusted);
  const historicalSampleSize = preferredGroups.reduce(
    (sum, group) => sum + group.sampleSize,
    0,
  );
  const confidence = determineConfidence(preferredGroups);
  const justification = buildJustification({
    objective,
    family,
    signals: briefAdjustment.signals,
    preferredGroups,
    historicalSampleSize,
    source: selected.source,
  });

  return {
    weights,
    preferredGroups: preferredGroups.slice(0, 3),
    justification,
    historicalSampleSize,
    confidence,
    signals: briefAdjustment.signals,
    source: selected.source,
  };
}
