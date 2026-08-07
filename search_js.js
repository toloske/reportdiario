import fs from 'fs';

const targetFile = process.argv[2] || 'sync_routes_mysql.js';
const query = process.argv[3] || 'vehicles';

try {
  const content = fs.readFileSync(targetFile, 'utf8');
  const lines = content.split('\n');

  console.log(`Searching for "${query}" in ${targetFile}:`);
  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(query.toLowerCase())) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
} catch (e) {
  console.error("Error reading/processing file:", e);
}
