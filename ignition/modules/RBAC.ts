import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const RBACModule = buildModule('RBAC', (m) => {
  const rbac = m.contract('RBAC');

  return { rbac };
});

export default RBACModule;
