/** 测试专用 MCP，按方法而非固定编号回应 JSON-RPC，验证官方 SDK 握手与工具发现。 */
import readline from 'node:readline';
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === 'initialize'
    ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'harness-test', version: '1.0.0' } }
    : request.method === 'tools/list'
      ? { tools: [{ name: 'ping', description: '隔离测试工具', inputSchema: { type: 'object', properties: {} } }] }
      : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'pong' }] } : {};
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
});
