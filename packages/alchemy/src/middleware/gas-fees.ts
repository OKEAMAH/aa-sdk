import type { AlchemyProvider } from "../provider.js";

export enum GasFeeStrategy {
  DEFAULT = "DEFAULT",
  FIXED = "FIXED",
  BASE_FEE_PERCENTAGE = "BASE_FEE_PERCENTAGE",
  PRIORITY_FEE_PERCENTAGE = "PRIORITY_FEE_PERCENTAGE",
}

export interface GasFeeMode {
  strategy: GasFeeStrategy;
  value: bigint;
}

export const withAlchemyGasFeeEstimator = (
  provider: AlchemyProvider,
  feeMode: GasFeeMode,
  maxPriorityFeeBufferPercent: bigint
): AlchemyProvider => {
  if (feeMode.strategy === GasFeeStrategy.DEFAULT) {
    return provider;
  }

  provider.withFeeDataGetter(async () => {
    const block = await provider.rpcClient.getBlock({ blockTag: "latest" });
    const baseFeePerGas = block.baseFeePerGas;
    if (baseFeePerGas == null) {
      throw new Error("baseFeePerGas is null");
    }
    // add a buffer here to account for potential spikes in priority fee
    const maxPriorityFeePerGas =
      (BigInt(await provider.rpcClient.getMaxPriorityFeePerGas()) *
        (100n + maxPriorityFeeBufferPercent)) /
      100n;
    // add 25% overhead to ensure mine
    const baseFeeScaled = (baseFeePerGas * 5n) / 4n;

    const prioFee = ((): bigint => {
      switch (feeMode.strategy) {
        case GasFeeStrategy.FIXED:
          return maxPriorityFeePerGas + feeMode.value;
        case GasFeeStrategy.BASE_FEE_PERCENTAGE:
          return (baseFeeScaled * feeMode.value) / 100n;
        case GasFeeStrategy.PRIORITY_FEE_PERCENTAGE:
          // add 10% to required priority fee to ensure mine
          return (maxPriorityFeePerGas * (100n + feeMode.value)) / 100n;
        default:
          throw new Error("fee mode not supported");
      }
    })();

    return {
      maxPriorityFeePerGas: prioFee,
      maxFeePerGas: baseFeeScaled + prioFee,
    };
  });
  return provider;
};
