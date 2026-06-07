const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '..', 'certs');
const files = ['localhost-key.pem', 'localhost-cert.pem'];

for (const file of files) {
  const filePath = path.join(certDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Deleted ${filePath}`);
  }
}

console.log('Certificate reset done. Run npm start to generate a new HTTPS certificate.');
