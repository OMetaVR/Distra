// Custom fonts (the Font Loader plugin). JS downloads font files into Documents/Distra/fonts and
// sends a table mapping Discord's font names to the replacements' PostScript names:
//
//   { scope: "app" | "messages", files: ["fonts/inter/400.ttf", ...], map: { "ggsans-Normal": "Inter-Regular", ... } }
//
// The files are registered with CoreText for this process. Discord asks UIKit for its fonts by
// name: React Native text resolves `fontFamily` ("ggsans-Medium, NotoSans-Medium") through
// +[UIFont fontWithName:size:], and natively drawn text (chat rows) gets its fonts from UIFont class
// helpers (+primaryMediumFontOfSize:, +codeRegularFontOfSize:allowFontScaling:, ...). Scope "app"
// replaces names everywhere; "messages" only what the helpers return.
//
// Optional adjustments (ignored by older tweaks, so JS sends them unconditionally):
//
//   scale: { "ggsans-Medium": 0.92, ... }      point size factor per Discord font name
//   spacing: { "Inter-Medium": 1.15, ... }     line height factor per replacement PostScript name
//
// Sizes are scaled where the replacement font is created. Line spacing is applied to the attributed
// strings Discord builds for natively drawn text (message content): -[DCDAttributedStringGenerator
// attributedStringWithContent:options:attributes:] (YYText) and +[DCDContentNodeAttributedStringGenerator
// makeAttributedStringFrom:options:] (Swift), by scaling each paragraph's line height. A paragraph
// gets the factor of the first replaced font in it. React Native text is adjusted from JS.
//
// The table is saved to Documents/Distra/fonts/active.json and applied at launch, before any text is
// laid out. UIKit and React Native cache fonts, so a change shows fully after Discord restarts.

#import "Distra.h"
#import <CoreText/CoreText.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <os/lock.h>

typedef UIFont *(*DSTFontWithName)(id, SEL, NSString *, CGFloat);
typedef UIFont *(*DSTFontWithDescriptor)(id, SEL, UIFontDescriptor *, CGFloat);
typedef id (*DSTContentIMP)(id, SEL, id, id, id);
typedef id (*DSTMakeIMP)(id, SEL, id, id);
typedef UIFont *(*DSTFontOptionsIMP)(id, SEL, UIFont *, id);

static os_unfair_lock gLock = OS_UNFAIR_LOCK_INIT;
static NSDictionary<NSString *, NSString *> *gMap;
/** Point size factor per Discord font name, and per replacement PostScript name. */
static NSDictionary<NSString *, NSNumber *> *gScales;
static NSDictionary<NSString *, NSNumber *> *gFaceScales;
/** Line height factor per replacement PostScript name. */
static NSDictionary<NSString *, NSNumber *> *gSpacing;
static BOOL gEverywhere;
static NSMutableSet<NSString *> *gRegistered;
static NSMutableArray<NSString *> *gHelpers;
static BOOL gHooked;
static DSTFontWithName gFontWithName;
static DSTFontWithDescriptor gFontWithDescriptor;
static DSTContentIMP gContent;
static DSTMakeIMP gMake;
static DSTFontOptionsIMP gFontOptions;
static BOOL gTextHooked;
static __thread NSUInteger gContentDepth;
static NSUInteger gHits[5];

enum { DSTHitName, DSTHitDescriptor, DSTHitHelper, DSTHitSpacing, DSTHitSizeOverride };

static NSURL *DSTFontsActiveURL(void) {
    return [DSTRootURL() URLByAppendingPathComponent:@"fonts/active.json"];
}

/**
 * The replacement for `name` ("ggsans-Medium" or a list like "ggsans-Medium, NotoSans-Medium"), and
 * in `size` the point size to use for one of `size` points.
 */
static NSString *DSTFontReplacement(NSString *name, BOOL helper, CGFloat *size) {
    if (![name isKindOfClass:NSString.class] || !name.length) return nil;
    os_unfair_lock_lock(&gLock);
    NSDictionary *map = (helper || gEverywhere) ? gMap : nil;
    NSDictionary *scales = gScales;
    os_unfair_lock_unlock(&gLock);
    if (!map.count) return nil;
    NSString *key = name;
    NSString *replacement = map[name];
    if (!replacement && [name containsString:@","]) {
        key = [[name componentsSeparatedByString:@","].firstObject stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        replacement = map[key];
    }
    double scale = [scales[key] doubleValue];
    if (replacement && size && *size > 0 && scale > 0) *size *= scale;
    return replacement;
}

/** `font` in its replacement, or `font` itself. */
static UIFont *DSTReplaceFont(UIFont *font, BOOL helper, NSUInteger hit) {
    CGFloat size = font.pointSize;
    NSString *replacement = font && gFontWithName ? DSTFontReplacement(font.fontName, helper, &size) : nil;
    if (!replacement) return font;
    UIFont *replaced = gFontWithName(UIFont.class, @selector(fontWithName:size:), replacement, size);
    if (!replaced) return font;
    gHits[hit]++;
    return replaced;
}

static UIFont *DSTHookedFontWithName(id self, SEL _cmd, NSString *name, CGFloat size) {
    CGFloat scaled = size;
    NSString *replacement = DSTFontReplacement(name, NO, &scaled);
    if (replacement) {
        UIFont *font = gFontWithName(self, _cmd, replacement, scaled);
        if (font) {
            gHits[DSTHitName]++;
            return font;
        }
    }
    return gFontWithName(self, _cmd, name, size);
}

static UIFont *DSTHookedFontWithDescriptor(id self, SEL _cmd, UIFontDescriptor *descriptor, CGFloat size) {
    UIFont *font = gFontWithDescriptor(self, _cmd, descriptor, size);
    return gEverywhere ? DSTReplaceFont(font, NO, DSTHitDescriptor) : font;
}

static BOOL DSTIsSystemHelper(NSString *name) {
    for (NSString *prefix in @[@"system", @"boldSystem", @"italicSystem", @"monospaced", @"preferred"]) {
        if ([name hasPrefix:prefix]) return YES;
    }
    return NO;
}

/** Wraps UIFont's `<name>FontOfSize:` and `<name>FontOfSize:allowFontScaling:` class helpers. */
static void DSTHookHelpers(Class meta) {
    unsigned int count = 0;
    Method *methods = class_copyMethodList(meta, &count);
    for (unsigned int i = 0; i < count; i++) {
        Method method = methods[i];
        SEL selector = method_getName(method);
        NSString *name = NSStringFromSelector(selector);
        BOOL scaling = [name hasSuffix:@"FontOfSize:allowFontScaling:"];
        if (!(scaling || [name hasSuffix:@"FontOfSize:"]) || DSTIsSystemHelper(name)) continue;

        char returns[4] = {0}, size[4] = {0}, flag[4] = {0};
        method_getReturnType(method, returns, sizeof(returns));
        method_getArgumentType(method, 2, size, sizeof(size));
        if (scaling) method_getArgumentType(method, 3, flag, sizeof(flag));
        if (returns[0] != '@' || size[0] != 'd' || method_getNumberOfArguments(method) != (scaling ? 4 : 3)) continue;
        if (scaling && flag[0] != 'B' && flag[0] != 'c') continue;

        IMP original = method_getImplementation(method);
        id block;
        if (scaling) {
            block = ^UIFont *(id self, CGFloat pointSize, BOOL allowScaling) {
                UIFont *font = ((UIFont *(*)(id, SEL, CGFloat, BOOL))original)(self, selector, pointSize, allowScaling);
                return DSTReplaceFont(font, YES, DSTHitHelper);
            };
        } else {
            block = ^UIFont *(id self, CGFloat pointSize) {
                UIFont *font = ((UIFont *(*)(id, SEL, CGFloat))original)(self, selector, pointSize);
                return DSTReplaceFont(font, YES, DSTHitHelper);
            };
        }
        method_setImplementation(method, imp_implementationWithBlock(block));
        [gHelpers addObject:name];
    }
    free(methods);
}

static void DSTInstallFontHooks(void) {
    if (gHooked) return;
    gHooked = YES;
    gHelpers = [NSMutableArray array];
    Class meta = object_getClass(UIFont.class);

    Method byName = class_getClassMethod(UIFont.class, @selector(fontWithName:size:));
    Method byDescriptor = class_getClassMethod(UIFont.class, @selector(fontWithDescriptor:size:));
    // Helpers first: their originals call fontWithName:size:, which is replaced next.
    DSTHookHelpers(meta);
    if (byName) gFontWithName = (DSTFontWithName)method_setImplementation(byName, (IMP)DSTHookedFontWithName);
    if (byDescriptor) gFontWithDescriptor = (DSTFontWithDescriptor)method_setImplementation(byDescriptor, (IMP)DSTHookedFontWithDescriptor);
    DSTLogNative(@"Fonts: hooked fontWithName:size: and %lu UIFont helpers", (unsigned long)gHelpers.count);
}

#pragma mark - Natively drawn text

/** `string` with each paragraph's line height scaled by the spacing of the first replaced font in it. */
static id DSTApplySpacing(id string) {
    if (![string isKindOfClass:NSAttributedString.class] || ![string length]) return string;
    os_unfair_lock_lock(&gLock);
    NSDictionary *spacing = gSpacing;
    os_unfair_lock_unlock(&gLock);
    if (!spacing.count) return string;

    NSAttributedString *source = string;
    NSString *text = source.string;
    NSMutableAttributedString *result;
    NSUInteger index = 0, length = text.length;
    while (index < length) {
        NSRange paragraph = [text paragraphRangeForRange:NSMakeRange(index, 0)];
        if (!paragraph.length) break;
        __block double factor = 0;
        [source enumerateAttribute:NSFontAttributeName inRange:paragraph options:0 usingBlock:^(id font, NSRange range, BOOL *stop) {
            NSNumber *value = [font isKindOfClass:UIFont.class] ? spacing[((UIFont *)font).fontName] : nil;
            if (value) {
                factor = value.doubleValue;
                *stop = YES;
            }
        }];
        if (factor > 0 && fabs(factor - 1) > 0.001) {
            if (!result) result = [source mutableCopy];
            [result enumerateAttribute:NSParagraphStyleAttributeName inRange:paragraph options:0 usingBlock:^(id style, NSRange range, BOOL *stop) {
                NSMutableParagraphStyle *adjusted = [style isKindOfClass:NSParagraphStyle.class] ? [style mutableCopy] : [NSMutableParagraphStyle new];
                adjusted.lineHeightMultiple = (adjusted.lineHeightMultiple > 0 ? adjusted.lineHeightMultiple : 1) * factor;
                if (adjusted.minimumLineHeight > 0) adjusted.minimumLineHeight *= factor;
                if (adjusted.maximumLineHeight > 0) adjusted.maximumLineHeight *= factor;
                [result addAttribute:NSParagraphStyleAttributeName value:adjusted range:range];
            }];
        }
        index = NSMaxRange(paragraph);
    }
    if (!result) return string;
    gHits[DSTHitSpacing]++;
    return result;
}

/** YYText message text. It recurses (quotes), so only the outermost call is adjusted. */
static id DSTHookedContent(id self, SEL _cmd, id content, id options, id attributes) {
    gContentDepth++;
    id result;
    @try {
        result = gContent(self, _cmd, content, options, attributes);
    } @finally {
        gContentDepth--;
    }
    return gContentDepth ? result : DSTApplySpacing(result);
}

/** Swift message text (Discord's "YYText replacement" experiment). */
static id DSTHookedMake(id self, SEL _cmd, id content, id options) {
    return DSTApplySpacing(gMake(self, _cmd, content, options));
}

/**
 * +[DCDAttributedStringGenerator font:withOptions:] resizes fonts to the options' fontSizeOverride
 * from their descriptor, which bypasses fontWithName:size:, so a replacement comes back unscaled.
 */
static UIFont *DSTHookedFontOptions(id self, SEL _cmd, UIFont *font, id options) {
    UIFont *result = gFontOptions(self, _cmd, font, options);
    if (![result isKindOfClass:UIFont.class] || result == font) return result;
    SEL overrideSelector = NSSelectorFromString(@"fontSizeOverride");
    if (![options respondsToSelector:overrideSelector] || !((id (*)(id, SEL))objc_msgSend)(options, overrideSelector)) return result;
    os_unfair_lock_lock(&gLock);
    double scale = [gFaceScales[result.fontName] doubleValue];
    os_unfair_lock_unlock(&gLock);
    if (scale <= 0 || fabs(scale - 1) < 0.001) return result;
    UIFont *scaled = gFontWithDescriptor
        ? gFontWithDescriptor(UIFont.class, @selector(fontWithDescriptor:size:), result.fontDescriptor, result.pointSize * scale)
        : [UIFont fontWithDescriptor:result.fontDescriptor size:result.pointSize * scale];
    if (!scaled) return result;
    gHits[DSTHitSizeOverride]++;
    return scaled;
}

/** Replaces `selector` of `cls` if it has the expected type encoding. Returns the original. */
static IMP DSTHookMethod(Class cls, NSString *selector, const char *types, IMP replacement) {
    Method method = cls ? class_getInstanceMethod(cls, NSSelectorFromString(selector)) : NULL;
    if (!method) return NULL;
    const char *actual = method_getTypeEncoding(method);
    // Compare without offsets ("@40@0:8@16" -> "@@:@").
    NSMutableString *shape = [NSMutableString string];
    for (const char *c = actual; c && *c; c++) if (!isdigit(*c)) [shape appendFormat:@"%c", *c];
    if (![shape isEqualToString:@(types)]) {
        DSTLogNative(@"Fonts: %@ has type %s, expected %s; not hooked", selector, actual ?: "?", types);
        return NULL;
    }
    return method_setImplementation(method, replacement);
}

static void DSTInstallTextHooks(void) {
    if (gTextHooked) return;
    gTextHooked = YES;
    Class generator = NSClassFromString(@"DCDAttributedStringGenerator");
    gContent = (DSTContentIMP)DSTHookMethod(generator, @"attributedStringWithContent:options:attributes:", "@@:@@@", (IMP)DSTHookedContent);
    gFontOptions = (DSTFontOptionsIMP)DSTHookMethod(object_getClass(generator), @"font:withOptions:", "@@:@@", (IMP)DSTHookedFontOptions);
    Class swift = NSClassFromString(@"DCDContentNodeAttributedStringGenerator");
    gMake = (DSTMakeIMP)DSTHookMethod(object_getClass(swift), @"makeAttributedStringFrom:options:", "@@:@@", (IMP)DSTHookedMake);
    DSTLogNative(@"Fonts: text hooks: YYText %@, font sizes %@, Swift %@", gContent ? @"on" : @"off", gFontOptions ? @"on" : @"off", gMake ? @"on" : @"off");
}

/** Positive numbers from `value` (a { key: number } object), keyed by string. */
static NSDictionary<NSString *, NSNumber *> *DSTFactors(id value) {
    if (![value isKindOfClass:NSDictionary.class]) return @{};
    NSMutableDictionary *factors = [NSMutableDictionary dictionary];
    [value enumerateKeysAndObjectsUsingBlock:^(id key, id number, BOOL *stop) {
        if (![key isKindOfClass:NSString.class] || ![number isKindOfClass:NSNumber.class]) return;
        double factor = [number doubleValue];
        if (factor >= 0.25 && factor <= 4 && fabs(factor - 1) > 0.001) factors[key] = @(factor);
    }];
    return factors;
}

#pragma mark - Registration

/** Registers `relativePath` (once per process). Returns an error message or nil. */
static NSString *DSTRegisterFontFile(NSString *relativePath) {
    if ([gRegistered containsObject:relativePath]) return nil;
    NSError *error;
    NSURL *url = DSTResolvePath(relativePath, &error);
    if (!url) return error.localizedDescription;
    if (![NSFileManager.defaultManager fileExistsAtPath:url.path]) return [NSString stringWithFormat:@"%@ is missing", relativePath];
    CFErrorRef cfError = NULL;
    if (!CTFontManagerRegisterFontsForURL((__bridge CFURLRef)url, kCTFontManagerScopeProcess, &cfError)) {
        NSError *registerError = CFBridgingRelease(cfError);
        if (registerError.code != kCTFontManagerErrorAlreadyRegistered) {
            return [NSString stringWithFormat:@"%@: %@", relativePath, registerError.localizedDescription];
        }
    }
    [gRegistered addObject:relativePath];
    return nil;
}

/** `name` at `size` as UIKit has it, without replacements. */
static UIFont *DSTOriginalFont(NSString *name, CGFloat size) {
    return gFontWithName ? gFontWithName(UIFont.class, @selector(fontWithName:size:), name, size) : [UIFont fontWithName:name size:size];
}

/** Registers the files and installs the table. Returns the problems found (missing files or fonts). */
static NSArray<NSString *> *DSTFontsApplyTable(NSDictionary *table) {
    NSMutableArray<NSString *> *problems = [NSMutableArray array];
    NSMutableDictionary<NSString *, NSString *> *map = [NSMutableDictionary dictionary];
    if (!gRegistered) gRegistered = [NSMutableSet set];

    NSArray *files = [table[@"files"] isKindOfClass:NSArray.class] ? table[@"files"] : @[];
    // Fonts that were removed go first, so their files can be deleted.
    for (NSString *file in gRegistered.allObjects) {
        if ([files containsObject:file]) continue;
        NSURL *url = DSTResolvePath(file, nil);
        if (url) CTFontManagerUnregisterFontsForURL((__bridge CFURLRef)url, kCTFontManagerScopeProcess, NULL);
        [gRegistered removeObject:file];
    }
    for (NSString *file in files) {
        if (![file isKindOfClass:NSString.class]) continue;
        NSString *problem = DSTRegisterFontFile(file);
        if (problem) [problems addObject:problem];
    }

    NSDictionary *requested = [table[@"map"] isKindOfClass:NSDictionary.class] ? table[@"map"] : @{};
    if (requested.count) DSTInstallFontHooks();
    [requested enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
        if (![key isKindOfClass:NSString.class] || ![value isKindOfClass:NSString.class]) return;
        if (!DSTOriginalFont(value, 12)) {
            [problems addObject:[NSString stringWithFormat:@"Font %@ isn't available", value]];
            return;
        }
        map[key] = value;
    }];

    NSDictionary *scales = DSTFactors(table[@"scale"]);
    NSMutableDictionary *faceScales = [NSMutableDictionary dictionary];
    [scales enumerateKeysAndObjectsUsingBlock:^(NSString *name, NSNumber *scale, BOOL *stop) {
        NSString *face = map[name];
        // A face shared by text and code keeps the text font's factor.
        if (face && (!faceScales[face] || [name hasPrefix:@"ggsans"])) faceScales[face] = scale;
    }];
    NSDictionary *spacing = map.count ? DSTFactors(table[@"spacing"]) : @{};
    if (spacing.count || faceScales.count) DSTInstallTextHooks();

    os_unfair_lock_lock(&gLock);
    gMap = map;
    gScales = map.count ? scales : @{};
    gFaceScales = map.count ? faceScales : @{};
    gSpacing = spacing;
    gEverywhere = ![table[@"scope"] isEqual:@"messages"];
    os_unfair_lock_unlock(&gLock);
    return problems;
}

void DSTFontsLoadSaved(void) {
    if (DSTBootGuard.shared.mode != DSTBootModeNormal) return;
    NSDictionary *saved = DSTReadJSONObject(DSTFontsActiveURL());
    if (![saved[@"map"] isKindOfClass:NSDictionary.class] || ![saved[@"map"] count]) return;
    NSArray *problems = DSTFontsApplyTable(saved);
    DSTLogNative(@"Fonts: %lu replacements (%@), %lu scaled, %lu spaced%@", (unsigned long)gMap.count, saved[@"scope"] ?: @"app",
                 (unsigned long)gScales.count, (unsigned long)gSpacing.count,
                 problems.count ? [@"; " stringByAppendingString:[problems componentsJoinedByString:@", "]] : @"");
}

NSDictionary *DSTFontsApply(NSDictionary *table, NSError **error) {
    if (![table isKindOfClass:NSDictionary.class]) {
        if (error) *error = DSTError(@"Expected { scope, files, map }");
        return nil;
    }
    __block NSArray *problems;
    void (^apply)(void) = ^{ problems = DSTFontsApplyTable(table); };
    if (NSThread.isMainThread) apply();
    else dispatch_sync(dispatch_get_main_queue(), apply);

    NSUInteger active = gMap.count;
    if (active) {
        if (!DSTWriteJSONObject(table, DSTFontsActiveURL(), error)) return nil;
    } else {
        [NSFileManager.defaultManager removeItemAtURL:DSTFontsActiveURL() error:nil];
    }
    return @{ @"active": @(active), @"problems": problems ?: @[] };
}

NSArray<NSDictionary *> *DSTFontsInspect(NSString *relativePath, NSError **error) {
    NSURL *url = DSTResolvePath(relativePath, error);
    if (!url) return nil;
    NSArray *descriptors = CFBridgingRelease(CTFontManagerCreateFontDescriptorsFromURL((__bridge CFURLRef)url));
    if (!descriptors.count) {
        if (error) *error = DSTError(@"Not a font file (expected .ttf or .otf)");
        return nil;
    }
    NSMutableArray *fonts = [NSMutableArray array];
    for (id descriptor in descriptors) {
        CTFontRef font = CTFontCreateWithFontDescriptor((__bridge CTFontDescriptorRef)descriptor, 12, NULL);
        if (!font) continue;
        NSString *postScriptName = CFBridgingRelease(CTFontCopyPostScriptName(font));
        NSString *family = CFBridgingRelease(CTFontCopyFamilyName(font));
        NSString *style = CFBridgingRelease(CTFontCopyName(font, kCTFontStyleNameKey));
        CTFontSymbolicTraits traits = CTFontGetSymbolicTraits(font);

        // usWeightClass (CSS-style 100-900) from the OS/2 table, else the bold trait.
        NSInteger weight = (traits & kCTFontTraitBold) ? 700 : 400;
        NSData *os2 = CFBridgingRelease(CTFontCopyTable(font, kCTFontTableOS2, kCTFontTableOptionNoOptions));
        if (os2.length >= 6) {
            const uint8_t *bytes = os2.bytes;
            NSInteger value = (bytes[4] << 8) | bytes[5];
            if (value >= 1 && value <= 1000) weight = value;
        }
        CFRelease(font);
        [fonts addObject:@{
            @"postScriptName": postScriptName ?: @"",
            @"family": family ?: @"",
            @"style": style ?: @"",
            @"weight": @(weight),
            @"italic": @((traits & kCTFontTraitItalic) != 0),
            @"monospace": @((traits & kCTFontTraitMonoSpace) != 0),
        }];
    }
    return fonts;
}

NSDictionary *DSTFontsMetrics(NSArray *names, NSNumber *size, BOOL resolved) {
    CGFloat pointSize = [size isKindOfClass:NSNumber.class] && size.doubleValue > 0 ? size.doubleValue : 100;
    NSMutableDictionary *metrics = [NSMutableDictionary dictionary];
    if (![names isKindOfClass:NSArray.class]) return metrics;
    for (NSString *name in names) {
        if (![name isKindOfClass:NSString.class]) continue;
        // `resolved`: what Discord gets for the name (replacement and size included).
        UIFont *font = resolved ? [UIFont fontWithName:name size:pointSize] : DSTOriginalFont(name, pointSize);
        if (!font) continue;
        CGSize sample = [@"The quick brown fox jumps over the lazy dog" sizeWithAttributes:@{ NSFontAttributeName: font }];
        metrics[name] = @{
            @"fontName": font.fontName ?: @"",
            @"pointSize": @(font.pointSize),
            @"ascender": @(font.ascender),
            @"descender": @(font.descender),
            @"leading": @(font.leading),
            @"lineHeight": @(font.lineHeight),
            @"capHeight": @(font.capHeight),
            @"xHeight": @(font.xHeight),
            @"width": @(sample.width),
        };
    }
    return metrics;
}

NSDictionary *DSTFontsInfo(void) {
    os_unfair_lock_lock(&gLock);
    NSDictionary *map = gMap ?: @{};
    NSDictionary *scales = gScales ?: @{};
    NSDictionary *spacing = gSpacing ?: @{};
    BOOL everywhere = gEverywhere;
    os_unfair_lock_unlock(&gLock);
    return @{
        @"version": @2,
        @"features": @[@"scale", @"spacing", @"metrics"],
        @"scale": scales,
        @"spacing": spacing,
        @"textHooks": @{ @"yytext": @(gContent != NULL), @"swift": @(gMake != NULL), @"sizeOverride": @(gFontOptions != NULL) },
        @"hooked": @(gHooked),
        @"scope": everywhere ? @"app" : @"messages",
        @"map": map,
        @"helpers": gHelpers ?: @[],
        @"registered": gRegistered.allObjects ?: @[],
        @"hits": @{
            @"name": @(gHits[DSTHitName]), @"descriptor": @(gHits[DSTHitDescriptor]), @"helper": @(gHits[DSTHitHelper]),
            @"spacing": @(gHits[DSTHitSpacing]), @"sizeOverride": @(gHits[DSTHitSizeOverride]),
        },
    };
}
