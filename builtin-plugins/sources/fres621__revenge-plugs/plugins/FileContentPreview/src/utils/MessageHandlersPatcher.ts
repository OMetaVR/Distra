/** MessageHandlersPatcher
 *  Most code here is old and based on https://github.com/acquitelol/better-chat-gestures/blob/master/src/index.tsx
 *  except I over-engineered a lot
 */

import { findByProps } from '@vendetta/metro';
import { before } from '@vendetta/patcher';

const { MessagesHandlers } = findByProps('MessagesHandlers');
let origGetParams: any;
let patches: Map<symbol, () => void> = new Map();
let pendingPatches: Map<symbol, [string, (args: any[]) => any]> = new Map();
let _handlers: any;
const isPatchedSymbol = Symbol('isPatchedSymbol');

type KnownHandlers =
  | 'handleTapImage'
  | 'handleTapChannel'
  | 'handleLongPressChannel'
  | 'handleTapAttachmentLink'
  | 'handleLongPressAttachmentLink'
  | 'handleTapCall'
  | 'handleTapMention'
  | 'handleTapCommandMention'
  | 'handleLongPressCommandMention'
  | 'handleTapGuildEventLink'
  | 'handleTapLink'
  | 'handleLongPressLink'
  | 'handleTapReaction'
  | 'handleTapReactionOverflow'
  | 'handleLongPressReaction'
  | 'handleOpenSticker'
  | 'handleTapAvatar'
  | 'handleTapUsername'
  | 'handleLongPressUsername'
  | 'handleOpenProfile'
  | 'handleTapThreadEmbed'
  | 'handleTapReply'
  | 'handleTapSummary'
  | 'handleTapSummaryJump'
  | 'handleLongPressMessage'
  | 'handleInitiateReply'
  | 'handleInitiateThread'
  | 'handleInitiateEdit'
  | 'handleTapMessage'
  | 'handleTapSeparator'
  | 'handleTapUploadProgressClose'
  | 'handleTapCancelUploadItem'
  | 'handleTapSpotifyResource'
  | 'handleTapActivityResource'
  | 'handleTapGuildEventInvite'
  | '_questsEmbedOnPress'
  | '_questsEmbedOnAccept'
  | 'handleTapInviteEmbedAccept'
  | 'handleTapInviteEmbed'
  | 'handleTapVoiceChannelPreview'
  | 'handleTapJoinActivity'
  | 'handleAcceptInstantInvite'
  | 'handleTransitionToInviteChannel'
  | 'handleTapGiftCodeEmbed'
  | 'handleTapGiftCodeAccept'
  | 'handleTapReferralRedeem'
  | 'handleTapEmoji'
  | 'handleTapTimestamp'
  | 'handleTapInlineCode'
  | 'handleTapRoleIcon'
  | 'handleTapGameIcon'
  | 'handleTapSuppressNotificationsIcon'
  | 'handleTapConnectionsRoleTag'
  | 'handleTapTimeoutIcon'
  | 'handleReveal'
  | 'handleTapButtonActionComponent'
  | 'handleTapSelectActionComponent'
  | 'handleTapWelcomeReply'
  | 'handleTapInviteToSpeak'
  | 'handleTapAutoModerationActions'
  | 'handleTapAutoModerationFeedback'
  | 'handleTransitionToThread'
  | 'handleTransitionToMessage'
  | 'handleTapFollowForumPost'
  | 'handleTapShareForumPost'
  | 'handleTapSeeMore'
  | 'handleCopyText'
  | 'handleTapTag'
  | 'handleTapRemix'
  | 'handleTapOpTag'
  | 'handleMediaAttachmentPlaybackStarted'
  | 'handleMediaAttachmentPlaybackEnded'
  | 'handleVoiceMessagePlaybackFailed'
  | 'handleTapPostPreviewEmbed'
  | 'handleTapDismissMediaPostSharePrompt'
  | 'handleTapChannelPromptButton'
  | 'handleTapObscuredMediaLearnMore'
  | 'onTapObscuredMediaToggle'
  | 'handleTapSafetyPolicyNoticeEmbed'
  | 'handleTapSafetySystemNotificationCta'
  | 'handleTapPollAnswer'
  | 'handleTapPollSubmitVote'
  | 'handleTapPollAction'
  | 'handleLongPressPollImage'
  | 'handleTapCtaButton'
  | 'handleMessageAccessibilityAction'
  | 'handleTapForwardFooter'
  | 'handleTapInlineForward'
  | 'handleTapSoundmoji'
  | 'handleTapClanTagChiplet'
  | 'handleTapContentInventoryEntryEmbed'
  | 'handleTapAppMessageEmbed';

function patchHandlers(handlers: any) {
  if (handlers[isPatchedSymbol]) return;
  handlers[isPatchedSymbol] = true;
  _handlers = handlers;
  for (let [a, val] of pendingPatches) {
    patches.set(a, before(val[0], _handlers, val[1]));
    pendingPatches.delete(a);
  }
}

/** Init the patcher */
function start() {
  if (origGetParams) console.error(`Tried to start the MessageHandlersPatcher when it's already started`);
  origGetParams = Object.getOwnPropertyDescriptor(MessagesHandlers.prototype, 'params')!.get!;
  Object.defineProperty(MessagesHandlers.prototype, 'params', {
    configurable: true,
    get() {
      this && patchHandlers(this);
      return origGetParams.call(this);
    },
  });
}

/** Un-do everything done by start() */
function end() {
  if (!origGetParams) console.error("Can't unpatch MessageHandlers when it was never patched in the first place");
  Object.defineProperty(MessagesHandlers.prototype, 'params', {
    configurable: true,
    get: origGetParams,
  });
  if (_handlers) _handlers[isPatchedSymbol] = false;
  _handlers = undefined;
  origGetParams = undefined;
}

export const UnpatchALL = Symbol('unpatchALL');

/**
 * Adds a message handlers patch, also inits the patcher if it's the first patch
 * @example
 * patch("handleTapInviteEmbed", ([data]) => console.log(data));
 */
export function patch(fn: KnownHandlers, callback: (args: any[]) => any) {
  if (!origGetParams) start();
  let a = Symbol('patch');
  if (_handlers) {
    patches.set(a, before(fn, _handlers, callback));
  } else {
    pendingPatches.set(a, [fn, callback]);
  }
  return () => unpatch(a);
}
export function unpatch(patch: symbol) {
  if (patch == UnpatchALL) {
    for (let undo of patches.values()) undo();
    patches.clear();
  } else if (pendingPatches.has(patch)) {
    pendingPatches.delete(patch);
  } else if (patches.has(patch)) {
    patches.get(patch)!();
    patches.delete(patch);
  } else {
    console.error(`MessageHandlersPatcher.unpatch should be used like: unpatch(patch) or unpatch(UnpatchALL). ${String(patch)} was given instead.`);
  }
  if (!patches.size) end();
}

export default { patch, unpatch, UnpatchALL };
