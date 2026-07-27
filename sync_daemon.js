import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function runSync() {
  console.log(`[${new Date().toLocaleString()}] Iniciando execução periódica do sync...`);
  try {
    const { stdout, stderr } = await execPromise('node sync_routes_mysql.js');
    console.log(stdout);
    if (stderr) console.error("Stderr:", stderr);
  } catch (error) {
    console.error("Erro ao rodar sincronização automática:", error.message || error);
  }
}

// Run immediately on start, then periodically
runSync();
setInterval(runSync, INTERVAL_MS);

console.log(`Daemon de sincronização automática iniciado. Executando a cada 30 minutos.`);
