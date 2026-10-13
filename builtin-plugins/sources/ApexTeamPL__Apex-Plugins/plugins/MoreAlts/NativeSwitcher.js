import { findByProps, findByStoreName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

const AccountDispatcher = findByProps("getCanUseMultiAccountMobile");
const MultiAccountStore = findByStoreName("MultiAccountStore");

export default function patchNativeSwitcher() {
  if (!storage.settings?.enableNativeSwitcher || !AccountDispatcher || !MultiAccountStore) {
    return () => {};
  }

  const unpatch = after("getCanUseMultiAccountMobile", AccountDispatcher, () => true);

  Object.defineProperty(MultiAccountStore, "canUseMultiAccountNotifications", {
    get: () => true,
    configurable: true
  });

  return () => {
    unpatch();
    delete MultiAccountStore.canUseMultiAccountNotifications;
  };
}
