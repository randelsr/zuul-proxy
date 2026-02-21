import { HardhatUserConfig } from "hardhat/types";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnition from "@nomicfoundation/hardhat-ignition";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem, hardhatIgnition],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
    adiTestnet: {
      type: "http",
      url: process.env.ADI_TESTNET_RPC_URL ?? "https://rpc.ab.testnet.adifoundation.ai/",
      accounts: process.env.ADI_PRIVATE_KEY ? [process.env.ADI_PRIVATE_KEY] : [],
      chainId: 99999,
    },
    adiMainnet: {
      type: "http",
      url: process.env.ADI_RPC_URL ?? "https://rpc.adifoundation.ai/",
      accounts: process.env.ADI_PRIVATE_KEY ? [process.env.ADI_PRIVATE_KEY] : [],
      chainId: 36900,
    },
    hederaTestnet: {
      type: "http",
      url: process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api",
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      chainId: 295,
    },
    baseTestnet: {
      type: "http",
      url: "https://sepolia.base.org",
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    arbitrumTestnet: {
      type: "http",
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.ARBITRUM_PRIVATE_KEY ? [process.env.ARBITRUM_PRIVATE_KEY] : [],
      chainId: 421614,
    },
    optimismTestnet: {
      type: "http",
      url: "https://sepolia.optimism.io",
      accounts: process.env.OPTIMISM_PRIVATE_KEY ? [process.env.OPTIMISM_PRIVATE_KEY] : [],
      chainId: 11155420,
    },
  },
};

export default config;
