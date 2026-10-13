/**
 * Patch the in-chat messages (RowManager.generate)
 */
import { findByStoreName, findByName, findByProps } from '@vendetta/metro';
import { after } from '@vendetta/patcher';
import filetypes from '../filetypes';

const ThemeStore = findByStoreName('ThemeStore');

const RowManager = findByName('RowManager');
const getEmbedThemeColors = findByName('getEmbedThemeColors');
const CodedLinkExtendedType = findByProps("CodedLinkExtendedType")?.CodedLinkExtendedType ?? { EMBEDDED_ACTIVITY_INVITE: 3 };

function getCodedLinkColors() {
  let colors = getEmbedThemeColors?.(ThemeStore.theme)?.colors || {
    acceptLabelGreenBackgroundColor: -14385083,
    headerColor: -6973533,
    borderColor: 268435455,
    backgroundColor: -14276817,
  };
  return {
    acceptLabelBackgroundColor: colors.acceptLabelGreenBackgroundColor,
    headerColor: colors.headerColor,
    borderColor: colors.borderColor,
    backgroundColor: colors.backgroundColor,
  };
}

function makeRPL(filename = 'unknown', size = '? bytes') {
  return {
    ...getCodedLinkColors(),
    thumbnailCornerRadius: 15,
    headerText: '',
    titleText: 'File' + ' — ' + size,
    structurableSubtitleText: null,
    type: null,
    extendedType: CodedLinkExtendedType.EMBEDDED_ACTIVITY_INVITE,
    participantAvatarUris: [],
    acceptLabelText: 'Preview',
    splashUrl: null,
    noParticipantsText: '\n' + filename,
    ctaEnabled: true,
  };
}

export default function patch() {
  return after('generate', RowManager.prototype, (_, row) => {
    const { message } = row;
    if (!message) return;
    if (!message.attachments?.length) return;
    let rpls: any[] = [];
    let attachs: any[] = [];
    message.attachments.forEach((attachment) => {
      if (filetypes.has(attachment.filename.toLowerCase().split('.').pop())) {
        rpls.push(makeRPL(attachment.filename, attachment.size));
      } else {
        attachs.push(attachment);
      }
    });
    if (rpls.length) {
      if (!message.codedLinks?.length) message.codedLinks = [];
      message.codedLinks.push(...rpls);
      message.attachments = attachs;
    }
  });
}
