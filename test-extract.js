const { extractActions } = require('./system/actions');

const testCases = [
    {
        name: "Standard with brackets",
        input: "Here is your event: [ACTION: ADD_CALENDAR_EVENT {\"title\": \"Test\"}]"
    },
    {
        name: "Missing leading bracket",
        input: "ACTION: ADD_CALENDAR_EVENT {\"title\": \"Missing Leading\"}]"
    },
    {
        name: "No brackets at all (New Support)",
        input: "ACTION: ADD_CALENDAR_EVENT {\"title\": \"No Brackets\"}"
    },
    {
        name: "Mixed text and action without brackets",
        input: "I will do this for you.\nACTION: WORK_LOG {\"task\": \"Coding\", \"duration\": \"1h\"}\nLet me know if you need more."
    }
];

testCases.forEach(tc => {
    console.log(`--- Testing: ${tc.name} ---`);
    console.log(`Input: ${tc.input}`);
    const { actions, cleanText } = extractActions(tc.input);
    console.log(`Found Actions: ${actions.length}`);
    actions.forEach(a => console.log(`  - Type: ${a.type}, Data: ${JSON.stringify(a.data)}`));
    console.log(`Clean Text: "${cleanText.trim()}"`);
    console.log('');
});
