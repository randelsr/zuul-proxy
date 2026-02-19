import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const AuditModule = buildModule('Audit', (m) => {
  const audit = m.contract('Audit');

  return { audit };
});

export default AuditModule;
