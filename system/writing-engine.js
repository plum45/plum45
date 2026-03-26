/**
 * Writing Engine (Nanobot Inspired)
 * Supports iterative drafting and complex document generation.
 */

async function draftDocument({ goal, instructions, client }) {
    console.log(`🖋️ [Writing Engine]: Drafting for goal: ${goal}`);

    const prompt = `You are the Lead Writer for Stacy AI.
Task: ${goal}
Instructions: ${instructions || 'Write a comprehensive and professional document.'}

Your goal is to provide a high-quality DRAFT in Markdown format.
Focus on structure, clarity, and detail.
Use professional Thai (ภาษาทางการหรือสุภาพ).`;

    try {
        const response = await client.chat.completions.create({
            model: "meta/llama-3.1-8b-instruct",
            messages: [{ role: 'system', content: prompt }],
            temperature: 0.7,
        });

        return response.choices[0].message.content;
    } catch (e) {
        console.error(`❌ [Writing Engine] Error: ${e.message}`);
        return `Error generating draft: ${e.message}`;
    }
}

module.exports = { draftDocument };
