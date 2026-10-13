import { findByProps, findByStoreName } from "@vendetta/metro";
import { i18n } from "@vendetta/metro/common";
import en from "../lang/en.json";
import bg from "../lang/bg.json";
import cs from "../lang/cs.json";
import da from "../lang/da.json";
import de from "../lang/de.json";
import el from "../lang/el.json";
import enUK from "../lang/en-UK.json";
import es from "../lang/es.json";
import fi from "../lang/fi.json";
import fr from "../lang/fr.json";
import hi from "../lang/hi.json";
import hr from "../lang/hr.json";
import hu from "../lang/hu.json";
import it from "../lang/it.json";
import ja from "../lang/ja.json";
import ko from "../lang/ko.json";
import lt from "../lang/lt.json";
import lzh from "../lang/lzh.json";
import nl from "../lang/nl.json";
import pl from "../lang/pl.json";
import ptBR from "../lang/pt-BR.json";
import ro from "../lang/ro.json";
import ru from "../lang/ru.json";
import sv from "../lang/sv.json";
import th from "../lang/th.json";
import tr from "../lang/tr.json";
import uk from "../lang/uk.json";
import vi from "../lang/vi.json";
import zhHantTW from "../lang/zh-Hant-TW.json";


const translations: Record<string, any> = {
    en,
    bg,
    cs,
    da,
    de,
    el,
    es,
    fi,
    fr,
    hi,
    hr,
    hu,
    it,
    ja,
    ko,
    lt,
    lzh,
    nl,
    pl,
    ro,
    ru,
    sv,
    th,
    tr,
    uk,
    vi,
    "en-uk": enUK,
    "pt-br": ptBR,
    "zh-hant-tw": zhHantTW,
};

const localeStore = findByStoreName("LocaleStore");
const localeModule =
    findByProps("getLocale", "locale") ||
    findByProps("getLocale", "localeIdentifier") ||
    findByProps("locale", "setLocale");

const isTranslationString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

const getCurrentLocale = (): string => {
    const candidates = [
        typeof i18n?.getLocale === "function" ? i18n.getLocale() : undefined,
        typeof (i18n as any)?.locale === "string" ? (i18n as any).locale : undefined,
        typeof localeStore?.getLocale === "function" ? localeStore.getLocale() : undefined,
        typeof localeStore?.locale === "string" ? localeStore.locale : undefined,
        typeof localeModule?.getLocale === "function" ? localeModule.getLocale() : undefined,
        typeof localeModule?.locale === "string" ? localeModule.locale : undefined,
        typeof (localeModule as any)?.localeIdentifier === "string"
            ? (localeModule as any).localeIdentifier
            : undefined,
        Intl.DateTimeFormat?.().resolvedOptions?.().locale,
    ];

    for (const locale of candidates) {
        if (typeof locale === "string" && locale.trim().length > 0) {
            return locale;
        }
    }

    return "en-US";
};

export const getTranslation = (path: string, placeholders?: Record<string, string>): string => {
    const normalizedLocale = getCurrentLocale().replace(/_/g, "-").toLowerCase();

    const getFromDict = (dict: any) => {
        if (!dict) return undefined;
        const actualDict = dict.default || dict;
        return path.split(".").reduce((obj, key) => obj?.[key], actualDict);
    };

    const localesToTry = [
        normalizedLocale,
        normalizedLocale.split("-")[0],
        "en",
    ];

    for (const localeKey of localesToTry) {
        const value = getFromDict(translations[localeKey]);
        if (isTranslationString(value)) {
            return replacePlaceholders(value, placeholders);
        }
    }

    return path;
};

const replacePlaceholders = (text: string, placeholders?: Record<string, string>): string => {
    if (!placeholders) return text;
    let result = text;
    for (const [key, value] of Object.entries(placeholders)) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return result;
};

export default {
    t: getTranslation,
};
