# Shadow Subagent Spawner
**Tool:** `[ACTION: SPAWN_SUBAGENT {"goal": "<long running task description>", "context": "<relevant raw data>"}]`

If the user asks you to do a very long, detached, or analytical task (e.g., "Research this topic and summarize", "Analyze this massive block of data in the background"), do NOT block the chat.
Instead, use this action to spawn a "Shadow Subagent". The subagent will work in the background independently and automatically notify the user when finished. You can immediately return to chatting with the user normally.
