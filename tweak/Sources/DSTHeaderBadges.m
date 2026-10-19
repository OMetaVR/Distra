// Profile badges in chat message headers, for the Show Badges In Chat plugin
// (src/plugins/core/showbadgesinchat).
//
// Discord 348 draws chat rows natively: DCDBaseMessageTableViewCell lays its views out with
// YogaKit, and the header (messageHeaderView) is a Yoga row of
//   usernameContainerView (tags before the name, name, tags after the name), timestampLabel,
//   tagsAfterTimestampView
// that never wraps (the name truncates instead). DCDMessageModel only decodes a fixed set of
// header fields (one role icon, one clan tag, one bot tag), so there is no slot for a list. Instead:
//  1. The plugin adds `message.distraBadges` (`[{ url, label }]`) to chat rows.
//  2. +[DCDRowModel makeRowModelArrayFromJSONString:error:] (every chat updateRows) records them
//     by message id before Discord builds its models.
//  3. -[DCDBaseMessageTableViewCell setMessageContent:actionManager:] (called whenever a cell is
//     configured, for display and for measuring) appends a DSTHeaderBadgeRow as the header's last
//     Yoga child and lets the header wrap. The row follows the timestamp when it fits, otherwise
//     Yoga moves it to a second header line. Cell heights come from Yoga laying out the
//     configured cell (DCDMessageCellUtils sizeThatFits:forYogaCell:), so the taller header
//     pushes the message text down without anything else to adjust.
// Installed on demand (bridge `headerBadges.enable`); anything not found leaves Discord untouched.

#import "Distra.h"
#import <objc/message.h>
#import <objc/runtime.h>
#import <os/lock.h>

static NSString *const DSTBadgesKey = @"distraBadges";
static const CGFloat DSTBadgeSize = 18;
static const CGFloat DSTBadgeGap = 4;
static const NSUInteger DSTMaxCachedMessages = 20000;

static char kRowKey;
static char kHeaderWrapKey;
static char kImageURLKey;

typedef struct {
    float value;
    int unit;
} DSTYGValue;

enum { DSTYGUnitPoint = 1 };
enum { DSTYGFlexDirectionRow = 2 };
enum { DSTYGWrapNoWrap = 0, DSTYGWrapWrap = 1 };
enum { DSTYGAlignCenter = 2 };

static DSTYGValue DSTPoints(CGFloat value) {
    return (DSTYGValue){ (float)value, DSTYGUnitPoint };
}

/** The parts of YogaKit's YGLayout used here. */
@protocol DSTYogaLayout <NSObject>
@property (nonatomic, setter=setEnabled:) BOOL isEnabled;
@property (nonatomic, setter=setIncludedInLayout:) BOOL isIncludedInLayout;
@property (nonatomic) int flexDirection;
@property (nonatomic) int flexWrap;
@property (nonatomic) int alignItems;
@property (nonatomic) double flexShrink;
@property (nonatomic) double flexGrow;
- (void)setWidth:(DSTYGValue)value;
- (void)setHeight:(DSTYGValue)value;
- (void)setMarginLeft:(DSTYGValue)value;
- (void)setColumnGap:(DSTYGValue)value;
- (void)setRowGap:(DSTYGValue)value;
@end

static id<DSTYogaLayout> DSTYoga(UIView *view) {
    static SEL yoga;
    if (!yoga) yoga = NSSelectorFromString(@"yoga");
    return [view respondsToSelector:yoga] ? ((id (*)(id, SEL))objc_msgSend)(view, yoga) : nil;
}

static id DSTSend(id target, NSString *selector) {
    SEL sel = NSSelectorFromString(selector);
    return [target respondsToSelector:sel] ? ((id (*)(id, SEL))objc_msgSend)(target, sel) : nil;
}

static BOOL gInstalled;
static NSMutableArray<NSString *> *gMissing;
static NSMutableDictionary<NSString *, NSNumber *> *gCounters;
static os_unfair_lock gLock = OS_UNFAIR_LOCK_INIT;
static NSMutableDictionary<NSString *, NSArray<NSDictionary *> *> *gBadges;

static id (*gMakeRows)(id, SEL, NSString *, NSError **);
static void (*gSetMessageContent)(id, SEL, id, id);

static void DSTCount(NSString *name) {
    os_unfair_lock_lock(&gLock);
    gCounters[name] = @(gCounters[name].integerValue + 1);
    os_unfair_lock_unlock(&gLock);
}

#pragma mark - Row data

/** `[{ url, label }]` with only http(s) URLs, or nil. */
static NSArray<NSDictionary *> *DSTCleanBadges(id raw) {
    if (![raw isKindOfClass:NSArray.class]) return nil;
    NSMutableArray *badges = [NSMutableArray array];
    for (NSDictionary *badge in raw) {
        if (![badge isKindOfClass:NSDictionary.class]) continue;
        NSString *url = badge[@"url"];
        if (![url isKindOfClass:NSString.class] || !([url hasPrefix:@"https://"] || [url hasPrefix:@"http://"])) continue;
        NSString *label = [badge[@"label"] isKindOfClass:NSString.class] ? badge[@"label"] : @"";
        [badges addObject:@{ @"url": url, @"label": label }];
        if (badges.count >= 32) break;
    }
    return badges.count ? badges : nil;
}

/** Records the badges of every message row in a chat updateRows payload. */
static void DSTScanRows(NSString *json) {
    if (![json isKindOfClass:NSString.class]) return;
    BOOL carriesBadges = [json rangeOfString:@"\"distraBadges\""].location != NSNotFound;
    os_unfair_lock_lock(&gLock);
    NSUInteger cached = gBadges.count;
    os_unfair_lock_unlock(&gLock);
    // Rows without badges only matter when they may replace rows that had some.
    if (!carriesBadges && !cached) return;

    NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
    id rows = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![rows isKindOfClass:NSArray.class]) return;

    NSMutableDictionary *found = [NSMutableDictionary dictionary];
    NSMutableArray *cleared = [NSMutableArray array];
    for (NSDictionary *row in rows) {
        NSDictionary *message = [row isKindOfClass:NSDictionary.class] ? row[@"message"] : nil;
        NSString *messageId = [message isKindOfClass:NSDictionary.class] ? message[@"id"] : nil;
        if (![messageId isKindOfClass:NSString.class]) continue;
        NSArray *badges = DSTCleanBadges(message[DSTBadgesKey]);
        if (badges) found[messageId] = badges;
        else [cleared addObject:messageId];
    }

    os_unfair_lock_lock(&gLock);
    if (gBadges.count + found.count > DSTMaxCachedMessages) [gBadges removeAllObjects];
    [gBadges removeObjectsForKeys:cleared];
    [gBadges addEntriesFromDictionary:found];
    os_unfair_lock_unlock(&gLock);
    if (found.count) DSTCount(@"rowsWithBadges");
}

static NSArray<NSDictionary *> *DSTBadgesForMessage(NSString *messageId) {
    if (![messageId isKindOfClass:NSString.class]) return nil;
    os_unfair_lock_lock(&gLock);
    NSArray *badges = gBadges[messageId];
    os_unfair_lock_unlock(&gLock);
    return badges;
}

#pragma mark - Images

static NSCache<NSString *, UIImage *> *DSTImageMemoryCache(void) {
    static NSCache *cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        cache = [NSCache new];
        cache.countLimit = 300;
    });
    return cache;
}

/** Shows `url` in `imageView` once loaded (main thread), unless the view moved on to another URL. */
static void DSTLoadImage(UIImageView *imageView, NSString *url) {
    objc_setAssociatedObject(imageView, &kImageURLKey, url, OBJC_ASSOCIATION_COPY_NONATOMIC);
    UIImage *cached = [DSTImageMemoryCache() objectForKey:url];
    imageView.image = cached;
    if (cached) return;

    static NSMutableDictionary<NSString *, NSMutableArray<UIImageView *> *> *pending;
    if (!pending) pending = [NSMutableDictionary dictionary];
    NSMutableArray *waiting = pending[url];
    if (waiting) {
        if (![waiting containsObject:imageView]) [waiting addObject:imageView];
        return;
    }
    pending[url] = [NSMutableArray arrayWithObject:imageView];

    NSURL *remote = [NSURL URLWithString:url];
    if (!remote) {
        [pending removeObjectForKey:url];
        return;
    }
    [[NSURLSession.sharedSession dataTaskWithURL:remote completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        UIImage *image = data.length ? [UIImage imageWithData:data scale:UIScreen.mainScreen.scale] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (image) [DSTImageMemoryCache() setObject:image forKey:url];
            else DSTCount(@"imageFailures");
            for (UIImageView *view in pending[url] ?: @[]) {
                if ([objc_getAssociatedObject(view, &kImageURLKey) isEqualToString:url]) view.image = image;
            }
            [pending removeObjectForKey:url];
        });
    }] resume];
}

#pragma mark - Toast

static UIColor *DSTThemeColor(NSString *name, UIColor *fallback) {
    id color = DSTSend(NSClassFromString(@"DCDThemeColor"), name);
    return [color isKindOfClass:UIColor.class] ? color : fallback;
}

static UIWindow *DSTKeyWindow(void) {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) {
            if (window.isKeyWindow) return window;
        }
    }
    return nil;
}

/** A short pill near the top of the screen naming the tapped badge. */
static void DSTShowBadgeToast(NSString *label, UIImage *image) {
    UIWindow *window = DSTKeyWindow();
    if (!window || !label.length) return;
    static __weak UIView *current;
    [current removeFromSuperview];

    UIView *pill = [UIView new];
    pill.backgroundColor = DSTThemeColor(@"backgroundSurfaceHighest", UIColor.secondarySystemBackgroundColor);
    pill.layer.cornerRadius = 18;
    pill.layer.shadowColor = UIColor.blackColor.CGColor;
    pill.layer.shadowOpacity = 0.2;
    pill.layer.shadowRadius = 8;
    pill.layer.shadowOffset = CGSizeMake(0, 2);
    pill.userInteractionEnabled = NO;

    UIImageView *icon = [[UIImageView alloc] initWithImage:image];
    icon.contentMode = UIViewContentModeScaleAspectFit;
    UILabel *text = [UILabel new];
    text.text = label;
    text.font = [UIFont systemFontOfSize:14 weight:UIFontWeightSemibold];
    text.textColor = DSTThemeColor(@"textDefault", UIColor.labelColor);
    text.numberOfLines = 1;

    CGFloat maxWidth = window.bounds.size.width - 48;
    CGSize textSize = [text sizeThatFits:CGSizeMake(maxWidth - 50, 20)];
    textSize.width = MIN(textSize.width, maxWidth - 50);
    CGFloat iconWidth = image ? 20 + 8 : 0;
    CGFloat width = 14 + iconWidth + textSize.width + 14;
    pill.frame = CGRectMake((window.bounds.size.width - width) / 2, window.safeAreaInsets.top + 8, width, 36);
    icon.frame = CGRectMake(14, 8, 20, 20);
    text.frame = CGRectMake(14 + iconWidth, (36 - textSize.height) / 2, textSize.width, textSize.height);
    [pill addSubview:icon];
    [pill addSubview:text];

    pill.alpha = 0;
    [window addSubview:pill];
    current = pill;
    [UIView animateWithDuration:0.2 animations:^{ pill.alpha = 1; } completion:^(BOOL finished) {
        [UIView animateWithDuration:0.3 delay:1.6 options:0 animations:^{ pill.alpha = 0; } completion:^(BOOL done) {
            [pill removeFromSuperview];
        }];
    }];
}

#pragma mark - Badge row

/** The badges of one header: a wrapping Yoga row of fixed-size images. */
@interface DSTHeaderBadgeRow : UIView
@property (nonatomic, copy) NSArray<NSDictionary *> *badges;
@end

@implementation DSTHeaderBadgeRow {
    NSMutableArray<UIImageView *> *_images;
}

- (instancetype)initWithFrame:(CGRect)frame {
    if ((self = [super initWithFrame:frame])) {
        _images = [NSMutableArray array];
        self.backgroundColor = UIColor.clearColor;
        id<DSTYogaLayout> yoga = DSTYoga(self);
        yoga.isEnabled = YES;
        yoga.flexDirection = DSTYGFlexDirectionRow;
        yoga.flexWrap = DSTYGWrapWrap;
        yoga.alignItems = DSTYGAlignCenter;
        yoga.flexShrink = 1;
        yoga.flexGrow = 0;
        [yoga setMarginLeft:DSTPoints(DSTBadgeGap)];
        [yoga setColumnGap:DSTPoints(DSTBadgeGap)];
        [yoga setRowGap:DSTPoints(2)];
        [self addGestureRecognizer:[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleTap:)]];
    }
    return self;
}

// On a wrapped line the row starts the line: drop the gap that separates it from the timestamp.
- (void)setFrame:(CGRect)frame {
    if (frame.origin.y > 1 && frame.origin.x > 0 && frame.origin.x <= DSTBadgeGap + 0.5) frame.origin.x = 0;
    [super setFrame:frame];
}

- (void)setBadges:(NSArray<NSDictionary *> *)badges {
    _badges = [badges copy];
    while (_images.count < badges.count) {
        UIImageView *image = [UIImageView new];
        image.contentMode = UIViewContentModeScaleAspectFit;
        image.isAccessibilityElement = YES;
        image.accessibilityTraits = UIAccessibilityTraitImage;
        id<DSTYogaLayout> yoga = DSTYoga(image);
        yoga.isEnabled = YES;
        yoga.flexShrink = 0;
        [yoga setWidth:DSTPoints(DSTBadgeSize)];
        [yoga setHeight:DSTPoints(DSTBadgeSize)];
        [_images addObject:image];
        [self addSubview:image];
    }
    for (NSUInteger i = 0; i < _images.count; i++) {
        UIImageView *image = _images[i];
        BOOL used = i < badges.count;
        image.hidden = !used;
        DSTYoga(image).isIncludedInLayout = used;
        if (!used) continue;
        image.accessibilityLabel = badges[i][@"label"];
        DSTLoadImage(image, badges[i][@"url"]);
    }
}

- (void)handleTap:(UITapGestureRecognizer *)recognizer {
    CGPoint point = [recognizer locationInView:self];
    for (NSUInteger i = 0; i < MIN(_images.count, _badges.count); i++) {
        UIImageView *image = _images[i];
        if (!CGRectContainsPoint(CGRectInset(image.frame, -DSTBadgeGap / 2, -4), point)) continue;
        DSTShowBadgeToast(_badges[i][@"label"], image.image);
        return;
    }
}

@end

#pragma mark - Header

static UIView *DSTHeaderOf(UIView *cell) {
    UIView *header = DSTSend(cell, @"messageHeaderView");
    return [header isKindOfClass:UIView.class] ? header : nil;
}

static NSString *DSTMessageIdOf(id cellModel) {
    id message = DSTSend(cellModel, @"message");
    NSString *messageId = DSTSend(message, @"id");
    return [messageId isKindOfClass:NSString.class] ? messageId : nil;
}

/** Restores the header's own wrapping (Discord's is no wrap). */
static void DSTRestoreHeader(UIView *header) {
    NSNumber *wrap = objc_getAssociatedObject(header, &kHeaderWrapKey);
    if (!wrap) return;
    DSTYoga(header).flexWrap = wrap.intValue;
    objc_setAssociatedObject(header, &kHeaderWrapKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static void DSTUpdateHeader(UIView *cell, id cellModel) {
    UIView *header = DSTHeaderOf(cell);
    if (!header) return;
    DSTHeaderBadgeRow *row = objc_getAssociatedObject(cell, &kRowKey);
    NSArray *badges = header.hidden ? nil : DSTBadgesForMessage(DSTMessageIdOf(cellModel));

    if (!badges.count) {
        if (row && !row.hidden) {
            row.hidden = YES;
            DSTYoga(row).isIncludedInLayout = NO;
        }
        DSTRestoreHeader(header);
        return;
    }

    id<DSTYogaLayout> headerYoga = DSTYoga(header);
    if (!headerYoga) return;
    if (!row) {
        row = [DSTHeaderBadgeRow new];
        objc_setAssociatedObject(cell, &kRowKey, row, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (row.superview != header || header.subviews.lastObject != row) [header addSubview:row];
    row.hidden = NO;
    DSTYoga(row).isIncludedInLayout = YES;
    if (![row.badges isEqualToArray:badges]) row.badges = badges;

    if (!objc_getAssociatedObject(header, &kHeaderWrapKey)) {
        objc_setAssociatedObject(header, &kHeaderWrapKey, @(headerYoga.flexWrap), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    headerYoga.flexWrap = DSTYGWrapWrap;
    DSTCount(@"headersDecorated");
}

#pragma mark - Hooks

static id DSTMakeRows(id self, SEL _cmd, NSString *json, NSError **error) {
    @try {
        DSTScanRows(json);
    } @catch (NSException *exception) {
        DSTCount(@"scanErrors");
    }
    return gMakeRows(self, _cmd, json, error);
}

static void DSTSetMessageContent(UIView *self, SEL _cmd, id cellModel, id actionManager) {
    gSetMessageContent(self, _cmd, cellModel, actionManager);
    @try {
        DSTUpdateHeader(self, cellModel);
    } @catch (NSException *exception) {
        DSTCount(@"headerErrors");
    }
}

static Method DSTFindMethod(Class cls, NSString *selector, BOOL classMethod, const char *types) {
    Method method = cls ? (classMethod ? class_getClassMethod(cls, NSSelectorFromString(selector)) : class_getInstanceMethod(cls, NSSelectorFromString(selector))) : NULL;
    if (!method) {
        [gMissing addObject:[NSString stringWithFormat:@"%c[%@ %@]", classMethod ? '+' : '-', cls ? NSStringFromClass(cls) : @"?", selector]];
        return NULL;
    }
    const char *actual = method_getTypeEncoding(method);
    if (!actual || strcmp(actual, types) != 0) {
        [gMissing addObject:[NSString stringWithFormat:@"%@ (types %s)", selector, actual ?: "?"]];
        return NULL;
    }
    return method;
}

static BOOL DSTInstall(void) {
    gMissing = [NSMutableArray array];
    gCounters = [NSMutableDictionary dictionary];
    gBadges = [NSMutableDictionary dictionary];

    Class rowModel = NSClassFromString(@"DCDRowModel");
    Class cell = NSClassFromString(@"DCDBaseMessageTableViewCell");
    if (!rowModel) [gMissing addObject:@"DCDRowModel"];
    if (!cell) [gMissing addObject:@"DCDBaseMessageTableViewCell"];
    if (!NSClassFromString(@"YGLayout")) [gMissing addObject:@"YGLayout"];
    if (cell && ![cell instancesRespondToSelector:NSSelectorFromString(@"messageHeaderView")]) [gMissing addObject:@"messageHeaderView"];

    Method makeRows = DSTFindMethod(rowModel, @"makeRowModelArrayFromJSONString:error:", YES, "@32@0:8@16^@24");
    Method setContent = DSTFindMethod(cell, @"setMessageContent:actionManager:", NO, "v32@0:8@16@24");
    if (!makeRows || !setContent || gMissing.count) {
        DSTLogNative(@"Header badges: not installed, missing %@", [gMissing componentsJoinedByString:@", "]);
        return NO;
    }
    gMakeRows = (void *)method_setImplementation(makeRows, (IMP)DSTMakeRows);
    gSetMessageContent = (void *)method_setImplementation(setContent, (IMP)DSTSetMessageContent);
    DSTLogNative(@"Header badges: hooks installed");
    return YES;
}

NSDictionary *DSTHeaderBadgesEnable(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{ gInstalled = DSTInstall(); });
    os_unfair_lock_lock(&gLock);
    NSDictionary *info = @{
        @"hooked": @(gInstalled),
        @"version": @1,
        @"missing": gMissing.copy ?: @[],
        @"cachedMessages": @(gBadges.count),
        @"counters": gCounters.copy ?: @{},
    };
    os_unfair_lock_unlock(&gLock);
    return info;
}

void DSTHeaderBadgesClear(void) {
    os_unfair_lock_lock(&gLock);
    [gBadges removeAllObjects];
    os_unfair_lock_unlock(&gLock);
}
