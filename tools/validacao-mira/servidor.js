// Servidor estatico minimo para a pagina de validacao (porta 8095).
const http = require("http"), fs = require("fs"), path = require("path");
const raiz = __dirname, tipos = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript" };
http.createServer((req, res) => {
  const p = path.join(raiz, decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": tipos[path.extname(p)] || "application/octet-stream" }); res.end(d); });
}).listen(process.env.PORT || 8095);
