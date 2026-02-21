rm -rf /Users/nullfox/repos/zuul-proxy/ignition/deployments/chain-31337

pnpm contracts:build
pnpm contracts:dev


pnpm hardhat ignition deploy ignition/modules/Zuul.ts --network localhost
pnpm contracts:deploy:adi   

<save contract addresses to .env>
npx tsx scripts/register-agents.ts
pnpm dev
npx tsx scripts/get-test-account-keys.ts


  pnpm audit:search --help

  Search by agent address (encrypted):
  pnpm audit:search --agent 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

  Search by agent and decrypt:
  pnpm audit:search --agent 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --decrypt

  Search by time range (last 24 hours):
  pnpm audit:search --from 2024-01-20 --to 2024-01-21 --limit 50

  Search with specific time and decrypt:
  pnpm audit:search --from 2024-01-20T12:00:00 --to 2024-01-21T12:00:00 --decrypt

  Search on custom proxy:
  pnpm audit:search --agent 0x... --proxy-url http://prod-proxy:8080



  curl -X POST http://localhost:8080/admin/rbac/revoke \
    -H 'Content-Type: application/json' \
    -d '{"agent_address": "0xAfAcD4d602A2c870b58808316505eC0BE0bf5C5B"}'