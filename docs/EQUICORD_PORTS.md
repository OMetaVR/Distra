# Equicord plugins worth porting to Distra

Research only (no code changed). Source: Equicord main, 198 plugins in `src/equicordplugins` + 166 in `src/plugins` (364 total, minus `_api`/`_core`). Reviewed from each plugin's `index.ts(x)` (description, patches, flux, context menus). I did not open the Discord 348 bundle for this doc, so every "348 internals" entry below names the kind of hook needed and the likely place to look; exact module names must be verified with the RE tooling before implementing.

## Licensing (read first)

Equicord is **GPL-3.0-or-later** (`package.json`, every file carries the SPDX header; most code is Vencord, (c) Vendicated and contributors). Distra's vendored plugins each keep their own upstream license (see `builtin-plugins/README.md`). Copying or translating Equicord code into Distra would pull the combined work under GPL-3.0 terms and clash with that per-plugin license model. So: **port behaviour, not code.** Reimplement from the described behaviour, with no patch regexes or component code copied. Equicord's patches target desktop webpack minified code and are useless on Hermes anyway; only the ideas (what to hook, what settings to expose) carry over. Credit the idea in the plugin header when it is a near-copy of a feature.

Mobile hook cheat sheet (from `docs/PLUGIN_TESTING.md`): Flux dispatcher events and stores (`useStateFromStores`), chat-row rewrite through the `DCDChatManager.updateRows` shim, message long-press action sheet (`showLongPressMessageActionSheet`, `ActionSheetRow`), Distra settings section, local Clyde messages (`src/lib/localMessage.ts`), `CloudUpload` for uploads, profile cards (`UserProfileCard`/`AboutMe`), patching `View.render`/`Pressable`, command registry.

## 1. Ranked shortlist (25)

Difficulty: easy = settings + store/flux or one function patch; medium = chat-row or component patch with some UI; hard = new layout or several native components.

| # | Equicord plugin | What it does | Why mobile | Diff. | Needs on 348 |
|---|---|---|---|---|---|
| 1 | **FakeNitro** (render half) | Fake emoji/sticker links in messages render as real emoji/stickers; tapping shows emoji info | Distra already sends fakes (Freemoji, FreeStickers) but they show as link text to everyone, including you | medium-hard | Chat-row rewrite (`updateRows`), custom-emoji node rendering, emoji tap sheet (`MessageEmojiActionSheet`), EmojiStore/StickersStore. Detail below |
| 2 | **HideChatButtons** (collapse toggle) | One eye button hides/shows the whole chat-bar button strip; remembers state | Chat bar is cramped on a phone; Distra's core plugin only turns off gift/app launcher | easy | Chat-bar buttons container patch, a pressable icon, persisted setting. Detail below |
| 3 | **BetterFolders** | Open folder shown on its own sidebar rail | Long server lists on a phone are a lot of scrolling; one rail per open folder is faster | hard | Guild rail component (guild-tree nodes), `ExpandedGuildFolderStore`, `SortedGuildStore`, folder toggle action; likely own rail view. Detail below |
| 4 | **PinDMs** | Pin DM/group channels to the top of the DM list, with reorder | Mobile has no DM pinning; most-used DMs get buried | medium | DM list data source (private channel sort store), long-press on a DM row, persisted order, "Pinned" section header |
| 5 | **HideServers** | Hide servers from the server list and quick switcher | Declutter; mobile cannot hide servers natively | medium | Guild tree / `SortedGuildStore` filter, guild long-press sheet entry, quick switcher results filter |
| 6 | **Timezones** | Show a user's local time in profile and message header; per-user zone set manually or from a DB | Useful for friends abroad; profile and header are already tappable | medium | Profile card patch, username-row patch in chat header, storage; optional timezone API (manual fallback) |
| 7 | **ShowMeYourName** | Choose nickname / display name / username combination shown in chat, mentions, replies | Mobile shows only one name; pick "nick (username)" etc. | medium | Message header and mention rendering (UsernameWithEffects is where Platform Indicators attaches), GuildMemberStore/UserStore |
| 8 | **TypingTweaks** (+TypingIndicator) | Avatars and role colours in the "X is typing" line | Typing line is tiny and anonymous | medium | Typing indicator component above chat input (Char Counter attaches near there), TypingStore |
| 9 | **WhoReacted** | Avatars of who reacted shown on the reaction pill | Mobile needs a tap-through to see reactors | medium | Reaction pill component, REST reactions endpoint, MessageReactionsStore |
| 10 | **RoleColorEverywhere** (+IRC colors, CustomUserColors) | Role colour on mentions, typing line, reactions, member names; optional per-user colours | Colour only on the message author in Discord today | medium | Mention component, username rendering, GuildMemberStore role colour |
| 11 | **ReplyTimestamp** | Timestamp on the replied-to preview inside a reply | Context for threaded chat; tiny change | easy | Reply preview component patch in message row; timestamp from MessageStore |
| 12 | **MentionAvatars** | Avatars and role icons inside @mentions | Cosmetic, clear in busy channels | medium | Mention node renderer in chat rows; user/role icon lookups |
| 13 | **StatusPresets** | Save custom statuses (text, emoji, expiry) and apply later | Custom-status editor is slow to retype on mobile | easy-medium | Custom status sheet (Radial Status already reads status stores), `UserSettingsProtoStore` or REST, saved list in settings |
| 14 | **ScheduledMessages** | Send a message at a time or after a delay | Not available on mobile. Caveat: only fires while the app is alive (iOS suspends JS) | medium | Command registry, `sendMessage`, timer plus on-resume catch-up (AppState); must warn about the limit |
| 15 | **ClientSideBlock** (+BlockKeywords) | Locally hide nearly all content from a user (messages, reactions, mentions) or messages containing keywords | Stronger than HideBlockedAndIgnoredMessages, which only filters existing blocks | easy-medium | Same flux filters (`LOAD_MESSAGES_SUCCESS`/`MESSAGE_CREATE`) as HideBlocked plus a row filter; user long-press entry |
| 16 | **ContentWarning** | User-defined trigger words blur message text/attachments until tapped | Privacy; tap-to-reveal suits touch | medium | Chat-row rewrite (same hook NSFW Blur uses), tap handler, keyword setting |
| 17 | **BetterSessions** | Exact timestamps and custom names for devices; notifies about new sessions | Account security from the phone | medium | Settings > Devices page patch (or own Distra page), auth sessions store, session flux events |
| 18 | **MessageLatency** | Marker on messages that took >= n seconds to send | Mobile networks lag; easy to surface | easy | Message timestamp vs snowflake in row patch, threshold setting |
| 19 | **TextReplace** | Regex/string replace rules on messages you send (optionally others') | Overlaps ChatAliases for sends; adds display-side rules | easy | `sendMessage` before-hook (as NoTracking/ChatAliases do), row rewrite for receive side, rule editor page |
| 20 | **CustomTimestamps** | Custom format for message timestamps | Mobile format is fixed; configurable is nice | medium | Timestamp component in message header, format settings |
| 21 | **HolyNotes** | Save messages into notebooks, jump back later | Long-press is the natural entry on mobile | medium | Message long-press sheet entry (like ViewRaw), storage, notebook page, jump via message link |
| 22 | **ExportMessages** | Export a message or a range to a file | iOS share sheet makes this convenient | medium | Long-press sheet entry, MessageStore, native share / file manager module |
| 23 | **PermissionsViewer** | View roles of a server and permissions of a user/channel | Debugging "why can't I" has no mobile UI | medium | `PermissionStore`, role/GuildStore, profile/channel sheet entry, own list page |
| 24 | **UnreadBadgeCount** | Unread message counts on channels in the channel list | Native mobile shows a dot only | medium | Channel row component, `ReadStateStore` counts (NoMentionCount already patches these stores) |
| 25 | **HideAttachments** | Hide attachments and embeds for individual messages | Data saving, spoilers; hover button becomes a long-press entry | easy-medium | Long-press sheet entry, per-message hidden set, chat-row rewrite dropping attachments/embeds |

Near-misses that are easy add-ons (small, no big UI): `noPendingCount`, `showMessageEmbeds` + `unsuppressEmbeds` (long-press), `copyEmojiMarkdown` + `copyStickerLinks` (emoji/sticker sheets), `repeatMessages`, `signature`, `splitLargeMessages`, `stickerBlocker`, `channelBadges`, `cleanChannelName`, `pinIcon`, `unindent`/`fixCodeblockGap`, `silentMessageToggle` (chat-bar toggle for Silent Messages), `favoriteMedia`, `relationshipNotifier`, `userMessagesPronouns`.

### Detail: the four things you asked about

**BetterFolders (the "open folder on its own sidebar" plugin).** There is no plugin named FolderSideBar or ServerFolders; it is `src/plugins/betterFolders` (`index.tsx` + `FolderSideBar.tsx`). Behaviour on desktop:
- Expanding a folder no longer expands it inline in the server rail. A second, narrow rail appears next to the main rail containing only the guilds of the expanded folder(s), animated in/out (width 0 to the rail width, 200 ms; setting `sidebarAnim`). Hidden in RTC fullscreen; visible whenever at least one folder with guilds is expanded.
- Implementation: it renders Discord's own guild-bar component a second time with a flag `isBetterFolders`. In that instance every guild-tree node that is not an expanded folder (or a guild inside one) is wrapped in `display:none`, and non-guild children (home button, add-server, etc.) are filtered out. In the original rail the contents of expanded folders are not rendered (the folder stays collapsed with mini icons) unless `keepIcons` is on.
- `showFolderIcon`: folder icon above the sidebar's guilds = never / always / only when more than one folder is expanded (hence the whole set of expanded ids is passed down).
- Extras via flux `CHANNEL_SELECT`, `TOGGLE_GUILD_FOLDER_EXPAND`, `LOGOUT`: close all folders when selecting a server outside any folder (`closeAllFolders`); close all on Home click (`closeAllHomeButton`); close other folders when opening one (`closeOthers`); close the folder when you select a server in it (`closeServerFolder`); force-open the folder when you switch to a server inside it (`forceOpen`); close all on logout. These are pure store + action logic (`ExpandedGuildFolderStore.getExpandedFolders`, folder-toggle action, `SortedGuildStore.getGuildFolders`) and are **easy**; the sidebar itself is the hard part.
- Mobile take: portrait phone, so an always-visible second rail eats width. Ship in two steps: (a) the extras above (easy; hook the folder toggle action and channel-select event), then (b) a rail variant (collapsible overlay column or horizontal strip for the open folder). Related folder tweaks: `plainFolderIcon` (no mini guild icons in folders) and `customFolderIcons` (png icon per folder).

**NoTypingAnimation / NoTyping.** Two different things:
- `noTypingAnimation`: one patch on the module containing `dotCycle`, rewriting `focused:x` to `_focused:x=false` so the typing-dots component thinks the window is never focused and stops its CPU-heavy animation. Purely a desktop CPU tweak; skipped.
- `silentTyping` (hides *your* typing indicator from others, with a toggle and a command) is **already covered** by the built-in `No typing` (patches `startTyping`). The only borrowable bit is a chat-bar toggle to switch it per session.

**FakeNitro: how fake emotes/stickers behave like real ones** (`src/plugins/fakeNitro/index.tsx`, 952 lines). Two halves; Distra's Freemoji/FreeStickers implement the send half only.
1. *Send half.* Unlocks pickers (patches `canUseEmojisEverywhere`/`canUseAnimatedEmojis`/sticker availability). On send (`sendMessage`/`sendStickers` pre-hooks) every `<:name:id>` the user cannot use is replaced by the emoji CDN URL `https://cdn.discordapp.com/emojis/<id>.webp?size=<emojiSize>&name=<name>` (png/gif for animated), optionally as a markdown hyperlink `[name](url)` (`hyperLinkText`, `{{NAME}}` placeholder) so no raw URL shows. Stickers become `https://media.discordapp.net/stickers/<id>.png?size=<n>&name=<name>` (animated ones go through a `.gif` URL). If the channel lacks Embed Links it warns instead of sending (`disableEmbedPermissionCheck` overrides).
2. *Render half (the part Distra lacks).* Regexes `/emojis/(\d+)\.(png|webp|gif)`, `/stickers/(\d+)\.`, `/attachments/\d+/\d+/(\d+)\.gif` recognise a fake. In the markdown parse step it:
   - keeps emoji links from being collapsed (`shouldKeepEmojiLink`), then walks the parsed React children (recursively through formatting nodes). Each link whose `href` matches an emoji URL is replaced with Discord's own parser output `Parser.defaultRules.customEmoji.react({jumboable, animated, emojiId, name, fake:true})`. Name = `EmojiStore.getCustomEmojiById(id)?.name`, else the `name` query param. `jumboable` is true when the emoji is the only content, so it renders big like a real one. By default only messages that are just the emoji/sticker convert; `transformCompoundSentence` converts inside normal sentences too.
   - Stickers: `renderStickersAccessories` pushes fake sticker objects `{format_type: 1 (png) | 2 (gif), id, name, fake:true}` into the message's sticker list (for gif links only when `StickersStore.getStickerById(id)` confirms it is a sticker, since a plain gif attachment looks identical). Sticker links are removed from the text, `renderEmbeds` skips the link embed (`shouldIgnoreEmbed`), and `filterAttachments` drops the gif attachment so the image does not show twice.
   - Emoji info on tap/click works because the node is a real `customEmoji` with an `emojiId`, so Discord's normal emoji popout opens. The plugin patches the popout description to append "This is a FakeNitro emoji and renders like a real emoji only for you. Appears as a link to non-plugin users." when the node carries `fake`; same for stickers in the sticker popout. Other users still see a link/embed.
   - Mobile port: Distra already has a chat-row rewrite shim. Detect the same URLs in the row content, swap them for the real custom-emoji node (so tap opens `MessageEmojiActionSheet`, which Stealmoji already patches), add stickers to the row's sticker list, hide the embed. Reuse Freemoji's URL format so both halves agree, and add a "FakeNitro notice" line to the emoji sheet. Medium-hard because the iOS chat list is built natively from serialised rows, not React: check what `updateRows` receives for emoji/sticker rows on 348.
   - FakeNitro's other parts (gradient themes via proto settings, stream quality, soundboard availability, app icons) are desktop or already covered (Freecons, ClientThemes).

**Hiding/collapsing chat input buttons.**
- `hideChatButtons` (Equicord): patches the chat-bar button list, wrapping the buttons in a component with one extra eye `ChatBarButton` at the end. Open = all buttons shown with an eye-off icon; closed = only the eye icon (strip is `overflow-x:auto`). Renders nothing if every button is disabled. Settings: `Open` (open by default; state also kept in a module variable for the session), `Color` (tint the toggle red while open). Distra's core Hide Chat Buttons only forces gift and app launcher flags off; merge in the runtime toggle: store open state in Distra settings and replace the buttons container's children with `[toggle]` when collapsed (Char Counter/Chatbox Avatar already hook that bar).
- `silentMessageToggle` and `sendTimestamps` add chat-bar buttons rather than hide them. No other Equicord plugin collapses the input.


## 2. Overlap with existing Distra built-ins (merge, do not add)

| Equicord plugin | Distra equivalent | What to merge / borrow |
|---|---|---|
| hideChatButtons | core Hide Chat Buttons | Collapse toggle, open-by-default, red tint option |
| fakeNitro | Freemoji, FreeStickers (send half), Stealmoji | Render half done as core plugin `distra:fakenitro` (src/plugins/core/fakenitro); notice line in the emoji/sticker sheet not done |
| silentTyping | No typing | Optional chat-bar toggle |
| messageLogger / messageLoggerEnhanced | core Message Logger | Enhanced: ignore lists by user/channel/guild, log export |
| platformIndicators | core Platform Indicators | Compare surfaces covered (member list still "to check") |
| noBlockedMessages / clientSideBlock / blockKeywords | Hide Blocked And Ignored Messages | Fold user/keyword hiding into it |
| noReplyMention / replyPingControl | NoAutoReplyMention | Per-user whitelist |
| newGuildSettings | Mute New Guilds | Extra defaults |
| translate / messageTranslate / translatePlus | Dislate Lite | Auto-translate on read |
| keywordNotify | Keyword Tracker | Regex support if missing |
| characterCounter | Char Counter | none |
| clearURLs | Clean URLs / NoTracking | none |
| reviewDB | ReviewDB | none |
| usrbg / userpfp | UserBG / UserPFP | none |
| globalBadges | Global Badges | none |
| validUser | ValidUser | none |
| viewRaw / viewRawVariant | ViewRaw | none |
| showHiddenChannels | Hidden Channels | none |
| alwaysTrust | AlwaysTrust | none |
| anonymiseFileNames | AnonymousFileNames | none |
| bypassPinPrompt | BypassPinPrompt | none |
| readAllNotificationsButton | Read All | none |
| blurNsfw | NSFW Blur | none |
| gifCollections / favGifSearch / gifPaste | Gif Categories, ClipboardGIFSend | Collections vs categories: same idea |
| expressionCloner | Stealmoji | none |
| messageLinkEmbeds | Message Preview | none |
| jumpTo | Jump To Top | "Jump to bottom" if missing |
| copyFileContents | FileContentPreview | Copy button |
| gifRoulette | GifRoulette | none |
| silentMessageToggle | Silent Messages | Chat-bar toggle instead of prefix only |
| friendsSince / mutualGroupDMs / voiceMessages | Native iOS | Not needed |

## 3. Everything else skipped (one line each)

Reasons: desktop-only UI (voice panel, popouts, hover, keybinds, Electron/web), rich-presence providers, quests, jokes, covered natively on iOS, or low value. "easy extra" = small idea for the near-miss list.

- `absRPC` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `accountPanelServerProfile` - desktop profile popout/sidebar UI
- `allCallTimers` - desktop voice/call/stream UI
- `altKrispSwitch` - desktop voice/call/stream UI
- `alwaysAnimate` - RN images animate per native settings
- `alwaysExpandProfiles` - desktop profile popout/sidebar UI
- `alwaysExpandRoles` - desktop profile popout/sidebar UI
- `alwaysTrust` - already in Distra (see overlap table)
- `amITyping` - needs desktop typing popout; low value
- `anammox` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `animalese` - joke/novelty/audio gag
- `anonymiseFileNames` - already in Distra (see overlap table)
- `appleMusic.desktop` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `arRPC.web` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `atSomeone` - novelty command/@someone random mention
- `autoDndWhilePlaying.discordDesktop` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `autoZipper` - web-only/dev tooling or file-system access
- `bannersEverywhere` - member-list banners; mobile member list differs, cosmetic
- `baseDecoder` - niche context-menu helper
- `betterActivities` - desktop member-list activity icons
- `betterAudioPlayer` - desktop canvas visualizers
- `betterBanReasons` - server-management/admin UI, desktop-only
- `betterBlockedUsers` - settings search; minor (easy extra if wanted)
- `betterCommands` - desktop command-popout tweaks; 348 popout differs
- `betterGifAltText` - accessibility; marginal
- `betterGifPicker` - open favourites tab by default; trivial, needs GIF picker tab hook
- `betterInvites` - server-management/admin UI, desktop-only
- `betterNotes` - desktop profile popout/sidebar UI
- `betterPlusReacts` - "+:emoji:" react text; trivial but niche (easy extra)
- `betterQuickReact` - desktop context-menu quick-react row
- `betterRoleContext` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `betterRoleDot` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `betterSettings` - desktop profile popout/sidebar UI
- `betterSpotifyCard` - desktop activity card
- `betterUploadButton` - desktop profile popout/sidebar UI
- `betterUserArea` - desktop profile popout/sidebar UI
- `biggerStreamPreview` - desktop voice/call/stream UI
- `blockKeywords` - merge into clientSideBlock (keyword half)
- `blockKrisp` - desktop voice/call/stream UI
- `blurNsfw` - already in Distra (see overlap table)
- `bypassPinPrompt` - already in Distra (see overlap table)
- `bypassStatus` - DND push filtering is server-side; Distra cannot change delivery
- `callTimer` - desktop voice/call/stream UI
- `channelBadges` - channel-type badges; cosmetic (easy extra)
- `channelTabs` - desktop profile popout/sidebar UI
- `characterCounter` - already in Distra (see overlap table)
- `cleanChannelName` - strip emoji from channel names; easy cosmetic extra
- `clearURLs` - already in Distra (see overlap table)
- `clientTheme` - needs Nitro-gated desktop API / experiments / account-risk
- `clipsEnhancements.discordDesktop` - desktop voice/call/stream UI
- `colorSighted` - needs Nitro-gated desktop API / experiments / account-risk
- `commandPalette` - keybind/keyboard-only
- `consoleJanitor` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `consoleShortcuts` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `copyEmojiMarkdown` - easy extra: emoji sheet copy-as-markdown (Stealmoji sheet pieces exist)
- `copyFileContents` - FileContentPreview covers preview; copy button is a small extra
- `copyProfileColors` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `copyStatusUrls` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `copyStickerLinks` - easy extra: sticker sheet copy/open link
- `copyUserMention` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `copyUserURLs` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `crashHandler` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `ctrlEnterSend` - keybind/keyboard-only
- `customFolderIcons` - folder icon picker; depends on folder UI (see BetterFolders)
- `customIdle` - relies on desktop hover/tooltip or mouse
- `customRPC` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `customSounds` - needs Nitro-gated desktop API / experiments / account-risk
- `customUserColors` - would pair with roleColorEverywhere (extra)
- `dearrow` - YouTube embed titles; marginal
- `decor` - needs Nitro-gated desktop API / experiments / account-risk
- `devCompanion.dev` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `disableCallIdle` - desktop voice/call/stream UI
- `disableCameras` - desktop voice/call/stream UI
- `discordDevBanner` - build-id banner; Distra has its own debug info
- `dontRoundMyTimestamps` - relies on desktop hover/tooltip or mouse
- `equicordHelper` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `equicordToolbox` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `equissant` - joke/novelty/audio gag
- `exitSounds` - desktop voice/call/stream UI
- `experiments` - needs Nitro-gated desktop API / experiments / account-risk
- `expressionCloner` - covered by Stealmoji (tap emoji sheet)
- `f8break` - keybind/keyboard-only
- `fakeProfileThemes` - needs Nitro-gated desktop API / experiments / account-risk
- `fastDeleteChannels` - server-management/admin UI, desktop-only
- `favEmojiFirst` - autocomplete order; needs emoji picker store hook
- `favGifSearch` - search over favourite GIFs; small extra for Gif Categories
- `favoriteMedia` - media library; medium, good later pick
- `findReply` - jump-to-earliest-reply; medium, niche
- `fixCodeblockGap` - markdown gap; easy extra if row patch exists
- `fixFileExtensions` - web-only/dev tooling or file-system access
- `fixImagesQuality` - force PNG; mobile has own CDN params, minor
- `fixSpotifyEmbeds.desktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `fixYoutubeEmbeds.desktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `followUser` - voice follow/narrate/log: low value on mobile (maybe later)
- `followVoiceUser` - voice follow/narrate/log: low value on mobile (maybe later)
- `fontLoader` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `forceOwnerCrown` - crown on large servers; cosmetic
- `forwardAnywhere` - forward fallback; 348 forward sheet differs
- `frequentQuickSwitcher` - desktop profile popout/sidebar UI
- `friendCloud` - renders image with desktop canvas
- `friendCodes` - needs Nitro-gated desktop API / experiments / account-risk
- `friendInvites` - server-management/admin UI, desktop-only
- `friendshipRanks` - covered natively (friends-since on profile) + FriendsSince removed
- `friendsSince` - covered by Discord iOS natively
- `friendTags` - desktop profile popout/sidebar UI
- `fullSearchContext` - SearchActionSheet already built in
- `fullUserInChatbox` - desktop profile popout/sidebar UI
- `fullVcPfp` - desktop voice/call/stream UI
- `gameActivityToggle` - desktop account panel button
- `gensokyoRadioRPC` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `ghosted` - joke/novelty/audio gag
- `gifCollections` - already in Distra (see overlap table)
- `gifPaste` - covered by ClipboardGIFSend
- `gifRoulette` - already in Distra (see overlap table)
- `githubRepos` - needs profile connections hook; marginal
- `globalBadges` - already in Distra (see overlap table)
- `googleThat` - trivial command; low value
- `greetStickerPicker` - server-management/admin UI, desktop-only
- `guildPickerDumper` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `guildTagSettings` - guild tags desktop settings
- `homeTyping` - desktop home-button badge
- `hopOn` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `husk` - joke/novelty/audio gag
- `iconViewer` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `ignoreActivities` - desktop-only activity registry
- `ignoreCalls` - ring handling is native on iOS (CallKit); not reliably interceptable
- `ignoreTerms` - needs Nitro-gated desktop API / experiments / account-risk
- `iLoveSpam` - likely-spammer filtering is a desktop client flag; not applicable
- `imageFilename` - relies on desktop hover/tooltip or mouse
- `imageLink` - row patch to show image-only link text; easy extra
- `imageZoom` - relies on desktop hover/tooltip or mouse
- `imgToGif` - needs canvas/GIF encoder; no cheap JS path in Hermes
- `implicitRelationships` - covered by Discord iOS natively
- `ingtoninator` - joke/novelty/audio gag
- `inRole` - role member list needs desktop gateway request; low value
- `instantScreenshare` - desktop voice/call/stream UI
- `invisibleChat.desktop` - desktop; SecretMessage already covers similar
- `inviteDefaults` - server-management/admin UI, desktop-only
- `ircColors` - hash-based username colours; pairs with roleColorEverywhere
- `iRememberYou` - local relationship archive; storage-heavy
- `jellyfinRichPresence` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `jumpscare` - joke/novelty/audio gag
- `jumpTo` - covered by Jump To Top
- `keepCurrentChannel` - iOS restores last channel natively
- `keyboardNavigation` - keybind/keyboard-only
- `keyboardSounds` - keybind/keyboard-only
- `keywordNotify` - covered by Keyword Tracker
- `lastActive` - niche jump-to-message helper
- `lastfmRichPresence` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `limitMiddleClickPaste` - keybind/keyboard-only
- `listenBrainzRPC` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `loadingQuotes` - joke/novelty/audio gag
- `loginWithQR` - needs Nitro-gated desktop API / experiments / account-risk
- `mediaPlaybackSpeed` - native iOS player has its own controls
- `memberCount` - desktop member-list header
- `messageBurst` - merges own sends; niche
- `messageClickActions` - keybind/keyboard-only
- `messageColors` - color-code chips in messages; cosmetic, row patch
- `messageFetchTimer` - dev-only stat
- `messageLinkEmbeds` - already in Distra (see overlap table)
- `messageLinkTooltip` - relies on desktop hover/tooltip or mouse
- `messageLogger` - covered by core Message Logger
- `messageLoggerEnhanced` - covered by core Message Logger (ideas worth mining: ignore lists, export)
- `messageNotifier` - toasts for chosen users (foreground only); merge with Keyword Tracker idea
- `messageTags` - low value vs ChatAliases (already built in)
- `messageTranslate` - covered by Dislate Lite
- `moreCommands` - slash commands; Distra Commands/Animal/Catgirls plugins already cover this style (cherry-pick /commands later)
- `moreKaomoji` - joke/novelty/audio gag
- `moreStickers` - needs custom sticker picker UI
- `moreUserTags` - BOT/WEBHOOK tags exist natively; mod tags marginal
- `moyai` - joke/novelty/audio gag
- `musicControls` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `mutualGroupDMs` - covered by Discord iOS natively
- `neverPausePreviews` - desktop voice/call/stream UI
- `newGuildSettings` - Mute New Guilds covers mute; extra settings are optional
- `newPluginsManager` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `noAppsAllowed` - joke/novelty/audio gag
- `noBlockedMessages` - already in Distra (see overlap table)
- `noBulletPoints` - joke/novelty/audio gag
- `noDeepLinks.web` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `noDevtoolsWarning` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `noF1` - keybind/keyboard-only
- `noMaskedUrlPaste` - desktop paste
- `noModalAnimation` - iOS sheets are native; no equivalent
- `noMosaic` - covered by Discord iOS natively
- `noNitroUpsell` - needs Nitro-gated desktop API / experiments / account-risk
- `noOnboardingDelay` - server-management/admin UI, desktop-only
- `noPendingCount` - hide pending friend/message-request badge counts; easy, pairs with NoMentionCount
- `noProfileThemes` - needs Nitro-gated desktop API / experiments / account-risk
- `noReplyMention` - already in Distra (see overlap table)
- `normalizeMessageLinks` - canary/ptb link rewrite; trivial, but Distra already routes discord.com links
- `noRoleHeaders` - member list role headers; mobile member list differs, easy only if patchable
- `noRPC.discordDesktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `noServerEmojis` - autocomplete filter; medium
- `noSystemBadge.discordDesktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `notificationTitle.discordDesktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `notificationVolume` - needs Nitro-gated desktop API / experiments / account-risk
- `noTypingAnimation` - desktop dotCycle animation; mobile typing dots are lightweight RN (see detail section)
- `noUnblockToJump` - jump to blocked messages; niche
- `oneko` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `onePingPerDM` - audio ping is OS/push on iOS
- `openInApp` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `orbolayBridge` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `overrideForumDefaults` - forum layout defaults; niche
- `partyMode` - joke/novelty/audio gag
- `pauseInvitesForever` - server-management/admin UI, desktop-only
- `permissionFreeWill` - server-management/admin UI, desktop-only
- `petpet` - needs canvas/GIF encoder
- `pictureInPicture` - desktop voice/call/stream UI
- `pingNotifications` - desktop notification formatting
- `pinIcon` - cosmetic row icon; easy extra
- `plainFolderIcon` - folder UI (see BetterFolders)
- `platformIndicators` - already in Distra (see overlap table)
- `platformSpoofer` - needs Nitro-gated desktop API / experiments / account-risk
- `polishWording` - joke/novelty/audio gag
- `previewMessage` - preview before sending; desktop textbox
- `questCompleter.discordDesktop` - quests are desktop/game only
- `questFocused` - quests are desktop/game only
- `questify` - quests are desktop/game only
- `questionMarkReplacement` - joke/novelty/audio gag
- `quickMention` - hover action
- `quickReply` - keybind/keyboard-only
- `quickThemeSwitcher.discordDesktop` - keybind/keyboard-only
- `quoter` - needs canvas image
- `randomVoice` - desktop voice/call/stream UI
- `reactErrorDecoder` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `readAllNotificationsButton` - already in Distra (see overlap table)
- `recentDMSwitcher` - keybind/keyboard-only
- `relationshipNotifier` - toast when removed as friend/group/server; medium (needs relationship+guild flux while app is open), good later pick
- `remix` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `repeatMessages` - long-press "repeat"; trivial extra (easy)
- `replaceGoogleSearch` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `replyPingControl` - NoAutoReplyMention covers default; per-user whitelist is a possible extra
- `revealAllSpoilers` - ctrl-click
- `reverseImageSearch` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `reviewDB` - already in Distra (see overlap table)
- `richMagnetLinks` - niche
- `rpcEditor` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `rpcStats` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `saveFavoriteGIFs` - web-only/dev tooling or file-system access
- `screenRecorder.equibop` - desktop voice/call/stream UI
- `searchFix` - desktop search bug
- `secretRingTone` - desktop voice/call/stream UI
- `seeSummaries` - needs Nitro-gated desktop API / experiments / account-risk
- `sekaiStickers` - canvas sticker maker
- `selfForward` - desktop forward popup
- `sendTimestamps` - covered by Discord iOS natively
- `serverInfo` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `serverListIndicators` - desktop guild list badge
- `serverSearch` - desktop profile popout/sidebar UI
- `shikiCodeblocks.desktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `showAllMessageButtons` - relies on desktop hover/tooltip or mouse
- `showBadgesInChat` - covered by Global Badges + native badges on profile; row patch needed
- `showConnections` - desktop profile popout/sidebar UI
- `showHiddenChannels` - already in Distra (see overlap table)
- `showHiddenThings` - server-management/admin UI, desktop-only
- `showMessageEmbeds` - long-press "show embeds" for suppressed links; easy, good extra with unsuppressEmbeds
- `showResourceChannels` - server resource channels; mobile list differs
- `showTimeoutDuration` - tooltip; easy extra if profile hook found
- `sidebarChat` - desktop profile popout/sidebar UI
- `signature` - append text on send; trivial (ChatAliases-style), easy extra
- `silentMessageToggle` - Silent Messages prefixes @silent; a chat-bar toggle would be an extra on top (easy)
- `silentTyping` - covered by No typing (+ context-menu toggle is desktop)
- `snowfall` - joke/novelty/audio gag
- `soggy` - joke/novelty/audio gag
- `songLink.desktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `sortFriendRequests` - covered by Discord iOS natively
- `soundBoardLogger` - desktop voice/call/stream UI
- `splitLargeMessages` - send-hook splitting long text; easy extra
- `spotifyActivityToggle` - desktop account panel button
- `spotifyCrack` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `spotifyLyrics` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `spotifyShareCommands` - needs Spotify web auth; Distra has SpotifyPreview/Spotify Fix
- `startupTimings` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `statsfmPresence` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `statusWhileActive.desktop` - desktop voice/call/stream UI
- `steamStatusSync` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `stickerBlocker` - hide stickers per user; easy extra (row patch)
- `stickerPaste` - covered mostly by ClipboardGIFSend/Freemoji flow; low value
- `streamerModeOnStream` - desktop voice/call/stream UI
- `streamingCodecDisabler` - desktop voice/call/stream UI
- `superReactionTweaks` - needs Nitro-gated desktop API / experiments / account-risk
- `talkInReverse` - joke/novelty/audio gag
- `themeAttributes` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `themeLibrary` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `tidalEmbeds` - Tidal embed player; WebView, marginal
- `tiktokTTS` - joke/novelty/audio gag
- `timelessClips.desktop` - desktop voice/call/stream UI
- `title` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `toastNotifications` - foreground DM toasts; iOS already shows banners
- `toggleVideoBind` - desktop voice/call/stream UI
- `toneIndicators` - relies on desktop hover/tooltip or mouse
- `tosuRPC` - rich-presence provider (needs desktop client/RPC process; Distra has Rich Presence)
- `translate` - already in Distra (see overlap table)
- `translatePlus` - already in Distra (see overlap table)
- `typingIndicator` - desktop channel-list typing dots; mobile list has its own
- `unindent` - codeblock indent trim; easy extra
- `unitConverter` - joke/novelty/audio gag
- `universalMention` - mention users without channel access; desktop autocomplete
- `unlimitedAccounts` - needs Nitro-gated desktop API / experiments / account-risk
- `unlockedAvatarZoom` - covered by Discord iOS natively
- `unsuppressEmbeds` - long-press unsuppress embeds; easy extra
- `urlHighlighter` - cosmetic
- `userMessagesPronouns` - pronouns beside name (PronounDB); medium extra, shares header patch with ShowMeYourName
- `userpfp` - already in Distra (see overlap table)
- `userVoiceShow` - voice follow/narrate/log: low value on mobile (maybe later)
- `usrbg` - already in Distra (see overlap table)
- `validReply` - covered by ValidUser-style fallbacks
- `validUser` - already in Distra (see overlap table)
- `vcDoubleClick` - desktop voice/call/stream UI
- `vcNarrator` - voice follow/narrate/log: low value on mobile (maybe later)
- `vcNarratorCustom` - voice follow/narrate/log: low value on mobile (maybe later)
- `vcPanelSettings` - desktop voice/call/stream UI
- `viewIcons` - iOS profile avatar/banner already open full-screen on tap
- `viewRaw` - already in Distra (see overlap table)
- `viewRawVariant` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `voiceButtons` - desktop voice/call/stream UI
- `voiceChannelLog.dev` - voice follow/narrate/log: low value on mobile (maybe later)
- `voiceChatUtils` - desktop voice/call/stream UI
- `voiceDownload` - covered by Discord iOS natively
- `voiceJoinMessages` - voice follow/narrate/log: low value on mobile (maybe later)
- `voiceMessages` - covered by Discord iOS natively
- `voiceRejoin` - voice follow/narrate/log: low value on mobile (maybe later)
- `volumeBooster` - desktop voice/call/stream UI
- `wallpaperFree` - per-channel wallpaper; hard (chat background layers, 348 native)
- `webContextMenus.web` - context-menu/hover-only copy helper (mobile has long-press equivalents or no value)
- `webKeybinds.web` - keybind/keyboard-only
- `webpackTarball` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `webScreenShareFixes.web` - desktop voice/call/stream UI
- `whitelistedEmojis` - emoji filtering; medium extra
- `whosWatching` - desktop voice/call/stream UI
- `wigglyText` - custom markdown render; fun but needs parser rule
- `writeUpperCase` - joke/novelty/audio gag
- `xsOverlay` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `youtubeAdblock.desktop` - desktop/web/Electron-only (native, window, deep-link, devtools, tray, console)
- `youtubeDescription` - embed text; marginal
