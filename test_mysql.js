import mysql from 'mysql2/promise';

const mysqlConfig = {
  host: 'banco.impactasistemas.com.br',
  port: 3306,
  user: 'transmana_powerbi',
  password: 'o962kJ96t5Cu8729BA5',
  database: 'transmana',
  connectTimeout: 20000
};

async function run() {
  let connection;
  try {
    const createConn = mysql.createConnection || (mysql.default && mysql.default.createConnection);
    connection = await createConn(mysqlConfig);
    console.log("Connected to MySQL.");

    // Query distinct Service values in the last 15 days
    const [svcs] = await connection.query(`
      SELECT DISTINCT Service, Service_Cidade
      FROM view_base_diario 
      WHERE Data_Rota >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
        AND (Service LIKE '%SSP40%' OR Service LIKE '%SSP49%' OR Service LIKE '%SSP57%' OR Service_Cidade LIKE '%Zona Norte%')
    `);
    console.log("MySQL Service values matching SSP40/49/57/Zona Norte (last 15 days):");
    console.log(svcs);

    // Let's also check if there are recent routes for these in the last 15 days
    const [recent] = await connection.query(`
      SELECT Service, Veiculo, Data_Rota, Motorista
      FROM view_base_diario
      WHERE Data_Rota >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
        AND Service IN ('SSP40', 'SSP49', 'SSP57')
      ORDER BY Data_Rota DESC
      LIMIT 50
    `);
    console.log("Recent routes for SSP40/49/57 (last 15 days):");
    console.log(recent);

  } catch (err) {
    console.error("Error connecting or querying MySQL:", err);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
