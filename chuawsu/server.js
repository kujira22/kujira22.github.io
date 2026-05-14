const http = require("http");
const fs = require("fs");
const path = require("path");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".JS": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function cacheControlFor(targetPath) {
  const ext = path.extname(targetPath);

  if (targetPath.endsWith("sw.js")) {
    return "no-cache, no-store, must-revalidate";
  }

  if (ext === ".html" || ext === ".webmanifest") {
    return "no-cache";
  }

  return "public, max-age=604800";
}

function safePathname(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname === "/") {
    return "/index.html";
  }
  return pathname;
}

function resolveFile(urlPath) {
  const pathname = safePathname(urlPath);
  const filePath = path.normalize(path.join(root, pathname));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const filePath = resolveFile(req.url || "/");

  if (!filePath) {
    send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
      return;
    }

    const targetPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;

    fs.readFile(targetPath, (readError, data) => {
      if (readError) {
        send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
        return;
      }

      const ext = path.extname(targetPath);
      const contentType = mimeTypes[ext] || "application/octet-stream";

      send(
        res,
        200,
        {
          "Content-Type": contentType,
          "Cache-Control": cacheControlFor(targetPath)
        },
        data
      );
    });
  });
});

server.listen(port, host, () => {
  console.log(`Serving ${root}`);
  console.log(`Open on this Mac: http://localhost:${port}`);
  console.log(`Open on your phone: http://<your-mac-ip>:${port}`);
});
