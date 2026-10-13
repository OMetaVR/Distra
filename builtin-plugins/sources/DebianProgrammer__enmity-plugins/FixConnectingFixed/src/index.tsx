import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { React, Toasts } from 'enmity/metro/common';
import { getIDByName } from "enmity/api/assets";
import { getByProps } from "enmity/modules";
import { getModule } from 'enmity/modules';
import { get } from "enmity/api/settings";
import { create } from 'enmity/patcher';

// @ts-ignore
import manifest, { name as plugin_name } from '../manifest.json';
import Settings from "./components/Settings";


const Patcher = create('FixConnecting')

const FixConnecting: Plugin = {
    ...manifest,
    onStart() {
        let auth = getByProps("startSession", "switchAccountToken")
        let AuthenticationStore = getModule(x => x._dispatcher && x.getName?.() === "AuthenticationStore")
        let FluxDispatcher = getByProps("dispatch", "subscribe")

        const unpatch = Patcher.after(auth, "startSession", (self, args, res) => {
            unpatch()
            setTimeout(() => {
                let session_id = AuthenticationStore.getSessionId()
                if (!session_id) {
                    FluxDispatcher.dispatch({type: 'APP_STATE_UPDATE', state: 'inactive'})
                    FluxDispatcher.dispatch({type: 'APP_STATE_UPDATE', state: 'background'})
                    FluxDispatcher.dispatch({type: 'APP_STATE_UPDATE', state: 'active'})
                    
                    if (get(plugin_name, "hideToast", true)) {
                        return;
                    }
                    else {
                        Toasts.open({
                            key: "TOAST",
                            content: `Automatically fixed Connecting bug!`,
                            icon: getIDByName('Check')
                        });
                    }
                }
            }, 300)
        })
    },
    onStop() {
        Patcher.unpatchAll()
    },
    getSettingsPanel({settings}) {
        return <Settings settings={settings}/>
    }
}

registerPlugin(FixConnecting)
