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

    // Query distinct vehicles where Frota_Fixa is not empty/null
    const [vehicles] = await connection.query(`
      SELECT DISTINCT 
        Veiculo as plate, 
        Service as svc_id, 
        Tipo_Veiculo as vehicle_type,
        Tipo as operation,
        Frota_Fixa
      FROM view_base_diario 
      WHERE Data_Rota >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND Service IN ('SSP40', 'SSP49', 'SSP57')
        AND Frota_Fixa IS NOT NULL AND Frota_Fixa != ''
      ORDER BY Service, Veiculo
    `);
    console.log(`Found ${vehicles.length} fixed fleet vehicles in MySQL for SSP40/49/57:`);
    console.log(JSON.stringify(vehicles, null, 2));

  } catch (err) {
    console.error("Error querying MySQL:", err);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
