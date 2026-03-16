const fs = require('fs');
const path = require('path');

const targetDir = 'c:\\Users\\lgopl\\Downloads';
const folders = {
    'แผนการสอนและใบงาน': ['แผน', 'ใบงาน', 'จัดการเรียนรู้', 'สอน'],
    'เอกสารทั่วไป': ['.pdf', '.docx', '.doc']
};

// Subfolders to create
const subfolders = Object.keys(folders);

subfolders.forEach(folder => {
    const p = path.join(targetDir, folder);
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p);
        console.log(`Created folder: ${folder}`);
    }
});

const files = fs.readdirSync(targetDir);

files.forEach(file => {
    const fullPath = path.join(targetDir, file);
    if (fs.lstatSync(fullPath).isDirectory()) return;

    // Check if it should go into 'แผนการสอนและใบงาน'
    let moved = false;
    for (const keyword of folders['แผนการสอนและใบงาน']) {
        if (file.includes(keyword)) {
            const dest = path.join(targetDir, 'แผนการสอนและใบงาน', file);
            fs.renameSync(fullPath, dest);
            console.log(`Moved ${file} to แผนการสอนและใบงาน`);
            moved = true;
            break;
        }
    }

    if (!moved) {
        // Check if it's a general document
        const ext = path.extname(file).toLowerCase();
        if (['.pdf', '.docx', '.doc'].includes(ext)) {
            const dest = path.join(targetDir, 'เอกสารทั่วไป', file);
            fs.renameSync(fullPath, dest);
            console.log(`Moved ${file} to เอกสารทั่วไป`);
        }
    }
});
