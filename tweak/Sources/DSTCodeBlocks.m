// Code block colours for the Better Code Blocks plugin (src/plugins/core/codeblocks/render.ts).
//
// Discord 348 draws a chat code block as one box in one colour:
// -[DCDAttributedStringGenerator attributedStringForCodeBlock:inQuote:attributes:] gets the code
// and returns it in the code font with a YYTextBlockBorder (the box). JS highlights the code and
// puts the result on the row's codeBlock node:
//
//   distraHighlight: { v: 1, spans: [start, length, colour, background, flags, ...], colors: ["#rrggbb", ...], label }
//
// (UTF-16 offsets into the code, indexes into `colors` or -1, flags 1 bold / 2 underline / 4 italic).
// Rows reach native as JSON, and -attributedStringWithContent:options:attributes: walks the node
// dictionaries as parsed (recursing for quotes), so the key survives. That hook remembers the nodes
// being generated on this thread; the code block hook finds its node, colours the code and adds
// the label as a header strip at the top of the box.
//
// With Discord's "YYText replacement" experiment, message text is built in Swift instead
// (+[DCDContentNodeAttributedStringGenerator makeAttributedStringFrom:options:]) from decoded
// models, which drop unknown keys. That hook reads the raw row JSON (-[DCDStructuredTextModel
// rawJSON]), finds each block's code in the result and colours it (no header: JS shows the label).

#import "Distra.h"
#import <CoreText/CoreText.h>
#import <objc/message.h>
#import <objc/runtime.h>

static NSString *const DSTHighlightKey = @"distraHighlight";
static NSString *const DSTFramesKey = @"DSTCodeBlockFrames";
static NSString *const DSTBlockBorderKey = @"YYTextBlockBorder";
static NSString *const DSTBackgroundBorderKey = @"YYTextBackgroundBorder";

typedef NSAttributedString *(*DSTContentIMP)(id, SEL, id, id, id);
typedef NSAttributedString *(*DSTCodeBlockIMP)(id, SEL, NSString *, BOOL, NSDictionary *);
typedef NSAttributedString *(*DSTMakeIMP)(id, SEL, id, id);

static DSTContentIMP gContent;
static DSTCodeBlockIMP gCodeBlock;
static DSTMakeIMP gMake;
static NSUInteger gColored, gHeaders, gFailures;

#pragma mark - Helpers

static id DSTSend(id target, SEL selector) {
    return [target respondsToSelector:selector] ? ((id (*)(id, SEL))objc_msgSend)(target, selector) : nil;
}

static UIColor *DSTThemeColor(NSString *name) {
    id color = DSTSend(NSClassFromString(@"DCDThemeColor"), NSSelectorFromString(name));
    return [color isKindOfClass:UIColor.class] ? color : nil;
}

static UIFont *DSTFont(NSString *helper, CGFloat size) {
    Class cls = UIFont.class;
    SEL selector = NSSelectorFromString(helper);
    if (![cls respondsToSelector:selector]) return nil;
    id font = ((id (*)(id, SEL, CGFloat))objc_msgSend)(cls, selector, size);
    return [font isKindOfClass:UIFont.class] ? font : nil;
}

/** "#rrggbb" or "#rrggbbaa". */
static UIColor *DSTColorFromHex(id hex) {
    if (![hex isKindOfClass:NSString.class] || ![hex hasPrefix:@"#"]) return nil;
    NSString *digits = [hex substringFromIndex:1];
    if (digits.length == 6) digits = [digits stringByAppendingString:@"ff"];
    if (digits.length != 8) return nil;
    unsigned long long value = 0;
    if (![[NSScanner scannerWithString:digits] scanHexLongLong:&value]) return nil;
    return [UIColor colorWithRed:((value >> 24) & 0xff) / 255.0 green:((value >> 16) & 0xff) / 255.0
                            blue:((value >> 8) & 0xff) / 255.0 alpha:(value & 0xff) / 255.0];
}

/** `base` with `tint` laid over it at `amount`. */
static UIColor *DSTBlend(UIColor *base, UIColor *tint, CGFloat amount) {
    CGFloat r1 = 0, g1 = 0, b1 = 0, a1 = 0, r2 = 0, g2 = 0, b2 = 0, a2 = 0;
    if (![base getRed:&r1 green:&g1 blue:&b1 alpha:&a1] || ![tint getRed:&r2 green:&g2 blue:&b2 alpha:&a2]) return base;
    CGFloat alpha = amount + a1 * (1 - amount);
    if (alpha <= 0) return base;
    return [UIColor colorWithRed:(r2 * amount + r1 * a1 * (1 - amount)) / alpha
                           green:(g2 * amount + g1 * a1 * (1 - amount)) / alpha
                            blue:(b2 * amount + b1 * a1 * (1 - amount)) / alpha
                           alpha:alpha];
}

/** `color` composited over the chat background, so it's fully opaque. */
static UIColor *DSTOpaque(UIColor *color) {
    UIColor *background = DSTThemeColor(@"backgroundBaseLower") ?: DSTThemeColor(@"backgroundBaseLow") ?: UIColor.systemBackgroundColor;
    CGFloat r = 0, g = 0, b = 0, a = 0;
    UIColor *base = [background getRed:&r green:&g blue:&b alpha:&a] ? [UIColor colorWithRed:r green:g blue:b alpha:1] : UIColor.blackColor;
    if (![color getRed:&r green:&g blue:&b alpha:&a]) return base;
    return DSTBlend(base, [UIColor colorWithRed:r green:g blue:b alpha:1], a);
}

static void DSTSetColor(NSMutableAttributedString *text, UIColor *color, NSRange range) {
    [text addAttribute:NSForegroundColorAttributeName value:color range:range];
    // YYText draws with CoreText, which reads its own key.
    [text addAttribute:(NSString *)kCTForegroundColorAttributeName value:(id)color.CGColor range:range];
}

/** Whether the text is drawn invisible (a hidden spoiler): colouring it would reveal it. */
static BOOL DSTIsHidden(NSAttributedString *text, NSUInteger index) {
    if (index >= text.length) return NO;
    UIColor *color = [text attribute:NSForegroundColorAttributeName atIndex:index effectiveRange:NULL];
    CGFloat red, green, blue, alpha = 1;
    if ([color isKindOfClass:UIColor.class] && [color getRed:&red green:&green blue:&blue alpha:&alpha] && alpha < 0.01) return YES;
    id cgColor = [text attribute:(NSString *)kCTForegroundColorAttributeName atIndex:index effectiveRange:NULL];
    return cgColor && CFGetTypeID((__bridge CFTypeRef)cgColor) == CGColorGetTypeID() && CGColorGetAlpha((__bridge CGColorRef)cgColor) < 0.01;
}

static id DSTMakeBackground(UIColor *color) {
    Class cls = NSClassFromString(@"YYTextBorder");
    SEL selector = NSSelectorFromString(@"borderWithFillColor:cornerRadius:");
    if (![cls respondsToSelector:selector]) return nil;
    return ((id (*)(id, SEL, UIColor *, CGFloat))objc_msgSend)(cls, selector, color, 2);
}

static UIFont *DSTStyledFont(UIFont *font, NSInteger flags) {
    if (!font) return nil;
    if (flags & 1) {
        UIFont *bold = DSTFont(@"codeBoldFontOfSize:", font.pointSize);
        if (bold) return bold;
    }
    UIFontDescriptorSymbolicTraits traits = font.fontDescriptor.symbolicTraits;
    if (flags & 1) traits |= UIFontDescriptorTraitBold;
    if (flags & 4) traits |= UIFontDescriptorTraitItalic;
    UIFontDescriptor *descriptor = [font.fontDescriptor fontDescriptorWithSymbolicTraits:traits];
    return descriptor ? [UIFont fontWithDescriptor:descriptor size:font.pointSize] : font;
}

#pragma mark - Colouring

/** Applies `info`'s spans to the code at `codeRange` of `text`. */
static void DSTApplySpans(NSMutableAttributedString *text, NSRange codeRange, NSDictionary *info) {
    NSArray *spans = [info[@"spans"] isKindOfClass:NSArray.class] ? info[@"spans"] : nil;
    NSArray *hex = [info[@"colors"] isKindOfClass:NSArray.class] ? info[@"colors"] : @[];
    if (!spans.count) return;
    NSMutableArray *colors = [NSMutableArray arrayWithCapacity:hex.count];
    for (id value in hex) [colors addObject:DSTColorFromHex(value) ?: NSNull.null];
    NSMutableDictionary<NSNumber *, id> *backgrounds = [NSMutableDictionary dictionary];

    for (NSUInteger i = 0; i + 4 < spans.count; i += 5) {
        NSInteger values[5];
        BOOL valid = YES;
        for (NSUInteger k = 0; k < 5; k++) {
            id number = spans[i + k];
            if (![number isKindOfClass:NSNumber.class]) valid = NO;
            else values[k] = [number integerValue];
        }
        if (!valid || values[0] < 0 || values[1] <= 0) continue;
        NSRange range = NSIntersectionRange(NSMakeRange(codeRange.location + values[0], values[1]), codeRange);
        if (!range.length) continue;
        NSInteger fg = values[2], bg = values[3], flags = values[4];
        if (fg >= 0 && fg < (NSInteger)colors.count && colors[fg] != NSNull.null) DSTSetColor(text, colors[fg], range);
        if (bg >= 0 && bg < (NSInteger)colors.count && colors[bg] != NSNull.null) {
            id border = backgrounds[@(bg)] ?: DSTMakeBackground(colors[bg]);
            if (border) {
                backgrounds[@(bg)] = border;
                [text addAttribute:DSTBackgroundBorderKey value:border range:range];
            }
        }
        if (flags & 2) {
            [text addAttribute:NSUnderlineStyleAttributeName value:@(NSUnderlineStyleSingle) range:range];
            [text addAttribute:(NSString *)kCTUnderlineStyleAttributeName value:@(kCTUnderlineStyleSingle) range:range];
        }
        if (flags & 5) {
            UIFont *font = DSTStyledFont([text attribute:NSFontAttributeName atIndex:range.location effectiveRange:NULL], flags);
            if (font) [text addAttribute:NSFontAttributeName value:font range:range];
        }
    }
    gColored++;
}

/**
 * Puts `label` on its own line at the top of the block. Out of quotes the box reaches 4pt past its
 * text (negative insets), so the label gets its own box in a slightly different shade, spaced so
 * that the code's box overlaps the strip's lower edge: a header strip attached to the box, with
 * the code box's top border as the separator. In quotes (no overhang) it stays in the same box.
 */
static NSDictionary *gLastHeader;

static UIColor *DSTFillOf(id border) {
    id fill = DSTSend(border, NSSelectorFromString(@"fillColor"));
    return [fill isKindOfClass:UIColor.class] ? fill : nil;
}

static CGFloat DSTAlphaOf(UIColor *color) {
    CGFloat r, g, b, a = 0;
    return [color getRed:&r green:&g blue:&b alpha:&a] ? a : 0;
}

static NSString *DSTHex(UIColor *color) {
    CGFloat r = 0, g = 0, b = 0, a = 0;
    if (![color getRed:&r green:&g blue:&b alpha:&a]) return @"-";
    return [NSString stringWithFormat:@"#%02x%02x%02x%02x", (int)round(r * 255), (int)round(g * 255), (int)round(b * 255), (int)round(a * 255)];
}

static void DSTInsertHeader(NSMutableAttributedString *text, NSString *label) {
    NSMutableDictionary *attributes = [[text attributesAtIndex:0 effectiveRange:NULL] mutableCopy];
    for (NSString *key in @[NSUnderlineStyleAttributeName, (NSString *)kCTUnderlineStyleAttributeName]) [attributes removeObjectForKey:key];

    UIFont *codeFont = [attributes[NSFontAttributeName] isKindOfClass:UIFont.class] ? attributes[NSFontAttributeName] : nil;
    CGFloat size = MAX(10, round((codeFont.pointSize ?: 15) * 0.8));
    attributes[NSFontAttributeName] = DSTFont(@"primarySemiboldFontOfSize:", size) ?: [UIFont systemFontOfSize:size weight:UIFontWeightSemibold];
    UIColor *muted = DSTThemeColor(@"textMuted") ?: UIColor.secondaryLabelColor;
    attributes[NSForegroundColorAttributeName] = muted;
    attributes[(NSString *)kCTForegroundColorAttributeName] = (id)muted.CGColor;

    NSParagraphStyle *base = [attributes[NSParagraphStyleAttributeName] isKindOfClass:NSParagraphStyle.class] ? attributes[NSParagraphStyleAttributeName] : NSParagraphStyle.defaultParagraphStyle;
    NSMutableParagraphStyle *style = [base mutableCopy];
    id border = attributes[DSTBlockBorderKey];
    id lineBackground = attributes[DSTBackgroundBorderKey];
    // The box's colour is either the block border's fill or a background drawn behind each line.
    UIColor *blockFill = DSTFillOf(border), *lineFill = DSTFillOf(lineBackground);
    UIColor *boxFill = DSTAlphaOf(blockFill) > 0.01 ? blockFill : DSTAlphaOf(lineFill) > 0.01 ? lineFill : nil;
    UIEdgeInsets insets = UIEdgeInsetsZero;
    if ([border respondsToSelector:@selector(insets)]) insets = ((UIEdgeInsets (*)(id, SEL))objc_msgSend)(border, @selector(insets));
    SEL setFill = NSSelectorFromString(@"setFillColor:");
    BOOL strip = border && boxFill && insets.top < 0 && [border conformsToProtocol:@protocol(NSCopying)] && [border respondsToSelector:setFill];
    if (strip) {
        // Its own solid box in a slightly lighter shade, overlapped by the code's box.
        id header = [border copy];
        UIColor *tint = DSTThemeColor(@"textDefault") ?: muted;
        ((void (*)(id, SEL, UIColor *))objc_msgSend)(header, setFill, DSTBlend(DSTOpaque(boxFill), tint, 0.06));
        attributes[DSTBlockBorderKey] = header;
        [attributes removeObjectForKey:DSTBackgroundBorderKey];
        style.paragraphSpacing = -insets.top;
    } else {
        // Same box as the code (keeps the line background, if that's what draws the box).
        style.paragraphSpacing = 4;
    }
    style.paragraphSpacingBefore = 0;
    attributes[NSParagraphStyleAttributeName] = style;

    gLastHeader = @{
        @"strip": @(strip),
        @"blockBorder": border ? NSStringFromClass([border class]) : @"-",
        @"blockFill": blockFill ? DSTHex(blockFill) : @"-",
        @"lineBackground": lineBackground ? NSStringFromClass([lineBackground class]) : @"-",
        @"lineFill": lineFill ? DSTHex(lineFill) : @"-",
        @"insetsTop": @(insets.top),
    };

    NSAttributedString *header = [[NSAttributedString alloc] initWithString:[label stringByAppendingString:@"\n"] attributes:attributes];
    [text insertAttributedString:header atIndex:0];
    gHeaders++;
}

#pragma mark - YYText message text

/** Content arrays being generated on this thread, innermost last, with the code blocks already used. */
static NSMutableArray<NSMutableDictionary *> *DSTFrames(void) {
    NSMutableDictionary *storage = NSThread.currentThread.threadDictionary;
    NSMutableArray *frames = storage[DSTFramesKey];
    if (!frames) storage[DSTFramesKey] = frames = [NSMutableArray array];
    return frames;
}

/** The highlight of the next unused code block node showing `code` in the innermost content array. */
static NSDictionary *DSTTakeHighlight(NSString *code) {
    NSMutableDictionary *frame = DSTFrames().lastObject;
    NSArray *nodes = frame[@"nodes"];
    NSMutableIndexSet *used = frame[@"used"];
    for (NSUInteger i = 0; i < nodes.count; i++) {
        NSDictionary *node = nodes[i];
        if ([used containsIndex:i] || ![node isKindOfClass:NSDictionary.class]) continue;
        if (![node[@"type"] isEqual:@"codeBlock"] || ![node[@"content"] isEqual:code]) continue;
        [used addIndex:i];
        NSDictionary *info = node[DSTHighlightKey];
        return [info isKindOfClass:NSDictionary.class] ? info : nil;
    }
    return nil;
}

static NSAttributedString *DSTContentHook(id self, SEL _cmd, id content, id options, id attributes) {
    if (![content isKindOfClass:NSArray.class]) return gContent(self, _cmd, content, options, attributes);
    NSMutableArray *frames = DSTFrames();
    [frames addObject:[@{ @"nodes": content, @"used": [NSMutableIndexSet indexSet] } mutableCopy]];
    @try {
        return gContent(self, _cmd, content, options, attributes);
    } @finally {
        [frames removeLastObject];
    }
}

static NSAttributedString *DSTCodeBlockHook(id self, SEL _cmd, NSString *code, BOOL inQuote, NSDictionary *attributes) {
    NSAttributedString *result = gCodeBlock(self, _cmd, code, inQuote, attributes);
    NSDictionary *info = [code isKindOfClass:NSString.class] ? DSTTakeHighlight(code) : nil;
    if (!info || ![result isKindOfClass:NSAttributedString.class] || !result.length || DSTIsHidden(result, 0)) return result;
    @try {
        NSMutableAttributedString *text = [result mutableCopy];
        NSRange codeRange = [text.string rangeOfString:code];
        if (code.length && codeRange.location != NSNotFound) DSTApplySpans(text, codeRange, info);
        NSString *label = [info[@"label"] isKindOfClass:NSString.class] ? info[@"label"] : nil;
        if (label.length) DSTInsertHeader(text, label);
        return text;
    } @catch (NSException *exception) {
        if (gFailures++ < 5) DSTLogNative(@"Code block colours failed: %@: %@", exception.name, exception.reason);
        return result;
    }
}

#pragma mark - Swift message text

static void DSTCollectBlocks(id node, NSMutableArray *blocks, NSUInteger depth) {
    if (depth > 12) return;
    if ([node isKindOfClass:NSArray.class]) {
        for (id child in node) DSTCollectBlocks(child, blocks, depth + 1);
    } else if ([node isKindOfClass:NSDictionary.class]) {
        if ([node[@"type"] isEqual:@"codeBlock"]) {
            if ([node[DSTHighlightKey] isKindOfClass:NSDictionary.class] && [node[@"content"] isKindOfClass:NSString.class]) [blocks addObject:node];
            return;
        }
        id content = node[@"content"];
        if ([content isKindOfClass:NSArray.class]) DSTCollectBlocks(content, blocks, depth + 1);
    }
}

static NSAttributedString *DSTMakeHook(id self, SEL _cmd, id content, id options) {
    NSAttributedString *result = gMake(self, _cmd, content, options);
    if (![result isKindOfClass:NSAttributedString.class] || !result.length) return result;
    @try {
        NSMutableArray<NSDictionary *> *blocks = [NSMutableArray array];
        DSTCollectBlocks(DSTSend(content, @selector(rawJSON)), blocks, 0);
        if (!blocks.count) return result;
        NSMutableAttributedString *text = [result mutableCopy];
        NSUInteger cursor = 0;
        for (NSDictionary *node in blocks) {
            NSString *code = node[@"content"];
            if (!code.length || cursor >= text.length) continue;
            NSRange range = [text.string rangeOfString:code options:0 range:NSMakeRange(cursor, text.length - cursor)];
            if (range.location == NSNotFound) continue;
            if (!DSTIsHidden(text, range.location)) DSTApplySpans(text, range, node[DSTHighlightKey]);
            cursor = NSMaxRange(range);
        }
        return text;
    } @catch (NSException *exception) {
        if (gFailures++ < 5) DSTLogNative(@"Code block colours (Swift text) failed: %@: %@", exception.name, exception.reason);
        return result;
    }
}

#pragma mark - Install

static IMP DSTReplace(Class cls, NSString *selectorName, IMP replacement, const char *expectedTypes) {
    Method method = cls ? class_getInstanceMethod(cls, NSSelectorFromString(selectorName)) : NULL;
    if (!method) return NULL;
    const char *types = method_getTypeEncoding(method);
    // Only hook the method shape this code was written against.
    if (!types || strcmp(types, expectedTypes) != 0) {
        DSTLogNative(@"Code blocks: %@ has type %s, expected %s; not hooked", selectorName, types ?: "?", expectedTypes);
        return NULL;
    }
    return method_setImplementation(method, replacement);
}

void DSTCodeBlocksInstall(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Class generator = NSClassFromString(@"DCDAttributedStringGenerator");
        Method codeBlock = generator ? class_getInstanceMethod(generator, NSSelectorFromString(@"attributedStringForCodeBlock:inQuote:attributes:")) : NULL;
        // Both or neither: the code block hook needs the nodes the content hook records.
        if (codeBlock && strcmp(method_getTypeEncoding(codeBlock) ?: "", "@36@0:8@16B24@28") == 0) {
            IMP content = DSTReplace(generator, @"attributedStringWithContent:options:attributes:", (IMP)DSTContentHook, "@40@0:8@16@24@32");
            if (content) {
                gContent = (DSTContentIMP)content;
                gCodeBlock = (DSTCodeBlockIMP)method_setImplementation(codeBlock, (IMP)DSTCodeBlockHook);
            }
        }
        Class swift = object_getClass(NSClassFromString(@"DCDContentNodeAttributedStringGenerator"));
        IMP make = DSTReplace(swift, @"makeAttributedStringFrom:options:", (IMP)DSTMakeHook, "@32@0:8@16@24");
        if (make) gMake = (DSTMakeIMP)make;
        DSTLogNative(@"Code blocks: YYText hook %@, Swift text hook %@", gCodeBlock ? @"on" : @"off", gMake ? @"on" : @"off");
    });
}

NSDictionary *DSTCodeBlocksInfo(void) {
    return @{
        @"version": @1,
        @"yytext": @(gCodeBlock != NULL),
        @"swift": @(gMake != NULL),
        @"colored": @(gColored),
        @"headers": @(gHeaders),
        @"failures": @(gFailures),
        @"lastHeader": gLastHeader ?: NSNull.null,
    };
}
