const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('RBAC Contract', () => {
  let rbac;
  let owner;
  let agent1;
  let agent2;

  const developerRole = ethers.id('developer');
  const adminRole = ethers.id('admin');

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    [owner, agent1, agent2] = signers;

    const RBACFactory = await ethers.getContractFactory('RBAC');
    rbac = await RBACFactory.deploy();
    await rbac.waitForDeployment();
  });

  it('should register an agent', async () => {
    const tx = await rbac.registerAgent(agent1.address, developerRole);
    const receipt = await tx.wait();

    expect(receipt?.logs.length).to.be.greaterThan(0);

    const [role, isActive] = await rbac.getAgentRole(agent1.address);
    expect(role).to.equal(developerRole);
    expect(isActive).to.equal(true);
  });

  it('should grant a permission', async () => {
    const tx = await rbac.grantPermission(developerRole, 'github', 'read');
    const receipt = await tx.wait();

    expect(receipt?.logs.length).to.be.greaterThan(0);
  });

  it('should check permission correctly', async () => {
    // Register agent with developer role
    await rbac.registerAgent(agent1.address, developerRole);

    // Grant permission
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Agent should have permission
    const hasReadPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    const hasCreatePermission = await rbac.hasPermission(agent1.address, 'github', 'create');

    expect(hasReadPermission).to.equal(true);
    expect(hasCreatePermission).to.equal(false);
  });

  it('should deny access to revoked agent', async () => {
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.grantPermission(developerRole, 'github', 'read');

    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(true);

    // Emergency revoke
    await rbac.emergencyRevoke(agent1.address);

    // Agent should no longer have permission
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false);
  });

  it('should revoke a permission', async () => {
    await rbac.grantPermission(developerRole, 'github', 'read');
    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false); // No registration

    await rbac.registerAgent(agent1.address, developerRole);
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(true);

    // Revoke permission
    await rbac.revokePermission(developerRole, 'github', 'read');

    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false);
  });

  it('should deny non-owner from registering agents', async () => {
    const rbacAsAgent1 = rbac.connect(agent1);

    try {
      await rbacAsAgent1.registerAgent(agent2.address, developerRole);
      expect.fail('Should have thrown error');
    } catch (error) {
      // Expected to revert with OwnableUnauthorizedAccount
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should deny inactive agents from having permissions', async () => {
    // Register agent with developer role
    await rbac.registerAgent(agent1.address, developerRole);
    // Grant permission
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Verify agent has permission before revoke
    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(true);

    // Revoke agent
    await rbac.emergencyRevoke(agent1.address);

    // Verify agent has no permission after revoke (inactive check)
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false);
  });

  it('should deny unregistered agents from having permissions', async () => {
    // Grant permission to role without registering agent with that role
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Unregistered agent should have no permission (even for granted role)
    const hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false);
  });

  it('should return correct role and active status for agent', async () => {
    await rbac.registerAgent(agent1.address, developerRole);
    const [role, isActive] = await rbac.getAgentRole(agent1.address);

    expect(role).to.equal(developerRole);
    expect(isActive).to.equal(true);
  });

  it('should return inactive status after emergency revoke', async () => {
    await rbac.registerAgent(agent1.address, developerRole);
    let [role, isActive] = await rbac.getAgentRole(agent1.address);
    expect(isActive).to.equal(true);

    await rbac.emergencyRevoke(agent1.address);
    [role, isActive] = await rbac.getAgentRole(agent1.address);

    expect(role).to.equal(developerRole); // Role unchanged
    expect(isActive).to.equal(false); // Active flag false
  });

  it('should grant multiple permissions to same role', async () => {
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.grantPermission(developerRole, 'github', 'read');
    await rbac.grantPermission(developerRole, 'github', 'create');
    await rbac.grantPermission(developerRole, 'slack', 'read');

    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'github', 'create')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'slack', 'read')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'slack', 'create')).to.equal(false);
  });

  it('should handle role reassignment', async () => {
    // Register agent with developer role
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Verify agent1 has permission
    let hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(true);

    // Re-register agent with admin role
    await rbac.registerAgent(agent1.address, adminRole);

    // Agent no longer has developer permissions
    hasPermission = await rbac.hasPermission(agent1.address, 'github', 'read');
    expect(hasPermission).to.equal(false);

    // Grant admin permission and verify agent can access it
    await rbac.grantPermission(adminRole, 'github', 'admin');
    const hasAdminPermission = await rbac.hasPermission(agent1.address, 'github', 'admin');
    expect(hasAdminPermission).to.equal(true);
  });

  it('should deny non-owner from granting permissions', async () => {
    const rbacAsAgent1 = rbac.connect(agent1);

    try {
      await rbacAsAgent1.grantPermission(developerRole, 'github', 'read');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should deny non-owner from revoking permissions', async () => {
    await rbac.grantPermission(developerRole, 'github', 'read');

    const rbacAsAgent1 = rbac.connect(agent1);

    try {
      await rbacAsAgent1.revokePermission(developerRole, 'github', 'read');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should deny non-owner from emergency revoke', async () => {
    await rbac.registerAgent(agent1.address, developerRole);

    const rbacAsAgent1 = rbac.connect(agent1);

    try {
      await rbacAsAgent1.emergencyRevoke(agent2.address);
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should not allow permission for unregistered agent even if role has permission', async () => {
    // Grant permission to a role
    await rbac.grantPermission(developerRole, 'github', 'delete');

    // Agent2 is NOT registered, so should NOT have permission
    let hasPermission = await rbac.hasPermission(agent2.address, 'github', 'delete');
    expect(hasPermission).to.equal(false);

    // Even after registering agent2 with that role, need to verify
    await rbac.registerAgent(agent2.address, developerRole);
    hasPermission = await rbac.hasPermission(agent2.address, 'github', 'delete');
    expect(hasPermission).to.equal(true);
  });

  it('should allow different permissions for different tools', async () => {
    await rbac.registerAgent(agent1.address, developerRole);

    // Grant read permission for github only
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Grant different permissions for slack
    await rbac.grantPermission(developerRole, 'slack', 'create');

    // Verify tool-specific permissions
    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'github', 'create')).to.equal(false);
    expect(await rbac.hasPermission(agent1.address, 'slack', 'create')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'slack', 'read')).to.equal(false);
  });

  it('should allow different actions for same tool', async () => {
    await rbac.registerAgent(agent1.address, developerRole);

    // Grant multiple actions for github
    await rbac.grantPermission(developerRole, 'github', 'read');
    await rbac.grantPermission(developerRole, 'github', 'create');

    // Other actions should not be granted
    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'github', 'create')).to.equal(true);
    expect(await rbac.hasPermission(agent1.address, 'github', 'update')).to.equal(false);
    expect(await rbac.hasPermission(agent1.address, 'github', 'delete')).to.equal(false);
  });

  it('should isolate permissions between roles', async () => {
    // Register agents with different roles
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.registerAgent(agent2.address, adminRole);

    // Grant permission only to developer role
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Developer should have permission
    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);

    // Admin should NOT have permission (different role)
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(false);

    // Grant different permission to admin role
    await rbac.grantPermission(adminRole, 'github', 'admin');

    // Admin should have admin permission but not read
    expect(await rbac.hasPermission(agent2.address, 'github', 'admin')).to.equal(true);
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(false);
  });

  it('should allow re-granting already-granted permission', async () => {
    await rbac.registerAgent(agent1.address, developerRole);

    // Grant permission twice
    await rbac.grantPermission(developerRole, 'github', 'read');
    await rbac.grantPermission(developerRole, 'github', 'read');

    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);
  });

  it('should allow re-revoking already-revoked permission', async () => {
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Revoke twice
    await rbac.revokePermission(developerRole, 'github', 'read');
    await rbac.revokePermission(developerRole, 'github', 'read');

    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(false);
  });

  it('should handle agent without assigned role (default zero role)', async () => {
    // Agent2 has never been registered, so should have default role (bytes32(0))
    // No permissions should exist for that role
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(false);

    // Grant permission to a specific role
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Agent2 still should not have permission (different role)
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(false);
  });

  it('should reject registering agent with zero address', async () => {
    try {
      await rbac.registerAgent(ethers.ZeroAddress, developerRole);
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid agent address');
    }
  });

  it('should reject emergency revoke with zero address', async () => {
    try {
      await rbac.emergencyRevoke(ethers.ZeroAddress);
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid agent address');
    }
  });

  it('should reject granting permission with empty tool', async () => {
    try {
      await rbac.grantPermission(developerRole, '', 'read');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid tool');
    }
  });

  it('should reject granting permission with empty action', async () => {
    try {
      await rbac.grantPermission(developerRole, 'github', '');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid action');
    }
  });

  it('should reject revoking permission with empty tool', async () => {
    try {
      await rbac.revokePermission(developerRole, '', 'read');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid tool');
    }
  });

  it('should reject revoking permission with empty action', async () => {
    try {
      await rbac.revokePermission(developerRole, 'github', '');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid action');
    }
  });

  it('should verify hasPermission returns false for all inactive agents regardless of role', async () => {
    // Register multiple agents with same role
    await rbac.registerAgent(agent1.address, developerRole);
    await rbac.registerAgent(agent2.address, developerRole);
    await rbac.grantPermission(developerRole, 'github', 'read');

    // Both should have permission before revoke
    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(true);
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(true);

    // Revoke only agent1
    await rbac.emergencyRevoke(agent1.address);

    // agent1 should not have permission (inactive)
    expect(await rbac.hasPermission(agent1.address, 'github', 'read')).to.equal(false);

    // agent2 should still have permission (still active)
    expect(await rbac.hasPermission(agent2.address, 'github', 'read')).to.equal(true);
  });
});
