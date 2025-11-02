// tests/AccuracyVerifier.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, someCV, noneCV, tupleCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_FORECAST_NOT_FOUND = 101;
const ERR_ACTUAL_NOT_SET = 102;
const ERR_INVALID_TIMESTAMP = 103;
const ERR_INVALID_CONFIDENCE = 105;
const ERR_VERIFICATION_LOCKED = 106;
const ERR_ORACLE_NOT_SET = 107;
const ERR_INVALID_ENERGY_VALUE = 108;
const ERR_INVALID_REGION_ID = 109;
const ERR_SCORE_ALREADY_COMPUTED = 110;

interface Forecast {
  regionId: bigint;
  predictedMw: bigint;
  confidence: bigint;
  timestamp: bigint;
  forecaster: string;
  verified: boolean;
  actualMw: bigint | null;
  errorMargin: bigint | null;
  score: bigint | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccuracyVerifierMock {
  state: {
    oraclePrincipal: string | null;
    nextForecastId: bigint;
    forecasts: Map<bigint, Forecast>;
    regionActuals: Map<string, bigint>;
    verificationLocks: Map<bigint, bigint>;
    blockHeight: bigint;
  } = {
    oraclePrincipal: null,
    nextForecastId: 0n,
    forecasts: new Map(),
    regionActuals: new Map(),
    verificationLocks: new Map(),
    blockHeight: 1000n,
  };

  caller = "ST1USER";
  oracle = "ST1ORACLE";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      oraclePrincipal: null,
      nextForecastId: 0n,
      forecasts: new Map(),
      regionActuals: new Map(),
      verificationLocks: new Map(),
      blockHeight: 1000n,
    };
    this.caller = "ST1USER";
  }

  setBlockHeight(height: bigint) {
    this.state.blockHeight = height;
  }

  setCaller(principal: string) {
    this.caller = principal;
  }

  calculateCycle(timestamp: bigint): bigint {
    return timestamp / 144n;
  }

  computeAbsoluteError(predicted: bigint, actual: bigint): bigint {
    return predicted > actual ? predicted - actual : actual - predicted;
  }

  computeRelativeError(predicted: bigint, actual: bigint): bigint {
    if (actual === 0n) return 0n;
    return (10000n * this.computeAbsoluteError(predicted, actual)) / actual;
  }

  computeBaseScore(errorBp: bigint): bigint {
    if (errorBp >= 5000n) return 0n;
    if (errorBp >= 2500n) return 50n;
    if (errorBp >= 1000n) return 75n;
    if (errorBp >= 500n) return 90n;
    return 100n;
  }

  setOracle(newOracle: string): Result<boolean> {
    if (this.state.oraclePrincipal !== null) return { ok: false, value: false };
    if (newOracle === this.caller) return { ok: false, value: false };
    this.state.oraclePrincipal = newOracle;
    return { ok: true, value: true };
  }

  submitForecast(
    regionId: bigint,
    predictedMw: bigint,
    confidence: bigint,
    targetTimestamp: bigint
  ): Result<bigint> {
    if (regionId <= 0n || regionId > 1000n) return { ok: false, value: BigInt(ERR_INVALID_REGION_ID) };
    if (predictedMw > 1000000n) return { ok: false, value: BigInt(ERR_INVALID_ENERGY_VALUE) };
    if (confidence < 1n || confidence > 100n) return { ok: false, value: BigInt(ERR_INVALID_CONFIDENCE) };
    if (targetTimestamp <= this.state.blockHeight) return { ok: false, value: BigInt(ERR_INVALID_TIMESTAMP) };

    const id = this.state.nextForecastId;
    const cycle = this.calculateCycle(targetTimestamp);

    this.state.forecasts.set(id, {
      regionId,
      predictedMw,
      confidence,
      timestamp: targetTimestamp,
      forecaster: this.caller,
      verified: false,
      actualMw: null,
      errorMargin: null,
      score: null,
    });

    this.state.verificationLocks.set(id, targetTimestamp + 144n);
    this.state.nextForecastId += 1n;

    return { ok: true, value: id };
  }

  submitActual(regionId: bigint, cycle: bigint, actualMw: bigint): Result<boolean> {
    if (this.state.oraclePrincipal !== this.caller) return { ok: false, value: false };
    if (!this.state.oraclePrincipal) return { ok: false, value: BigInt(ERR_ORACLE_NOT_SET) };
    if (regionId <= 0n || regionId > 1000n) return { ok: false, value: BigInt(ERR_INVALID_REGION_ID) };
    if (actualMw > 1000000n) return { ok: false, value: BigInt(ERR_INVALID_ENERGY_VALUE) };

    const key = `${regionId.toString()}-${cycle.toString()}`;
    this.state.regionActuals.set(key, actualMw);
    return { ok: true, value: true };
  }

  verifyForecast(forecastId: bigint): Result<bigint> {
    const forecast = this.state.forecasts.get(forecastId);
    if (!forecast) return { ok: false, value: BigInt(ERR_FORECAST_NOT_FOUND) };
    if (forecast.verified) return { ok: false, value: BigInt(ERR_SCORE_ALREADY_COMPUTED) };

    const lockTime = this.state.verificationLocks.get(forecastId);
    if (!lockTime || this.state.blockHeight < lockTime) return { ok: false, value: BigInt(ERR_VERIFICATION_LOCKED) };

    const targetCycle = this.calculateCycle(forecast.timestamp);
    const actualKey = `${forecast.regionId.toString()}-${targetCycle.toString()}`;
    const actualMw = this.state.regionActuals.get(actualKey);
    if (actualMw === undefined) return { ok: false, value: BigInt(ERR_ACTUAL_NOT_SET) };

    const relErrorBp = this.computeRelativeError(forecast.predictedMw, actualMw);
    const baseScore = this.computeBaseScore(relErrorBp);
    const confidenceBoost = forecast.confidence > 70n ? 10n : forecast.confidence > 40n ? 5n : 0n;
    const finalScore = baseScore + confidenceBoost;

    this.state.forecasts.set(forecastId, {
      ...forecast,
      verified: true,
      actualMw,
      errorMargin: relErrorBp,
      score: finalScore,
    });

    return { ok: true, value: finalScore };
  }

  getForecastScore(forecastId: bigint): Result<{ score: bigint | null; verified: boolean; errorBp: bigint | null; actual: bigint | null }> {
    const forecast = this.state.forecasts.get(forecastId);
    if (!forecast) return { ok: false, value: { score: null, verified: false, errorBp: null, actual: null } };
    return {
      ok: true,
      value: {
        score: forecast.score,
        verified: forecast.verified,
        errorBp: forecast.errorMargin,
        actual: forecast.actualMw,
      },
    };
  }

  isForecastVerifiable(forecastId: bigint): Result<boolean> {
    const forecast = this.state.forecasts.get(forecastId);
    if (!forecast) return { ok: false, value: false };
    const lockTime = this.state.verificationLocks.get(forecastId);
    if (!lockTime) return { ok: false, value: false };
    const targetCycle = this.calculateCycle(forecast.timestamp);
    const actualKey = `${forecast.regionId.toString()}-${targetCycle.toString()}`;
    const actualExists = this.state.regionActuals.has(actualKey);

    return {
      ok: true,
      value: !forecast.verified && this.state.blockHeight >= lockTime && actualExists,
    };
  }
}

describe("AccuracyVerifier", () => {
  let contract: AccuracyVerifierMock;

  beforeEach(() => {
    contract = new AccuracyVerifierMock();
    contract.reset();
  });

  it("sets oracle successfully", () => {
    const result = contract.setOracle("ST1ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects setting oracle twice", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST2ADMIN");
    const result = contract.setOracle("ST2ORACLE");
    expect(result.ok).toBe(false);
  });

  it("rejects self as oracle", () => {
    const result = contract.setOracle(contract.caller);
    expect(result.ok).toBe(false);
  });

  it("submits forecast successfully", () => {
    contract.setBlockHeight(1000n);
    const result = contract.submitForecast(1n, 5000n, 80n, 1500n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0n);
  });

  it("rejects forecast with invalid region", () => {
    const result = contract.submitForecast(0n, 5000n, 80n, 1500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_REGION_ID));
  });

  it("rejects forecast with past timestamp", () => {
    contract.setBlockHeight(2000n);
    const result = contract.submitForecast(1n, 5000n, 80n, 1999n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_TIMESTAMP));
  });

  it("rejects forecast with invalid confidence", () => {
    const result = contract.submitForecast(1n, 5000n, 0n, 1500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_CONFIDENCE));
  });

  it("oracle submits actual successfully", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST1ORACLE");
    const result = contract.submitActual(1n, 10n, 4800n);
    expect(result.ok).toBe(true);
  });

  it("non-oracle cannot submit actual", () => {
    contract.setOracle("ST1ORACLE");
    const result = contract.submitActual(1n, 10n, 4800n);
    expect(result.ok).toBe(false);
  });

  it("verifies forecast with perfect prediction", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST1ORACLE");
    contract.submitActual(1n, 10n, 5000n);
    contract.setCaller("ST1USER");
    contract.submitForecast(1n, 5000n, 90n, 1440n);
    contract.setBlockHeight(1440n + 144n + 10n);
    const result = contract.verifyForecast(0n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(110n);
  });

  it("rejects verification before lock", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST1ORACLE");
    contract.submitActual(1n, 10n, 5000n);
    contract.setCaller("ST1USER");
    contract.submitForecast(1n, 5000n, 80n, 1440n);
    contract.setBlockHeight(1440n + 100n);
    const result = contract.verifyForecast(0n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_VERIFICATION_LOCKED));
  });

  it("rejects verification without actual", () => {
    contract.setCaller("ST1USER");
    contract.submitForecast(1n, 5000n, 80n, 1440n);
    contract.setBlockHeight(2000n);
    const result = contract.verifyForecast(0n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_ACTUAL_NOT_SET));
  });

  it("rejects double verification", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST1ORACLE");
    contract.submitActual(1n, 10n, 5000n);
    contract.setCaller("ST1USER");
    contract.submitForecast(1n, 5000n, 80n, 1440n);
    contract.setBlockHeight(2000n);
    contract.verifyForecast(0n);
    const result = contract.verifyForecast(0n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_SCORE_ALREADY_COMPUTED));
  });

  it("checks verifiability correctly", () => {
    contract.setOracle("ST1ORACLE");
    contract.setCaller("ST1ORACLE");
    contract.submitActual(1n, 10n, 5000n);
    contract.setCaller("ST1USER");
    contract.submitForecast(1n, 5000n, 80n, 1440n);
    contract.setBlockHeight(1585n);
    const result = contract.isForecastVerifiable(0n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("returns next forecast ID", () => {
    contract.submitForecast(1n, 5000n, 80n, 1500n);
    contract.submitForecast(2n, 3000n, 60n, 1600n);
    expect(contract.state.nextForecastId).toBe(2n);
  });
});