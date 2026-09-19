/**
 * DOMAIN COPILOT - OPENAPI 3.1 SPECIFICATION & INTERACTIVE DOCS (DEV-004)
 * Generates complete OpenAPI 3.1 contract and serves interactive Swagger / Scalar UI.
 * Covers 100% of MVP endpoints, schemas, auth mechanisms, and streaming contracts.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openApiSpecification = {
  openapi: "3.1.0",
  info: {
    title: "Domain Copilot - Agentic RAG Platform API",
    version: "1.0.0",
    description:
      "Enterprise Agentic RAG platform with hybrid dense-keyword retrieval, multi-agent orchestration, Human-in-the-Loop governance, and deterministic Twist risk guards.",
    contact: {
      name: "Domain Copilot Engineering",
      email: "support@domaincopilot.ai",
    },
    license: {
      name: "MIT",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local Development Server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT session token obtained via /api/auth/login",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "dc_token",
        description: "HTTP-only session cookie",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["ADMIN", "APPROVER", "EXPERT", "VIEWER"] },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "role", "status"],
      },
      Conversation: {
        type: "object",
        properties: {
          id: { type: "string" },
          ownerId: { type: "string" },
          title: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "ownerId", "title", "createdAt", "updatedAt"],
      },
      Message: {
        type: "object",
        properties: {
          id: { type: "string" },
          conversationId: { type: "string" },
          runId: { type: "string", nullable: true },
          role: { type: "string", enum: ["user", "assistant"] },
          content: { type: "string" },
          citations: {
            type: "array",
            items: { $ref: "#/components/schemas/Citation" },
            nullable: true,
          },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "conversationId", "role", "content", "createdAt"],
      },
      Document: {
        type: "object",
        properties: {
          id: { type: "string" },
          source: { type: "string" },
          name: { type: "string" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
          contentHash: { type: "string" },
          status: { type: "string", enum: ["STAGED", "EXTRACTED", "CHUNKED", "EMBEDDED", "INDEXED", "FAILED"] },
          currentVersionId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "source", "name", "mimeType", "status"],
      },
      Citation: {
        type: "object",
        properties: {
          id: { type: "string" },
          chunkId: { type: "string" },
          documentId: { type: "string" },
          documentName: { type: "string" },
          version: { type: "integer" },
          page: { type: "integer" },
          section: { type: "string" },
          clause: { type: "string" },
          snippet: { type: "string" },
          relevanceScore: { type: "number" },
        },
        required: ["id", "chunkId", "documentName", "snippet"],
      },
      QueryRequest: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 2 },
          conversationId: { type: "string" },
          stream: { type: "boolean", default: true },
          filters: {
            type: "object",
            properties: {
              source: { type: "string" },
              documentId: { type: "string" },
              version: { type: "integer" },
              section: { type: "string" },
              page: { type: "integer" },
            },
          },
        },
        required: ["query"],
      },
      ApprovalRequest: {
        type: "object",
        properties: {
          id: { type: "string" },
          runId: { type: "string" },
          actionName: { type: "string" },
          actionPayload: { type: "object" },
          riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
          requestedBy: { type: "string" },
          reviewerId: { type: "string" },
          reviewerComment: { type: "string" },
          approvalToken: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "runId", "actionName", "riskLevel", "status"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          details: { type: "object" },
        },
        required: ["error"],
      },
    },
  },
  paths: {
    "/healthz": {
      get: {
        summary: "Liveness health check (OBS-006)",
        description: "Returns HTTP 200 OK immediately if the server application process is running.",
        responses: {
          200: {
            description: "Server is alive and healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "UP" },
                    uptime: { type: "number" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/readyz": {
      get: {
        summary: "Readiness health check with real DB and pgvector check (OBS-006)",
        description:
          "Executes real SQL ping ('SELECT 1') and pgvector cosine check. Returns 200 when ready, 503 if DB is unreachable.",
        responses: {
          200: {
            description: "Database and pgvector connection are ready and operational",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "READY" },
                    database: { type: "string", example: "CONNECTED" },
                    pgvector: { type: "string", example: "READY" },
                    totalChunksIndexed: { type: "integer" },
                    dbLatencyMs: { type: "number" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          503: {
            description: "Database or pgvector connection is offline",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Authenticate user and issue session token (DEV-003)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  role: { type: "string", enum: ["ADMIN", "APPROVER", "EXPERT", "VIEWER"], default: "EXPERT" },
                },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful; returns JWT token and sets HTTP-only cookie",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/me": {
      get: {
        summary: "Get current authenticated session, role, and permissions (DEV-003)",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: "Session identity and active role permissions",
          },
        },
      },
    },
    "/api/documents": {
      get: {
        summary: "List all indexed corpus documents (ING-001)",
        responses: {
          200: {
            description: "Array of indexed documents with version metadata",
          },
        },
      },
      post: {
        summary: "Upload and ingest a new clinical document (ING-001/002)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Document extracted, chunked, and indexed" },
          400: { description: "Invalid extension or payload exceeds 25MB ceiling" },
        },
      },
    },
    "/api/documents/{id}/reingest": {
      post: {
        summary: "Trigger document re-ingestion (Requires APPROVER/ADMIN) (DEV-003)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Document re-ingested" },
          403: { description: "Forbidden: APPROVER or ADMIN role required" },
        },
      },
    },
    "/api/conversations": {
      get: {
        summary: "List persistent conversations for current user",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: "List of user conversations sorted by updatedAt DESC",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    conversations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Conversation" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a new conversation",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", default: "New Chat" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Conversation created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    conversation: { $ref: "#/components/schemas/Conversation" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/conversations/{id}": {
      get: {
        summary: "Get conversation details with ownership validation",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Conversation found" },
          403: { description: "Forbidden: Access denied to other user's conversation" },
          404: { description: "Conversation not found" },
        },
      },
      patch: {
        summary: "Update conversation title",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { title: { type: "string" } },
                required: ["title"],
              },
            },
          },
        },
        responses: {
          200: { description: "Conversation updated" },
          403: { description: "Forbidden" },
          404: { description: "Not found" },
        },
      },
      delete: {
        summary: "Delete conversation and all cascading messages",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Conversation deleted" },
          403: { description: "Forbidden" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/conversations/{id}/messages": {
      get: {
        summary: "List chronological messages for conversation",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Messages returned in chronological order",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    messages: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Message" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Post user message, trigger linked run, and auto-derive chat title",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  filters: { type: "object" },
                },
                required: ["content"],
              },
            },
          },
        },
        responses: {
          201: { description: "Message created and Run started" },
          400: { description: "Empty query or invalid filter" },
          403: { description: "Forbidden" },
        },
      },
    },
    "/api/queries": {
      post: {
        summary: "Submit copilot inquiry to multi-agent supervisor (AGT-001)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/QueryRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Grounded answer with inline citations or low-evidence refusal notice",
          },
        },
      },
    },
    "/api/runs/{id}": {
      get: {
        summary: "Get full execution trace inspector payload (OBS-003)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Run status, steps, tool calls, and per-step token ledger spend" },
        },
      },
    },
    "/api/runs/{id}/stream": {
      get: {
        summary: "Subscribe to real-time Server-Sent Events (SSE) stream (RT-001 to RT-004)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "text/event-stream delivering step_start, step_complete, token, citation, and ping heartbeats",
            content: { "text/event-stream": {} },
          },
        },
      },
    },
    "/api/approvals": {
      get: {
        summary: "List Human-in-the-Loop approval requests (HITL-001)",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] } },
        ],
        responses: {
          200: { description: "List of approval requests" },
        },
      },
    },
    "/api/approvals/{id}/approve": {
      post: {
        summary: "Grant approval for pending consequential action (HITL-003, DEV-003)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  comment: { type: "string" },
                  reviewerId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Action approved; returns signed token and resume endpoint" },
          403: { description: "Forbidden: APPROVER or ADMIN role required" },
        },
      },
    },
    "/api/approvals/{id}/reject": {
      post: {
        summary: "Reject pending action with mandatory reason (HITL-005, DEV-003)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", minLength: 1 },
                  reviewerId: { type: "string" },
                },
                required: ["reason"],
              },
            },
          },
        },
        responses: {
          200: { description: "Action rejected; associated run marked as REFUSED" },
          400: { description: "Rejection reason is mandatory" },
          403: { description: "Forbidden: APPROVER or ADMIN role required" },
        },
      },
    },
    "/api/evaluation/runs": {
      get: {
        summary: "Get golden Q/A evaluation benchmark results (OBS-004)",
        responses: {
          200: { description: "Pass rate, retrieval recall, refusal precision, and case breakdown" },
        },
      },
      post: {
        summary: "Trigger live golden Q/A evaluation benchmark execution (OBS-004)",
        responses: {
          200: { description: "Benchmark executed and saved to ledger" },
        },
      },
    },
  },
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantsJson =
    url.searchParams.get("format") === "json" ||
    req.headers.get("accept")?.includes("application/json");

  if (wantsJson) {
    return NextResponse.json(openApiSpecification);
  }

  // Render standalone interactive Swagger UI HTML page
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Domain Copilot - OpenAPI 3.1 Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .top-banner {
      background: #1e293b;
      color: #fff;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
    }
    .top-banner h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .top-banner .badge {
      background: #38bdf8;
      color: #0f172a;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
    }
    .top-banner a {
      color: #38bdf8;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .top-banner a:hover {
      text-decoration: underline;
    }
    .swagger-ui {
      filter: invert(88%) hue-rotate(180deg);
    }
    .swagger-ui .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <div class="top-banner">
    <h1>
      <span>Domain Copilot API Documentation</span>
      <span class="badge">OpenAPI 3.1</span>
    </h1>
    <div>
      <a href="/api/docs?format=json" target="_blank">Download Raw OpenAPI JSON</a>
      &nbsp;&middot;&nbsp;
      <a href="/copilot">Return to Copilot</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        spec: ${JSON.stringify(openApiSpecification)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
