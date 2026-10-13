import patch0 from './patches/MessageHandlers';
import patch1 from './patches/RowManager';

let patches: any[] = [];

export default {
  onLoad: () => {
    patches.push(patch0());
    patches.push(patch1());
  },
  onUnload: () => {
    for (let unpatch of patches) unpatch();
  },
};
