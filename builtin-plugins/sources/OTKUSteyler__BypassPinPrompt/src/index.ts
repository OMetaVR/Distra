import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

const MessageActions = findByProps("pinMessage", "unpinMessage");
const Alerts = findByProps("show", "close", "openLazy");

const PIN_TITLES = [
    "Pin Message",
    "Nachricht anpinnen",
    "Épingler le message",
    "Fijar mensaje",
    "Fissa messaggio",
    "Bericht vastmaken",
    "Fixera meddelande",
    "Fastgør besked",
    "Fest melding",
    "Kiinnitä viesti",
    "Rögzítsd az üzenetet",
    "Przypnij wiadomość",
    "Fixar mensagem",
    "Закрепить сообщение",
    "メッセージをピン留め",
    "固定消息",
    "메시지 고정",
    "Sabitle mesajı",
    "Prikvači poruku",
    "Prikvačite poruku",
    "Mesajı Sabitle",
    "Anexar mensagem",
    "Pripnúť správu",
    "Připnout zprávu",
    "Закріпити повідомлення",
    "ปักหมุดข้อความ",
    "Ghim tin nhắn",
    "Sematkan Pesan",
];

// Distra: the unpin prompt wasn't covered, and the list above only knows some languages. Discord's own
// strings for both titles (in the current language) are added when available.
const Intl = findByProps("intl", "t");
const DISCORD_TITLE_KEYS = ["CvQ18w" /* Pin Message */, "Bse+F/" /* Unpin Message */];
function promptTitles(): string[] {
    const titles = [...PIN_TITLES, "Unpin Message"];
    for (const key of DISCORD_TITLE_KEYS) {
        try {
            const title = Intl?.t?.[key] && Intl.intl.string(Intl.t[key]);
            if (typeof title === "string") titles.push(title);
        } catch {}
    }
    return titles;
}

let patches: (() => void)[] = [];

export default {
    name: "BypassPinPrompt",
    description: "Bypass the confirmation prompt when pinning or unpinning messages.",
    authors: [
        { name: "btmc727 (ported)" },
        { name: "thororen (original)" },
    ],

    onLoad() {
        if (!MessageActions || !Alerts) return;

        patches.push(
            instead("show", Alerts, (args, orig) => {
                const alert = args[0];
                const title: string = alert?.title ?? "";

                if (promptTitles().includes(title)) {
                    const confirmAction = alert?.confirmText
                        ? alert?.onConfirm ?? alert?.actions?.find((a: any) => a.preferred)?.onPress
                        : null;
                    confirmAction?.();
                    return;
                }

                return orig(...args);
            })
        );
    },

    onUnload() {
        patches.forEach(p => p());
        patches = [];
    },
};
