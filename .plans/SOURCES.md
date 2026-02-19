# Research Sources & References

All research findings are grounded in current (February 2026) official documentation and community resources.

---

## Smart Contract Framework Research

### Hardhat
- [Hardhat Official Documentation](https://hardhat.org)
- [Hardhat Getting Started](https://hardhat.org/getting-started)
- [Hardhat Ignition Documentation](https://hardhat.org/ignition)
- [Hardhat Ignition Guide: Deploy](https://hardhat.org/ignition/docs/guides/deploy)
- [Hardhat TypeScript Support](https://v2.hardhat.org/hardhat-runner/docs/guides/typescript)

### Foundry
- [Foundry Official Documentation](https://getfoundry.sh)
- [Foundry Scripting & Deployment](https://getfoundry.sh/forge/deploying/)
- [Foundry CLI Reference](https://book.getfoundry.sh/reference/forge/forge)

### Comparisons
- [Foundry vs Hardhat: A Faster, Native Way to Test Solidity Smart Contracts](https://threesigma.xyz/blog/foundry/foundry-vs-hardhat-solidity-testing-tools)
- [Hardhat: The Professional Ethereum Development Environment](https://palmartin.medium.com/fvvvvvvvvfffffffffffffffffffffffffhardhat-the-professional-ethereum-development-environment-18ff7c8557c4) - Medium, January 2026
- [Top Smart Contract Frameworks: Hardhat vs Foundry in 2026](https://www.nadcab.com/blog/smart-contract-frameworks-explained)
- [Smart contract Frameworks - Foundry vs Hardhat: Differences in performance and developer experience](https://chainstack.com/foundry-hardhat-differences-performance/)
- [Hardhat vs Foundry](https://metamask.io/news/hardhat-vs-foundry-choosing-the-right-ethereum-development-tool) - MetaMask Developer Blog
- [Remix vs Truffle vs Hardhat vs Foundry](https://www.ethereum-blockchain-developer.com/advanced-mini-courses/remix-vs-truffle-vs-hardhat-vs-foundry)

### Multi-Chain Deployment
- [Hardhat Ignition Multi-Chain Configuration](https://hardhat.org/ignition)
- [Foundry Deploy and Verify on Hedera](https://docs.hedera.com/hedera/getting-started-evm-developers/deploy-a-smart-contract-with-foundry)
- [Foundry Multichain Deployment Patterns](https://github.com/timurguvenkaya/foundry-multichain)
- [How to Deploy a Contract with Foundry on Hedera](https://blog.validationcloud.io/how-to-hedera-foundry)

---

## EVM Client Library Research

### viem
- [viem Official Documentation](https://viem.sh)
- [viem Getting Started](https://viem.sh/docs/getting-started)
- [viem FAQ](https://viem.sh/docs/faq)
- [Why viem](https://viem.sh/docs/introduction)
- [viem Account Abstraction](https://viem.sh/account-abstraction)
- [Wallet Client in viem](https://viem.sh/docs/clients/wallet)
- [Coinbase Smart Wallet Integration in viem](https://viem.sh/account-abstraction/accounts/smart/toCoinbaseSmartAccount)

### Signature Recovery (viem)
- [recoverMessageAddress · Viem](https://viem.sh/docs/utilities/recoverMessageAddress)
- [signMessage (Local Account) · Viem](https://viem.sh/docs/accounts/local/signMessage)
- [recoverTypedDataAddress · Viem](https://v1.viem.sh/docs/utilities/recoverTypedDataAddress.html)
- [recoverAddress · viem](https://v1.viem.sh/docs/utilities/recoverAddress.html)

### ethers.js v6
- [ethers.js Official Documentation](https://docs.ethers.org/v6)
- [ethers.js Signers](https://docs.ethers.org/v6/api/wallet/)
- [ethers.js v5 API Reference](https://docs.ethers.org/v5/api/signer/)

### Signature Recovery (ethers.js)
- [ethers.js signing and recover discussion](https://github.com/ethers-io/ethers.js/discussions/2357)
- [ECDSA.recover vs ethers.utils.verifyMessage](https://forum.openzeppelin.com/t/ecdsa-recover-different-from-ethers-utils-verifymessage/29685)
- [How to recover the sender of a signed transaction?](https://github.com/ethers-io/ethers.js/discussions/1267)
- [How to recover the public key and address from a signed message?](https://github.com/ethers-io/ethers.js/issues/447)

### Comparisons
- [Viem: A Modern, Typed Alternative to Ethers.js for Ethereum Development](https://medium.com/@BizthonOfficial/viem-a-modern-typed-alternative-to-ethers-js-for-ethereum-development-fd425eb58459) - Medium, BizThon
- [Viem vs. Ethers.js: A Comparison for Web3 Developers](https://metamask.io/news/viem-vs-ethers-js-a-detailed-comparison-for-web3-developers) - MetaMask Developer Blog
- [The Promise of viem: A TypeScript Library for Interacting with Ethereum](https://www.dynamic.xyz/blog/the-promise-of-viem-a-typescript-library-for-interacting-with-ethereum) - Dynamic Blog
- [Wallet Integration for Smart Contracts: Complete Guide 2026](https://www.nadcab.com/blog/wallet-integration-for-smart-contracts)
- [Ethers vs VIEM: Which Web3 Frontend Library?](https://jamesbachini.com/ethers-vs-viem/) - JamesBachini

### Bundle Size & Performance
- [Why Viem](https://viem.sh/docs/introduction) - Official documentation on design philosophy
- [Have you heard about viem?](https://medium.com/@vgabrielmarian21/have-you-heard-about-viem-84df547e43e4) - Medium discussion on viem advantages
- [Comparing Ethers.js and Viem/Wagmi](https://gaboesquivel.com/blog/2024-07-viem-wagmi-ethers)

---

## Wallet Abstraction & Account Abstraction

### viem Account Abstraction
- [Getting Started with Account Abstraction · Viem](https://viem.sh/account-abstraction)
- [Wallet Client · Viem](https://viem.sh/docs/clients/wallet)
- [Coinbase Smart Wallet · Viem](https://viem.sh/account-abstraction/accounts/smart/toCoinbaseSmartAccount)

### ethers.js Custom Signers
- [How to create a custom signer in Ethers.js](https://medium.com/@mohammadammad144/how-to-create-a-custom-signer-in-ethers-js-af05e62d8e2) - Medium, Mohammadammad
- [Convert v5 signer to v6 signer discussion](https://github.com/ethers-io/ethers.js/issues/4279)

### Wallet Abstraction Patterns
- [GitHub - tronweb3/tronwallet-adapter: Modular TypeScript wallet adapters and components](https://github.com/tronweb3/tronwallet-adapter)
- [Top 10 Embedded Wallets for Apps in 2026](https://www.openfort.io/blog/top-10-embedded-wallets)
- [Web3Modal — Simplifying Multi-Wallet Integrations for dApp Developers](https://medium.com/@BizthonOfficial/web3modal-simplifying-multi-wallet-integrations-for-dapp-developers-191ff3cc4891) - Medium, BizThon

### ERC-4337 & ERC-6492
- [What is ERC-6492 and why it's important for Account Abstraction](https://docs.zerodev.app/blog/erc-6492-and-why-its-important-for-aa) - ZeroDev Documentation
- [Simplifying Smart Wallets: ERC 1271 and ERC 6492 Explained](https://www.dynamic.xyz/blog/erc-1271-and-erc-6492-explained) - Dynamic Blog
- [GitHub - AmbireTech/signature-validator: TypeScript library that supports validation of ERC-1271, ERC-6492](https://github.com/AmbireTech/signature-validator)
- [Implementing EIP-6492 along with ERC-1271?](https://github.com/wevm/viem/discussions/337) - viem GitHub discussions
- [EIP-7702 Implementation Guide: Build and Test Smart Accounts](https://www.quicknode.com/guides/ethereum-development/smart-contracts/eip-7702-smart-accounts) - QuickNode Guides

---

## Coinbase Agentic Wallet

### Official Resources
- [Introducing Agentic Wallets: Give Your Agents the Power of Autonomy](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) - Coinbase Developer Platform
- [Agentic Wallet - Coinbase Developer Documentation](https://docs.cdp.coinbase.com/agentic-wallet/welcome)

### Coverage
- [Coinbase rolls out AI tool to 'give any agent a wallet'](https://www.theblock.co/post/389524/coinbase-rolls-out-ai-tool-to-give-any-agent-a-wallet) - The Block
- [Coinbase Debuts Crypto Wallet Infrastructure for AI Agents](https://www.pymnts.com/cryptocurrency/2026/coinbase-debuts-crypto-wallet-infrastructure-for-ai-agents/) - PYMNTS
- [Coinbase Unveils Agentic Wallets to Power Autonomous AI Spending and Investing](https://www.paymentsjournal.com/coinbase-unveils-agentic-wallets-to-power-autonomous-ai-spending-and-investing/) - Payments Journal
- [Coinbase Wallet alternative guide 2026: best options by use case](https://www.gncrypto.news/news/coinbase-wallet-alternative/) - GNCrypto

---

## Multi-Chain Support (EVM Compatibility)

### Hedera JSON-RPC Relay
- [JSON-RPC Relay and EVM Tooling - Hedera](https://docs.hedera.com/hedera/core-concepts/smart-contracts/understanding-hederas-evm-differences-and-compatibility/for-evm-developers-migrating-to-hedera/json-rpc-relay-and-evm-tooling)
- [HIP-482: JSON-RPC Relay](https://hips.hedera.com/HIP/hip-482.html)
- [Anything you can do, you can do on Hedera: Introducing the JSON-RPC Relay](https://hedera.com/blog/anything-you-can-do-you-can-do-on-hedera-introducing-the-json-rpc-relay/) - Hedera Blog
- [How To Leverage Hedera for Efficient Web3 Development: A Dive into JSON-RPC EVM Tooling](https://validationcloud.medium.com/how-to-leverage-hedera-for-efficient-web3-development-a-dive-into-json-rpc-evm-tooling-2719b991fffc) - Validation Cloud Medium
- [JSON-RPC Relay | ARKHIA](https://docs.arkhia.io/docs/arkhia-services/Protocols/Hedera/json-relay.api)
- [GitHub - hiero-ledger/hiero-json-rpc-relay: Implementation of Ethereum JSON-RPC APIs for Hedera](https://github.com/hiero-ledger/hiero-json-rpc-relay)

### Other EVM Chains
- [RPC methods | Arbitrum Docs](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/rpc-methods)
- [Why does the wallet give internal JSON RPC errors? – Optimism](https://help.optimism.io/hc/en-us/articles/6377913085339-Why-does-the-wallet-give-internal-JSON-RPC-errors)
- [How to Fix Internal JSON RPC Error](https://www.datawallet.com/crypto/how-to-fix-internal-json-rpc-error-metamask)

---

## TypeChain & ABI Generation

### TypeChain
- [GitHub - dethcrypto/TypeChain: TypeScript bindings for Ethereum smart contracts](https://github.com/dethcrypto/TypeChain)
- [@typechain/hardhat - npm](https://www.npmjs.com/package/@typechain/hardhat)
- [typechain - npm](https://www.npmjs.com/package/typechain)

### Hardhat TypeScript Integration
- [Using TypeScript - Hardhat](https://v2.hardhat.org/hardhat-runner/docs/guides/typescript)
- [Strong Types With Typescript - useDApp](https://usedapp-docs.netlify.app/docs/guides/reading/typechain/)

### Foundry Bindings
- [cast bind - Foundry Book](https://book.getfoundry.sh/reference/cli/cast/bind)
- [Add cast command to generate ethers-rs bindings](https://github.com/foundry-rs/foundry/issues/4132)
- [cast abi-encode - Foundry Book](https://github.com/foundry-rs/foundry-book/blob/master/src/reference/cast/cast-abi-encode.md)

---

## Additional Resources

### Framework Comparisons
- [Introduction to Foundry](https://www.quicknode.com/guides/ethereum-development/smart-contracts/intro-to-foundry) - QuickNode Guides
- [Foundry - A Fast Solidity Smart Contract Development Toolkit](https://chainstack.com/foundry-a-fast-solidity-contract-development-toolkit/) - Chainstack
- [Smart Contract Development with Foundry](https://r4bbit.substack.com/p/smart-contract-development-with-foundry) - r4bbit Substack

### Wallet Integration
- [Ethereum & EVM chains - Trust Developers](https://developer.trustwallet.com/developer/develop-for-trust/browser-extension/evm)
- [Best MetaMask Wallet Alternatives in 2026](https://onekey.so/blog/ecosystem/preview-39-metamask-20260213-154558-best-metamask-wallet-alternatives-in-2026/) - OneKey Blog
- [Coinbase Wallet vs. MetaMask: Best Wallet 2026](https://coinledger.io/tools/coinbase-wallet-vs-metamask) - CoinLedger
- [Can I import my Coinbase Wallet account to MetaMask?](https://support.metamask.io/configure/accounts/can-i-import-my-coinbase-wallet-account-to-metamask/) - MetaMask Help Center
- [Wallet interoperability - MetaMask Developer Documentation](https://docs.metamask.io/wallet/concepts/wallet-interoperability/)
- [Design supercharged on-chain experiences - MetaMask Embedded Wallets](https://metamask.io/developer/embedded-wallets/)
- [swap-velora-evm - Tether Wallet Development Kit](https://docs.wallet.tether.io/sdk/swap-modules/swap-velora-evm)
- [wallet-evm - Tether Wallet Development Kit](https://docs.wallet.tether.io/sdk/wallet-modules/wallet-evm)

### Account Abstraction Landscape
- [Account Abstraction Landscape](https://medium.com/distributed-lab/account-abstraction-landscape-a8ccfe7a022a) - Distributed Lab Medium
- [Top 6 Account Abstraction Providers: An In-Depth Review](https://medium.com/coinmonks/top-6-account-abstraction-providers-a-in-depth-review-3a09b9fc707c) - Coinmonks
- [Web3: A Deep Dive Into ERC-4337 and Gasless ERC-20 Transfers](https://medium.com/@brianonchain/a-linear-deep-dive-into-erc-4337-and-gasless-erc-20-transfers-c475d132951f) - Medium, brianonchain
- [Integrating with EIP-7702 - Privy Docs](https://docs.privy.io/recipes/react/eip-7702)
- [Custom account abstraction implementation - Privy Docs](https://docs.privy.io/recipes/account-abstraction/custom-implementation)

---

## Research Date & Context

All links and information referenced as of **February 18, 2026**.

This research was conducted as part of the **Zuul Proxy** project for **ETHDenver 2026**, with a focus on:
- Multi-chain deployment (Hedera, Base, Arbitrum, Optimism)
- Modular wallet abstraction (Coinbase Agentic Wallet, MetaMask, WalletConnect, raw ECDSA)
- Signature recovery as primary use case
- TypeScript-first stack requirements

---

## How These Sources Were Used

1. **Official Documentation:** Primary source for API references, features, and current capabilities
2. **Comparison Articles:** Secondary sources for trade-off analysis and ecosystem assessment
3. **GitHub Discussions:** Community feedback on real-world usage and edge cases
4. **Blog Posts & News:** Current market trends and ecosystem adoption rates
5. **Product Documentation:** Hedera, Coinbase, MetaMask for chain-specific requirements

Each recommendation in the research documents is grounded in information from one or more of these authoritative sources.

---

**Last Updated:** 2026-02-18
**Research Confidence:** HIGH (90%)
