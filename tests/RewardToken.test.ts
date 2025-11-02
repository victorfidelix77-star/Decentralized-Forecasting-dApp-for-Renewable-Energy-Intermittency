import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INSUFFICIENT_BALANCE = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_MINT_LIMIT_REACHED = 103;
const ERR_BURN_EXCEEDS_BALANCE = 104;
const ERR_MINT_NOT_ENABLED = 106;
const ERR_SUPPLY_CAP_EXCEEDED = 110;
const ERR_ZERO_ADDRESS = 111;
const ERR_SELF_TRANSFER = 112;
const ERR_MINT_ZERO = 113;
const ERR_BURN_ZERO = 114;

interface Result<T> {
  ok: boolean;
  value: T;
}

class RewardTokenMock {
  state: {
    balances: Map<string, bigint>;
    allowances: Map<string, bigint>;
    totalMinted: bigint;
    mintAdmin: string;
    mintEnabled: boolean;
    burnEnabled: boolean;
    transferEnabled: boolean;
    lastMintBlock: bigint;
    mintCooldown: bigint;
    tokenUri: string;
    metadata: Map<string, string>;
    blockHeight: bigint;
    contractPrincipal: string;
  } = {
    balances: new Map(),
    allowances: new Map(),
    totalMinted: 0n,
    mintAdmin: "ST1CONTRACT",
    mintEnabled: true,
    burnEnabled: true,
    transferEnabled: true,
    lastMintBlock: 0n,
    mintCooldown: 144n,
    tokenUri: "",
    metadata: new Map(),
    blockHeight: 1000n,
    contractPrincipal: "ST1CONTRACT",
  };

  caller = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      balances: new Map(),
      allowances: new Map(),
      totalMinted: 0n,
      mintAdmin: "ST1CONTRACT",
      mintEnabled: true,
      burnEnabled: true,
      transferEnabled: true,
      lastMintBlock: 0n,
      mintCooldown: 144n,
      tokenUri: "",
      metadata: new Map([
        ["name", "Renewable Forecast Token"],
        ["symbol", "RFT"],
        ["decimals", "6"],
      ]),
      blockHeight: 1000n,
      contractPrincipal: "ST1CONTRACT",
    };
    this.caller = "ST1USER";
  }

  setCaller(principal: string) {
    this.caller = principal;
  }

  setBlockHeight(height: bigint) {
    this.state.blockHeight = height;
  }

  getName(): Result<string> {
    return { ok: true, value: "Renewable Forecast Token" };
  }

  getSymbol(): Result<string> {
    return { ok: true, value: "RFT" };
  }

  getDecimals(): Result<bigint> {
    return { ok: true, value: 6n };
  }

  getTotalSupply(): Result<bigint> {
    return { ok: true, value: this.state.totalMinted };
  }

  getBalance(account: string): Result<bigint> {
    return { ok: true, value: this.state.balances.get(account) ?? 0n };
  }

  getTokenUri(): Result<string | null> {
    return {
      ok: true,
      value: this.state.tokenUri === "" ? null : this.state.tokenUri,
    };
  }

  getAllowance(owner: string, spender: string): Result<bigint> {
    const key = `${owner}-${spender}`;
    return { ok: true, value: this.state.allowances.get(key) ?? 0n };
  }

  getMintAdmin(): Result<string> {
    return { ok: true, value: this.state.mintAdmin };
  }

  transfer(amount: bigint, sender: string, recipient: string): Result<boolean> {
    if (!this.state.transferEnabled)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (amount <= 0n) return { ok: false, value: BigInt(ERR_INVALID_AMOUNT) };
    if (this.caller !== sender)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (sender === recipient)
      return { ok: false, value: BigInt(ERR_SELF_TRANSFER) };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: BigInt(ERR_ZERO_ADDRESS) };

    const senderBal = this.state.balances.get(sender) ?? 0n;
    if (senderBal < amount)
      return { ok: false, value: BigInt(ERR_INSUFFICIENT_BALANCE) };

    this.state.balances.set(sender, senderBal - amount);
    const recBal = this.state.balances.get(recipient) ?? 0n;
    this.state.balances.set(recipient, recBal + amount);
    return { ok: true, value: true };
  }

  approve(spender: string, amount: bigint): Result<boolean> {
    if (amount <= 0n) return { ok: false, value: BigInt(ERR_INVALID_AMOUNT) };
    if (spender === this.caller)
      return { ok: false, value: BigInt(ERR_SELF_TRANSFER) };
    const key = `${this.caller}-${spender}`;
    this.state.allowances.set(key, amount);
    return { ok: true, value: true };
  }

  transferFrom(
    owner: string,
    recipient: string,
    amount: bigint
  ): Result<boolean> {
    if (!this.state.transferEnabled)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    const allowanceKey = `${owner}-${this.caller}`;
    const allowance = this.state.allowances.get(allowanceKey) ?? 0n;
    if (allowance < amount)
      return { ok: false, value: BigInt(ERR_INSUFFICIENT_BALANCE) };
    if (amount <= 0n) return { ok: false, value: BigInt(ERR_INVALID_AMOUNT) };
    if (owner === recipient)
      return { ok: false, value: BigInt(ERR_SELF_TRANSFER) };

    const ownerBal = this.state.balances.get(owner) ?? 0n;
    if (ownerBal < amount)
      return { ok: false, value: BigInt(ERR_INSUFFICIENT_BALANCE) };

    this.state.allowances.set(allowanceKey, allowance - amount);
    this.state.balances.set(owner, ownerBal - amount);
    const recBal = this.state.balances.get(recipient) ?? 0n;
    this.state.balances.set(recipient, recBal + amount);
    return { ok: true, value: true };
  }

  mint(amount: bigint, recipient: string): Result<boolean> {
    if (!this.state.mintEnabled)
      return { ok: false, value: BigInt(ERR_MINT_NOT_ENABLED) };
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (amount <= 0n) return { ok: false, value: BigInt(ERR_MINT_ZERO) };
    if (
      this.state.blockHeight <
      this.state.lastMintBlock + this.state.mintCooldown
    )
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (recipient === this.caller)
      return { ok: false, value: BigInt(ERR_SELF_TRANSFER) };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: BigInt(ERR_ZERO_ADDRESS) };

    const newTotal = this.state.totalMinted + amount;
    if (newTotal > 100000000n)
      return { ok: false, value: BigInt(ERR_SUPPLY_CAP_EXCEEDED) };

    const bal = this.state.balances.get(recipient) ?? 0n;
    this.state.balances.set(recipient, bal + amount);
    this.state.totalMinted = newTotal;
    this.state.lastMintBlock = this.state.blockHeight;
    return { ok: true, value: true };
  }

  burn(amount: bigint): Result<boolean> {
    if (!this.state.burnEnabled)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (amount <= 0n) return { ok: false, value: BigInt(ERR_BURN_ZERO) };
    const bal = this.state.balances.get(this.caller) ?? 0n;
    if (bal < amount)
      return { ok: false, value: BigInt(ERR_BURN_EXCEEDS_BALANCE) };
    this.state.balances.set(this.caller, bal - amount);
    return { ok: true, value: true };
  }

  setMintAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (newAdmin === this.caller)
      return { ok: false, value: BigInt(ERR_SELF_TRANSFER) };
    this.state.mintAdmin = newAdmin;
    return { ok: true, value: true };
  }

  setTokenUri(uri: string): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    this.state.tokenUri = uri;
    return { ok: true, value: true };
  }

  toggleMint(): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    this.state.mintEnabled = !this.state.mintEnabled;
    return { ok: true, value: this.state.mintEnabled };
  }

  toggleBurn(): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    this.state.burnEnabled = !this.state.burnEnabled;
    return { ok: true, value: this.state.burnEnabled };
  }

  toggleTransfer(): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    this.state.transferEnabled = !this.state.transferEnabled;
    return { ok: true, value: this.state.transferEnabled };
  }

  setMintCooldown(blocks: bigint): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (blocks < 1n) return { ok: false, value: BigInt(ERR_INVALID_AMOUNT) };
    this.state.mintCooldown = blocks;
    return { ok: true, value: true };
  }

  initialize(): Result<boolean> {
    if (this.caller !== this.state.mintAdmin)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    if (this.state.totalMinted !== 0n)
      return { ok: false, value: BigInt(ERR_NOT_AUTHORIZED) };
    this.state.balances.set(this.caller, 50000000n);
    this.state.totalMinted = 50000000n;
    return { ok: true, value: true };
  }
}

describe("RewardToken", () => {
  let token: RewardTokenMock;

  beforeEach(() => {
    token = new RewardTokenMock();
    token.reset();
  });

  it("initializes with correct metadata", () => {
    expect(token.getName().value).toBe("Renewable Forecast Token");
    expect(token.getSymbol().value).toBe("RFT");
    expect(token.getDecimals().value).toBe(6n);
  });

  it("mints initial supply on initialize", () => {
    token.setCaller("ST1CONTRACT");
    const result = token.initialize();
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1CONTRACT").value).toBe(50000000n);
    expect(token.getTotalSupply().value).toBe(50000000n);
  });

  it("rejects double initialization", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    const result = token.initialize();
    expect(result.ok).toBe(false);
  });

  it("admin mints tokens with cooldown", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setBlockHeight(1000n);
    const result = token.mint(1000n, "ST1USER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1USER").value).toBe(1000n);
  });

  it("enforces mint cooldown", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setBlockHeight(1000n);
    token.mint(1000n, "ST1USER");
    const result = token.mint(1000n, "ST1USER");
    expect(result.ok).toBe(false);
  });

  it("allows mint after cooldown", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setBlockHeight(1000n);
    token.mint(1000n, "ST1USER");
    token.setBlockHeight(1000n + 144n);
    const result = token.mint(500n, "ST1USER");
    expect(result.ok).toBe(true);
  });

  it("enforces supply cap", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setBlockHeight(1000n);
    const result = token.mint(50000001n, "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_SUPPLY_CAP_EXCEEDED));
  });

  it("transfers tokens correctly", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setCaller("ST1CONTRACT");
    token.mint(1000n, "ST1USER");
    token.setCaller("ST1USER");
    const result = token.transfer(400n, "ST1USER", "ST2USER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1USER").value).toBe(600n);
    expect(token.getBalance("ST2USER").value).toBe(400n);
  });

  it("rejects self-transfer", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.setCaller("ST1USER");
    const result = token.transfer(100n, "ST1USER", "ST1USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(BigInt(ERR_SELF_TRANSFER));
  });

  it("allows approved spending", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.mint(1000n, "ST1USER");
    token.setCaller("ST1USER");
    token.approve("ST2SPENDER", 500n);
    token.setCaller("ST2SPENDER");
    const result = token.transferFrom("ST1USER", "ST3RECIPIENT", 300n);
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST3RECIPIENT").value).toBe(300n);
  });

  it("burns tokens when enabled", () => {
    token.setCaller("ST1CONTRACT");
    token.initialize();
    token.mint(1000n, "ST1USER");
    token.setCaller("ST1USER");
    const result = token.burn(400n);
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1USER").value).toBe(600n);
  });

  it("toggles features as admin", () => {
    token.setCaller("ST1CONTRACT");
    expect(token.toggleMint().value).toBe(false);
    expect(token.toggleBurn().value).toBe(false);
    expect(token.toggleTransfer().value).toBe(false);
  });
});
