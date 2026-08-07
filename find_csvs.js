import fs from 'fs';
import path from 'path';

const root = 'g:/Outros computadores/Meu computador/drive';

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        // limit depth
        if (!file.startsWith('.') && !file.includes('node_modules')) {
          results = results.concat(walk(fullPath));
        }
      } else if (file.endsWith('.csv')) {
        results.push(fullPath);
      }
    });
  } catch (e) {
    // ignore
  }
  return results;
}

console.log("All CSV files found:");
console.log(walk(root));
