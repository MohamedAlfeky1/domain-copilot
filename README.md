# Domain Copilot: Agentic RAG Platform

Domain Copilot is an agentic RAG application for bilingual Arabic and English healthcare guidance.

It combines document retrieval, specialized AI agents, safety checks, human approval for valid consequential actions, and persistent conversations. You can run it with Docker, develop it locally with Node.js, use cloud or local AI providers, and run the included evaluation and security tests.

## Table of Contents

- [What Is Domain Copilot?](#what-is-domain-copilot)
- [Quick Start](#quick-start)
  - [Option 1: Docker Compose](#option-1-docker-compose)
  - [Option 2: Node.js](#option-2-nodejs)
  - [Corpus Size](#corpus-size)
- [Choose Your Setup](#choose-your-setup)
- [Demo Accounts](#demo-accounts)
- [AI Models and Providers](#ai-models-and-providers)
  - [OpenAI](#openai)
  - [OpenRouter](#openrouter)
  - [Ollama](#ollama)
  - [Offline Mock Adapter](#offline-mock-adapter)
  - [Embeddings](#embeddings)
- [What You Can Try](#what-you-can-try)
- [Key API Endpoints](#key-api-endpoints)
- [Verification and Evaluation](#verification-and-evaluation)
- [Assessment Variant](#assessment-variant)
- [Video Deliverables](#video-deliverables)
- [Project Documentation](#project-documentation)

## What Is Domain Copilot?

Domain Copilot is a healthcare-focused AI application built around Retrieval-Augmented Generation (RAG).

At a high level, the application provides:

| Capability | What it does |
|---|---|
| **Clinical RAG** | Retrieves relevant content from the indexed healthcare corpus before generating an answer |
| **Hybrid Retrieval** | Combines semantic and keyword-based retrieval |
| **Multi-Agent Workflow** | Uses specialized agents and tools for different parts of the workflow |
| **Arabic + English** | Supports bilingual queries and RTL presentation for Arabic |
| **Safety and Refusal** | Refuses unsafe, unsupported, or out-of-bounds requests |
| **Human Approval** | Valid consequential protocol updates can pause for human approval before execution |
| **Persistent Chat** | Stores conversations and messages for multi-turn use |

The active assessment configuration is:

- **Domain D0:** Healthcare — Clinical Protocols & Patient Safety
- **Twist T1:** Bilingual Arabic + English — Cross-Lingual RAG & RTL

## Quick Start

There are two simple ways to run the project.

### Option 1: Docker Compose

Use Docker when you want to start the application and its environment with minimal manual setup.

#### 1. Clone the repository

```bash
git clone <repo-url>
cd domain-copilot
```

#### 2. Create the environment file

```bash
cp .env.example .env
```

Add the required values to `.env` for the AI provider you want to use.

#### 3. Start the application

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

Verify container health and readiness:
- Health check: `http://localhost:3000/healthz`
- Readiness check: `http://localhost:3000/readyz`

You can now use the web application.

### Option 2: Node.js

Use the Node.js setup when you want to develop, debug, inspect, or run the evaluation workflow directly.

#### 1. Install dependencies

```bash
npm install
```

#### 2. Seed the baseline corpus

```bash
npm run seed:corpus
```

This creates the default quickstart corpus.

#### 3. Verify the corpus

```bash
npm run test:corpus
```

#### 4. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Corpus Size

The project uses two corpus sizes for different purposes:

| Corpus | Size | Purpose |
|---|---:|---|
| **Baseline seed** | 32 documents / 197 pages | Quickstart and local student/demo setup |
| **Evaluation corpus** | 41 documents / 243 pages / 622 chunks | Benchmark and evaluation workflow |

The quickstart does not need the full evaluation corpus just to get the application running.

## Choose Your Setup

| You want to... | Use |
|---|---|
| Run the application quickly | **Docker Compose** |
| Develop or debug the project | **Node.js** |
| Use a local AI model | **Ollama** |
| Run offline tests without external AI services | **Mock Adapter** |
| Run the evaluation workflow | **Node.js + evaluation commands** |

## Demo Accounts

The repository includes seeded accounts for testing server-side RBAC.

| Email | Password | Role | Main Use |
|---|---|---|---|
| `admin@domaincopilot.ai` | `admin123` | **ADMIN** | Corpus management and system settings |
| `approver@domaincopilot.ai` | `approver123` | **APPROVER** | HITL review and approvals |
| `expert@domaincopilot.ai` | `expert123` | **EXPERT** | Copilot queries and run traces |
| `viewer@domaincopilot.ai` | `viewer123` | **VIEWER** | Read-only inspection |

For a normal Copilot demo, the **EXPERT** account is sufficient.

To test the approval workflow, use the **APPROVER** account.

## AI Models and Providers

The AI backend is provider-based, so the application can switch between supported providers without changing the main workflow.

| Provider | Main Use | Models / Configuration |
|---|---|---|
| **OpenAI** | Cloud completions and embeddings | `gpt-4o`, `text-embedding-3-small` |
| **OpenRouter** | Multi-model cloud provider | Example: `google/gemma-4-31b-it:free` |
| **Ollama** | Local / on-premise generation | `llama3.2`, `qwen2.5` |
| **Mock Adapter** | Offline development and testing | Deterministic local behavior |

### OpenAI

The documented OpenAI configuration uses:

- **Completion model:** `gpt-4o`
- **Embedding model:** `text-embedding-3-small`
- **Embedding size:** 1536 dimensions

### OpenRouter

The project supports an OpenRouter provider for routing requests to available models.

Example model referenced by the project:

```text
google/gemma-4-31b-it:free
```

### Ollama

Ollama provides a local option when you do not want generation to depend on a hosted model provider.

Example configuration:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=...
```

Example local models:

```text
llama3.2
qwen2.5
```

### Offline Mock Adapter

A deterministic mock provider is available for tests and offline development.

It is useful when you want to exercise the application flow without depending on external AI credentials or internet access.

### Embeddings

The implementation supports a 1536-dimensional vector space, including:

- `models/gemini-embedding-001`
- `text-embedding-3-small`

Embeddings are stored in PostgreSQL using `pgvector`.

## What You Can Try

Once the application is running, the main workflows to explore are:

### 1. Ask a Clinical Question

Ask a question related to the indexed healthcare knowledge and inspect the retrieved evidence and citations.

### 2. Try Arabic

Ask a clinical question in Arabic and verify the bilingual response and RTL presentation.

### 3. Try a Refusal

Send an unrelated or unsupported request and observe the dedicated refusal behavior instead of a normal grounded answer.

### 4. Try Human Approval

Submit a valid consequential protocol update and observe the approval step before execution.

Unsafe or out-of-bounds consequential requests are refused before an approval request is created.

### 5. Continue a Conversation

Open a conversation, send multiple messages, and verify that the conversation history is preserved.

## Key API Endpoints

### Conversations

```text
POST /api/conversations/[id]/messages
```

Primary interactive Copilot endpoint. Handles the conversation request and supports the streaming experience.

```text
GET /api/conversations
```

Lists the authenticated user's conversations.

```text
POST /api/conversations
```

Creates a new conversation.

```text
DELETE /api/conversations/[id]
```

Deletes a conversation and its associated messages.

### Evaluation

```text
POST /api/queries
```

Stateless API used by evaluation and regression workflows.

### Human Approval

```text
GET /api/approvals
```

Returns the pending approval queue for authorized reviewers.

```text
POST /api/approvals/[id]/approve
```

Approves a valid pending consequential action.

```text
POST /api/approvals/[id]/reject
```

Rejects a pending action with a required justification.

## Verification and Evaluation

The repository includes checks for architecture, unit tests, authentication, integration, retrieval, security, corpus size, and benchmark evaluation.

### Run the main verification suites

```bash
# Architecture boundary checks
npm run lint:arch

# Unit tests
npm run test:unit

# Authentication and RBAC
npm run test:auth

# Integration tests
npm run test:integration

# Retrieval tests
npm run test:retrieval

# Security / prompt-injection regression tests
npm run test:security

# Corpus validation
npm run test:corpus
```

### Run the evaluation workflow

```bash
# Golden benchmark
npm run eval

# Twist evaluation slice
npm run eval:twist

# Generate evaluation report
npm run eval:report
```

### Current Evaluation Snapshot

The documented benchmark currently reports:

| Metric | Result |
|---|---:|
| Evaluation cases | **33** |
| Passed | **30 / 33** |
| Pass rate | **90.9%** |
| English Recall@5 | **87.5%** |
| Arabic Recall@5 | **87.5%** |
| Groundedness | **93.8%** |
| Refusal Precision | **100% (7/7)** |
| Evaluation cost | **$0.09352** |

## Assessment Variant

The active variant is configured in:

```text
src/config/variant.config.ts
```

### Current configuration

- **D0:** Healthcare — Clinical Protocols & Patient Safety
- **T1:** Bilingual Arabic + English — Cross-Lingual RAG & RTL

The project also includes a deterministic side-effect risk guard:

```text
ITwistPort.evaluateRiskGuard
```

The application expects a configured active variant rather than placeholder values such as `D<n>`.

## Video Deliverables

The repository contains the scripts and supporting material for the required videos.

### Product Demonstration

**VIDEO-001:** 5–8 minute product demonstration

See:

[`teaching/video-demo-script.md`](teaching/video-demo-script.md)

### Technical Teaching Video

**VIDEO-002:** approximately 10 minutes

See:

[`teaching/video-teaching-script.md`](teaching/video-teaching-script.md)

## Project Documentation

### Requirements and Architecture

- [`Business Requirements Document (BRD)`](docs/BRD.md)
- [`System Design & Gap Analysis`](docs/SYSTEM-DESIGN.md)
- [`System Architecture & C4 Diagrams`](docs/ARCHITECTURE.md)
- [`Security & OWASP Threat Controls`](docs/SECURITY.md)
- [`Empirical Evaluation Benchmark`](docs/EVALUATION.md)

### Development and Teaching

- [`Agentic Coding Workflow`](docs/AGENTIC-WORKFLOW.md)
- [`AI Usage Log`](docs/AI-USAGE-LOG.md)
- [`Architecture Decision Records`](docs/adr/)
- [`Teaching Pack`](teaching/)
- [`Teaching Assessment Map`](teaching/assessment-map.md)

## Notes

For the fastest first run, use **Docker Compose**.

For development and evaluation, use the **Node.js** workflow.

For local AI generation, use **Ollama**.

For offline development and tests, use the **Mock Adapter**.
