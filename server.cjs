// Dependency-free server, loopback only. Does not expose other folders.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.PORT||8765);
const allowed=new Set(['index.html','style.css','game-core.js','app.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';}catch{res.writeHead(400);return res.end('Bad request');}if(!allowed.has(name)){res.writeHead(404);return res.end('Not found');}fs.readFile(path.join(root,name),(err,data)=>{if(err){res.writeHead(500);return res.end('Unable to read demo file');}res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});}).listen(port,'127.0.0.1',()=>console.log(`SOVEREIGN ready at http://127.0.0.1:${port}`));
