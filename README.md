# MICROFLUX-X1 | Enterprise Workflow Automation on Algorand

[![Network: Testnet](https://img.shields.io/badge/Algorand-Testnet-blue?style=for-the-badge&logo=algorand)](https://lora.algokit.io/testnet/application/758592157)
[![Smart Contract: ARC-4](https://img.shields.io/badge/Smart_Contract-ARC--4-green?style=for-the-badge&logo=python)](./projects/microflux-contracts)
[![Frontend: React & Vite](https://img.shields.io/badge/Frontend-React_Vite-61DAFB?style=for-the-badge&logo=react)](./projects/microflux-frontend)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](LICENSE)
# MICROFLUX
## Intelligent Workflow Orchestration for the Algorand Ecosystem

**MICROFLUX-X1** is a high-performance orchestration layer for the Algorand blockchain. It transforms complex off-chain logic into verifiable on-chain execution using a sophisticated hybrid engine that combines **Atomic Transaction Grouping** with **ARC-4 Smart Contracts**.
<div align="left">

[![Network: Testnet](https://img.shields.io/badge/Algorand-Testnet-000000?style=for-the-badge&logo=algorand&logoColor=white)](https://lora.algokit.io/testnet/application/758592157)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://microflux-frontend.vercel.app)
[![Protocol: ARC-4](https://img.shields.io/badge/Protocol-ARC--4-000000?style=for-the-badge&logo=python&logoColor=white)](./projects/microflux-contracts)
[![License: MIT](https://img.shields.io/badge/License-MIT-000000?style=for-the-badge)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

</div>

> MicroFlux is a premier orchestration layer designed for the Algorand blockchain, enabling the synthesis of complex financial workflows through a sophisticated, node-based interface.

**Official Deployment:** [https://microflux-frontend.vercel.app](https://microflux-frontend.vercel.app)

**Workflow QA:** Manual test steps for the DAO payroll, DeFi stop-loss, and GitHub bounty templates are in [docs/workflow-tests.md](./docs/workflow-tests.md).

**CORS:** The API allows browser origins from local dev (`http://localhost:5173`), listed Vercel apps, `CORS_ORIGINS`, and (unless `CORS_ALLOW_RENDER=0`) any `https://*.onrender.com`. Configure `CORS_ORIGINS` on Render if the frontend uses a host outside those patterns (for example a custom domain).

---

## 💎 The Vision
### Executive Vision

In a fragmented financial landscape, MICROFLUX-X1 serves as the "on-chain nervous system." It enables developers and enterprise users to build, simulate, and execute multi-step financial workflows—ranging from automated payroll splits to oracle-driven treasury management—with 100% cryptographic certainty and single-group atomicity.
In the landscape of modern decentralized finance, MicroFlux serves as a programmable middleware that bridges the precision of Algorand Layer 1 transactions with the practical requirements of enterprise data systems. The platform is engineered to translate high-level business intent into verifiable, atomic blockchain operations with absolute cryptographic certainty.

## 🏗️ Technical Architecture
---

### 1. The Hybrid Execution Engine
MICROFLUX-X1 offers three distinct execution paradigms to balance flexibility and security:
- **Atomic Execution (Default):** Groups L1 payments, ASA transfers, and App calls into a single atomic block (up to 16 transactions), ensuring "all-or-nothing" reliability.
- **Contract Execution:** Routes workflow metadata through a deployed `WorkflowExecutor` contract for permanent on-chain auditing and hash-based integrity verification.
- **Direct Execution:** Optimized for rapid, lightweight L1 interactions.
### Core Performance Pillars

### 2. Smart Contract Layer
The system is powered by the **WorkflowExecutor** contract (written in Algorand Python/algopy):
- **On-Chain Registry:** Records workflow hashes to prevent unauthorized modifications.
- **Execution Tracking:** Maintains a global counter and timestamp registry for enterprise auditing.
- **Verifiable Integrity:** Each execution is linked to a SHA-256 hash of the original workflow definition.
| Pillar | Technical Definition | Strategic Advantage |
| :--- | :--- | :--- |
| **Atomic Synchronization** | Built on Algorand Atomic Groups | Ensures synchronous failure or success across the entire logic chain. |
| **Hybrid Connectivity** | Real-time Web2/Web3 Bridge | Seamlessly exports blockchain state to Google Sheets and Telegram. |
| **Visual Architecture** | React Flow Logic Canvas | Provides a low-code environment for complex vault and treasury tasks. |
| **AI Synthesis** | LLM-Integrated Copilot | Converts natural language descriptions into valid on-chain execution paths. |

---

## 🚀 Deployment Details
### Technical Infrastructure

The protocol is fully operational and deployed on the **Algorand Testnet**.
MicroFlux is architected to prioritize security and interaction speed, utilizing a hybrid stack that spans from Python-based smart contracts to high-performance React interfaces.

- **Application ID:** `758592157`
- **Contract Address:** `FIJ5IPPVRGJKVYH6RI3EIE4OMUKKP7QSIORXT2Q4H5Q4ZEJHKDMCTXR2T4`
- **Creator Wallet:** `EKTG5HFLBQCKOK43C2ZE6NYYLLEYKIFDHA2DIPS4YKONP4MD7UYKBO7CXQ`
- **Explorer:** [View on Lora (AlgoKit)](https://lora.algokit.io/testnet/application/758592157)
**Blockchain Layer**
*   **Protocol:** Algorand L1 (Atomic Bundles, ASA Management)
*   **Smart Contracts:** ARC-4 ABI Compliant (Written in Algorand Python)
*   **Signer:** Native integration with Pera, Defly, and Lute wallets

**Infrastructure & Middleware**
*   **Middleware:** Node.js Express server with PostgreSQL integration
*   **Data Channels:** Bi-directional bridge for Google Sheets and Telegram Bots
*   **Intelligence:** Groq-hosted Large Language Models for workflow generation

---

## 🛠️ Tech Stack
### Network and Protocol Status

The MicroFlux protocol is live and operational on the Algorand Testnet. Auditing and verification data are provided below.

- **L1 Protocol:** Algorand (ASAs, Standard Payments, Atomic Groups)
- **L2 Contracts:** Puya Python (Pure Python to TEAL)
- **Frontend:** React 18, Vite, TypeScript
- **Wallet Integration:** `@txnlab/use-wallet` (Pera, Defly, Lute)
- **Intelligence:** Groq AI-powered Copilot for workflow generation
- **Oracle Data:** CoinGecko API integration for real-time valuation
| Parameter | Identifier |
| :--- | :--- |
| **Network** | Algorand Testnet |
| **Application ID** | 758592157 |
| **ABI Standard** | ARC-4 |
| **Contract Address** | FIJ5IPPVRGJKVYH6RI3EIE4OMUKKP7QSIORXT2Q4H5Q4ZEJHKDMCTXR2T4 |
| **Verification** | [View Protocol on Lora](https://lora.algokit.io/testnet/application/758592157) |

## 🚦 Getting Started
---

### Prerequisites
- Node.js v20+
- Python 3.12+ (for contract development)
- AlgoKit CLI
### Development Environment & Setup

### Installation
**1. Repository Initialization**
Clone the protocol repository:
```bash
# Clone the repository
git clone https://github.com/SomeshTalligeriDEV/microflux-arc.git
cd microflux-arc
```

# Install Frontend Dependencies
cd projects/microflux-frontend
**2. Backend Configuration & Execution**
The backend serves as the bridge for Web2 integrations and workflow logic.
```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Start Development Server
# Start the engine
npm run dev
```

### Configuration
Update `projects/microflux-frontend/.env`:
```env
VITE_APP_ID=758592157
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
```

---
**3. Frontend Configuration & Execution**
The visual workspace for building workflows.
```bash
# Navigate to the frontend directory
cd projects/microflux-frontend

## ⚡ Key Features
# Install dependencies
npm install

- **Visual Workflow Builder:** Drag-and-drop nodes to define complex logic.
- **AI Copilot:** Natural language to on-chain workflow generation.
- **Simulation Engine:** Real-time preview of execution logs and price impacts before signing.
- **Enterprise Marketplace:** Pre-configured templates for common DeFi and Treasury tasks.
- **Wallet-Native Signing:** Secure, non-custodial execution via industry-standard wallets.
# Launch the workspace
npm run dev
```

---

## ⚖️ License
### Open Source Contribution

Distributed under the MIT License. See `LICENSE` for more information.
MicroFlux is an open-initiative project. We welcome technical contributions aimed at expanding the library of integrated nodes or optimizing the transition between off-chain logic and on-chain execution.

**License**
Licensed under the MIT License. Produced for the Algorand Developer Ecosystem.

---

**Built for the Algorand Blockchain | Hackathon Winning Demo Grade**
**Professional Algorand Automation | Build. Verify. Execute.**

This paste expires in <1 hour. Public IP access. Share whatever you see with others in seconds with Context. Terms of ServiceReport this
