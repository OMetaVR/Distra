import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import os from "node:os";

let url: URL;

const server = http.createServer(async (req, res) => {
  const route = new URL(req.url || "", url);

  console.log(`Serving ${route.href}`);
  
  const filepath = path.resolve(`.${route.pathname}`);

  const writeHead = (statusCode: number, headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]) => res.writeHead(statusCode, http.STATUS_CODES[statusCode], headers);

  if (route.pathname === "/") {
    const html = Buffer.from(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoggyBootsy server</title>
</head>
<body>
  <div>Plugins</div>
  ${fs.readdirSync("./dist").filter(m => m.endsWith(".js")).map(m => `<a href=${new URL(`/dist/${m}`, url)}>${m}</a>`)}
</body>
</html>`, "utf-8");

    writeHead(200, {
      "Content-Type": "text/html",
      "Content-Size": Buffer.byteLength(html)
    });

    res.write(html);

    res.end();
    
    return;
  }
  if (route.pathname.startsWith("/dist/") && fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath);

    writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Size": Buffer.byteLength(data)
    });

    res.write(data);

    res.end();

    return;
  }

  const html = Buffer.from(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${http.STATUS_CODES[404]}</title>
</head>
<body>404 path <strong>${route.href}</strong> is unknown!</body>
</html>`, "utf-8");

  writeHead(404, {
    "Content-Type": "text/html",
    "Content-Size": Buffer.byteLength(html)
  });

  res.write(html);

  res.end();
});

dns.lookup(os.hostname(), 4).then(({ address }) => {
  const PORT = Number(process.env.PORT || 8080);

  switch (true) {
    case Number.isNaN(PORT): {
      throw new Error("[Enviroment::PORT] is not a number");
    }
    case Math.max(Math.min(PORT, 0xFFFF), 0) !== PORT: {
      throw new Error("[Enviroment::PORT] must between 0x0 and 0xFFFF");
    }
    case Math.trunc(PORT) !== PORT: {
      throw new Error("[Enviroment::PORT] must be a a integer not a float/decimal");
    }
  }
  
  server.listen(Number(PORT), address, () => {
    url = new URL(`http://${address}:${PORT}/`);

    console.log(`Serving at ${url.href}`);
  });
});
