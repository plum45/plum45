/**
 * MCP Client Wrapper (Ultimate Assimilation - from Nanobot)
 * Allows Stacy to spawn and connect to standard Model Context Protocol (MCP) servers
 * via stdio and call their tools using JSON-RPC.
 */
const { spawn } = require('child_process');

class McpClient {
    constructor(command, args = [], env = process.env) {
        this.command = command;
        this.args = args;
        this.env = env;
        this.process = null;
        this.currentId = 1;
        this.pendingRequests = new Map();
        this.tools = [];
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`🔌 [MCP] Starting Server: ${this.command} ${this.args.join(' ')}`);
            this.process = spawn(this.command, this.args, { env: this.env });
            
            let buffer = '';

            this.process.stdout.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split('\n');
                buffer = lines.pop(); // keep the incomplete line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        this.handleMessage(msg);
                    } catch (e) {
                        console.error(`[MCP] Failed to parse message: ${line}`, e);
                    }
                }
            });

            this.process.stderr.on('data', (data) => {
                console.error(`⚠️ [MCP STDERR]: ${data.toString().trim()}`);
            });

            this.process.on('error', (err) => reject(err));
            this.process.on('exit', (code) => console.log(`[MCP] Connection closed with code ${code}`));

            // Send standard initialize request
            this.sendRequest("initialize", {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                clientInfo: { name: "stacy-ultimate", version: "1.0.0" }
            }).then(() => resolve()).catch(reject);
        });
    }

    handleMessage(msg) {
        if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id);
            if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
                resolve(msg.result);
            }
            this.pendingRequests.delete(msg.id);
        }
    }

    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.process) return reject(new Error("Not connected"));
            
            const id = this.currentId++;
            this.pendingRequests.set(id, { resolve, reject });
            
            const req = { jsonrpc: "2.0", id, method, params };
            this.process.stdin.write(JSON.stringify(req) + '\n');
            
            // Timeout after 30s
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP Request timeout: ${method}`));
                }
            }, 30000);
        });
    }

    async getTools() {
        console.log(`[MCP] Requesting tools list...`);
        const res = await this.sendRequest("tools/list", {});
        this.tools = res.tools || [];
        return this.tools;
    }

    async callTool(name, args) {
        console.log(`[MCP] Calling Tool: ${name} with args:`, args);
        try {
            const res = await this.sendRequest("tools/call", { name, arguments: args });
            if (res.isError) return `❌ MCP Tool Error: ${JSON.stringify(res.content)}`;
            
            return res.content.map(c => c.text || JSON.stringify(c)).join('\n');
        } catch (e) {
            return `❌ Failure executing MCP Tool ${name}: ${e.message}`;
        }
    }
}

// Map to hold singleton instances
const mcpServers = new Map();

async function executeMcpTool(serverName, command, args, toolName, toolArgs) {
    let client = mcpServers.get(serverName);
    
    if (!client) {
        client = new McpClient(command, args);
        try {
            await client.connect();
            mcpServers.set(serverName, client);
        } catch (e) {
            return `❌ Failed to connect to MCP Server '${serverName}': ${e.message}`;
        }
    }

    return await client.callTool(toolName, toolArgs);
}

module.exports = { executeMcpTool, McpClient };
