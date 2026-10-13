import { readFile, writeFile, readdir, cp } from "fs/promises";

function owo(text, pluginId, manifest) {
    return text.replaceAll("{pluginname}", manifest.name).replaceAll("{pluginid}", pluginId);
}

await cp('pages/common.css', 'dist/common.css');
const indexTemplate = await readFile('pages/index.html', 'utf-8');
const pluginTemplate = await readFile('pages/plugin.html', 'utf-8');

const plugs = [];
for (let plug of await readdir("./plugins")) {
    const manifest = JSON.parse(await readFile(`./plugins/${plug}/manifest.json`));
    plugs.push({ manifest, id: plug });
    await writeFile(`./dist/${plug}/index.html`, owo(pluginTemplate, plug, manifest));
}

await writeFile('dist/404.html', indexTemplate.replaceAll(/<(for-each-plugin)>([\s\S]*?)<\/\1>/g, (_, __, template) => {
    return plugs.map(p => owo(template, p.id, p.manifest)).join('');
}));