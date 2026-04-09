# MICROFLUX-X1

> **AI-Powered Visual Workflow Builder for Algorand Blockchain**

Build, simulate, and execute on-chain workflows with drag-and-drop. AI-assisted. Production-ready.

---

## Features

### 🔧 Visual Workflow Builder
- Drag-and-drop node-based workflow canvas
- 16+ node types across 5 categories
- Real-time connection drawing between nodes
- Node property editing with configuration panels
- Workflow simulation with step-by-step execution logs
- USD value estimation for transactions

### 🤖 AI Copilot (Groq-Powered)
- Natural language → workflow generation
- Converts plain English descriptions to structured workflows
- Schema-validated AI output (never executes directly)
- Preset prompt templates for common workflows
- Workflow explanation in human-readable format
- Rate-limited API calls for safety

### 🏪 Template Marketplace
- 6 pre-built workflow templates
- Categories: Payments, Treasury, Trading, Automation
- Mini-graph preview for each template
- One-click template loading into canvas
- Search and filter functionality
- Difficulty rating and gas estimation

### 📊 Market Data (CoinGecko)
- Real-time ALGO/USD price feeds
- Multi-token price tracking (BTC, ETH, USDC)
- Transaction value calculator (ALGO → USD)
- Cached responses (45s TTL) to avoid rate limits
- Auto-refresh price data

### 📦 Node Categories

| Category | Nodes | Type |
|----------|-------|------|
| **Triggers** | Timer Loop, Wallet Event, Webhook | Mock (UI) |
| **Actions** | Send Payment, ASA Transfer, App Call, HTTP Request | Real / Mock |
| **Logic** | Delay, Filter/Condition, Debug Log | Mock |
| **DeFi/Data** | Get Quote, Price Feed | Mock |
| **Notifications** | Browser (real), Telegram, Discord | Real / Mock |

---

## Architecture

```
src/
├── services/
│   ├── aiService.ts          # Groq AI integration
│   ├── marketService.ts      # CoinGecko price data
│   ├── templateService.ts    # Workflow templates
│   └── nodeDefinitions.ts    # Node type registry
├── components/
│   ├── Navbar.tsx             # Navigation bar
│   ├── HeroSection.tsx        # Landing page hero
│   ├── WorkflowBuilder.tsx    # Canvas + sidebar
│   ├── AICopilotPanel.tsx     # AI prompt interface
│   ├── AIPage.tsx             # AI copilot full page
│   ├── Marketplace.tsx        # Template marketplace
│   ├── MarketDataPanel.tsx    # Market data page
│   ├── ConnectWallet.tsx      # Wallet connection modal
│   ├── Account.tsx            # Account display
│   └── ErrorBoundary.tsx      # Error handling
├── Home.tsx                   # App router / state
├── App.tsx                    # Wallet provider
└── styles/
    └── App.css                # Design system
```

---

## Setup

### Prerequisites
- Node.js >= 20.0
- npm >= 9.0
- Docker (for LocalNet)
- [AlgoKit CLI](https://github.com/algorandfoundation/algokit-cli)

### Installation

```bash
# Clone and navigate
cd microflux/projects/microflux-frontend

# Install dependencies
npm install

# Configure environment
cp .env.template .env
# Edit .env with your network settings

# Start development server
npm run dev
```

### API Keys (Optional)
- **Groq API**: Get free key at [console.groq.com](https://console.groq.com) — for AI Copilot
- **CoinGecko**: Public API, no key needed — for market data

---

## Demo Scenarios

### Demo 1: Manual Workflow
1. Navigate to **Builder**
2. Add nodes from palette (Send Payment, Debug Log)
3. Connect nodes via ports
4. Configure node properties
5. Click **Simulate** → Execute

### Demo 2: Template Workflow
1. Go to **Marketplace**
2. Browse templates (e.g., "Treasury Distribution")
3. Click **Use Template**
4. Review loaded workflow
5. Simulate or execute

### Demo 3: AI-Generated Workflow ⚡
1. Go to **AI Copilot**
2. Enter Groq API key
3. Type: *"Send 1 ALGO to address X"*
4. AI generates workflow with nodes + connections
5. Click **Load into Canvas**
6. Simulate → Execute

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Blockchain**: Algorand SDK + AlgoKit Utils
- **AI**: Groq API (Llama 3.3 70B)
- **Market Data**: CoinGecko Public API
- **Wallets**: Defly, Pera, Exodus, KMD (LocalNet)
- **Design**: Custom CSS Design System (ICME-inspired dark theme)

---

## License

MIT
