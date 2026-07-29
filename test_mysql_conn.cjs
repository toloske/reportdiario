const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  console.log('Testing MySQL Connection...');
  console.log('Host:', process.env.MYSQL_HOST);
  console.log('Port:', process.env.MYSQL_PORT);
  console.log('Database:', process.env.MYSQL_DATABASE);

  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'banco.impactasistemas.com.br',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'transmana_powerbi',
      password: process.env.MYSQL_PASSWORD || 'o962kJ96t5Cu8729BA5',
      database: process.env.MYSQL_DATABASE || 'transmana',
      connectTimeout: 20000
    });

    console.log('✅ Connected to MySQL!');

    const [rows] = await connection.query(`
      SELECT DISTINCT DATE(Data_Rota) as data_rota, COUNT(*) as total 
      FROM view_base_diario 
      WHERE Data_Rota >= '2026-07-25' 
      GROUP BY DATE(Data_Rota) 
      ORDER BY data_rota DESC
    `);

    console.log('MySQL Recent Dates (from 2026-07-25):', rows);

    await connection.end();
  } catch (err) {
    console.error('❌ Connection error:', err);
  }
}

testConnection();
