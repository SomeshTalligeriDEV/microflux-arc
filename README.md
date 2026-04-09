# MICROFLUX-X1 | Enterprise Workflow Automation on Algorand

[![Network: Testnet](https://img.shields.io/badge/Algorand-Testnet-blue?style=for-the-badge&logo=algorand)](https://lora.algokit.io/testnet/application/758592157)
[![Smart Contract: ARC-4](https://img.shields.io/badge/Smart_Contract-ARC--4-green?style=for-the-badge&logo=python)](./projects/microflux-contracts)
[![Frontend: React & Vite](https://img.shields.io/badge/Frontend-React_Vite-61DAFB?style=for-the-badge&logo=react)](./projects/microflux-frontend)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](LICENSE)

**MICROFLUX-X1** is a high-performance orchestration layer for the Algorand blockchain. It transforms complex off-chain logic into verifiable on-chain execution using a sophisticated hybrid engine that combines **Atomic Transaction Grouping** with **ARC-4 Smart Contracts**.

---

## 💎 The Vision

In a fragmented financial landscape, MICROFLUX-X1 serves as the "on-chain nervous system." It enables developers and enterprise users to build, simulate, and execute multi-step financial workflows—ranging from automated payroll splits to oracle-driven treasury management—with 100% cryptographic certainty and single-group atomicity.

## 🏗️ Technical Architecture

### 1. The Hybrid Execution Engine
MICROFLUX-X1 offers three distinct execution paradigms to balance flexibility and security:
- **Atomic Execution (Default):** Groups L1 payments, ASA transfers, and App calls into a single atomic block (up to 16 transactions), ensuring "all-or-nothing" reliability.
- **Contract Execution:** Routes workflow metadata through a deployed `WorkflowExecutor` contract for permanent on-chain auditing and hash-based integrity verification.
- **Direct Execution:** Optimized for rapid, lightweight L1 interactions.

### 2. Smart Contract Layer
The system is powered by the **WorkflowExecutor** contract (written in Algorand Python/algopy):
- **On-Chain Registry:** Records workflow hashes to prevent unauthorized modifications.
- **Execution Tracking:** Maintains a global counter and timestamp registry for enterprise auditing.
- **Verifiable Integrity:** Each execution is linked to a SHA-256 hash of the original workflow definition.

---

## 🚀 Deployment Details

The protocol is fully operational and deployed on the **Algorand Testnet**.

- **Application ID:** `758592157`
- **Contract Address:** `FIJ5IPPVRGJKVYH6RI3EIE4OMUKKP7QSIORXT2Q4H5Q4ZEJHKDMCTXR2T4`
- **Creator Wallet:** `EKTG5HFLBQCKOK43C2ZE6NYYLLEYKIFDHA2DIPS4YKONP4MD7UYKBO7CXQ`
- **Explorer:** [View on Lora (AlgoKit)](https://lora.algokit.io/testnet/application/758592157)

---

## 🛠️ Tech Stack

- **L1 Protocol:** Algorand (ASAs, Standard Payments, Atomic Groups)
- **L2 Contracts:** Puya Python (Pure Python to TEAL)
- **Frontend:** React 18, Vite, TypeScript
- **Wallet Integration:** `@txnlab/use-wallet` (Pera, Defly, Lute)
- **Intelligence:** Groq AI-powered Copilot for workflow generation
- **Oracle Data:** CoinGecko API integration for real-time valuation

## 🚦 Getting Started

### Prerequisites
- Node.js v20+
- Python 3.12+ (for contract development)
- AlgoKit CLI

### Installation
```bash
# Clone the repository
git clone https://github.com/SomeshTalligeriDEV/microflux-arc.git

# Install Frontend Dependencies
cd projects/microflux-frontend
npm install

# Start Development Server
npm run dev
```

### Configuration
Update `projects/microflux-frontend/.env`:
```env
VITE_APP_ID=758592157
VITE_ALGOD_SERVER=https://testnet-api.algonode.cloud
```

---

## ⚡ Key Features

- **Visual Workflow Builder:** Drag-and-drop nodes to define complex logic.
- **AI Copilot:** Natural language to on-chain workflow generation.
- **Simulation Engine:** Real-time preview of execution logs and price impacts before signing.
- **Enterprise Marketplace:** Pre-configured templates for common DeFi and Treasury tasks.
- **Wallet-Native Signing:** Secure, non-custodial execution via industry-standard wallets.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built for the Algorand Blockchain | Hackathon Winning Demo Grade**
