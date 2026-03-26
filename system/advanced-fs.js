/**
 * Advanced Filesystem Tools (Ultimate Assimilation - from Nanobot)
 * Provides robust file reading (with pagination), writing, editing (smart replace),
 * and directory listing (with auto-ignore).
 */
const fs = require('fs');
const path = require('path');

// --- Helper Functions ---
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
}

const IGNORE_DIRS = new Set([
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".tox", ".mypy_cache", ".pytest_cache",
    ".ruff_cache", ".coverage", "htmlcov", "artifacts", "brain", ".gemini"
]);

// --- Core Tools ---

/**
 * Reads a file with line-number pagination.
 */
function readFileChunk(filePath, offset = 1, limit = 2000) {
    try {
        if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
        
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) return `Error: Not a file: ${filePath}`;

        // Basic read
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const total = lines.length;

        if (offset < 1) offset = 1;
        if (offset > total) return `Error: offset ${offset} is beyond end of file (${total} lines)`;

        const start = offset - 1;
        const end = Math.min(start + limit, total);
        
        const numberedLines = lines.slice(start, end).map((line, i) => `${start + i + 1}| ${line}`);
        let result = numberedLines.join('\n');

        if (end < total) {
            result += `\n\n(Showing lines ${offset}-${end} of ${total}. Use READ_FILE with offset=${end + 1} to continue.)`;
        } else {
            result += `\n\n(End of file — ${total} lines total)`;
        }

        return result;
    } catch (e) {
        return `Error reading file: ${e.message}`;
    }
}

/**
 * Writes or overwrites a file completely.
 */
function writeFile(filePath, content) {
    try {
        const ext = getFileExtension(filePath);
        if (['.docx', '.xlsx', '.pptx', '.pdf', '.zip'].includes(ext)) {
            return `Error: ${ext} is a binary format. DO NOT use WRITE_FILE for this. Use specialized actions like CREATE_WORD or CREATE_EXCEL instead.`;
        }
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
        return `Successfully wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${filePath}`;
    } catch (e) {
        return `Error writing file: ${e.message}`;
    }
}

/**
 * Iterates through a directory to safely list contents.
 */
function listDirectory(dirPath, recursive = false, maxEntries = 200) {
    try {
        if (!fs.existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`;
        if (!fs.statSync(dirPath).isDirectory()) return `Error: Not a directory: ${dirPath}`;

        let items = [];
        let total = 0;

        function scanDir(currentDir, currentDepth) {
            if (items.length >= maxEntries) return; // Stop if max reached
            
            const files = fs.readdirSync(currentDir);
            for (const file of files) {
                if (IGNORE_DIRS.has(file)) continue;

                const fullPath = path.join(currentDir, file);
                const isDir = fs.statSync(fullPath).isDirectory();
                
                total++;
                if (items.length < maxEntries) {
                    const relative = path.relative(dirPath, fullPath);
                    items.push(isDir ? `📁 ${relative}/` : `📄 ${relative}`);
                }

                if (recursive && isDir) {
                    scanDir(fullPath, currentDepth + 1);
                }
            }
        }

        scanDir(dirPath, 0);

        if (items.length === 0 && total === 0) return `Directory ${dirPath} is empty`;

        let result = items.join('\n');
        if (total > maxEntries) {
            result += `\n\n(truncated, showing first ${maxEntries} of ${total} entries)`;
        }
        return result;

    } catch (e) {
        return `Error listing directory: ${e.message}`;
    }
}

/**
 * Smart file editing (surgical replace without replacing the whole file).
 */
function editFile(filePath, oldText, newText, replaceAll = false) {
    try {
        if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;
        
        let content = fs.readFileSync(filePath, 'utf8');
        const usesCrLf = content.includes('\r\n');
        
        // Normalize line endings for internal processing
        let normContent = content.replace(/\r\n/g, '\n');
        let normOld = oldText.replace(/\r\n/g, '\n');
        let normNew = newText.replace(/\r\n/g, '\n');

        let matchCount = 0;
        let finalContent = normContent;

        // Try exact match first
        if (normContent.includes(normOld)) {
            matchCount = normContent.split(normOld).length - 1;
            
            if (matchCount > 1 && !replaceAll) {
                return `Warning: old_text appears ${matchCount} times. Provide more context to make it unique, or set replace_all=true.`;
            }

            if (replaceAll) {
                finalContent = normContent.split(normOld).join(normNew);
            } else {
                finalContent = normContent.replace(normOld, normNew);
            }
        } else {
            // Fallback: Line-trim matching for minor differences
            let oldLines = normOld.split('\n').map(l => l.trim());
            let contentLines = normContent.split('\n');
            let foundIndex = -1;

            if (oldLines.length > 0) {
                for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
                    let window = contentLines.slice(i, i + oldLines.length);
                    if (window.map(l => l.trim()).join('\n') === oldLines.join('\n')) {
                        foundIndex = i;
                        break;
                    }
                }
            }

            if (foundIndex === -1) {
                return `Error: old_text not found in ${filePath}. Verify the file content exactly.`;
            }

            // Replace the matched lines
            let replacedLines = normNew.split('\n');
            contentLines.splice(foundIndex, oldLines.length, ...replacedLines);
            finalContent = contentLines.join('\n');
        }

        // Restore original line endings if needed
        if (usesCrLf) finalContent = finalContent.replace(/\n/g, '\r\n');

        const ext = getFileExtension(filePath);
        if (['.docx', '.xlsx', '.pptx', '.pdf', '.zip'].includes(ext)) {
            return `Error: ${ext} is a binary format. DO NOT use EDIT_FILE for this.`;
        }

        fs.writeFileSync(filePath, finalContent, 'utf8');
        return `Successfully edited ${filePath}`;

    } catch (e) {
        return `Error editing file: ${e.message}`;
    }
}

module.exports = {
    readFileChunk,
    writeFile,
    listDirectory,
    editFile
};
