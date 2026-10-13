import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

export default () =>
    before("uploadLocalFiles", findByProps("uploadLocalFiles"), (args) => {
        if (!storage.sendAsVM || args[0].flags == 8192) return;
        const item = args[0].items[0];
        if (item.mimeType.startsWith("audio")) {
            item.mimeType = "audio/ogg"
            args[0].flags = 8192;
            item.waveform = item.item.waveform = 'AEtWPyUaGA4OEAcA';
            item.durationSecs = item.item.durationSecs = 60.0;
        }
    });

