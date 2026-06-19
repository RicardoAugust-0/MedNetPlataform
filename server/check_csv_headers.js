import fs from 'fs';
import path from 'path';

const csvPath = path.resolve('../docs/skills/mednet-skill/Maxtrack_alertas.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');
const firstLine = lines[0];

// The file might have semicolon delimiter
const headers = firstLine.split(';');
console.log('CSV Headers:');
headers.forEach((h, i) => {
  console.log(`${i}: ${h}`);
});
