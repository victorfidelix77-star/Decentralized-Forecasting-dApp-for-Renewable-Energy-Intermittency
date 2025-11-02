import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_REGION = 101;
const ERR_INVALID_ENERGY = 102;
const ERR_INVALID_CONFIDENCE = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_STAKE_INSUFFICIENT = 105;
const ERR_LOCK_PERIOD = 108;
const ERR_INVALID_STAKE_AMOUNT = 109;

interface Forecast {
  regionId: bigint;
  predictedMw: bigint;
  confidence: bigint;
  targetTimestamp: bigint;
  forecaster: string;
  stakeAmount: bigint;
  submittedAt: bigint;
  cycle: bigint;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ForecastSubmissionMock {
  state: {
    nextForecastId: bigint;
    verifierContract: string;
    userStakes: Map<string, bigint>;
    userLockTimestamp: Map<string, bigint>;
    forecasts: Map<bigint, Forecast>;
    regionForecasts: Map<string, bigint[]>;
    blockHeight: bigint;
    stxTransfers: Array<{ amount: bigint; from: string; to: string }>;
  } = {
    nextForecastId: 0n,
    verifierContract: "ST1ADMIN",
    userStakes: new Map(),
    userLockTimestamp: new Map(),
    forecasts: new Map(),
    regionForecasts: new Map(),
    blockHeight: 1000n,
    stxTransfers: [],
  };

  caller = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextForecastId: 0n,
      verifierContract: "ST1ADMIN",
      userStakes: new Map(),
      userLockTimestamp: new Map(),
      forecasts: new Map(),
      regionForecasts: new Map(),
      blockHeight: 1000n,
      stxTransfers: [],
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

  setVerifierContract(newVerifier: string): Result<boolean> {
    if (this.caller !== this.state.verifierContract)
      return { ok: false, value: false };
    this.state.verifierContract = newVerifier;
    return { ok: true, value: true };
  }

  stake(amount: bigint): Result<boolean> {
    if (amount < 1000000n)
      return { ok: false, value: BigInt(ERR_INVALID_STAKE_AMOUNT) };
    const current = this.state.userStakes.get(this.caller) ?? 0n;
    this.state.userStakes.set(this.caller, current + amount);
    this.state.stxTransfers.push({
      amount,
      from: this.caller,
      to: this.contractAddress(),
    });
    return { ok: true, value: true };
  }

  unstake(amount: bigint): Result<boolean> {
    const current = this.state.userStakes.get(this.caller) ?? 0n;
    if (current < amount)
      return { ok: false, value: BigInt(ERR_STAKE_INSUFFICIENT) };
    const lockTime = this.state.userLockTimestamp.get(this.caller) ?? 0n;
    if (this.state.blockHeight < lockTime + 2016n)
      return { ok: false, value: BigInt(ERR_LOCK_PERIOD) };
    this.state.userStakes.set(this.caller, current - amount);
    this.state.stxTransfers.push({
      amount,
      from: this.contractAddress(),
      to: this.caller,
    });
    return { ok: true, value: true };
  }

  submitForecast(
    regionId: bigint,
    predictedMw: bigint,
    confidence: bigint,
    targetTimestamp: bigint
  ): Result<bigint> {
    if (regionId <= 0n || regionId > 1000n)
      return { ok: false, value: BigInt(ERR_INVALID_REGION) };
    if (predictedMw > 1000000n)
      return { ok: false, value: BigInt(ERR_INVALID_ENERGY) };
    if (confidence < 1n || confidence > 100n)
      return { ok: false, value: BigInt(ERR_INVALID_CONFIDENCE) };
    if (targetTimestamp <= this.state.blockHeight)
      return { ok: false, value: BigInt(ERR_INVALID_TIMESTAMP) };

    const stake = this.state.userStakes.get(this.caller) ?? 0n;
    if (stake < 1000000n)
      return { ok: false, value: BigInt(ERR_STAKE_INSUFFICIENT) };

    const lockTime = this.state.userLockTimestamp.get(this.caller) ?? 0n;
    if (this.state.blockHeight < lockTime + 2016n)
      return { ok: false, value: BigInt(ERR_LOCK_PERIOD) };

    const cycle = this.calculateCycle(targetTimestamp);
    const key = `${regionId}-${cycle}`;
    const list = this.state.regionForecasts.get(key) ?? [];
    if (list.length >= 100) return { ok: false, value: 0n };

    const id = this.state.nextForecastId;
    this.state.forecasts.set(id, {
      regionId,
      predictedMw,
      confidence,
      targetTimestamp,
      forecaster: this.caller,
      stakeAmount: stake,
      submittedAt: this.state.blockHeight,
      cycle,
    });
    this.state.regionForecasts.set(key, [...list, id]);
    this.state.nextForecastId += 1n;
    return { ok: true, value: id };
  }

  lockStakeOnSlash(user: string): Result<boolean> {
    if (this.caller !== this.state.verifierContract)
      return { ok: false, value: false };
    this.state.userLockTimestamp.set(user, this.state.blockHeight);
    return { ok: true, value: true };
  }

  contractAddress(): string {
    return "ST1CONTRACT";
  }
}

describe("ForecastSubmission", () => {
  let contract: ForecastSubmissionMock;

  beforeEach(() => {
    contract = new ForecastSubmissionMock();
    contract.reset();
  });

  it("sets verifier contract successfully", () => {
    contract.setCaller("ST1ADMIN");
    const result = contract.setVerifierContract("ST1VERIFIER");
    expect(result.ok).toBe(true);
  });

  it("rejects non-admin verifier change", () => {
    const result = contract.setVerifierContract("ST1VERIFIER");
    expect(result.ok).toBe(false);
  });

  it("stakes successfully", () => {
    const result = contract.stake(2000000n);
    expect(result.ok).toBe(true);
    expect(contract.state.userStakes.get("ST1USER")).toBe(2000000n);
  });

  it("rejects stake below minimum", () => {
    const result = contract.stake(500000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_STAKE_AMOUNT));
  });

  it("unstakes after lock period", () => {
    contract.stake(2000000n);
    contract.setBlockHeight(1000n + 2016n + 1n);
    const result = contract.unstake(1000000n);
    expect(result.ok).toBe(true);
    expect(contract.state.userStakes.get("ST1USER")).toBe(1000000n);
  });

  it("rejects unstake during lock", () => {
    contract.stake(2000000n);
    contract.setCaller("ST1VERIFIER");
    contract.lockStakeOnSlash("ST1USER");
    contract.setCaller("ST1USER");
    const result = contract.unstake(1000000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_LOCK_PERIOD));
  });

  it("rejects forecast without stake", () => {
    contract.setBlockHeight(1000n);
    const result = contract.submitForecast(1n, 5000n, 80n, 1500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_STAKE_INSUFFICIENT));
  });

  it("rejects forecast with invalid region", () => {
    contract.stake(2000000n);
    const result = contract.submitForecast(0n, 5000n, 80n, 1500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_REGION));
  });

  it("rejects forecast with past timestamp", () => {
    contract.stake(2000000n);
    contract.setBlockHeight(2000n);
    const result = contract.submitForecast(1n, 5000n, 80n, 1999n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_INVALID_TIMESTAMP));
  });

  it("rejects lock by non-verifier", () => {
    const result = contract.lockStakeOnSlash("ST1USER");
    expect(result.ok).toBe(false);
  });

  it("limits forecasts per region-cycle", () => {
    contract.stake(2000000n);
    contract.setBlockHeight(1000n);
    for (let i = 0; i < 100; i++) {
      contract.setCaller(`ST1USER${i}`);
      contract.stake(2000000n);
      contract.submitForecast(1n, 5000n, 80n, 1440n);
    }
    contract.setCaller("ST1USER101");
    contract.stake(2000000n);
    const result = contract.submitForecast(1n, 5000n, 80n, 1440n);
    expect(result.ok).toBe(false);
  });
});
