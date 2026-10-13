import { findByStoreName, findByProps } from '@vendetta/metro';
import filetypes from '../filetypes';
import MessageHandlers from '../utils/MessageHandlersPatcher';
import { FCModal } from '../ui/FCModal';

const SelectedChannelStore = findByStoreName('SelectedChannelStore');
const MessageStore = findByStoreName('MessageStore');
const modals = findByProps('pushModal');

export default function patch() {
  return MessageHandlers.patch('handleTapInviteEmbed', ([{ nativeEvent }]) => {
    const { index, messageId } = nativeEvent;
    let channel = SelectedChannelStore.getChannelId();
    let message = MessageStore.getMessage(channel, messageId);
  
    /** Starter thread messages */
    if (message.messageReference && message.messageReference.type == 0 && message.messageReference.channel_id != channel) {
      message = MessageStore.getMessage(message.messageReference.channel_id, message.messageReference.message_id);
    }
    /** Forwards */
    if (message.messageSnapshots?.[0]?.message) {
      message = message.messageSnapshots[0].message;
    }
    
    let codedLinks = message.codedLinks;
    let textFiles = message.attachments.filter((attachment) => filetypes.has(attachment.filename.toLowerCase().split('.').pop()));
    if (index >= codedLinks.length) {
      const attachmentIndex = index - codedLinks.length;
      const attachment = textFiles[attachmentIndex];
      const { filename, url, size } = attachment;
      modals.pushModal({
        key: 'file-content-preview',
        modal: {
          key: 'file-content-preview',
          modal: FCModal,
          props: { filename, url, bytes: size },
          animation: 'slide-up',
          shouldPersistUnderModals: false,
          closable: true,
        },
      });
    }
  });
}
