---
type: "query"
date: "2026-06-22T22:05:10.704222+00:00"
question: "Are the inferred relationships involving Google Sheets Bidirectional Integration (e.g. with Google Sheets Integration and n8n Supabase Row UPDATE Configuration) actually correct?"
contributor: "graphify"
source_nodes: ["docs_project_sheets_integration", "readme_google_sheets_integration", "supabase_n8n_integration_guide_supabase_update"]
---

# Q: Are the inferred relationships involving Google Sheets Bidirectional Integration (e.g. with Google Sheets Integration and n8n Supabase Row UPDATE Configuration) actually correct?

## Answer

Expanded from original query via vocab: ['google', 'sheets', 'bidirectional', 'integration', 'n8n', 'supabase', 'row', 'update', 'configuration'].

Tracing the relationships in the graph reveals:
1. Google Sheets Bidirectional Integration <--> Google Sheets Integration (Conceptually Related):
- This is highly correct. README.md defines Google Sheets as the compliance/audit trail log (Google Sheets Integration), and docs/PROJECT.md details the implementation details of the read/write bidirectional sync via supabase Edge Functions (Google Sheets Bidirectional Integration).

2. n8n Supabase Row UPDATE Configuration <--> Google Sheets Bidirectional Integration (Conceptually Related):
- This is partially correct. Both represent external integrations connecting Supabase/MedNet to outer services (n8n RPA scraping on FastAPI VPS vs Google Sheets API integration via edge functions). While conceptually analogous in using Supabase as a sync layer, they are functionally distinct features: n8n handles bot logs, while sheets handle manual operator compliance logs.

## Source Nodes

- docs_project_sheets_integration
- readme_google_sheets_integration
- supabase_n8n_integration_guide_supabase_update