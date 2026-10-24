import { mkdir, readdir, copyFile, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = ['index.html', 'login.html', 'signup.html', 'board.html', 'studio.html', 'data/student-tasks.json'];
for (const [folder, extension] of [['css', 'css'], ['js', 'js']]) {
    for (const name of await readdir(new URL(folder + '/', root))) {
        if (new RegExp(`^[a-zA-Z0-9_-]+\\.${extension}$`).test(name)) files.push(`${folder}/${name}`);
    }
}
for (const file of files) {
    const target = new URL(file, output);
    await mkdir(new URL('./', target), { recursive: true });
    await copyFile(new URL(file, root), target);
}
console.log(`Built ${files.length} public files. Server code and secrets excluded.`);
