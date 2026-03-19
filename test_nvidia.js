const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "stepfun-ai/step-3.5-flash",
    messages: [{"role":"user","content":"สวัสดี ทดสอบหน่อย"}],
    temperature: 1,
    top_p: 0.9,
    max_tokens: 1024
  });

  console.log('Result:', completion.choices[0].message.content);
}

main().catch(console.error);
