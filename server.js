// MAD KARTS — сервер мультиплеера без зависимостей (Node.js 16+). Запуск: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';if(u==='/play')u='/game.html';
 const f=path.join(PUB,path.normalize(u));if(!f.startsWith(PUB)){r.writeHead(403);return r.end()}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('404')}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(d)})});
const enc=s=>{const b=Buffer.from(s),n=b.length;let h;if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([h,b])};
function dec(sock,buf,cb){sock.buf=Buffer.concat([sock.buf,buf]);
 for(;;){const b=sock.buf;if(b.length<2)return;const op=b[0]&15,m=b[1]&128;let n=b[1]&127,o=2;
  if(n===126){if(b.length<4)return;n=b.readUInt16BE(2);o=4}else if(n===127){if(b.length<10)return;n=Number(b.readBigUInt64BE(2));o=10}
  if(n>65536)return sock.destroy();if(b.length<o+(m?4:0)+n)return;
  const mk=m?b.slice(o,o+4):null;o+=m?4:0;const p=Buffer.from(b.slice(o,o+n));if(mk)for(let i=0;i<n;i++)p[i]^=mk[i&3];sock.buf=b.slice(o+n);
  if(op===8)return sock.end();if(op===9)sock.write(Buffer.from([0x8a,0]));if(op===1)cb(p.toString())}}
const rooms=new Map();let uid=0;
const send=(c,o)=>{if(!c.sock.destroyed)c.sock.write(enc(JSON.stringify(o)))};
const bc=(r,o,ex)=>r.players.forEach(p=>{if(p!==ex)send(p,o)});
const list=r=>r.players.map((p,i)=>({id:p.id,name:p.name,slot:i,host:p===r.host}));
function leave(c){const r=c.room;if(!r)return;c.room=null;r.players=r.players.filter(p=>p!==c);
 if(!r.players.length){rooms.delete(r.code);return}if(r.host===c)r.host=r.players[0];bc(r,{t:'left',id:c.id});bc(r,{t:'room',code:r.code,players:list(r)})}
function msg(c,m){
 if(m.t==='create'||m.t==='join'){leave(c);c.name=String(m.name||'Гонщик').slice(0,12);let r;
  if(m.t==='create'){let code;do code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('');while(rooms.has(code));r={code,players:[],host:c,started:false};rooms.set(code,r)}
  else{r=rooms.get(String(m.code||'').toUpperCase());if(!r)return send(c,{t:'err',m:'Комната не найдена'});if(r.started)return send(c,{t:'err',m:'Гонка уже идёт'});if(r.players.length>=6)return send(c,{t:'err',m:'Комната заполнена'})}
  r.players.push(c);c.room=r;send(c,{t:'you',id:c.id});bc(r,{t:'room',code:r.code,players:list(r)})}
 else if(!c.room)return;
 else if(m.t==='start'&&c.room.host===c&&c.room.players.length>1){const r=c.room;r.started=true;bc(r,{t:'start',seed:1+Math.floor(Math.random()*2e9),players:list(r)})}
 else if(m.t==='pos'&&c.room.started){m.id=c.id;bc(c.room,m,c)}
 else if(m.t==='lobby'&&c.room.host===c){c.room.started=false;bc(c.room,{t:'room',code:c.room.code,players:list(c.room)})}
 else if(m.t==='leave')leave(c)}
srv.on('upgrade',(q,sock)=>{if(q.url!=='/ws')return sock.destroy();
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(q.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
 sock.buf=Buffer.alloc(0);const c={sock,id:++uid,name:'Гонщик',room:null};
 sock.on('data',d=>dec(sock,d,t=>{try{msg(c,JSON.parse(t))}catch(e){}}));sock.on('close',()=>leave(c));sock.on('error',()=>leave(c))});
srv.listen(PORT,()=>console.log('MAD KARTS: http://localhost:'+PORT+'  (игра: /play)'));
