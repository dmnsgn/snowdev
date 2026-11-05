import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import sirv from "sirv";
import { WebSocketServer, WebSocket } from "ws";
import selfsigned from "selfsigned";
import open from "open";
import getPort from "get-port";

import { console, htmlHotInject } from "../utils.js";

const execFile = promisify(execFileCb);

const CLIENT_PATH = "/@snowdev/client.js";
const SOCKET_PATH = "/@snowdev";
const PORT_ATTEMPTS = 20;
const HEAD_TAG = /<head(\s[^>]*)?>/i;
const LEADING_DOCTYPE = /^\s*(<!doctype[^>]*>)?/i;

/**
 * @typedef {object} ServerOptions
 * @property {string} [host] Hostname to listen on. Defaults to all interfaces.
 * @property {number} [port=3000] Preferred port. The following ones are tried
 *   if in use, then a random one.
 * @property {boolean} [https=true] Serve with a "mkcert" certificate if
 *   installed or a self-signed one.
 * @property {boolean} [http2=true] Serve with "node:http2" over HTTPS.
 * @property {boolean | string} [open=true] Open the browser on start, at a path
 *   if a string (eg. "/examples/").
 * @property {boolean} [single=true] Serve "index.html" for unknown routes
 *   (SPA).
 * @property {boolean} [crossOriginIsolation=false] Add
 *   Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP)
 *   headers. Required for the use of SharedArrayBuffer.
 * @property {Record<string, string>} [headers] Response headers, overriding the
 *   "crossOriginIsolation" ones.
 * @property {boolean} [hmr=false] Hot Module Replacement. Requires
 *   "es-module-shims" with "shimMode".
 * @property {string[] | false} [watch] Globs reloading the page on change ("!"
 *   to exclude): CSS is swapped in place and JS hot reloaded with "hmr".
 *   Defaults to root HTML, CSS and JS files, sources, examples and
 *   "web_modules".
 */

const getNetworkAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter(({ family, internal }) => family === "IPv4" && !internal)
    .map(({ address }) => address);

const isWildcardHost = (host) => !host || host === "0.0.0.0" || host === "::";

const getCertificates = async (hosts, options) => {
  try {
    const directory = join(options.cacheFolder, "certificates");
    await mkdir(directory, { recursive: true });
    const certFile = join(directory, "cert.pem");
    const keyFile = join(directory, "key.pem");

    // Always regenerated: cheap and follows host/network changes
    await execFile("mkcert", [
      "-cert-file",
      certFile,
      "-key-file",
      keyFile,
      ...hosts,
    ]);

    return { cert: await readFile(certFile), key: await readFile(keyFile) };
  } catch (error) {
    // Not installed: expected, silently fallback
    if (error.code !== "ENOENT") {
      console.warn(
        `dev — "mkcert" failed, using a self-signed certificate: ${error.message.trim()}`,
      );
    }
  }

  // Short-lived: regenerated on each start
  const notAfterDate = new Date();
  notAfterDate.setDate(notAfterDate.getDate() + 1);

  const { cert, private: key } = await selfsigned.generate(
    [{ name: "commonName", value: hosts[0] }],
    {
      keyType: "ec",
      algorithm: "sha256",
      notAfterDate,
      extensions: [
        {
          name: "subjectAltName",
          altNames: hosts.map((host) =>
            /^[\d.:]+$/.test(host)
              ? { type: 7, ip: host }
              : { type: 2, value: host },
          ),
        },
      ],
    },
  );

  return { cert, key };
};

const createHttpServer = async (listener, hosts, options) => {
  if (!options.server.https) return http.createServer(listener);

  const certificates = await getCertificates(hosts, options);

  // HTTP/1.1 is still needed for WebSocket upgrades (no RFC 8441 support in "ws")
  return options.server.http2
    ? http2.createSecureServer({ ...certificates, allowHTTP1: true }, listener)
    : https.createServer(certificates, listener);
};

const listen = (server, port, host) =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError).once("listening", onListening);
    server.listen(port, host);
  });

const listenAvailable = async (server, { port, host }) => {
  if (!port) return listen(server, port, host);

  // Explicit list: "portNumbers()" rejects privileged ports
  const ports = Array.from({ length: PORT_ATTEMPTS }, (_, i) => port + i);
  const exclude = new Set();

  for (;;) {
    // No "host": probe all local interfaces, not only the one listened on
    const candidate = await getPort({ port: ports, exclude });
    try {
      return await listen(server, candidate, host);
    } catch (error) {
      // Taken between probe and listen
      if (error.code !== "EADDRINUSE") throw error;
      exclude.add(candidate);
    }
  }
};

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/**
 * Resolve navigation requests to an HTML file.
 *
 * @private
 * @returns {Promise<{ file: string } | { redirect: string } | undefined>}
 */
const resolveHtml = async (pathname, req, options) => {
  const file = join(options.cwd, pathname);
  if (relative(options.cwd, file).startsWith("..")) return;

  const extension = extname(pathname);

  if (extension === ".html") return (await isFile(file)) ? { file } : undefined;
  if (pathname.endsWith("/")) {
    const index = join(file, "index.html");
    if (await isFile(index)) return { file: index };
  } else if (!extension && (await isFile(join(file, "index.html")))) {
    return { redirect: `${pathname}/` };
  }

  if (
    !options.server.single ||
    extension ||
    !req.headers.accept?.includes("text/html")
  ) {
    return;
  }

  const index = join(options.cwd, "index.html");
  if (await isFile(index)) return { file: index };
};

const injectClient = (html) => {
  const script = `<script type="module" src="${CLIENT_PATH}"></script>`;
  // Head is optional in HTML: keep the doctype first to avoid quirks mode
  return HEAD_TAG.test(html)
    ? html.replace(HEAD_TAG, (tag) => tag + script)
    : html.replace(LEADING_DOCTYPE, (doctype) => doctype + script);
};

const transformHtml = async (file, options) => {
  const html = injectClient(await readFile(file, "utf8"));
  return options.server.hmr ? htmlHotInject(html) : html;
};

const openBrowser = async (url) => {
  const warn = (reason) =>
    console.warn(
      `dev — Couldn't open browser (${reason}). Set "server.open" to false in headless environments.`,
    );

  try {
    const launcher = await open(url);
    // Launcher started but failed (eg. xdg-open without a browser)
    launcher.once("exit", (code) => {
      if (code) warn(`exit code ${code}`);
    });
  } catch (error) {
    // Launcher not found (eg. no xdg-open)
    warn(error.message);
  }
};

/**
 * @callback ServerSend
 * @param {string} type
 * @param {unknown} [data]
 * @returns {void}
 */

/**
 * @typedef {object} DevServer
 * @property {string} url
 * @property {ServerSend} send
 * @property {function(): Promise<void>} close
 * @property {function(): void} printUrls
 * @property {function(): Promise<void>} open
 */

/**
 * Start a static server with a WebSocket channel to the injected client.
 *
 * @param {object} options
 * @returns {Promise<DevServer>}
 */
const createServer = async (options) => {
  const { host } = options.server;
  const client = await readFile(new URL("client.js", import.meta.url));
  const serveStatic = sirv(options.cwd, { dev: true, etag: true });

  const listener = async (req, res) => {
    try {
      if (options.server.crossOriginIsolation) {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      }
      for (const [name, value] of Object.entries(options.server.headers)) {
        res.setHeader(name, value);
      }

      const pathname = decodeURIComponent(
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Parsing base only, no request
        new URL(req.url, "http://_").pathname,
      );

      if (pathname === CLIENT_PATH) {
        res.setHeader("Content-Type", "text/javascript");
        res.end(client);
        return;
      }

      const html = await resolveHtml(pathname, req, options);
      if (html?.redirect) {
        res.writeHead(301, { Location: html.redirect }).end();
      } else if (html?.file) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(await transformHtml(html.file, options));
      } else {
        serveStatic(req, res, () => {
          res.writeHead(404).end();
        });
      }
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };

  const hosts = [
    ...new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      ...(isWildcardHost(host) ? getNetworkAddresses() : [host]),
    ]),
  ];
  const server = await createHttpServer(listener, hosts, options);

  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== SOCKET_PATH) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });

  const send = (type, data) => {
    const message = JSON.stringify({ type, data });
    for (const socket of wss.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  };

  const port = await listenAvailable(server, options.server);
  const protocol = options.server.https ? "https" : "http";
  const toUrl = (hostname) => `${protocol}://${hostname}:${port}/`;
  const url = toUrl(isWildcardHost(host) ? "localhost" : host);

  const networkUrls = isWildcardHost(host)
    ? getNetworkAddresses().map((address) => toUrl(address))
    : [];
  const printUrls = () =>
    console.log(`

Server running:
➜ Local:   ${url}
${networkUrls.map((networkUrl) => `➜ Network: ${networkUrl}`).join("\n")}
`);
  printUrls();

  const { open: openPath } = options.server;
  const openUrl =
    typeof openPath === "string" ? new URL(openPath, url).href : url;
  const openInBrowser = () => openBrowser(openUrl);
  if (openPath) await openInBrowser();

  const close = async () => {
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    const closed = new Promise((resolve) => server.close(resolve));
    // Open tabs keep HTTP/2 sessions and keep-alive connections indefinitely
    for (const socket of sockets) socket.destroy();
    await closed;
  };

  return { url, send, close, printUrls, open: openInBrowser };
};

export default createServer;
