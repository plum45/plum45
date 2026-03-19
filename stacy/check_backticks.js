const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('`')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
});
