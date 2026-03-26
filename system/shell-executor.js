/**
 * Robust Shell Executor (Ultimate Assimilation - from Nanobot)
 * Execute system commands securely with regex pattern blocking,
 * explicit timeouts, and output truncation for heavy stdout.
 */
const { exec } = require('child_process');

// Ported deny patterns from nanobot/agent/tools/shell.py
const DENY_PATTERNS = [
    /\brm\s+-[rf]{1,2}\b/i,          // rm -r, rm -rf, rm -fr
    /\bdel\s+\/[fq]\b/i,             // del /f, del /q
    /\brmdir\s+\/s\b/i,              // rmdir /s
    /(?:^|[;&|]\s*)format\b/i,       // format (standalone)
    /\b(mkfs|diskpart)\b/i,          // disk operations
    /\bdd\s+if=/i,                   // dd
    />\s*\/dev\/sd/i,                // write to raw disk
    /\b(shutdown|reboot|poweroff)\b/i, // system power
    /:\(\)\s*\{.*\};\s*:/            // fork bomb
];

const MAX_OUTPUT_LEN = 10000;
const MAX_TIMEOUT = 600000; // 10 minutes max, though default is shorter

function checkGuard(command) {
    const cmdStr = command.trim();
    for (const pattern of DENY_PATTERNS) {
        if (pattern.test(cmdStr)) {
            return "❌ Error: Command blocked by safety guard (dangerous pattern detected).";
        }
    }
    return null;
}

async function executeCommand(command, workingDir = null, timeoutMs = 60000) {
    console.log(`💻 [Shell] Executing: ${command}`);

    const guardError = checkGuard(command);
    if (guardError) return guardError;

    const effectiveTimeout = Math.min(timeoutMs, MAX_TIMEOUT);

    return new Promise((resolve) => {
        let isDone = false;
        
        const child = exec(command, { 
            cwd: workingDir || process.cwd(),
            maxBuffer: 1024 * 1024 * 5 // 5MB buffer
        }, (error, stdout, stderr) => {
            if (isDone) return;
            isDone = true;

            let outputParts = [];
            
            if (stdout) outputParts.push(stdout.toString());
            if (stderr && stderr.toString().trim()) {
                outputParts.push(`STDERR:\n${stderr.toString()}`);
            }
            if (error) {
                if (error.code === 740) {
                    outputParts.push(`\n❌ **Error: การดำเนินการนี้ต้องใช้สิทธิ์ผู้ดูแลระบบ (Administrator)**\n💡 **วิธีแก้:** โปรดปิดบอทแล้วคลิกขวาที่ terminal/powershell แล้วเลือก "Run as Administrator" แล้วเปิดบอทใหม่อีกครั้งคะ`);
                } else {
                    outputParts.push(`Exit code: ${error.code || 'unknown'}`);
                }
            } else {
                outputParts.push(`Exit code: 0`);
            }

            let result = outputParts.join('\n') || "(no output)";

            // Nanobot-style head/tail truncation
            if (result.length > MAX_OUTPUT_LEN) {
                const half = Math.floor(MAX_OUTPUT_LEN / 2);
                result = result.substring(0, half) +
                         `\n\n... (${(result.length - MAX_OUTPUT_LEN).toLocaleString()} chars truncated) ...\n\n` +
                         result.substring(result.length - half);
            }

            resolve(result);
        });

        // Strict timeout kill
        setTimeout(() => {
            if (!isDone) {
                isDone = true;
                child.kill('SIGKILL');
                resolve(`❌ Error: Command timed out after ${effectiveTimeout / 1000} seconds`);
            }
        }, effectiveTimeout);
    });
}

module.exports = { executeCommand };
