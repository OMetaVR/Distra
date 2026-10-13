import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { Dialog } from 'enmity/metro/common';
import { getByProps } from 'enmity/metro';
import { create } from 'enmity/patcher';
import manifest from '../manifest.json';

const Call = getByProps("handleStartCall");
const Patcher = create("confirm-calls");


const ConfirmCalls: Plugin = {
   ...manifest,

   onStart() { //a1, a2, a3
      //a3.apply(a1,a2) runs original function
      Patcher.instead(Call, "handleStartCall", (a1, a2, a3) => {
         Dialog.show({
            title: "Confirm call",
            body: "Are you sure you want to call?",
            confirmText: "Yes",
            cancelText: "No",
            onConfirm: (): void => a3.apply(a1, a2)
         });
      });
   },

   onStop() {
      Patcher.unpatchAll();
   }
};

registerPlugin(ConfirmCalls);
