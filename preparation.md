# Brainstorming & Preparation

This document serves as our central hub for brainstorming, researching reference projects, and planning the next phase of the RNS CRM project.

## 1. Reference Repositories Analysis

We are studying a few reference projects to gather ideas for the frontend, backend, and orchestrator.

### ChatPilot

_Repository cloned in `Rough/ChatPilot`_

#### 1. Features for the User

- **Multi-tenant CRM:** Supports multiple organizations (e.g., GMD for industrial metals and KBC for field officer training) with distinct logins and data segregation.
- **Omnichannel Communication:** Integrates Twilio SMS and WhatsApp (via Twilio Content API) for messaging.
- **Smart Chat Interface:** A public chat widget that uses IP addresses or phone numbers to track and identify users.
- **Automated Campaigns:** Ability to schedule, send, and track bulk SMS/WhatsApp messages.
- **Rich Media Support:** Document & media upload capabilities (up to 15MB) for campaign messages.
- **Super Admin Dashboard:** A God-mode view showing real-time metrics, active conversations, chat volume graphs, AI token usage, and audit logs across all organizations.
- **Knowledge Base (KB):** Custom KB integration where the AI grounds its answers based on specific organization documents.

#### 2. AI Architecture

- **Model Used:** OpenAI `gpt-3.5-turbo` (default) and `gpt-4o-mini` for specific Field Officer training modules.
- **Core Strategy - Contextual Grounding:**
  - Every user message is processed alongside the last 4-6 messages (Token limit protected).
  - It fetches relevant text from the Knowledge Base to provide grounded answers.
  - It forcefully injects organization-specific System Prompts (e.g., "You are GMD Genie, an AI assistant specializing EXCLUSIVELY in industrial metal products").
- **Topic Enforcement Algorithms:** Not just relying on prompts, the code explicitly validates the AI's output. If the AI hallucinates outside the core topic (e.g., Steel, Aluminum), it appends a hardcoded redirect: _"Let's keep our conversation focused on [Topic]"_.
- **AI Engagement Scoring:** The AI operates in the background to read a user's chat history and scores their "Intent to Buy" from 1-100 automatically.
- **Specialized AI Modes:** Uses different prompting sequences depending on the context (e.g., "General Chat" vs. "Field Officer Training Route" vs. "Marketing Promotion Generator").

#### 3. APIs Used & Architecture Structure

- **Frontend/Backend:** Express.js (Node / TypeScript) backend.
- **Database:** MongoDB (mongoose) for storing Chat Histories, Leads, Campaigns, and WhatsApp Templates.
- **3rd Party APIs:**
  - **OpenAI API:** For message generation, engagement scoring, and marketing copy creation.
  - **Twilio API:** For OTP verification, standard SMS sending, and Twilio Content API for rich WhatsApp templates.
- **Key Internal Endpoints:**
  - `POST /api/chat`: Core Public Chat.
  - `POST /api/auth/login`: Handles multi-tenant routing based on hardcoded credentials.
  - `GET /api/super-admin/overview`: Analytics aggregator.
  - `POST /api/whatsapp/templates/submit`: Registers templates natively with WhatsApp.
  - `POST /api/webhook/twilio`: Main webhook listener.

### 4. Deep Code Analysis: Flaws, Constraints & Weaknesses (RNS CRM Improvements)

After auditing `server/routes.ts`, `openai.service.ts`, `twilio.service.ts`, and `mongodb.service.ts`, here are the critical failure points of ChatPilot that we **must fix** when architecting the RNS CRM:

#### A. Scalability & Fake Multi-Tenancy

- **Issue:** ChatPilot does not have real multi-tenancy. Organizations ("GMD" vs "KBC") are literally hardcoded in `if/else` statements throughout the code.
- **The Constraint:** To add a 3rd client, a developer _must_ modify the TypeScript code, add a `TWILIO_ACCOUNT_SID3` to the `.env` file, and redeploy the server.
- **RNS CRM Fix:** We need a robust `Tenant` database model. Twilio keys, OpenAI keys, and System Prompts must be pulled dynamically from the database per tenant.

#### B. Artificial Intelligence & Prompt Brittleness

- **Issue 1 (Token Limits):** To handle memory limits, ChatPilot arbitrarily chops the array (`conversationHistory.slice(-4)`). This causes "Goldfish Memory" where the bot forgets what was said 5 minutes ago.
- **Issue 2 (Model Weakness):** It uses `gpt-3.5-turbo` for customer chat. This model struggles with complex multi-step reasoning.
- **Issue 3 (Topic Enforcement Hack):** The developer implemented a "Topic Guardrail" that checks if the AI's output contains specific words (like `['steel', 'aluminum']`). If the AI writes a perfect response without those exact words, the code forcibly appends _"Let's keep our conversation focused..."_ creating a terrible, rigid user experience.
- **RNS CRM Fix:** Upgrade to `gpt-4o-mini` (or Claude 3 Haiku). Use **Vector Embeddings (RAG)** for long-term memory instead of arbitrary slicing. Use function calling to keep the AI on track instead of string-matching algorithms.

#### C. Database Architecture

- **Issue:** The schema is highly fragmented (`GMT_KB_customers`, `GMT_Leads`, `FO_Training_Progress`). Instead of an abstract `Users` collection with relationship tables, every new feature forced the creation of a new, isolated collection.

#### D. Message Loss (No Event Queue)

- **Issue:** In the Twilio Webhook handler, incoming messages are processed synchronously using Node's `setImmediate()`. If multiple people message at once, or if the server crashes/restarts during the 3-5 seconds it takes OpenAI to reply, **the customer's message is permanently lost.**
- **RNS CRM Fix:** Implement a backend Message Queue (e.g., Redis Streams, BullMQ, or Kafka). Webhooks should instantly return `200 OK` and push the job to a queue to ensure 100% message delivery. for incoming customer SMS/WhatsApp messages.

### WhatsCRM

_Repository cloned in `Rough/WhatsCRM`_

- **Architecture Overview:**
  - Desktop application built with Electron.js and React.js.
  - Integration with WhatsApp API (or libraries like `whatsapp-web.js`).
  - Likely uses a local database for storage (given it's a desktop app).
- **Key Features:**
  - Automated replies, templates, and scheduled messaging.
  - Local message management, organization, and archiving.
  - Notifications for real-time alerts.
- **What we can learn/adapt:**
  - **Local-First WhatsApp Connection:** WhatsCRM does _not_ use the official paid Twilio/WhatsApp Cloud API. Instead, it uses `whatsapp-web.js` under the hood in the Electron `main.js` process to silently run a headless Chrome browser and scan a QR code. This makes it completely free to send messages, bypassing Twilio fees, but requires the desktop app to stay running.
  - **Anti-Ban Message Queuing:** Because it uses an unofficial API, the code includes extensive `ANTI_BAN_CONFIG` logic (batch sizes, random variance delays, hourly rate limits, simulated typing). If RNS CRM implements bulk messaging via unofficial APIs, we _must_ study and emulate this exact queuing and backoff logic to prevent phone number bans.
  - **React + Electron IPC:** The frontend (React) communicates with the backend (Node.js) via Electron IPC rather than standard HTTP REST calls.

### CordysCRM

_Repository cloned in `Rough/CordysCRM`_

- **Architecture Overview:**
  - Enterprise-grade CRM system.
  - Frontend: Vue.js, Naive-UI, Vant-UI.
  - Backend: Java Spring Boot.
  - Database & Caching: MySQL, Redis.
  - Deployment: Docker-first approach.
- **Key Features:**
  - AI Integration: Uses "MaxKB" for AI agent capabilities (smart follow-ups, smart quotes).
  - Business Intelligence (BI): Data visualization and natural language querying/analysis.
  - Complete Sales Funnel: Lead acquisition, allocation, opportunity tracking, contract signing, and payment collection.
  - Role-Based Access Control (RBAC).
- **What we can learn/adapt:**
  - **Enterprise Architecture:** Using Redis for caching and MySQL/PostgreSQL for relational, structured CRM data is a proven standard that we MUST adopt over flat JSON files or fragmented MongoDB schemas.
  - **Decoupled AI Architecture:** Unlike ChatPilot which hardcoded OpenAI prompts into the backend codebase, CordysCRM _externalizes_ AI via dedicated API integrations (MaxKB and SQLBot). This is cleaner, infinitely more scalable, and allows non-technical admins to tweak the AI agents via a UI rather than requiring code deployments!
  - **AI & BI at the Core:** The concept of using AI not just for chat, but for _Data Analysis_ (BI) and querying the database is highly applicable to RNS CRM. We should build an internal AI agent for managers.
  - **Role-Based Access Control:** A robust RBAC system (Super Admin, Sales Rep, Manager) is critical as a CRM scales.

## 2. Our Project: RNS CRM Proposed Architecture

Based on the analysis of the actual RNS CRM backend, ChatPilot, CordysCRM, and WhatsCRM, here is the proposed blueprint for the new RNS CRM:

### Frontend (The Dashboard)

- **Framework:** React or Vue.js (Next.js/Nuxt.js recommended for enterprise routing).
- **UI Inspiration:** ChatPilot's sleek dark/light mode dashboard for viewing conversations, and CordysCRM's data-dense tables for managing the actual sales pipeline (leads, opportunities, contracts).
- **Key Features:**
  - Multi-tenant Login (Super Admin vs. Tenant Admin vs. Sales Rep).
  - Real-time Multi-Agent Inbox for WhatsApp/SMS.
  - BI Dashboard: Visual charts showing lead conversion rates and AI engagement scores.

### Backend (The Core Engine)

- **Framework:** Node.js (Express or NestJS) or Java Spring Boot (inspired by CordysCRM). _Recommendation: Stick with Node.js to easily integrate the existing `gemini_service.js` logic._
- **Database Pipeline (Crucial Upgrade):**
  - **Relational DB (PostgreSQL/MySQL):** Replace the flat JSON files. Use this for Tenants, Users, Leads, Contracts, and structured CRM data.
  - **NoSQL / Vector DB (MongoDB or pgvector):** Use this specifically for storing the massive volume of chat history and providing RAG capabilities if needed.
  - **Caching & Queues (Redis):** Implement BullMQ (Node) or a similar Redis queue. Webhooks from Twilio must hit the server, return `200 OK` instantly, and push the processing job to Redis to prevent message loss under load.

### Artificial Intelligence & Automation

- **The Brain:** Retain the brilliant **Gemini 2.0 Flash** integration and the 30-message rolling window history from the current RNS CRM backend.
- **The Strategy:** Avoid ChatPilot's rigid string-matching. Rely on the superior `system_prompt.js` from RNS CRM to naturally guide lead collection.
- **The "Magic" Features to Build:**
  - _Silent Live Scraper:_ Keep the existing server-side web scraper logic for live product data.
  - _AI Engagement Scoring:_ Steal ChatPilot's background worker idea to rate a lead's "Intent to Buy" (1-100) and display it on the frontend.
  - _Manager SQLBot:_ Inspired by CordysCRM, give CRM managers a UI to ask natural language questions (e.g., "Show me all high-priority leads from this week") and have an AI agent query the PostgreSQL database.
  - _WhatsApp Automation:_ Adopt WhatsCRM's local anti-ban queuing logic if using unofficial APIs, or stick to Twilio with strict rate-limit management.
