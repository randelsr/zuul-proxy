import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import type { HardhatModulesAPI } from "@nomicfoundation/hardhat-ignition";

/**
 * Zuul Proxy Main Deployment Module
 *
 * Deploys both RBAC and Audit contracts together
 * Used by: pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost
 */
const ZuulModule = buildModule("Zuul", (m: HardhatModulesAPI) => {
  // Deploy RBAC contract (on-chain permission management)
  const rbac = m.contract("RBAC");

  // Deploy Audit contract (immutable audit log) with RBAC address
  const audit = m.contract("Audit", [rbac]);

  return { rbac, audit };
});

export default ZuulModule;
