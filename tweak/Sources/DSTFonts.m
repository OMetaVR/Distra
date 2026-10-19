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
// The table is saved to Documents/Distra/fonts/active.json and applied at launch, before any text is
// laid out. UIKit and React Native cache fonts, so a change shows fully after Discord restarts.

#import "Distra.h"
#import <CoreText/CoreText.h>
#import <objc/runtime.h>
#import <os/lock.h>

typedef UIFont *(*DSTFontWithName)(id, SEL, NSString *, CGFloat);
typedef UIFont *(*DSTFontWithDescriptor)(id, SEL, UIFontDescriptor *, CGFloat);

static os_unfair_lock gLock = OS_UNFAIR_LOCK_INIT;
static NSDictionary<NSString *, NSString *> *gMap;
static BOOL gEverywhere;
static NSMutableSet<NSString *> *gRegistered;
static NSMutableArray<NSString *> *gHelpers;
static BOOL gHooked;
static DSTFontWithName gFontWithName;
static DSTFontWithDescriptor gFontWithDescriptor;
static NSUInteger gHits[3];

enum { DSTHitName, DSTHitDescriptor, DSTHitHelper };

static NSURL *DSTFontsActiveURL(void) {
    return [DSTRootURL() URLByAppendingPathComponent:@"fonts/active.json"];
}

/** The replacement for `name` ("ggsans-Medium" or a list like "ggsans-Medium, NotoSans-Medium"). */
static NSString *DSTFontReplacement(NSString *name, BOOL helper) {
    if (![name isKindOfClass:NSString.class] || !name.length) return nil;
    os_unfair_lock_lock(&gLock);
    NSDictionary *map = (helper || gEverywhere) ? gMap : nil;
    os_unfair_lock_unlock(&gLock);
    if (!map.count) return nil;
    NSString *replacement = map[name];
    if (!replacement && [name containsString:@","]) {
        NSString *first = [[name componentsSeparatedByString:@","].firstObject stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        replacement = map[first];
    }
    return replacement;
}

/** `font` in its replacement, or `font` itself. */
static UIFont *DSTReplaceFont(UIFont *font, BOOL helper, NSUInteger hit) {
    NSString *replacement = font && gFontWithName ? DSTFontReplacement(font.fontName, helper) : nil;
    if (!replacement) return font;
    UIFont *replaced = gFontWithName(UIFont.class, @selector(fontWithName:size:), replacement, font.pointSize);
    if (!replaced) return font;
    gHits[hit]++;
    return replaced;
}

static UIFont *DSTHookedFontWithName(id self, SEL _cmd, NSString *name, CGFloat size) {
    NSString *replacement = DSTFontReplacement(name, NO);
    if (replacement) {
        UIFont *font = gFontWithName(self, _cmd, replacement, size);
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
        if (!gFontWithName(UIFont.class, @selector(fontWithName:size:), value, 12)) {
            [problems addObject:[NSString stringWithFormat:@"Font %@ isn't available", value]];
            return;
        }
        map[key] = value;
    }];

    os_unfair_lock_lock(&gLock);
    gMap = map;
    gEverywhere = ![table[@"scope"] isEqual:@"messages"];
    os_unfair_lock_unlock(&gLock);
    return problems;
}

void DSTFontsLoadSaved(void) {
    if (DSTBootGuard.shared.mode != DSTBootModeNormal) return;
    NSDictionary *saved = DSTReadJSONObject(DSTFontsActiveURL());
    if (![saved[@"map"] isKindOfClass:NSDictionary.class] || ![saved[@"map"] count]) return;
    NSArray *problems = DSTFontsApplyTable(saved);
    DSTLogNative(@"Fonts: %lu replacements (%@)%@", (unsigned long)gMap.count, saved[@"scope"] ?: @"app",
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

NSDictionary *DSTFontsInfo(void) {
    os_unfair_lock_lock(&gLock);
    NSDictionary *map = gMap ?: @{};
    BOOL everywhere = gEverywhere;
    os_unfair_lock_unlock(&gLock);
    return @{
        @"hooked": @(gHooked),
        @"scope": everywhere ? @"app" : @"messages",
        @"map": map,
        @"helpers": gHelpers ?: @[],
        @"registered": gRegistered.allObjects ?: @[],
        @"hits": @{ @"name": @(gHits[DSTHitName]), @"descriptor": @(gHits[DSTHitDescriptor]), @"helper": @(gHits[DSTHitHelper]) },
    };
}
