# System Design Document - Domain Copilot

## Part A: Target Enterprise Architecture (At Scale)

At enterprise production scale (>10M queries/month), Domain Copilot is architected as a resilient, distributed cloud-native platform:

1. **API Gateway & Managed Rate Limiting**: AWS API Gateway / Kong enforcing JWT validation, API key tiers, and distributed Token Bucket rate limiting.
2. **Secrets Manager**: AWS Secrets Manager / HashiCorp Vault with dynamic rotation of LLM provider credentials.
3. **Message Broker / Event Streaming**: Apache Kafka or RabbitMQ queuing ingestion jobs, asynchronous agent tasks, and audit logs.
4. **Caching Layer**: Distributed Redis Cluster caching frequently queried chunk embeddings and semantic similarity lookups.
5. **Managed Vector Database**: Dedicated Qdrant / Pinecone / AWS Aurora PostgreSQL with pgvector read replicas and autoscaling storage.
6. **Observability Stack**: OpenTelemetry collector exporting traces and spans to Datadog / Grafana Tempo, with Prometheus metrics and PagerDuty alerts.
7. **Disaster Recovery & Backup**: Multi-region active-passive replication with automated 15-minute point-in-time PostgreSQL recovery (PITR).

---

## Part B: Implemented Assessment MVP & Gap Analysis

The implemented MVP satisfies the complete P0 floor using Next.js 14 App Router, Node.js runtime, Clean Architecture, and PostgreSQL/pgvector.

### Target vs. Implemented Gap Analysis Table

| Component | Enterprise Target Architecture | Implemented Assessment MVP | Mitigation Strategy in MVP | Effort to Close | Est. Cloud Cost |
|:---|:---|:---|:---|:---|:---|
| **API Gateway** | AWS API Gateway / Kong with WAF | Next.js Middleware with CORS & Helmet | Route-level role & token validation | 3 Days | $45/mo |
| **Secrets** | AWS Secrets Manager / Vault | Externalized `.env` with strict gitignore | Pre-commit secret scanning (gitleaks) | 1 Day | $10/mo |
| **Job Queue** | Apache Kafka / AWS SQS | Asynchronous in-memory job state machine | Database-backed status & retry counts | 4 Days | $70/mo |
| **Vector DB** | Managed pgvector Aurora / Pinecone | Dockerized pgvector (pg16) / Embedded | Local IVFFlat cosine similarity | 2 Days | $120/mo |
| **Cache** | Redis Cluster with semantic cache | In-memory query & embedding memoization | LRU cache layer in adapter | 2 Days | $30/mo |
| **Observability** | OpenTelemetry + Datadog APM | Custom Correlation ID + Usage Ledger | End-to-end trace inspector in UI | 5 Days | $150/mo |
| **Total to Close** | | | | **17 Days** | **~$425/mo** |
