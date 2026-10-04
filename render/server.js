// Production server for Render: serves the built demo and the wisp proxy on ONE port.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/demo/dist");
const PORT = Number(process.env.PORT || 10000);
const TYPES = {
	".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
	".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
	".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json",
	".woff2": "font/woff2", ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
	let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
	let file = path.join(DIST, path.normalize(p));
	if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
	if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
	if (!existsSync(file)) file = path.join(DIST, "index.html"); // SPA fallback
	res.writeHead(200, {
		"Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
	});
	createReadStream(file).pipe(res);
});

server.on("upgrade", (req, socket, head) => {
	if (req.url.startsWith("/wisp/")) wisp.routeRequest(req, socket, head);
	else socket.end();
});

server.listen(PORT, "0.0.0.0", () => console.log(`Scramjet listening on :${PORT}`));
