# Nixkit local AI playtest
The first playable integration is **The Third Voice**. It walks through the normal
Nixkit controls and uses the same proximity-gated conversation and buttons as a
person. It does not solve puzzles, read unrevealed testimony, evaluate arbitrary
JavaScript, or expose the page, filesystem, save object, or browser history.

## Run from a local MCP client

1. In this repository with Node 22.12 or later, run `npm ci` and `npm run build`.
2. Add the following server to a local client that can launch **stdio** MCP
   processes. Replace the absolute path with this checkout. The server command
   writes only MCP protocol messages to stdout; use Node directly, not an npm
   wrapper, in the client configuration.

   ```json
   {
     "mcpServers": {
       "nixkit": {
         "command": "node",
         "args": ["/absolute/path/to/nixchan/tools/nixkit-mcp.mjs"]
       }
     }
   }
   ```

3. In the client's local server logs (stderr), open the pairing URL in your
   browser. Keep its secret fragment private. Click **Enable local AI control**
   in that same tab. It needs working WebGPU or WebGL 2, and the tab must remain
   in the foreground. Leave the browser window open; switching the tab or
   taking over with a real key/mouse input stops the session.
4. Ask the client to observe, walk to **Ruan at the ferry landing**, interact,
   and continue the conversation until his testimony enters the docket. Use
   the **STOP local AI control** button or `nixkit_stop` to release control.

## Tools

| Tool | What it can do |
| --- | --- |
| `nixkit_observe` | Current position, camera movement basis, nearby landmark offsets (within 10 m), available interaction, current conversation and revealed evidence. |
| `nixkit_move` | `forward` and `right` from −1 through 1, `durationMs` from 1 through 2000. Uses normal movement/collision. No warp. |
| `nixkit_interact` | Activate the same available nearby action a player can use. |
| `nixkit_choose` | Use the exact `choiceId` most recently shown in the current conversation. Stale IDs are rejected. |
| `nixkit_stop` | Discard pending commands and end the pairing. |

The process binds its browser bridge to **127.0.0.1** only and serves a local
build, not GitHub Pages or ChatGPT Sites. Never tunnel or publish this bridge.
This is not a cloud ChatGPT connector, nor a browser-off player. No remote
MCP client can connect to it. Set an optional fixed `NIXKIT_PORT` in the
local client environment if you want to reuse the local browser save across
restarts. The local save is separate from saves on other site origins.

Games opt in in code through the typed adapter in `src/lib/nixkit/agent-bridge.ts`;
this first server only enables `third-voice`. To add another game in the
future, review and add its player-visible adapter rather than giving the agent
generic page access.

Transport reference: [MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).
