// Opens a Distra page from anywhere (a chat, here) as a modal with its own navigator, so the page can
// push further pages (a plugin's settings) like it does inside Settings > Distra.

import { findByName, findByProps } from "@/metro";
import { CUSTOM_PAGE_ROUTE, CustomPage } from "@/ui/settings";
import { ErrorBoundary } from "@/ui/ErrorBoundary";

const KEY = "distra-helper";
const ROOT_ROUTE = "DISTRA_HELPER_ROOT";

const modals = () => findByProps("pushModal", "popModal");
const close = () => modals()?.popModal?.(KEY);

export function openPageModal(title: string, Page: React.ComponentType<any>) {
    const Navigator = findByName("Navigator") ?? findByProps("Navigator")?.Navigator;
    const closeButton = findByProps("getRenderCloseButton")?.getRenderCloseButton ?? findByProps("getHeaderCloseButton")?.getHeaderCloseButton;
    if (!Navigator || !modals()?.pushModal) return false;

    const Modal = () => (
        <Navigator
            initialRouteName={ROOT_ROUTE}
            screens={{
                [ROOT_ROUTE]: {
                    title,
                    headerLeft: closeButton?.(close),
                    render: () => <ErrorBoundary><Page /></ErrorBoundary>,
                },
                [CUSTOM_PAGE_ROUTE]: {
                    title: "",
                    render: () => <CustomPage />,
                },
            }}
        />
    );
    close();
    modals().pushModal({ key: KEY, modal: { key: KEY, modal: Modal, animation: "slide-up", shouldPersistUnderModals: false, closable: true } });
    return true;
}
