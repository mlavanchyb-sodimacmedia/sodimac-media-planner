export type ForecastConfidence =
  | "Alta"
  | "Media"
  | "Baja"
  | "Referencial";

export interface ForecastBaseline {
  level:
    | "family_group"
    | "group"
    | "global";

  family: string | null;
  commercialGroup: string | null;

  originalSampleSize: number;
  sampleSize: number;
  excludedAsOutlier: number;

  exactSamples: number;
  probableSamples: number;

  medianRoas: number | null;
  roasP25: number | null;
  roasP75: number | null;

  medianCtr: number | null;
  medianCpm: number | null;
  medianCpc: number | null;
  medianReachRate: number | null;
  medianMarginRate: number | null;

  confidence: ForecastConfidence;
  salesForecastEnabled: boolean;
}

export interface ForecastBaselinesFile {
  metadata: {
    source: string;
    method: string;
    allowedMatchQuality: string[];
    fallbackOrder: string[];
    eligibleRows: number;
    disclaimer: string;
  };

  baselines: ForecastBaseline[];
}