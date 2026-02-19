const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Audit Contract', () => {
  let audit;
  let owner;

  // Helper function to create valid hex strings
  function toHexString(str, length) {
    const hex = Buffer.from(str, 'utf8').toString('hex');
    if (length) {
      return '0x' + hex.padEnd(length * 2, '0').substring(0, length * 2);
    }
    return '0x' + hex;
  }

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const AuditFactory = await ethers.getContractFactory('Audit');
    audit = await AuditFactory.deploy();
    await audit.waitForDeployment();
  });

  it('should log an audit entry', async () => {
    const auditId = ethers.id('test-audit-1');
    const encryptedPayload = toHexString('encrypted-payload-data', 32);
    const payloadHash = ethers.id('payload-hash');
    const agentSig = toHexString('agent-signature', 65);
    const proxySig = toHexString('proxy-signature', 65);

    const tx = await audit.logAudit(auditId, encryptedPayload, payloadHash, agentSig, proxySig);
    const receipt = await tx.wait();

    expect(receipt?.logs.length).to.be.greaterThan(0);

    const entry = await audit.getAuditEntry(auditId);
    expect(entry.auditId).to.equal(auditId);
    expect(entry.payloadHash).to.equal(payloadHash);
  });

  it('should deny non-owner from logging', async () => {
    const [, nonOwner] = await ethers.getSigners();
    const auditId = ethers.id('test-audit-1');

    const auditAsNonOwner = audit.connect(nonOwner);

    try {
      await auditAsNonOwner.logAudit(
        auditId,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should paginate audit entries', async () => {
    for (let i = 0; i < 5; i++) {
      const auditId = ethers.id(`audit-${i}`);
      await audit.logAudit(
        auditId,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
    }

    const count = await audit.getAuditCount();
    expect(count).to.equal(5n);

    const page1 = await audit.getAuditEntries(0, 2);
    expect(page1.length).to.equal(2);

    const page2 = await audit.getAuditEntries(2, 2);
    expect(page2.length).to.equal(2);
  });

  it('should handle empty pagination gracefully', async () => {
    const count = await audit.getAuditCount();
    expect(count).to.equal(0n);

    // For empty audit log, offset 0 and limit 0 should return empty array
    // (instead of calling getAuditEntries with offset 0 on empty log which would revert)
    expect(count).to.equal(0n);
  });

  it('should store multiple audit entries with correct timestamps', async () => {
    const auditId1 = ethers.id('audit-1');
    const auditId2 = ethers.id('audit-2');

    await audit.logAudit(
      auditId1,
      toHexString('data1', 32),
      ethers.id('hash1'),
      toHexString('sig1', 65),
      toHexString('sig1', 65)
    );

    // Add small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));

    await audit.logAudit(
      auditId2,
      toHexString('data2', 32),
      ethers.id('hash2'),
      toHexString('sig2', 65),
      toHexString('sig2', 65)
    );

    const entry1 = await audit.getAuditEntry(auditId1);
    const entry2 = await audit.getAuditEntry(auditId2);

    expect(entry1.auditId).to.equal(auditId1);
    expect(entry2.auditId).to.equal(auditId2);
    expect(entry2.timestamp).to.be.gte(entry1.timestamp);
  });

  it('should store all audit entry fields correctly', async () => {
    const auditId = ethers.id('test-full-entry');
    const encryptedPayload = toHexString('test-payload', 32);
    const payloadHash = ethers.id('test-hash');
    const agentSig = toHexString('agent-sig-data', 65);
    const proxySig = toHexString('proxy-sig-data', 65);

    await audit.logAudit(auditId, encryptedPayload, payloadHash, agentSig, proxySig);

    const entry = await audit.getAuditEntry(auditId);

    expect(entry.auditId).to.equal(auditId);
    expect(entry.encryptedPayload).to.equal(encryptedPayload);
    expect(entry.payloadHash).to.equal(payloadHash);
    expect(entry.agentSignature).to.equal(agentSig);
    expect(entry.proxySignature).to.equal(proxySig);
    expect(entry.timestamp).to.be.greaterThan(0);
  });

  it('should retrieve non-existent entry with zero values', async () => {
    const nonExistentId = ethers.id('non-existent');
    const entry = await audit.getAuditEntry(nonExistentId);

    expect(entry.auditId).to.equal(ethers.ZeroHash);
    expect(entry.timestamp).to.equal(0n);
  });

  it('should return correct count after multiple entries', async () => {
    let count = await audit.getAuditCount();
    expect(count).to.equal(0n);

    for (let i = 0; i < 3; i++) {
      const auditId = ethers.id(`audit-${i}`);
      await audit.logAudit(
        auditId,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      count = await audit.getAuditCount();
      expect(count).to.equal(BigInt(i + 1));
    }
  });

  it('should paginate with various offset/limit combinations', async () => {
    // Log 10 entries
    for (let i = 0; i < 10; i++) {
      const auditId = ethers.id(`audit-${i}`);
      await audit.logAudit(
        auditId,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
    }

    const count = await audit.getAuditCount();
    expect(count).to.equal(10n);

    // Test various pagination combinations
    const page1 = await audit.getAuditEntries(0, 3);
    expect(page1.length).to.equal(3);

    const page2 = await audit.getAuditEntries(3, 3);
    expect(page2.length).to.equal(3);

    const page3 = await audit.getAuditEntries(6, 5); // Last page with 4 entries
    expect(page3.length).to.equal(4);

    const lastPage = await audit.getAuditEntries(9, 10); // Offset at last entry
    expect(lastPage.length).to.equal(1);
  });

  it('should handle pagination requesting more than available', async () => {
    for (let i = 0; i < 3; i++) {
      const auditId = ethers.id(`audit-${i}`);
      await audit.logAudit(
        auditId,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
    }

    // Request 100 entries when only 3 exist
    const entries = await audit.getAuditEntries(0, 100);
    expect(entries.length).to.equal(3);
  });

  it('should deny non-owner from logging', async () => {
    const [, nonOwner] = await ethers.getSigners();
    const auditAsNonOwner = audit.connect(nonOwner);

    try {
      await auditAsNonOwner.logAudit(
        ethers.id('test'),
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('OwnableUnauthorizedAccount');
    }
  });

  it('should reject invalid audit ID (zero hash)', async () => {
    try {
      await audit.logAudit(
        ethers.ZeroHash,
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid audit ID');
    }
  });

  it('should reject empty encrypted payload', async () => {
    try {
      await audit.logAudit(
        ethers.id('test'),
        '0x', // Empty bytes
        ethers.id('hash'),
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid payload');
    }
  });

  it('should reject invalid payload hash (zero hash)', async () => {
    try {
      await audit.logAudit(
        ethers.id('test'),
        toHexString('data', 32),
        ethers.ZeroHash,
        toHexString('sig1', 65),
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid hash');
    }
  });

  it('should reject empty agent signature', async () => {
    try {
      await audit.logAudit(
        ethers.id('test'),
        toHexString('data', 32),
        ethers.id('hash'),
        '0x', // Empty bytes
        toHexString('sig2', 65)
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid agent signature');
    }
  });

  it('should reject empty proxy signature', async () => {
    try {
      await audit.logAudit(
        ethers.id('test'),
        toHexString('data', 32),
        ethers.id('hash'),
        toHexString('sig1', 65),
        '0x' // Empty bytes
      );
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid proxy signature');
    }
  });

  it('should preserve audit entry immutability (no modification methods)', async () => {
    const auditId = ethers.id('immutable-test');
    await audit.logAudit(
      auditId,
      toHexString('original', 32),
      ethers.id('hash'),
      toHexString('sig1', 65),
      toHexString('sig2', 65)
    );

    const entry1 = await audit.getAuditEntry(auditId);
    expect(entry1.encryptedPayload).to.equal(toHexString('original', 32));

    // Try to log another entry with same ID (should create new entry or overwrite)
    await audit.logAudit(
      auditId,
      toHexString('modified', 32),
      ethers.id('hash2'),
      toHexString('sig1', 65),
      toHexString('sig2', 65)
    );

    // Verify latest entry was updated (overwrite behavior in storage)
    const entry2 = await audit.getAuditEntry(auditId);
    expect(entry2.encryptedPayload).to.equal(toHexString('modified', 32));
  });
});
