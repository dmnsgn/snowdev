const RECONNECT_DELAY = 1000;
const RECONNECT_MAX_DELAY = 10_000;

const listeners = new Map();

const on = (type, callback) => {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(callback);
  return () => listeners.get(type).delete(callback);
};

const snowdev = { socket: null, on };
// Public hook for user land code
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.___snowdev___ = snowdev;

const replaceStylesheet = (file) => {
  const url = new URL(file, location.origin).pathname;
  const links = [...document.querySelectorAll("link[rel='stylesheet']")].filter(
    (link) => new URL(link.href).pathname === url,
  );
  if (!links.length) return location.reload();

  // Swap once loaded to avoid a flash of unstyled content
  for (const link of links) {
    const next = link.cloneNode();
    next.href = `${url}?t=${Date.now()}`;
    next.addEventListener("load", () => link.remove(), { once: true });
    link.after(next);
  }
};

on("reload", () => location.reload());
on("css", replaceStylesheet);
on("hmr", (file) => {
  globalThis.importShim.hotReload(new URL(file, document.baseURI).href);
});
on("console:log", (message) => console.log(message));

let attempts = 0;

// Failed connections are always logged by the browser: back off to limit noise
const reconnect = () => {
  if (document.hidden) {
    document.addEventListener("visibilitychange", () => connect(true), {
      once: true,
    });
    return;
  }
  const delay = Math.min(
    RECONNECT_DELAY * 2 ** attempts++,
    RECONNECT_MAX_DELAY,
  );
  setTimeout(() => connect(true), delay);
};

const connect = (reconnecting) => {
  const url = new URL("/@snowdev", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";

  const socket = new WebSocket(url);
  snowdev.socket = socket;

  socket.addEventListener("open", () => {
    attempts = 0;
    // Server restarted (eg. config change): reload to get the new state
    if (reconnecting) return location.reload();
    console.info("[snowdev] Connected");
  });
  socket.addEventListener("message", (event) => {
    const { type, data } = JSON.parse(event.data);
    for (const callback of listeners.get(type) ?? []) callback(data);
  });
  socket.addEventListener("close", () => {
    if (!attempts) console.info("[snowdev] Disconnected. Reconnecting…");
    reconnect();
  });
};

connect(false);
