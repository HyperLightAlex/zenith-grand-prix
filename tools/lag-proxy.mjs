// A TCP proxy that delays every byte each way: the internet, on one machine.
// Online bugs that only show over a real connection (messages arriving while
// the client is still busy with the last thing) show through this.
//
//   node tools/lag-proxy.mjs 8092 8090 60      8092 -> the server on 8090, 60 ms each way
//
// Then load the game directly and send only the online traffic through it:
//   URL=http://127.0.0.1:8090/ SERVER=http://127.0.0.1:8092 node tools/squad-check.mjs
// (or &server=http://127.0.0.1:8092 on the page's address).
import net from 'node:net';
const [listen, target, delay] = process.argv.slice(2).map(Number);
net.createServer((client) => {
  const server = net.connect(target, '127.0.0.1');
  const pipe = (from, to) => {
    let last = 0;
    from.on('data', (chunk) => {
      // In order, each chunk no earlier than `delay` after it came.
      const at = Math.max(Date.now() + delay, last);
      last = at;
      setTimeout(() => { if (!to.destroyed) to.write(chunk); }, at - Date.now());
    });
    from.on('end', () => setTimeout(() => to.end(), Math.max(0, last - Date.now()) + delay));
    from.on('error', () => to.destroy());
  };
  pipe(client, server);
  pipe(server, client);
  client.on('close', () => setTimeout(() => server.destroy(), delay * 2));
  server.on('close', () => setTimeout(() => client.destroy(), delay * 2));
}).listen(listen, '127.0.0.1', () => console.log(`proxy :${listen} -> :${target}, ${delay} ms each way`));
