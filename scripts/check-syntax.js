import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function filesIn(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesIn(path) : path.endsWith('.js') ? [path] : [];
    });
}
const files = ['js', 'server', 'scripts'].flatMap(filesIn);
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.error || result.status !== 0) process.exit(1);
}
console.log(`Syntax checks passed for ${files.length} JavaScript files. This does not replace functional tests.`);
