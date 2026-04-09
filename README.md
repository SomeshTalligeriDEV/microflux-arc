# MICROFLUX-X1

**AI-Powered Visual Workflow Builder for Algorand**

MICROFLUX-X1 is the first visual workflow automation platform built natively on the Algorand blockchain. Design workflows with drag-and-drop, let AI generate them from natural language, and execute them on-chain via wallet signing — all from your browser.

---

## ⚡ Key Features

| Feature | Status | Details |
|---------|--------|---------|
| **Visual Workflow Builder** | ✅ Live | Drag-and-drop canvas with 16 node types |
| **AI Copilot** | ✅ Live | Groq API — natural language → workflow JSON |
| **Wallet Integration** | ✅ Live | Pera, Defly, Lute wallets |
| **On-Chain Payments** | ✅ Live | Native ALGO transfers via algosdk |
| **ASA Transfers** | ✅ Live | Algorand Standard Asset support |
| **Smart Contract** | ✅ Live | WorkflowExecutor (ARC-4) deployed on Testnet |
| **Atomic Groups** | ✅ Live | Payments + ASA + App Call in one atomic group |
| **Market Data** | ✅ Live | CoinGecko real-time pricing |
| **Template Marketplace** | ✅ Live | 6 pre-built workflow templates |

---

## 🏗️ Architecture

```
microflux/
├── projects/
│   ├── microflux-contracts/        ← Algorand Python smart contract
│   │   └── smart_contracts/
│   │       └── executor/
│   │           ├── contract.py     ← WorkflowExecutor (ARC-4)
│   │           └── deploy-config.ts
│   │
│   └── microflux-frontend/         ← React + Vite frontend
│       └── src/
│           ├── services/
│           │   ├── contractService.ts   ← App call + atomic groups
│           │   ├── walletService.ts     ← Algod + transaction signing
│           │   ├── aiService.ts         ← Groq AI integration
│           │   ├── marketService.ts     ← CoinGecko prices
│           │   └── nodeDefinitions.ts   ← 16 workflow node types
│           └── components/
│               ├── WorkflowBuilder.tsx  ← Canvas + hybrid execution
│               ├── ConnectWallet.tsx    ← Wallet connection modal
│               └── ...
│
└── server/                          ← Express.js backend
    └── src/
        └── core/
            ├── engine/              ← Algorand + Folks Router
            └── integrations/        ← CoinGecko + Telegram
```

---

## 🚀 On-Chain Execution

MICROFLUX-X1 supports **three execution modes**:

### Mode 1: Direct Execution (⚡)
Individual L1 transactions signed one-by-one.
- Each `send_payment` / `asa_transfer` / `app_call` node creates its own transaction
- Signed via Pera/Defly/Lute wallet
- Fastest for simple workflows

### Mode 2: Contract Execution (📱)
Execute via the **WorkflowExecutor** smart contract.
- Workflow is hashed (SHA-256) and recorded on-chain
- `execute(workflow_hash)` called on the deployed contract
- Provides **verifiability** — execution is provable on-chain
- Contract tracks execution count and timestamps

### Mode 3: Atomic Groups (⛓)
**All transactions grouped atomically** — the key differentiator.
- Payments + ASA transfers + App call combined in one atomic group
- `algosdk.assignGroupID()` ensures all-or-nothing execution
- Single wallet signature for the entire group
- Most powerful mode for complex workflows

### WorkflowExecutor Smart Contract

```python
class WorkflowExecutor(ARC4Contract):
    def register_workflow(self, workflow_hash: String) -> String
    def execute(self, workflow_hash: String) -> String
    def get_execution_count(self) -> UInt64
    def verify_hash(self, workflow_hash: String) -> UInt64
    def set_public_execution(self, enabled: UInt64) -> String
```

**Global State:**
- `total_executions` — lifetime execution counter
- `workflow_count` — registered workflow count
- `last_workflow_hash` — most recent workflow hash
- `last_execution_time` — timestamp of last execution
- `public_execution` — toggle for public/creator-only access

---

## 📋 Setup

### Prerequisites
- [AlgoKit](https://github.com/algorandfoundation/algokit-cli) installed
- Node.js 18+
- Python 3.12+

### 1. Install dependencies
```bash
algokit project bootstrap all
```

### 2. Deploy the smart contract
```bash
cd projects/microflux-contracts
algokit project run build
algokit project run deploy
```

Copy the output App ID to your frontend:
```bash
# In projects/microflux-frontend/.env
VITE_APP_ID=<your_app_id>
```

### 3. Run the frontend
```bash
cd projects/microflux-frontend
npm run dev
```

### 4. Connect your wallet
1. Open http://localhost:5173
2. Click **CONNECT WALLET**
3. Select Pera / Defly / Lute
4. Your Testnet balance appears in the navbar

### 5. Execute a workflow
1. Navigate to **Builder**
2. Drag nodes from the palette
3. Connect them with edges
4. Choose execution mode (Direct / Contract / Atomic)
5. Click **EXECUTE ON-CHAIN**
6. Approve the transaction in your wallet
7. View the TX on the explorer

---

## 🔐 Environment Variables

```env
# Algorand Testnet
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
VITE_ALGOD_NETWORK=testnet

# WorkflowExecutor App ID (set after deployment)
VITE_APP_ID=0
```

---

## 🛡️ Security

- **No private keys stored** — all signing through wallet providers
- **AI is assistive only** — never executes transactions
- **Workflow hashing** — SHA-256 integrity verification on-chain
- **Creator-only access** — contract restricts execution by default

---

## 🏆 Hackathon Demo Flow

1. **Open MICROFLUX-X1** → Show the landing page
2. **Connect Pera Wallet** → Balance loads from Testnet
3. **Create workflow** → Drag Payment + ASA nodes
4. **Switch to Contract mode** → Show App ID
5. **Execute via smart contract** → Wallet signs, confirms on-chain
6. **Show explorer** → TX and App visible on Lora
7. **Say:** *"This is now verifiable on-chain"*

---

## 📁 Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Algorand Python (algopy), ARC-4 |
| Frontend | React + TypeScript + Vite |
| Wallet | @txnlab/use-wallet (Pera, Defly, Lute) |
| AI | Groq API (llama-3.3-70b-versatile) |
| Market Data | CoinGecko API |
| Backend | Express.js + algosdk |
| DEX | Folks Router API |
| Design | ICME-inspired dark mode |

---

## License

MIT
