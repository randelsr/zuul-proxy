require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-ignition');
require('@nomicfoundation/hardhat-viem');
require('@typechain/hardhat');
require('solidity-coverage');

// Register ts-node for TypeScript support
require('ts-node').register({
  project: require('path').resolve(__dirname, './tsconfig.hardhat.json'),
  transpileOnly: true,
});

const config = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    hederaTestnet: {
      url: process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api',
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      chainId: 295,
    },
    baseTestnet: {
      url: 'https://sepolia.base.org',
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    arbitrumTestnet: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: process.env.ARBITRUM_PRIVATE_KEY ? [process.env.ARBITRUM_PRIVATE_KEY] : [],
      chainId: 421614,
    },
    optimismTestnet: {
      url: 'https://sepolia.optimism.io',
      accounts: process.env.OPTIMISM_PRIVATE_KEY ? [process.env.OPTIMISM_PRIVATE_KEY] : [],
      chainId: 11155420,
    },
  },
  mocha: {
    timeout: 40000,
  },
  typechain: {
    outDir: 'src/contracts/generated',
    target: 'ethers-v6',
  },
};

module.exports = config;
