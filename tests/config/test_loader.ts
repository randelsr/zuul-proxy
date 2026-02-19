import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import type { FileReader } from '../../src/config/loader.js';

describe('Config Loader', () => {
  beforeEach(() => {
    // Set required env vars for tests
    process.env.GITHUB_API_KEY = 'ghp_test123';
    process.env.SLACK_API_KEY = 'xoxb_test456';
    process.env.OPENAI_API_KEY = 'sk_test789';
    process.env.HEDERA_RPC_URL = 'https://testnet.hashio.io/api';
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.GITHUB_API_KEY;
    delete process.env.SLACK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.HEDERA_RPC_URL;
  });

  it('should load valid config.yaml', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
    endpoints:
      - path: /repos/{owner}/{repo}/issues
        methods: [GET, POST]
        description: Manage issues

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read, create]

chain:
  name: hedera
  chainId: 295
  rpcUrl: https://testnet.hashio.io/api

cache:
  ttlSeconds: 300

server:
  port: 8080
  host: 0.0.0.0
  readTimeoutMs: 30000
  writeTimeoutMs: 60000
`;

    const mockFileReader: FileReader = async () => configContent;

    const config = await loadConfig('config.yaml', mockFileReader);

    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].key).toBe('github');
    expect(config.tools[0].baseUrl).toBe('https://api.github.com');
    expect(config.tools[0].keyRef).toBe('GITHUB_API_KEY');
    expect(config.roles).toHaveLength(1);
    expect(config.roles[0].id).toBe('developer');
    expect(config.chain.chainId).toBe(295);
    expect(config.chain.name).toBe('hedera');
    expect(config.cache.ttlSeconds).toBe(300);
    expect(config.server.port).toBe(8080);
  });

  it('should fail on missing environment variable', async () => {
    delete process.env.MISSING_API_KEY;

    const configContent = `tools:
  - key: missing
    description: Missing Tool
    baseUrl: https://api.example.com
    keyRef: MISSING_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: missing
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(
      /Environment variable MISSING_API_KEY not found/
    );
  });

  it('should fail on invalid base URL', async () => {
    const configContent = `tools:
  - key: bad
    description: Bad Tool
    baseUrl: not-a-valid-url
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: bad
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(/Invalid base URL/);
  });

  it('should fail on invalid RPC URL', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: not-a-valid-url
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(/Invalid RPC URL/);
  });

  it('should fail on missing required tool', async () => {
    const configContent = `tools: []

roles:
  - id: developer
    name: Developer
    permissions: []

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(
      /At least one tool required/
    );
  });

  it('should fail on missing required role', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles: []

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow(
      /At least one role required/
    );
  });

  it('should substitute environment variables in config', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read]

chain:
  name: hedera
  chainId: 295
  rpcUrl: \${HEDERA_RPC_URL}
`;

    const mockFileReader: FileReader = async () => configContent;

    const config = await loadConfig('config.yaml', mockFileReader);

    expect(config.chain.rpcUrl).toBe('https://testnet.hashio.io/api');
  });

  it('should use default values for optional fields', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    const config = await loadConfig('config.yaml', mockFileReader);

    expect(config.cache.ttlSeconds).toBe(300);
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.readTimeoutMs).toBe(30000);
    expect(config.server.writeTimeoutMs).toBe(60000);
  });

  it('should handle multiple tools and roles', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY
  - key: slack
    description: Slack API
    baseUrl: https://slack.com/api
    keyRef: SLACK_API_KEY
  - key: openai
    description: OpenAI API
    baseUrl: https://api.openai.com/v1
    keyRef: OPENAI_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read, create]
      - tool: slack
        actions: [read]
  - id: admin
    name: Administrator
    permissions:
      - tool: github
        actions: [read, create, update, delete]
      - tool: slack
        actions: [read, create]
      - tool: openai
        actions: [read, create]

chain:
  name: hedera
  chainId: 295
  rpcUrl: \${HEDERA_RPC_URL}
`;

    const mockFileReader: FileReader = async () => configContent;

    const config = await loadConfig('config.yaml', mockFileReader);

    expect(config.tools).toHaveLength(3);
    expect(config.roles).toHaveLength(2);
    expect(config.roles[0].permissions).toHaveLength(2);
    expect(config.roles[1].permissions).toHaveLength(3);
  });

  it('should fail on invalid chainId type', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read]

chain:
  name: local
  chainId: "not-a-number"
  rpcUrl: http://localhost:8545
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow();
  });

  it('should fail on invalid port number', async () => {
    const configContent = `tools:
  - key: github
    description: GitHub API
    baseUrl: https://api.github.com
    keyRef: GITHUB_API_KEY

roles:
  - id: developer
    name: Developer
    permissions:
      - tool: github
        actions: [read]

chain:
  name: local
  chainId: 31337
  rpcUrl: http://localhost:8545

server:
  port: 99999
  host: 0.0.0.0
  readTimeoutMs: 30000
  writeTimeoutMs: 60000
`;

    const mockFileReader: FileReader = async () => configContent;

    await expect(loadConfig('config.yaml', mockFileReader)).rejects.toThrow();
  });
});
