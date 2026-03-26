/**
 * Subagent System (Nanobot Inspired)
 * Allows Stacy to spawn auxiliary AI instances for specialized tasks.
 */

async function handleSubagent({ goal, context, client, userId }) {
    console.log(`🤖 [Subagent]: Spawning for goal: ${goal.substring(0, 50)}...`);

    const subagentPrompt = `You are a Subagent for Stacy (The Ultimate Office Secretary).
Goal: ${goal}
Context: ${context}

Your job is to solve the goal efficiently. 
Output your final findings or results clearly.
Stacy will use your output to answer the Master.

RULES:
1. Stay focused on the goal.
2. Be concise.
3. If you need to perform actions, describe them (but you cannot execute them directly - report back to Stacy).
4. Output in THAI if the goal is in Thai.`;

    try {
        const response = await client.chat.completions.create({
            model: "meta/llama-3.1-8b-instruct", // Lightweight model
            messages: [{ role: 'system', content: subagentPrompt }],
            temperature: 0.5,
        });

        const result = response.choices[0].message.content.trim();
        console.log(`✅ [Subagent]: Task completed.`);
        return result;
    } catch (e) {
        console.error(`❌ [Subagent] Error: ${e.message}`);
        return `Error executing subtask: ${e.message}`;
    }
}

module.exports = { handleSubagent };
