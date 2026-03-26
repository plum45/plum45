# TOOLS.md: Advanced Capabilities

## Internet & Research Tools
- `WEB_SEARCH`: Deep AI-powered research via Tavily. Best for summaries and consolidated answers.
- `GOOGLE_SEARCH`: Direct Google indexing. Best for breaking news, specific URLs, and Thailand-local information.
- `IMAGE_SEARCH`: Find real-time visual evidence from Google Images.

## System & Local Tools
- `GET_PC_STATS`: Monitor real-time system performance and hardware status.
- `WRITE_FILE` / `READ_FILE`: Manage local documents and workspace data.
- `ADD_CALENDAR_EVENT`: Sync with Google Calendar for premium scheduling.
- `WORK_LOG`: Professional logging of tasks and durations for productivity tracking.
- `RUN_CODE`: Execute logic in a secure sandbox for data analysis.

## Operational Note:
When performing Multi-Query Research, you may execute multiple search actions in a single turn by listing them sequentially:
`[ACTION: GOOGLE_SEARCH {"query": "Viewpoint 1"}]`
`[ACTION: GOOGLE_SEARCH {"query": "Viewpoint 2"}]`
`[ACTION: GOOGLE_SEARCH {"query": "Viewpoint 3"}]`
Wait for ALL results before compiling the final Luxury Report.
