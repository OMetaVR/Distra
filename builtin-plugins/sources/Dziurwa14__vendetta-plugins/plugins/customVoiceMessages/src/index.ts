import voiceMessages from "./patches/voiceMessages"
import { msgCreate, msgSuccess, msgUpdate } from "./patches/messagePatches"
import download from "./patches/download"
import { storage } from "@vendetta/plugin";

storage.sendAsVM ??= true
storage.allAsVM ??= false

const patches = [
    voiceMessages(),
    msgCreate(),
    msgSuccess(),
    msgUpdate(),
    download()
];

export const onUnload = () => { patches.forEach(p => p()); }

export { default as settings } from "./settings";
