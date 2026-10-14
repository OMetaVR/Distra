# Plugin sweep (Discord 348, Distra dev build)

Results of enabling each built-in plugin on a live device, one at a time, with every earlier
plugin left enabled (so conflicts between plugins show up). "Works" means the plugin started
without errors and its main feature was observed working; anything that needs a person (UI
taps, sending messages, account actions) is listed under "to check".

## Changes that affect every plugin

- Plugins now start before Discord's UI first renders (as in Vendetta). Patches on memo
  components (most of Discord's UI) only reach components mounted afterwards, so plugins
  started after the UI only affected screens opened later. Update checks for installed
  plugins run after the UI is up.
- Vendetta plugins log every lookup that finds nothing (`[<plugin>] Lookup found nothing: ...`),
  visible in the debugger log.
- Renamed icons: plugins asking for old icon names (`ic_message_delete`, `Warning`, `CheckmarkIcon`,
  ...) get the closest current icon (src/lib/assets.ts).
- `findByProps("ActionSheetRowGroup")`, `("ActionSheetRow", "Group")`, `("ActionSheetRowIcon")`:
  these became statics of `ActionSheetRow`; the lookups return them again.

- Old native module names (`DCDFileManager`, `MediaManager`, `DCDChatManager`, ...) never resolved on the
  device: iOS makes `nativeModuleProxy` read-only, so the alias wrapper wasn't installed (it only worked
  in tests). The aliases are now put on `ReactNative.NativeModules` instead.
- Plugins rewriting chat rows (`DCDChatManager.updateRows`) got iOS's leftover native DCDChatManager,
  which Discord no longer calls, so their patches never ran. They now get the shim Discord's rows go
  through (verified: a plugin-style hook sees row updates).

- `Linking.openURL` with a discord.com message/channel link now navigates inside Distra. iOS otherwise
  hands those links to whichever app claims them (another Discord install), which /firstmessage and
  other plugins hit.
- `vendetta.debug.getDebugInfo()` reports React, Hermes, OS and device like Vendetta's (sysinfo commands).

- Renamed theme colors (TEXT_NORMAL, HEADER_PRIMARY, INTERACTIVE_NORMAL, BACKGROUND_PRIMARY, ... 32 names used
  by built-in plugins) resolve to their current tokens; `constants.ThemeColorMap` exists again.
- `Flux.useStateFromStores` (and the other store hooks) are available on Flux again; 348 moved them.
- Enmity lookups honor `{ default: false }` (they only understood `defaultExport`).
- Enmity plugins asking for the old default-exported Button get an adapter over the current Button.
- Vendetta plugins get their own patcher, so `unpatchAll()` and disabling a plugin only remove that
  plugin's patches (it didn't exist before; CopyBios called it).

- Built-in manifests keep their `vendetta`/`bunny` sections. Plugins read `manifest.vendetta.icon` for
  settings tiles; it was dropped, so Cloud Sync, Better Eval, Plugin Browser etc. showed no icon (and
  logged lookups for an empty icon name).

- Local ("only you") replies: Enmity's `sendReply` with embeds and Vendetta's `{ type: 4, data }` /
  flags-64 command results are now shown as a local Clyde message with the embeds (src/lib/localMessage.ts).
  Before, `sendReply` passed an embed object where 348 wants text, and `{ type: 4 }` results were
  SENT as a (blank) real message. Affects /pfp, /rory, /nekos (whisper), /userinfo, /serverinfo, ...
- `findByProps("ScrollView")` / Enmity `getByProps("View")` return React Native again (Animated now also
  exports View/ScrollView); More Alts and TokenUtils patch `View.render`.
- Testing note: I enabled all plugins together on your device for collision testing. UwUify, Piratifier,
  Silent Messages and Rich Presence were switched off again because they change what you send / your
  account state. Everything else that works is left on.

- Settings-page sweep: every enabled plugin's settings page was opened inside Settings and checked for
  our error page (not just "no crash"). 51 pages, 51 render after fixing Dislate (it displayed
  `manifest.hash`, which built-in manifests now carry). Pages only ever got *opened*; their controls
  still need a person.

- Enmity plugins' `Patcher.before` is a real before-hook now, and patching Enmity's lazy common modules
  (`Messages`, `Dispatcher`, ...) patches the real module. Before, patches on them silently never fired
  (NoTracking, SecretMessage and every Enmity plugin patching Messages were inert).

## Round 2 (user feedback, 2026-10-14 evening)

Core changes: `src/core/errorGuard.ts` contains fatal JS errors whose stack has plugin frames (an exception in an onPress used to terminate the whole app); `url.openDeeplink` exists and `discord.gg` invites open in-app; `src/lib/chatBar.tsx` + `distra.chatBar.register()` put buttons in the chat bar; `src/lib/jsx.ts` finds memo/forwardRef component names; the Settings list gets a "Plugin Settings" section for rows plugins pin themselves; the remote debugger gives a command 25s before moving on (one hung eval used to block the phone's command loop until the app restarted).

| Plugin | State | Notes |
| --- | --- | --- |
| Global Badges | Fixed | Icons: 348 builds a badge's icon from `getProfileBadgeIconUrl`, patched for `gb-` ids (verified, icons resolve). New "Show every badge" raises Discord's 6-badge limit (verified: all 13 render, wrapped). The BadgeVault link crashed because `url.openDeeplink` was missing. |
| No typing | Extended | Chat bar keyboard button (slashed while hidden) and a settings page with a switch for it. |
| Hide Chat Buttons (core) | Extended | "Swipe to collapse". Untested on device. |
| Read All | Fixed (untested) | Looked the hook up by function name, which iOS strips; now by file path. The hook only runs where Discord mounts the guilds bar (in 348's dock layout). |
| Server Drawer | Added | kmmiio99o's drawer. Options: side list for open folders, separator after open folders. It replaces the quest dock's expanded content, so check by dragging the dock up. |
| Silent Leave | Extended (untested) | "Leave silently" on the group DM leave confirmation (hooks the sheet's leave row, then `Alerts.show`), plus /leave silent. |
| Silent Messages | Rebuilt settings | Table rows; page renders. |
| SecretMessage | Fixed | Toggles re-render live; "Auto shorten" icon (`ic_dm_user` is mapped to UserIcon). |
| NSFW Blur | Settings removed | The page only said it was working. |
| Commands | Fixed | Header fits on one line. |
| More Alts! | Fixed | Emoji cog replaced by an icon. |
| Cloud Sync | Fixed | Title no longer bounces in developer mode. |
| Message Logger (core) | Fixed (untested) | The full-size viewer showed the grey copy because rows shared attachment objects with the message store; rows now get copies. |
| Fake Nitro (core) | Verified | A Freemoji link in a message becomes an inline custom emoji node (checked on a local message). |

Removed: Bluetooth Audio Fix (Android only), Plugin Browser, Themes+, NoTracking (Clean URLs), Stealmoji (EmotesPlus).

## Results

| Plugin | Result | Notes / to check |
|---|---|---|
| Message Logger (core) | Works | Deletes keep the message in red live; edits show history (no extra "(edited)"); own edits recorded; deleted images greyed in chat with the original kept for the full viewer; long-press menu hides Delete/Silent Delete on deleted messages and adds Remove from Log. To check: tap a deleted image to confirm the viewer opens the saved original. |
| Platform Indicators (core) | Fixed | Names are now drawn by UsernameWithEffects; icons attach to it. Seen working in DM list, DM header and profile. To check: member list in a server. |
| Radial Status (core) | Fixed (your notes) | DM-list rings were too wide: the avatar's own margin ended up inside the ring. Margins/positioning now move to the ring, and the ring uses negative margins so the avatar's layout box (and avatar decorations around it) stay where they were; it is centered in its row (was pinned to the top, which shifted DM avatars up). The dark spot by your profile avatar was the avatar decoration's cutout for the old status dot; decorations no longer get that cutout. To check: DM list rings fit; your profile avatar at the bottom has no dark spot. |
| Hide Chat Buttons (core) | Works | Gift and app launcher flags are off on the chat bar (seen in a DM). |
| 🎄 Christmas Counter | Works | Toast once a day, date saved. To check: settings page. |
| 🗿 (Moyai) | Fixed | iOS can't play the original OGG sound; now an MP3 copy (builtin-plugins/assets/moyai-thud.mp3, served from the repo, or from this PC in dev builds). Verified: a 🗿 reaction plays the sound. Needs the repo pushed as OMetaVR/Distra for release builds. |
| ActionSheetFinder | Works | Logs and toasts the name of each action sheet opened (verified with the message long-press sheet). |
| Addon List | Works | /plugin-list and /theme-list (verified with sending captured). Enabled built-ins now count as installed plugins for Vendetta plugins (they were invisible before). Collision: the Commands plugin registers commands with the same names; both appear in the / menu. With ~25 plugins the list passes 2000 characters and it asks for Split Large Messages, as upstream. |
| AltMediaPicker | Starts cleanly, patched | Replaces the attach-file handler with the photo library picker. Added an id per picked photo (348 keys uploads by it). To check (UI): attach button opens the photo picker; several photos attach separately. |
| AlwaysTrust | Works | MaskedLinkStore.isTrustedDomain now returns true, which is what 348's link handling checks. |
| Animal Commands | Works | /dog /cat /fox ... (verified /cat with sending captured). The missing locale-module lookups are fallbacks; it uses LocaleStore. |
| AnonymousFileNames | Starts cleanly | uploadLocalFiles is gone since 284; it patches CloudUpload instead (exists in 348). To check: upload a file and confirm the name is randomized. Upstream warning: breaks file options in slash commands. |

### Fixed without the device (phone was locked); verify on device

| Plugin | Change |
|---|---|
| BetterNSFWGateBypass | Settings icons used a removed `getAssetByName` export; now `getAssetIDByName` with current icon names. |
| Keyword Tracker, Commands, Multi Scrobbler, Better Eval, nexpid plugins (pinToSettings) | Their settings shortcut looks for the client-mod section by name ("Bunny", "Revenge", "Kettu"); "Distra" added. |
| FavouriteAnything | Discord 348 renamed GIFFavButton to MediaViewerOverlayButtonFavoriteGIF; looked up by its file name now. Whether non-GIF media get the star still depends on the media viewer, to check. |
| Enmity plugins | Lookups that find nothing are logged with the plugin's name, like Vendetta plugins. |
| Chatbox Avatar | Works | Your avatar renders inside the chat bar actions. |
| Better Eval | Starts cleanly | Registers its "Evaluate JavaScript" tile in the Distra section (patched to recognize Distra). Its list patch runs once, on the first settings list built. To check: the tile appears in Settings > Distra and the eval page works. |
| BetterCommandPopout | Not applicable on 348 | The executed-command popout it extends no longer exists; tapping a used command opens AppInteractionInfoActionSheet, and the message no longer carries the application command id its mention needs. Harmless while enabled. |
| BetterNSFWGateBypass | Fixed | 348 moved shouldNSFWGateGuild into AgeGateUtils; the plugin failed to start (patched a missing function). Now patched where it lives; verified the gate check returns false. Settings icons fixed too. |
| Bluetooth Audio Fix | Android only | Patches NativeAudioManagerModule.setCommunicationModeOn, which only exists on Android; on iOS the module is absent and the plugin can't load. Left disabled. |
| BrainFuckEval | Works | /bfeval runs; output posts as a local Clyde message (ephemeral by default). |
| BypassPinPrompt | Fixed | Skipped the pin prompt only; now also unpin, in any language (uses Discord's own title strings). Verified both confirm without showing. |
| catbox.moe | Starts cleanly | Hooks CloudUpload's compression step and adds /litterbox. To check: upload a large file (should go to catbox) and /litterbox. The optional cleanup of failed sends has no API in 348 (skipped). Removed upstream's "warm-up", which uploaded a junk file to catbox and litterbox on every app start (litterbox started answering 403). |
| Catgirls | Works | /nekos (verified with sending captured); whisper mode posts a local Clyde reply. |
| Char Counter | Works | Counter pill is rendered above the chat input with the input attached. To check: count updates while typing. |
| ChatAliases | Works | /setAlias, /alias, /removeAlias (verified with sending captured). |
| Clean URLs | Works | Strips trackers from links you send (verified with sending captured). Links in received messages use the chat-row hook, which only started working with the DCDChatManager fix above. |
| ClientThemes | Fixed side effect | canUseClientThemes returns true (themes unlocked). Upstream turned off "sync appearance settings" on every start, which reset Developer Mode (and probably other appearance settings) to local defaults each launch. Patched: sync is only turned off while a client theme is actually in use, and back on otherwise/on unload. Developer Mode is on again and survives reloads (verified). To check: gradient theme persists across launches; your appearance settings are as you want. |
| ClipboardGIFSend | Starts cleanly | 348's GIF picker still calls trackSelectGIF before sending, which is what it keys on. To check: picking a GIF copies its link instead of sending. |
| Cloud Sync | Fixed | Crashed on start: it subscribes to Vendetta's plugin/theme storage emitters (Symbol vendetta.storage.emitter), which Distra didn't expose. Storage proxies and vendetta.plugins.plugins/themes now carry a Vendetta-compatible emitter. To check: sign in to the sync service and sync. |
| Commands | Works | Checked /catfact /dogfact /useless /gary /plugin-list /sysinfo (sysinfo was mostly "Unknown" until getDebugInfo was filled in). /firstmessage opened the other Discord app; fixed by keeping discord.com links in-app. Not run: /ip, /invite create|view|revoke, /konosend, /spotify * (need activity). Collision: /plugin-list and /theme-list also come from Addon List. |
| CopyBios | Starts cleanly | Patches BioText (exists in 348) to make bio text selectable. To check: long-press a bio in a profile to select/copy. |
| CreateWebhooks | Removed | Built into Discord (Integrations > Webhooks has a create button). Moved to the catalog's removed list. |
| Custom Voice Messages | Starts cleanly | Hooks CloudUpload and MessageStore's create/load/update handlers (all found in 348). To check: send an audio file; it should arrive as a voice message (mobile only, upstream note). |
| Dashless | Works | No rendered text contains dashes after enabling (patches View.render globally, as upstream). |
| devkitplus | Works, patched | Adds dk.* and lookup helpers as globals (verified). Its unload deleted every global it set, including Distra's global ReactNative/React; now it skips globals that already exist. |
| Dislate Lite | Starts cleanly | "Translate Message" is added to the message long-press menu (verified). To check: translating a message (Google/DeepL request) and /translate commands. |
| EmotesPlus | Starts cleanly, compat fix | Its buttons used Discord's old default-exported Button (Button.Colors/Sizes), which no longer exists; Enmity plugins asking for it now get an adapter over the current Button. To check: tap a custom emoji in a message; the sheet should show Copy Emote URL / Copy as Image / clone buttons. |
| FakeProfileThemesAndEffects | Starts cleanly | ProfileEffectStore/Spacing/FlashList use the fallbacks added earlier (effects come from the collectibles shop data). To check: profile editor shows theme colors/effect pickers; others' fake themes render. If FlashList is missing the effect picker list may be empty. |
| FavouriteAnything | Fixed | Found its component under the 348 name (MediaViewerOverlayButtonFavoriteGIF) and patches it now (it logged "not found" every launch before). To check: open a non-GIF image/video in the media viewer; a favourite star should appear and add it to favourites. |
| FileContentPreview | Works | Text-like attachments become a "Preview" card in chat (verified on a fake .txt message). To check: tapping Preview opens the file viewer modal. |
| FileSizeOnPicker | Starts cleanly | Patches Pressable (memo of a function in 348, safe) and keys on localImageSource, which 348's media picker still uses. To check: open the attachment picker; photos show a size tag. |
| Freecons | Works | All 25 app icons now show as free (were 24 premium). To check: pick one in Appearance > App Icon. |
| Freemoji | Fixed | Crashed on messages without text (command results) and on emojis from servers you left. Its "weird embed" is the Hyperlink emoji setting (on by default; sends [name](link)). To check: send an emoji you can't normally use. |
| FreeStickers | Works | canUseCustomStickersEverywhere returns true; sendStickers is hooked to send unavailable stickers as links/GIFs. To check: send a sticker from another server. |
| FriendsSince | Removed | Built into Discord (profiles show when you became friends). Moved to the catalog's removed list. While testing it, it crashed Discord on profiles; the compat fixes that came out of that (Flux.useStateFromStores, ThemeColorMap, Enmity `default` option) stay. |
| Geastures+ | Starts cleanly | Hooks handleAddDefaultDoubleTapReaction (exists in 348); double-tap-to-react is enabled as it requires. To check: double-tap a message runs the configured gesture action instead of the default reaction. |
| GetPFP | Works | /pfp posts a local Clyde reply with the avatar (verified). |
| GetThatRory | Works | /rory posts a local Clyde reply with a Rory image (verified). |
| Gif Categories | Starts cleanly | GIF picker store, categories page, header and Navigator all found (close button uses the getHeaderCloseButton fallback). To check: custom GIF categories in the GIF picker. |
| GifRoulette | Works | /gifroulette picks a random favourite GIF (verified with sending captured). |
| Global Badges | Starts cleanly | useBadges and Bunny's onJsxCreate are available; badges are fetched from its API. To check: open the profile of someone with Vencord/Aliucord/etc. badges. |
| Cloud Sync (settings crash) | Fixed | Opening Settings crashed Discord: nexpid's plugins expect build-time constants (PREVIEW_LANG, DEFAULT_LANG, IS_DEV, ...) that Distra's plugin build didn't define. Now defined like nexpid's build (affects all 14 nexpid plugins). Every settings tile title evaluates without errors. |
| Cloud Sync (icon, service) | Fixed; usage note | Icon was missing because the manifest's vendetta.icon was dropped (fixed for all plugins). Licensing: the plugin is CC-BY-4.0 (credited in builtin-plugins/README.md, license kept) and its backend nexpid/CloudSync is MIT. It talks to nexpid's hosted service by default and has a built-in custom host setting, so using it is the intended use; but it signs you in with Discord and stores your plugin/theme lists there, which the plugin's warning now says. Courtesy: telling nexpid that Distra ships it would be polite since it adds load to their server. |
| GuildLurk | Starts cleanly | joinGuild, getGuildsTree, getGuildCount, lurkingGuildIds, transitionToGuildSync all exist. Not run: lurking is an account action. To check: lurk a public server by id. |
| Hidden Channels | Works | Of 1320 channels in your servers, 804 are hidden to you; the permission override makes all of them pass the view check (verified), and a "This channel is hidden" popup comes first. Discord's servers still refuse to send messages for channels you truly can't read, so those open empty. To check: open a hidden channel; the lock icon next to hidden channel names. |
| HideBlockedAndIgnoredMessages | Starts cleanly | isBlocked/isIgnored exist; it filters LOAD_MESSAGES_SUCCESS / MESSAGE_CREATE events and rows. To check: a blocked user's messages are not shown. |
| UwUify | Works (disabled) | Rewrites outgoing messages (verified: "Hello there" -> "Hewwo thewe"). Left off because it changes everything you send. |
| Piratifier | Not run (disabled) | Changes outgoing messages like UwUify; left off. |
| Silent Messages | Not run (disabled) | Prefixes messages with @silent; left off. |
| Rich Presence | Not run (disabled) | Changes your presence; left off. To check: set an activity in its settings. |
| InfoCommands | Works | /userinfo (verified: full embed with 10 fields). Also /serverinfo and /inviteinfo. |
| Bluetooth Audio Fix, BetterCommandPopout | Not applicable | See above. |
| RDT | Removed | Needs a React DevTools global that release builds don't have; replaced by Developer > Remote debugger. |
| Jump To Top | Starts cleanly | Chat jump button and channel/forum long-press sheets resolve by file path (all three exist). To check: long-press a channel/forum post for the jump option. |
| No typing | Starts cleanly | startTyping exists and is patched. To check: typing in a chat doesn't show you as typing to others. |
| NoAutoReplyMention | Starts cleanly | createPendingReply exists and is patched. To check: replying defaults to no @ping. |
| NSFW Blur | Starts cleanly | createMessageContent exists and is patched. To check: NSFW-marked images are blurred. |
| Override User Avatars | Starts cleanly | getUserAvatarURL exists. To check: set a custom avatar for a user in its settings. |
| Read All | Starts cleanly | GuildStore/ReadStateStore/haptics exist. To check: its button marks every server read. |
| MoreConfirm | Works | Confirms voice calls, video calls, friend requests and blocking. Settings page has one switch per confirmation (all on by default; verified the page, storage and the call prompts with the call itself blocked). Discriminator "0" names are shown without "#0". |
| NoMentionCount | Starts cleanly | Read-state stores and their methods exist and are patched. To check: hidden channels/servers show no mention badge. |
| NoIdle | Starts cleanly | Filters idle status events on the dispatcher. |
| NoBandwidthKick | Starts cleanly | Patches Timeout.prototype.start (exists). |
| NoCompression | Starts cleanly | CloudUpload.reactNativeCompressAndExtractData and handleError exist and are patched. To check: send an image; it uploads uncompressed. |
| Mute New Guilds | Starts cleanly | invites.acceptInvite and updateGuildNotificationSettings exist. To check: join a server via invite; it starts muted. |
| SearchActionSheet | Starts cleanly | SearchListRow and showLongPressMessageActionSheet exist. To check: long-press a search result. |
| UserPFP | Starts cleanly | getUserAvatarURL/getUserAvatarSource exist and are patched; its server lookup needs network. To check: a user with a UserPFP avatar shows it. |
| UserBG | Starts cleanly | getUserBannerURL exists and is patched. To check: a user with a UserBG banner shows it. |
| Tenor Gif Fix | Starts cleanly | downloadMediaAsset exists and openLazy is patched. |
| Use System Emoji | Works now | Rewrites emoji in chat rows; was inert until the chat-row hook was fixed. To check: custom-looking unicode emoji render as system emoji. |
| Stealmoji | Starts cleanly | Emoji lookups, action sheet pieces, uploadEmoji and permission store all exist; MessageEmojiActionSheet key still exists in 348. To check: tap an emoji in chat; steal options appear. |
| SpotifyPreview | Fixed | Tapping a Spotify link opens the preview panel without Discord's "Leaving Discord" link-safety modal behind it (the link handler is replaced for Spotify links instead of clearing the href; verified: sheet opens, no modal). It cannot render inline under the link: chat rows are native and cannot host a WebView. |
| SlowmodeExtended | Starts cleanly | SLOWMODE_VALUES exists in the channel settings module. To check: slowmode picker offers more values. |
| HypeSquadSwitcher | Starts cleanly | /hypesquad registers; REST client exists. Not run: changes your account. To check: its settings page. |
| SilentLeave | Starts cleanly | /leave registers; REST client exists. Not run: leaves a server. |
| Unfurl | Works | /unfurl and /furl register and reply locally (verified: "Generating Longlink.."). |
| NoTracking | Works | Strips tracking from links you send (verified together with Clean URLs: the tag/utm params are gone). |
| LoginSound | Works | The sound URL is a reachable MP3 and prepares fine through the sound module (verified). To check: it plays on app start. |
| ViewRaw | Starts cleanly | Adds "View Raw" to the message long-press menu (verified, coexisting with Translate, Silent Delete, Delete). To check: opening it shows the raw message JSON. |
| SilentDelete | Works | "Silent Delete" row appears in the message menu next to Delete (verified). Collision with Message Logger: on messages the logger has marked deleted both Delete rows are hidden. |
| KonoChan-Randomizer | Starts cleanly | /konoself and /konosend register; sendBotMessage/sendMessage exist. |
| ValidUser | Starts cleanly | Falls back to the REST API for unknown users since gateway helpers moved; fetches one user at a time. |
| Message Preview | Works | Settings page renders its real controls (Preview type: Popup / Ephemeral message). To check: long-press a message link / use the preview. |
| Plugin Browser | Starts cleanly | Settings page renders; needs its server list. Overlaps with Distra's own Plugin Library. |
| Plugin Embeds | Starts cleanly | Settings page renders. To check: plugin links in chat get install cards. |
| Kazum Kiryu Facecam | Fixed | Nothing showed because nexpid plugins import images as `{ uri, width, height }` objects and the plugin build produced bare data-URL strings (not a valid Image source). Fixed in scripts/build-plugins.mjs for the nexpid repo (also restores NexxUtils thumbnails, Song Spotlight and Plugin Browser icons). Verified: settings preview image and the in-chat overlay (slides in when the keyboard opens). |
| Monet Theme | Starts cleanly | Settings page renders. Theme-style plugin: Distra has no theme engine yet (see ROADMAP), so its colors may not apply. |
| Themes+ | Starts cleanly | Settings page renders. Same caveat as Monet Theme (no theme engine yet). |
| Song Spotlight | Fixed | The profile card had a translucent grey fill that Discord's own About Me card doesn't have, so it showed as a box; it is transparent now (verified on the own profile). Service/player icons render again (image import fix). Its server returns 401 until you sign in (expected). |
| NexxUtils | Fixed | Test Toast crashed the app: `vendetta.ui.assets.all` didn't exist (now provided). Add Listen Along: SpotifyPlayButton is no longer rendered by Discord 348 (skipped with a warning); the profile activity button (PlayOnSpotifyButton) is patched as a function component instead. Opening/closing a module page crashed on unmount (SmartMention effect returned a Promise); fixed for all nexpid plugins. To check: Listen Along button next to a friend's Spotify activity on their profile (needs someone listening). |
| No Embed Copy | Starts cleanly | Hooks the embed copy action; to check: long-press an embed. |
| Spotify Fix | Fixed | Threw on every SPOTIFY_PLAYER_STATE event without a payload; payload is checked now. |
| RemoveUserBanner | Starts cleanly | Patches several places (user store, profile store, banner URL helpers); the ones missing in 348 have fallbacks. |
| ReviewDB | Starts cleanly | 348's segmented profile tabs are handled by its segmented-profile patch (SegmentedControlPages exists). To check: a Reviews section on a profile. |
| SecretMessage | Works (partly) | Encrypt-on-send verified (message content becomes ciphertext when its switch is on); decrypt hooks run on MessageStore handlers. The gift-button toggle and "Send secret message" placeholder are skipped (Discord 348's Pressable/ChatInput have no render method to patch): switch it on in the plugin's settings or with /secret. Prebuilt upstream file, patched in place. |
| More Alts! | Starts cleanly | Starts after the View.render lookup fix; its Settings tile (Distra section) and account switching need a person to try. |
| TokenUtils | Starts cleanly | Starts after the View.render lookup fix. Sensitive: shows/copies your account token; keep it off unless needed. |
| NoTracking | Works | Strips tracking parameters from links you send (Enmity before-hook on sendMessage; didn't fire before the Enmity patcher fixes). |
| Fake Nitro (core) | Implemented, not yet verified on device | Freemoji / FreeStickers / Equicord FakeNitro image links (cdn.discordapp.com/emojis/<id>.<ext>, media.discordapp.net/stickers/<id>.<ext>) render as real emoji and stickers, yours and other people's. Patches parseMessageMarkup (links become `<:name:id>`), getMessageStickers (fake sticker items) and RowManager#generate (drops the link embed). To check: enable Fake Nitro in the Plugin Library; a Freemoji message shows inline emoji, tapping opens the emoji sheet; a FreeStickers message shows a sticker, tapping opens sticker details. |
