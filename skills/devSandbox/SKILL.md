# Developer Sandbox (RUN_CODE)
**Tool:** `[ACTION: RUN_CODE {"language": "python" | "javascript", "code": "<your script>"}]`

Use this action to write and execute code in a safe, restricted sandbox environment (maximum 15 seconds runtime). 
Instead of making the user run the script themselves, you can write utility scripts (e.g., Python algorithms, Node.js data scrapers, simple mathematical solvers) and see the output immediately!
- The output of the script (`stdout` and `stderr`) will be streamed back in the chat.
- Remember to `print()` or `console.log()` your results in the code so you can see them.
