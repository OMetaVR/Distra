import { React, ReactNative, clipboard } from '@vendetta/metro/common';
import { findByName } from '@vendetta/metro';
import { Forms, General } from '@vendetta/ui/components';
import { getAssetIDByName } from '@vendetta/ui/assets';
import { showToast } from '@vendetta/ui/toasts';

const { View, TouchableOpacity } = General;
const { FormIcon } = Forms;

const Svg = findByName('Svg', false).default;
const Path = findByName('Svg', false).Path;

export const WordWrapSvg: any = ({ color }) => (
  <Svg height="24" width="24" viewBox="0 0 96 96" fill={color}>
    <Path d="M11 20a3 3 90 000 6h74a3 3 90 000-6zm0 26a3 3 90 000 6H76a10 10 90 010 20h-17.76l2.88-2.88a3 3 90 10-4.24-4.24l-8 8a3 3 90 000 4.24l8 8a3 3 90 104.24-4.24l-2.88-2.88H76a16 16 90 000-32z" />
    <Path d="M8 75a3 3 90 013-3h26a3 3 90 010 6h-26a3 3 90 01-3-3" />
  </Svg>
);

export const MonospaceSvg: any = ({ color }) => (
  <Svg height="24" width="24" viewBox="0 0 32 32">
    <Path d="m3 16 9-9 2 2-7 7 7 7-2 2zm15 7 7-7-7-7 2-2 9 9-9 9z" fill={color} />
  </Svg>
);

interface FCButtonProps {
  onPress: () => any;
  info: string;
  colors: {
    background: {
      active: any;
      inactive: any;
    };
    border: {
      active: any;
      inactive: any;
    };
  };
  active: boolean;
  content: any;
}

export const FCButton: any = ({ onPress, info, colors, active, content }: FCButtonProps) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={() => {
        showToast(info, getAssetIDByName('ic_information_filled_24px'));
      }}
      style={{
        backgroundColor: active ? colors.background.active : colors.background.inactive,
        padding: 4,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: active ? colors.border.active : colors.border.inactive,
      }}>
      {content}
    </TouchableOpacity>
  );
};

export const FCButtonBar: any = ({ children }) => {
  return (
    <View
      style={{
        padding: 15,
        paddingBottom: 0,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'space-between',
      }}>
      {/* nested view because it was planned to have buttons both in the left and the right side, might still be used at some point */}
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
        }}>
        {children}
      </View>
    </View>
  );
};

const download = ReactNative.NativeModules.MediaManager.downloadMediaAsset;

export const DownloadButton: any = ({ url, saveText, failText, copyText }) => {
  function onPress() {
    download(url, 0).then((saved) => {
      if (saved) {
        showToast(saveText, getAssetIDByName('ic_selection_checked_24px'));
      } else {
        showToast(failText, getAssetIDByName('ic_close_circle'));
      }
    });
  }
  function onLongPress() {
    clipboard.setString(url);
    showToast(copyText, getAssetIDByName('toast_copy_link'));
  }

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress}>
      <FormIcon source={getAssetIDByName('ic_download_24px')} style={{ marginRight: 8, marginLeft: -8, opacity: 1 }} />
    </TouchableOpacity>
  );
};
