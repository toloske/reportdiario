import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';

const execPromise = promisify(exec);
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const PORT = 3001;

async function runSync(dateParam = '') {
  console.log(`[${new Date().toLocaleString()}] Iniciando sync...`);
  try {
    let cmd = 'node sync_routes_mysql.js';
    if (dateParam) {
      cmd += ` --date ${dateParam}`;
    }
    const { stdout, stderr } = await execPromise(cmd);
    console.log(stdout);
    if (stderr) console.error("Stderr:", stderr);
    return { success: true, stdout };
  } catch (error) {
    console.error("Erro ao rodar sincronização:", error.message || error);
    return { success: false, error: error.message };
  }
}

// Periodical sync every 30 minutes
setInterval(() => runSync(), INTERVAL_MS);

// Start HTTP Server
const server = createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/sync') {
    const dateParam = url.searchParams.get('date') || '';
    
    console.log(`[HTTP] Requisição recebida para sincronizar data: ${dateParam || 'Últimos dias'}`);
    const result = await runSync(dateParam);
    
    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Sincronizado com sucesso!', stdout: result.stdout }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: result.error }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Daemon de sincronização automática iniciado. Executando a cada 30 minutos.`);
  console.log(`Servidor HTTP ouvindo na porta ${PORT}. Endpoint: http://localhost:${PORT}/sync`);
});
