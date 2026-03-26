/**
 * Memory Consolidator (Nanobot Inspired)
 * Automatically extracts facts from conversation history and stores them in Firestore.
 */

async function consolidateMemory(userId, history, client, db) {
    // Only consolidate if we have enough history (e.g., 10 pairs = 20 messages)
    if (!history || history.length < 10) return null;

    console.log(`🧠 [Memory Consolidator]: Analyzing history for user ${userId}...`);

    try {
        // Prepare history for the LLM
        const conversationSnippet = history.slice(-20).map(m => 
            `${m.role === 'user' ? 'Boss' : 'Stacy'}: ${m.content}`
        ).join('\n');

        const prompt = `You are a Memory Specialist for Stacy AI. 
Review the following conversation and extract key facts, user preferences, or important project details.
RULES:
1. Be extremely concise (one bullet point per fact).
2. Output in THAI.
3. Only output NEW facts that are not already known.
4. If no new facts, output "NONE".

Conversation:
${conversationSnippet}`;

        const response = await client.chat.completions.create({
            model: "z-ai/glm5", // Use GLM-5 but without the "thinking" args for background
            messages: [{ role: 'system', content: prompt }],
            temperature: 0.1,
            max_tokens: 1000,
        });

        const extracted = response.choices[0].message.content.trim();
        if (extracted === "NONE" || extracted.length < 5) {
            console.log(`🧠 [Memory Consolidator]: No new facts identified.`);
            return null;
        }

        console.log(`✨ [Memory Consolidator]: Extracted new facts: ${extracted.substring(0, 50)}...`);

        // Update Firestore
        const userRef = db.collection('userActivities').doc(String(userId));
        const doc = await userRef.get();
        let facts = [];
        if (doc.exists && doc.data().facts) {
            facts = doc.data().facts;
        }

        // Add new facts (limit to last 50 blocks to save space)
        facts.push(`[สรุปเมื่อ ${new Date().toLocaleDateString('th-TH')}] ${extracted}`);
        if (facts.length > 50) facts.shift();

        await userRef.update({ facts, updatedAt: new Date() });
        console.log(`✅ [Memory Consolidator]: Firestore updated for ${userId}`);
        
        return facts;
    } catch (e) {
        console.error(`❌ [Memory Consolidator] Error: ${e.message}`);
        return null;
    }
}

module.exports = { consolidateMemory };
