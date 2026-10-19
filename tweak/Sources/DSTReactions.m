// Reactor avatars inside reaction pills, for the WhoReacted plugin (src/plugins/core/whoreacted).
//
// Discord 348 draws reaction pills natively: DiscordChatComponentsSwift.ReactionView, a Yoga row
// (emoji, count, ...) measured by ReactionListLayout on a dummy cell. Its ReactionModel (ObjC name
// DCDReactionModel) only decodes emoji, me/me_burst, count, count_details, burst_count,
// burst_colors and themedBurstColors, so there is no field to put users in. Instead:
//  1. The plugin adds `message.distraReactors` to chat rows: `{ s: size, o: overlap,
//     r: [{ c: count, n: [normal urls], b: [burst urls] }] }`, one entry per row reaction.
//  2. +[DCDRowModel makeRowModelArrayFromJSONString:error:] (every chat updateRows) reads it and
//     attaches each entry to the parsed DCDReactionModel (associated object).
//  3. Before Yoga lays out a reaction cell (-[YGLayout calculateLayoutWithSize:]), each
//     ReactionView gets a DSTReactorStack as its last Yoga child, so Discord's own measuring makes
//     the pill wide enough and the avatars sit after the count.
// Installed on demand (bridge `reactions.enable`); anything not found leaves Discord untouched.

#import "Distra.h"
#import <malloc/malloc.h>
#import <objc/message.h>
#import <objc/runtime.h>

static NSString *const DSTReactorsKey = @"distraReactors";
static char kReactorInfoKey;
static char kStackKey;
static char kPendingKey;
static char kImageURLKey;

static BOOL gInstalled;
static NSMutableArray<NSString *> *gMissing;
static NSMutableDictionary<NSString *, NSNumber *> *gCounters;
static NSDictionary *gLastPill;

static Class gReactionViewClass, gReactionCellClass, gReactionViewModelClass, gAddedReactionClass, gReactionModelClass;
static ptrdiff_t gViewModelOffset = -1, gModeOffset = -1, gIsBurstOffset = -1, gReactionOffset = -1, gCountOffset = -1, gCountLabelOffset = -1;

static id (*gMakeRows)(id, SEL, NSString *, NSError **);
static CGSize (*gCalculateLayout)(id, SEL, CGSize);

static void DSTCount(NSString *name) {
    gCounters[name] = @(gCounters[name].integerValue + 1);
}

static ptrdiff_t DSTIvarOffset(Class cls, const char *name) {
    Ivar ivar = cls ? class_getInstanceVariable(cls, name) : NULL;
    if (!ivar) {
        [gMissing addObject:[NSString stringWithFormat:@"%@.%s", cls ? NSStringFromClass(cls) : @"?", name]];
        return -1;
    }
    return ivar_getOffset(ivar);
}

static Class DSTClass(NSString *name) {
    Class cls = NSClassFromString(name);
    if (!cls) [gMissing addObject:name];
    return cls;
}

/** A Swift class reference stored at `offset` (nil when unset). */
static id DSTObjectAt(id object, ptrdiff_t offset) {
    if (!object || offset < 0) return nil;
    void *raw = *(void **)((uint8_t *)(__bridge void *)object + offset);
    return (__bridge id)raw;
}

static id DSTSend(id target, NSString *selector) {
    SEL sel = NSSelectorFromString(selector);
    return [target respondsToSelector:sel] ? ((id (*)(id, SEL))objc_msgSend)(target, sel) : nil;
}

#pragma mark - Row data

/** messageId -> distraReactors payload, or nil when the rows carry none. */
static NSDictionary<NSString *, NSDictionary *> *DSTReactorPayloads(NSString *json) {
    if (![json isKindOfClass:NSString.class] || [json rangeOfString:@"\"distraReactors\""].location == NSNotFound) return nil;
    id parsed = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    NSArray *rows = [parsed isKindOfClass:NSArray.class] ? parsed : nil;
    if (!rows && [parsed isKindOfClass:NSDictionary.class]) {
        for (id value in [parsed allValues]) if ([value isKindOfClass:NSArray.class]) rows = value;
    }
    NSMutableDictionary *payloads = [NSMutableDictionary dictionary];
    for (NSDictionary *row in rows) {
        NSDictionary *message = [row isKindOfClass:NSDictionary.class] ? row[@"message"] : nil;
        if (![message isKindOfClass:NSDictionary.class]) continue;
        NSDictionary *payload = message[DSTReactorsKey];
        NSString *messageId = message[@"id"];
        if ([payload isKindOfClass:NSDictionary.class] && [messageId isKindOfClass:NSString.class]) payloads[messageId] = payload;
    }
    return payloads;
}

/**
 * Every reaction model parsed per message (weakly), each tagged with its place in the message.
 * When reactors arrive Discord re-parses the row, but a pill already on screen whose count and
 * emoji didn't change keeps the model from the earlier parse, so entries go onto those too.
 */
static NSMutableDictionary<NSString *, NSHashTable *> *gModels;
static char kIndexKey;

static void DSTRecordModels(NSArray *rows) {
    for (id row in rows) {
        id message = DSTSend(DSTSend(row, @"messageRowModel"), @"message");
        NSString *messageId = DSTSend(message, @"id");
        NSArray *reactions = DSTSend(message, @"reactions");
        if (![messageId isKindOfClass:NSString.class] || ![reactions isKindOfClass:NSArray.class] || !reactions.count) continue;
        if (gModels.count > 3000) [gModels removeAllObjects];
        NSHashTable *models = gModels[messageId];
        if (!models) gModels[messageId] = models = [NSHashTable weakObjectsHashTable];
        [reactions enumerateObjectsUsingBlock:^(id reaction, NSUInteger index, BOOL *stop) {
            if (gReactionModelClass && ![reaction isKindOfClass:gReactionModelClass]) return;
            objc_setAssociatedObject(reaction, &kIndexKey, @(index), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            [models addObject:reaction];
        }];
    }
}

/** Attaches each reaction's entry to every model parsed for it whose count still matches. */
static void DSTAttachPayloads(NSDictionary<NSString *, NSDictionary *> *payloads) {
    [payloads enumerateKeysAndObjectsUsingBlock:^(NSString *messageId, NSDictionary *payload, BOOL *stop) {
        NSArray *entries = [payload[@"r"] isKindOfClass:NSArray.class] ? payload[@"r"] : nil;
        if (!entries) return;
        DSTCount(@"payloadRows");
        for (id reaction in gModels[messageId].allObjects) {
            NSUInteger index = [objc_getAssociatedObject(reaction, &kIndexKey) unsignedIntegerValue];
            NSDictionary *entry = index < entries.count ? entries[index] : nil;
            if (![entry isKindOfClass:NSDictionary.class]) continue;
            // The count must match, so a reordered or changed list never shows the wrong people.
            if (gCountOffset >= 0 && [entry[@"c"] isKindOfClass:NSNumber.class]) {
                NSInteger count = *(NSInteger *)((uint8_t *)(__bridge void *)reaction + gCountOffset);
                if (count != [entry[@"c"] integerValue]) {
                    DSTCount(@"countMismatches");
                    continue;
                }
            }
            NSMutableDictionary *info = [entry mutableCopy];
            info[@"s"] = payload[@"s"];
            info[@"o"] = payload[@"o"];
            objc_setAssociatedObject(reaction, &kReactorInfoKey, info, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            DSTCount(@"attached");
        }
    }];
}

static void DSTRefreshVisiblePills(void);

static id DSTMakeRows(id self, SEL _cmd, NSString *json, NSError **error) {
    NSDictionary *payloads = nil;
    @try {
        payloads = DSTReactorPayloads(json);
    } @catch (NSException *exception) {
        DSTCount(@"parseErrors");
    }
    id rows = gMakeRows(self, _cmd, json, error);
    if ([rows isKindOfClass:NSArray.class]) {
        @try {
            DSTRecordModels(rows);
            if (payloads.count) {
                DSTAttachPayloads(payloads);
                // Pills already on screen aren't reconfigured when only the avatars changed.
                dispatch_async(dispatch_get_main_queue(), ^{ DSTRefreshVisiblePills(); });
            }
        } @catch (NSException *exception) {
            DSTCount(@"attachErrors");
        }
    }
    return rows;
}

#pragma mark - Avatar stack

static UIImage *DSTBiteMask(CGFloat size, CGFloat step, CGFloat ring) {
    static NSCache<NSString *, UIImage *> *cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ cache = [NSCache new]; });
    NSString *key = [NSString stringWithFormat:@"%.1f/%.1f/%.1f", size, step, ring];
    UIImage *mask = [cache objectForKey:key];
    if (mask) return mask;
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(size, size)];
    mask = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        [UIColor.blackColor setFill];
        [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(0, 0, size, size)] fill];
        // Cut where the avatar on the left sits, plus a ring, like Discord's own avatar piles.
        CGContextSetBlendMode(context.CGContext, kCGBlendModeClear);
        [[UIBezierPath bezierPathWithOvalInRect:CGRectMake(-step - ring, -ring, size + ring * 2, size + ring * 2)] fill];
    }];
    [cache setObject:mask forKey:key];
    return mask;
}

static void DSTDownloadImage(UIImageView *view, NSString *urlString) {
    static NSCache<NSString *, UIImage *> *images;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ images = [NSCache new]; });
    UIImage *cached = [images objectForKey:urlString];
    if (cached) {
        view.image = cached;
        return;
    }
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) return;
    [[NSURLSession.sharedSession dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        UIImage *image = data ? [UIImage imageWithData:data scale:UIScreen.mainScreen.scale] : nil;
        if (!image) {
            dispatch_async(dispatch_get_main_queue(), ^{ DSTCount(@"imageFailures"); });
            return;
        }
        [images setObject:image forKey:urlString];
        dispatch_async(dispatch_get_main_queue(), ^{
            if ([objc_getAssociatedObject(view, &kImageURLKey) isEqual:urlString]) view.image = image;
        });
    }] resume];
}

static void DSTLoadImage(UIImageView *view, NSString *urlString) {
    if ([objc_getAssociatedObject(view, &kImageURLKey) isEqual:urlString] && view.image) return;
    objc_setAssociatedObject(view, &kImageURLKey, urlString, OBJC_ASSOCIATION_COPY_NONATOMIC);
    view.image = nil;
    // Discord's own image loader (SDWebImage) and its caches, with a plain download if it fails.
    SEL webCache = NSSelectorFromString(@"sd_setImageWithURL:placeholderImage:options:completed:");
    if ([view respondsToSelector:webCache]) {
        __weak UIImageView *weakView = view;
        void (^completed)(UIImage *, NSError *, NSInteger, NSURL *) = ^(UIImage *image, NSError *error, NSInteger cacheType, NSURL *imageURL) {
            UIImageView *strongView = weakView;
            if (image || !strongView || ![objc_getAssociatedObject(strongView, &kImageURLKey) isEqual:urlString]) return;
            DSTDownloadImage(strongView, urlString);
        };
        ((void (*)(id, SEL, NSURL *, UIImage *, NSUInteger, id))objc_msgSend)(view, webCache, [NSURL URLWithString:urlString], nil, 0, completed);
        return;
    }
    DSTDownloadImage(view, urlString);
}

@interface DSTReactorStack : UIView
@property (nonatomic, copy) NSArray<NSString *> *urls;
@property (nonatomic) CGFloat avatarSize;
@property (nonatomic) CGFloat overlap;
@property (nonatomic, strong) UIColor *placeholderColor;
@end

@implementation DSTReactorStack {
    NSMutableArray<UIImageView *> *_avatars;
}

static const CGFloat DSTStackGap = 4;
static const CGFloat DSTStackRing = 1.5;

- (instancetype)initWithFrame:(CGRect)frame {
    if ((self = [super initWithFrame:frame])) {
        _avatars = [NSMutableArray array];
        _avatarSize = 16;
        _overlap = 5;
        self.userInteractionEnabled = NO;
        self.isAccessibilityElement = NO;
    }
    return self;
}

- (CGFloat)step {
    return MAX(1, self.avatarSize - self.overlap);
}

- (CGSize)sizeThatFits:(CGSize)size {
    NSUInteger count = self.urls.count;
    if (!count) return CGSizeZero;
    return CGSizeMake(ceil(DSTStackGap + self.avatarSize + (count - 1) * self.step), self.avatarSize);
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat size = self.avatarSize, step = self.step;
    while (_avatars.count < self.urls.count) {
        UIImageView *avatar = [UIImageView new];
        avatar.contentMode = UIViewContentModeScaleAspectFill;
        avatar.clipsToBounds = YES;
        [self addSubview:avatar];
        [_avatars addObject:avatar];
    }
    UIImage *bite = DSTBiteMask(size, step, DSTStackRing);
    CGFloat y = floor((CGRectGetHeight(self.bounds) - size) / 2);
    for (NSUInteger i = 0; i < _avatars.count; i++) {
        UIImageView *avatar = _avatars[i];
        avatar.hidden = i >= self.urls.count;
        if (avatar.hidden) continue;
        avatar.frame = CGRectMake(DSTStackGap + i * step, y, size, size);
        avatar.backgroundColor = self.placeholderColor;
        if (i == 0) {
            avatar.layer.mask = nil;
            avatar.layer.cornerRadius = size / 2;
        } else {
            avatar.layer.cornerRadius = 0;
            CALayer *mask = avatar.layer.mask ?: [CALayer layer];
            mask.frame = avatar.bounds;
            mask.contents = (__bridge id)bite.CGImage;
            avatar.layer.mask = mask;
        }
        DSTLoadImage(avatar, self.urls[i]);
    }
}

@end

#pragma mark - Reaction views

static id DSTYoga(UIView *view) {
    return DSTSend(view, @"yoga");
}

static void DSTYogaSetBool(id yoga, NSString *selector, BOOL value) {
    SEL sel = NSSelectorFromString(selector);
    if ([yoga respondsToSelector:sel]) ((void (*)(id, SEL, BOOL))objc_msgSend)(yoga, sel, value);
}

/** The entry attached to the reaction a ReactionView draws, and whether it is the burst pill. */
static NSDictionary *DSTInfoForReactionView(UIView *reactionView, BOOL *isBurst) {
    id viewModel = DSTObjectAt(reactionView, gViewModelOffset);
    if (!viewModel || gModeOffset < 0 || ![viewModel isKindOfClass:gReactionViewModelClass]) return nil;
    // ReactionViewMode is an enum of class payloads (added / addNewReaction / overflow) with its
    // case in the pointer's spare bits.
    uintptr_t raw = *(uintptr_t *)((uint8_t *)(__bridge void *)viewModel + gModeOffset);
    void *pointer = (void *)(raw & 0x0FFFFFFFFFFFFFF8ULL);
    if (!pointer || !malloc_zone_from_ptr(pointer)) {
        DSTCount(@"identityMisses");
        return nil;
    }
    id added = (__bridge id)pointer;
    if (object_getClass(added) != gAddedReactionClass) return nil;
    if (gIsBurstOffset >= 0) *isBurst = *(BOOL *)((uint8_t *)pointer + gIsBurstOffset);
    id reaction = DSTObjectAt(added, gReactionOffset);
    return reaction ? objc_getAssociatedObject(reaction, &kReactorInfoKey) : nil;
}

/** Re-measures the reaction list a shown pill sits in, once per run loop (its sizes are cached). */
static void DSTInvalidateReactionList(UIView *reactionView) {
    if (!reactionView.window) return;
    UIView *view = reactionView.superview;
    while (view && ![view isKindOfClass:UICollectionView.class]) view = view.superview;
    UICollectionView *list = (UICollectionView *)view;
    if (!list || [objc_getAssociatedObject(list, &kPendingKey) boolValue]) return;
    objc_setAssociatedObject(list, &kPendingKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    __weak UICollectionView *weakList = list;
    dispatch_async(dispatch_get_main_queue(), ^{
        UICollectionView *strongList = weakList;
        if (!strongList) return;
        objc_setAssociatedObject(strongList, &kPendingKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        [strongList.collectionViewLayout invalidateLayout];
        [strongList setNeedsLayout];
        DSTCount(@"invalidations");
    });
}

static BOOL DSTDecorateReactionView(UIView *reactionView) {
    BOOL isBurst = NO;
    NSDictionary *info = DSTInfoForReactionView(reactionView, &isBurst);
    DSTCount(info ? @"infoFound" : @"infoMissing");
    NSArray *urls = info[isBurst ? @"b" : @"n"];
    if (![urls isKindOfClass:NSArray.class]) urls = @[];
    DSTReactorStack *stack = objc_getAssociatedObject(reactionView, &kStackKey);
    if (!urls.count && !stack) return NO;

    if (!stack) {
        stack = [DSTReactorStack new];
        [reactionView addSubview:stack];
        DSTYogaSetBool(DSTYoga(stack), @"setEnabled:", YES);
        objc_setAssociatedObject(reactionView, &kStackKey, stack, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    // Yoga lays children out in subview order: keep the avatars after the count.
    if (reactionView.subviews.lastObject != stack) [reactionView bringSubviewToFront:stack];

    CGFloat size = [info[@"s"] isKindOfClass:NSNumber.class] ? [info[@"s"] doubleValue] : 16;
    CGFloat overlap = [info[@"o"] isKindOfClass:NSNumber.class] ? [info[@"o"] doubleValue] : round(size * 0.3);
    UILabel *countLabel = DSTObjectAt(reactionView, gCountLabelOffset);
    UIColor *textColor = [countLabel respondsToSelector:@selector(textColor)] ? countLabel.textColor : nil;
    stack.placeholderColor = [textColor colorWithAlphaComponent:0.2];

    BOOL changed = ![stack.urls isEqualToArray:urls] || stack.avatarSize != size || stack.overlap != overlap;
    if (!changed) return NO;
    if (stack.urls.count != urls.count || stack.avatarSize != size || stack.overlap != overlap) DSTInvalidateReactionList(reactionView);
    stack.urls = urls;
    stack.avatarSize = size;
    stack.overlap = overlap;
    stack.hidden = !urls.count;
    id yoga = DSTYoga(stack);
    DSTYogaSetBool(yoga, @"setIncludedInLayout:", urls.count > 0);
    if ([yoga respondsToSelector:NSSelectorFromString(@"markDirty")]) ((void (*)(id, SEL))objc_msgSend)(yoga, NSSelectorFromString(@"markDirty"));
    [stack setNeedsLayout];
    if (urls.count) {
        DSTCount(@"decorated");
        gLastPill = @{ @"avatars": @(urls.count), @"burst": @(isBurst), @"size": @(size) };
    }
    return YES;
}

static CGSize DSTCalculateLayout(id self, SEL _cmd, CGSize size) {
    UIView *view = DSTSend(self, @"view");
    @try {
        if ([view isKindOfClass:gReactionViewClass]) {
            DSTDecorateReactionView(view);
        } else if (gReactionCellClass ? [view.superview isKindOfClass:gReactionCellClass] : [view.superview isKindOfClass:UICollectionViewCell.class]) {
            for (UIView *subview in view.subviews) {
                if ([subview isKindOfClass:gReactionViewClass]) DSTDecorateReactionView(subview);
            }
        }
    } @catch (NSException *exception) {
        DSTCount(@"layoutErrors");
    }
    return gCalculateLayout(self, _cmd, size);
}

#pragma mark - Install

static BOOL DSTInstall(void) {
    gMissing = [NSMutableArray array];
    gCounters = [NSMutableDictionary dictionary];
    gModels = [NSMutableDictionary dictionary];

    Class rowModel = DSTClass(@"DCDRowModel");
    Class yogaLayout = DSTClass(@"YGLayout");
    gReactionViewClass = DSTClass(@"_TtC26DiscordChatComponentsSwift12ReactionView");
    gReactionViewModelClass = DSTClass(@"_TtC26DiscordChatComponentsSwift17ReactionViewModel");
    gAddedReactionClass = DSTClass(@"_TtC26DiscordChatComponentsSwift22AddedReactionViewModel");
    gReactionModelClass = DSTClass(@"DCDReactionModel");
    // Private type: optional (any collection cell holding a ReactionView works too).
    gReactionCellClass = NSClassFromString(@"_TtCC26DiscordChatComponentsSwift16ReactionListViewP33_5AD4497334A7EBA9387EB6BF36FF525926ReactionCollectionViewCell");

    gViewModelOffset = DSTIvarOffset(gReactionViewClass, "model");
    gCountLabelOffset = DSTIvarOffset(gReactionViewClass, "countLabel");
    gModeOffset = DSTIvarOffset(gReactionViewModelClass, "mode");
    gIsBurstOffset = DSTIvarOffset(gAddedReactionClass, "isBurst");
    gReactionOffset = DSTIvarOffset(gAddedReactionClass, "reaction");
    gCountOffset = DSTIvarOffset(gReactionModelClass, "count");

    Method makeRows = rowModel ? class_getClassMethod(rowModel, NSSelectorFromString(@"makeRowModelArrayFromJSONString:error:")) : NULL;
    Method calculate = yogaLayout ? class_getInstanceMethod(yogaLayout, NSSelectorFromString(@"calculateLayoutWithSize:")) : NULL;
    if (!makeRows) [gMissing addObject:@"+[DCDRowModel makeRowModelArrayFromJSONString:error:]"];
    if (!calculate) [gMissing addObject:@"-[YGLayout calculateLayoutWithSize:]"];

    BOOL ready = makeRows && calculate && gReactionViewClass && gReactionViewModelClass && gAddedReactionClass
        && gViewModelOffset >= 0 && gModeOffset >= 0 && gReactionOffset >= 0;
    if (!ready) {
        DSTLogNative(@"Reactions: not installed, missing %@", [gMissing componentsJoinedByString:@", "]);
        return NO;
    }
    gMakeRows = (void *)method_setImplementation(makeRows, (IMP)DSTMakeRows);
    gCalculateLayout = (void *)method_setImplementation(calculate, (IMP)DSTCalculateLayout);
    DSTLogNative(@"Reactions: avatar hooks installed%@", gMissing.count ? [NSString stringWithFormat:@" (missing %@)", [gMissing componentsJoinedByString:@", "]] : @"");
    return YES;
}

static void DSTCollectReactionViews(UIView *view, NSMutableArray *found) {
    if (found.count >= 300) return;
    if (gReactionViewClass && [view isKindOfClass:gReactionViewClass]) {
        [found addObject:view];
        return;
    }
    for (UIView *subview in view.subviews) DSTCollectReactionViews(subview, found);
}

static NSArray<UIView *> *DSTVisibleReactionViews(void) {
    NSMutableArray *views = [NSMutableArray array];
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) DSTCollectReactionViews(window, views);
    }
    return views;
}

/** Puts newly arrived avatars into pills already on screen (once per run loop). */
static BOOL gRefreshPending;
static void DSTRefreshVisiblePills(void) {
    if (gRefreshPending) return;
    gRefreshPending = YES;
    dispatch_async(dispatch_get_main_queue(), ^{
        gRefreshPending = NO;
        @try {
            for (UIView *view in DSTVisibleReactionViews()) {
                if (!DSTDecorateReactionView(view)) continue;
                DSTCount(@"refreshed");
                id yoga = DSTYoga(view);
                SEL apply = NSSelectorFromString(@"applyLayoutPreservingOrigin:");
                if ([yoga respondsToSelector:apply]) ((void (*)(id, SEL, BOOL))objc_msgSend)(yoga, apply, YES);
            }
        } @catch (NSException *exception) {
            DSTCount(@"refreshErrors");
        }
    });
}

static NSArray *DSTRect(CGRect rect) {
    return @[ @(round(rect.origin.x)), @(round(rect.origin.y)), @(round(rect.size.width)), @(round(rect.size.height)) ];
}

/** What every reaction pill on screen has, for debugging. */
NSDictionary *DSTReactionsInspect(void) {
    if (!gInstalled) return @{ @"installed": @NO };
    NSArray<UIView *> *views = DSTVisibleReactionViews();
    NSMutableArray *pills = [NSMutableArray array];
    for (UIView *view in views) {
        BOOL isBurst = NO;
        NSDictionary *info = nil;
        @try {
            info = DSTInfoForReactionView(view, &isBurst);
        } @catch (NSException *exception) {
        }
        DSTReactorStack *stack = objc_getAssociatedObject(view, &kStackKey);
        UILabel *countLabel = DSTObjectAt(view, gCountLabelOffset);
        NSMutableDictionary *pill = [NSMutableDictionary dictionary];
        pill[@"frame"] = DSTRect([view convertRect:view.bounds toView:nil]);
        pill[@"bounds"] = DSTRect(view.bounds);
        pill[@"count"] = [countLabel isKindOfClass:UILabel.class] ? (countLabel.text ?: @"") : @"?";
        if ([countLabel isKindOfClass:UILabel.class]) pill[@"countFrame"] = DSTRect(countLabel.frame);
        pill[@"info"] = @(info != nil);
        pill[@"infoUrls"] = @([info[isBurst ? @"b" : @"n"] count]);
        pill[@"burst"] = @(isBurst);
        pill[@"cell"] = view.superview ? NSStringFromClass(view.superview.class) : @"-";
        pill[@"cellFrame"] = view.superview ? DSTRect(view.superview.frame) : @[];
        if (stack) {
            NSUInteger loaded = 0;
            for (UIView *avatar in stack.subviews) if ([avatar isKindOfClass:UIImageView.class] && !avatar.hidden && ((UIImageView *)avatar).image) loaded++;
            pill[@"stack"] = @{
                @"urls": @(stack.urls.count),
                @"hidden": @(stack.hidden),
                @"frame": DSTRect(stack.frame),
                @"loaded": @(loaded),
                @"subviewIndex": @([view.subviews indexOfObject:stack]),
                @"subviews": @(view.subviews.count),
            };
        }
        [pills addObject:pill];
    }
    return @{ @"installed": @YES, @"counters": gCounters.copy ?: @{}, @"pills": pills };
}

NSDictionary *DSTReactionsEnable(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{ gInstalled = DSTInstall(); });
    return @{
        @"installed": @(gInstalled),
        @"missing": gMissing.copy ?: @[],
        @"counters": gCounters.copy ?: @{},
        @"lastPill": gLastPill ?: NSNull.null,
        @"cellClass": @(gReactionCellClass != nil),
    };
}
