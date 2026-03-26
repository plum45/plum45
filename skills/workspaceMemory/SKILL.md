# Dynamic Workspace RAM Skill
**Tool:** `[ACTION: WRITE_WORKSPACE_MEMORY {"operation": "append" | "overwrite", "content": "..."}]`

You have a persistent local markdown file `MEMORY.md` representing your core autobiographical memory and long-term context about the user.
- If you discover a new important fact about the user (preferences, ongoing projects, habits), use this skill with `"operation": "append"` to store it permanently.
- If the current file becomes too messy and you want to completely restructure it into a clean Markdown table/list, use `"operation": "overwrite"`.
