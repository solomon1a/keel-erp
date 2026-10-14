// Sample Node.js application for REA testing
const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  readFile(filename) {
    const filePath = path.join(this.baseDir, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeFile(filename, content) {
    const filePath = path.join(this.baseDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }

  listFiles() {
    return fs.readdirSync(this.baseDir);
  }
}

function processData(data) {
  return data.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' | ');
}

module.exports = { FileManager, processData };

// Example usage
if (require.main === module) {
  const manager = new FileManager(__dirname);
  console.log('Files in directory:', manager.listFiles());
  
  const sampleData = "Line 1\nLine 2\nLine 3\n";
  console.log('Processed:', processData(sampleData));
}
