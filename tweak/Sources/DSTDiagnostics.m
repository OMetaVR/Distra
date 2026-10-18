// On-device diagnostics, so problems can be investigated without a Mac:
//
//   - every native and JS log line goes to an in-memory buffer and to
//     Documents/Distra/logs/latest.log (the previous launch is kept as previous.log)
//   - a banner shortly after launch says whether Distra started
//   - a three-finger long press anywhere opens a log viewer with Copy/Share

#import "Distra.h"

static const NSTimeInterval kBannerTimeout = 15;
static const NSUInteger kMaxBufferedLines = 2000;

@interface DSTDiagnostics () <UIAdaptivePresentationControllerDelegate>
@property (nonatomic, strong) NSMutableArray<NSString *> *lines;
@property (nonatomic, strong) dispatch_queue_t queue;
@property (nonatomic, strong) NSFileHandle *file;
@property (nonatomic, strong) NSDate *launchDate;
@property (nonatomic, copy) NSString *hookName;
@property (nonatomic) NSUInteger injectedBytes;
@property (nonatomic, copy) NSDictionary *jsStatus;
@property (nonatomic) BOOL bannerShown;
@property (nonatomic) BOOL viewerOpen;
@end

@implementation DSTDiagnostics

+ (instancetype)shared {
    static DSTDiagnostics *shared;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ shared = [self new]; });
    return shared;
}

- (instancetype)init {
    if ((self = [super init])) {
        _lines = [NSMutableArray array];
        _queue = dispatch_queue_create("dev.distra.diagnostics", DISPATCH_QUEUE_SERIAL);
        _launchDate = [NSDate date];

        NSURL *directory = [DSTRootURL() URLByAppendingPathComponent:@"logs" isDirectory:YES];
        NSURL *latest = [directory URLByAppendingPathComponent:@"latest.log"];
        NSURL *previous = [directory URLByAppendingPathComponent:@"previous.log"];
        NSFileManager *fm = NSFileManager.defaultManager;
        [fm createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
        [fm removeItemAtURL:previous error:nil];
        [fm moveItemAtURL:latest toURL:previous error:nil];
        [fm createFileAtPath:latest.path contents:nil attributes:nil];
        _file = [NSFileHandle fileHandleForWritingAtPath:latest.path];
    }
    return self;
}

- (NSURL *)previousLogURL {
    return [DSTRootURL() URLByAppendingPathComponent:@"logs/previous.log"];
}

#pragma mark - Logging

- (void)log:(NSString *)message source:(NSString *)source level:(NSString *)level {
    NSTimeInterval elapsed = -[self.launchDate timeIntervalSinceNow];
    NSString *line = [NSString stringWithFormat:@"%7.2fs %@ %@ %@", elapsed, source, level.length ? level : @"info", message];
    dispatch_async(self.queue, ^{
        [self.lines addObject:line];
        if (self.lines.count > kMaxBufferedLines) [self.lines removeObjectsInRange:NSMakeRange(0, self.lines.count - kMaxBufferedLines)];
        @try {
            [self.file writeData:[[line stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding]];
        } @catch (NSException *exception) { }
    });
}

- (NSString *)logText {
    __block NSString *text;
    dispatch_sync(self.queue, ^{ text = [self.lines componentsJoinedByString:@"\n"]; });
    return text;
}

- (void)recordHook:(NSString *)hookName injectedBytes:(NSUInteger)bytes {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.hookName = hookName;
        self.injectedBytes = bytes;
    });
}

- (void)recordJSStatus:(NSDictionary *)status {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.jsStatus = status;
        [self showBanner];
    });
}

#pragma mark - Summary

- (NSString *)summary {
    NSDictionary *info = NSBundle.mainBundle.infoDictionary;
    NSMutableArray *rows = [NSMutableArray array];
    [rows addObject:[NSString stringWithFormat:@"Distra tweak %@ (%@)", DSTLoaderVersion, DSTIsJailbroken() ? @"jailbreak" : @"injected"]];
    [rows addObject:[NSString stringWithFormat:@"Discord %@ (%@) %@", info[@"CFBundleShortVersionString"], info[@"CFBundleVersion"], NSBundle.mainBundle.bundleIdentifier]];
    [rows addObject:[NSString stringWithFormat:@"iOS %@", UIDevice.currentDevice.systemVersion]];
    [rows addObject:self.hookName
        ? [NSString stringWithFormat:@"Bundle hook: %@, injected %lu bytes", self.hookName, (unsigned long)self.injectedBytes]
        : @"Bundle hook: NOT FIRED (Discord's JS bundle was never intercepted)"];
    if (self.jsStatus) {
        NSArray *failed = self.jsStatus[@"failedSteps"];
        [rows addObject:[NSString stringWithFormat:@"JS: ready in %@ms, %lu failed step(s)%@", self.jsStatus[@"durationMs"], (unsigned long)failed.count,
                         failed.count ? [@": " stringByAppendingString:[failed componentsJoinedByString:@", "]] : @""]];
    } else {
        [rows addObject:@"JS: has not reported ready"];
    }
    [rows addObject:[NSString stringWithFormat:@"Boot mode: %ld, failed launches before this one: %ld", (long)DSTBootGuard.shared.mode, (long)DSTBootGuard.shared.failedBoots]];
    return [rows componentsJoinedByString:@"\n"];
}

#pragma mark - Banner

- (void)scheduleBannerFallback {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kBannerTimeout * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self showBanner];
    });
}

- (UIWindow *)keyWindow {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) {
            if (window.isKeyWindow) return window;
        }
    }
    return nil;
}

- (void)showBanner {
    if (self.bannerShown) return;
    UIWindow *window = [self keyWindow];
    if (!window) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self showBanner]; });
        return;
    }
    self.bannerShown = YES;

    NSString *text;
    BOOL problem = YES;
    if (!self.hookName) {
        text = @"Distra loaded, but Discord's JS bundle was never intercepted.";
    } else if (!self.jsStatus) {
        text = @"Distra was injected, but its JS hasn't started.";
    } else if ([self.jsStatus[@"failedSteps"] count] > 0) {
        text = [NSString stringWithFormat:@"Distra started with %lu error(s).", (unsigned long)[self.jsStatus[@"failedSteps"] count]];
    } else {
        text = [NSString stringWithFormat:@"Distra %@ is running.", self.jsStatus[@"version"] ?: DSTLoaderVersion];
        problem = NO;
    }
    // Problems always show; the "running" banner is opt-in.
    if (!problem && ![DSTLoaderConfig()[@"showSuccessBanner"] boolValue]) {
        self.bannerShown = YES;
        return;
    }
    text = [text stringByAppendingString:@"\nTap here, or hold three fingers anywhere, for logs."];

    UILabel *label = [UILabel new];
    label.text = text;
    label.numberOfLines = 0;
    label.font = [UIFont systemFontOfSize:13 weight:UIFontWeightSemibold];
    label.textColor = UIColor.whiteColor;
    label.textAlignment = NSTextAlignmentCenter;
    label.backgroundColor = problem ? [UIColor colorWithRed:0.75 green:0.2 blue:0.2 alpha:0.95] : [UIColor colorWithRed:0.25 green:0.3 blue:0.75 alpha:0.95];
    label.layer.cornerRadius = 12;
    label.clipsToBounds = YES;
    label.userInteractionEnabled = YES;
    [label addGestureRecognizer:[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(bannerTapped:)]];

    CGFloat width = MIN(window.bounds.size.width - 24, 420);
    CGSize size = [label sizeThatFits:CGSizeMake(width - 24, CGFLOAT_MAX)];
    label.frame = CGRectMake((window.bounds.size.width - width) / 2, window.safeAreaInsets.top + 8, width, size.height + 20);
    label.alpha = 0;
    [window addSubview:label];

    [UIView animateWithDuration:0.25 animations:^{ label.alpha = 1; }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((problem ? 8 : 3) * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [UIView animateWithDuration:0.25 animations:^{ label.alpha = 0; } completion:^(BOOL finished) { [label removeFromSuperview]; }];
    });
}

- (void)bannerTapped:(UITapGestureRecognizer *)recognizer {
    [recognizer.view removeFromSuperview];
    [self presentViewer];
}

#pragma mark - Gesture

- (void)installGestureOnWindow:(UIWindow *)window {
    for (UIGestureRecognizer *recognizer in window.gestureRecognizers) {
        if ([recognizer.name isEqualToString:@"DistraDiagnostics"]) return;
    }
    UILongPressGestureRecognizer *press = [[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(longPressed:)];
    press.name = @"DistraDiagnostics";
    press.numberOfTouchesRequired = 3;
    press.minimumPressDuration = 0.8;
    press.cancelsTouchesInView = NO;
    [window addGestureRecognizer:press];
}

- (void)longPressed:(UILongPressGestureRecognizer *)recognizer {
    if (recognizer.state == UIGestureRecognizerStateBegan) [self presentViewer];
}

- (void)start {
    [NSNotificationCenter.defaultCenter addObserverForName:UIWindowDidBecomeKeyNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
        [self installGestureOnWindow:note.object];
    }];
    [NSNotificationCenter.defaultCenter addObserverForName:UIApplicationDidFinishLaunchingNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
        [self scheduleBannerFallback];
    }];
}

#pragma mark - Viewer

- (void)presentViewer {
    if (self.viewerOpen) return;
    UIWindow *window = [self keyWindow];
    UIViewController *top = window.rootViewController;
    while (top.presentedViewController) top = top.presentedViewController;
    if (!top) return;

    UIViewController *viewer = [UIViewController new];
    viewer.title = @"Distra Logs";
    viewer.view.backgroundColor = UIColor.systemBackgroundColor;

    UISegmentedControl *picker = [[UISegmentedControl alloc] initWithItems:@[@"This launch", @"Previous launch"]];
    picker.selectedSegmentIndex = 0;
    viewer.navigationItem.titleView = picker;

    UITextView *textView = [UITextView new];
    textView.editable = NO;
    textView.font = [UIFont monospacedSystemFontOfSize:11 weight:UIFontWeightRegular];
    textView.translatesAutoresizingMaskIntoConstraints = NO;
    [viewer.view addSubview:textView];
    [NSLayoutConstraint activateConstraints:@[
        [textView.topAnchor constraintEqualToAnchor:viewer.view.safeAreaLayoutGuide.topAnchor],
        [textView.bottomAnchor constraintEqualToAnchor:viewer.view.bottomAnchor],
        [textView.leadingAnchor constraintEqualToAnchor:viewer.view.safeAreaLayoutGuide.leadingAnchor constant:4],
        [textView.trailingAnchor constraintEqualToAnchor:viewer.view.safeAreaLayoutGuide.trailingAnchor constant:-4],
    ]];

    __weak UITextView *weakText = textView;
    void (^reload)(NSInteger) = ^(NSInteger index) {
        NSString *body = index == 0
            ? [NSString stringWithFormat:@"%@\n\n%@", [self summary], [self logText]]
            : ([NSString stringWithContentsOfURL:self.previousLogURL encoding:NSUTF8StringEncoding error:nil] ?: @"No previous log.");
        weakText.text = body;
    };
    reload(0);
    [picker addAction:[UIAction actionWithHandler:^(UIAction *action) { reload(picker.selectedSegmentIndex); }] forControlEvents:UIControlEventValueChanged];

    UINavigationController *navigation = [[UINavigationController alloc] initWithRootViewController:viewer];
    __weak UINavigationController *weakNavigation = navigation;
    viewer.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithPrimaryAction:[UIAction actionWithTitle:@"Close" image:nil identifier:nil handler:^(UIAction *action) {
        self.viewerOpen = NO;
        [weakNavigation dismissViewControllerAnimated:YES completion:nil];
    }]];
    UIAction *copy = [UIAction actionWithTitle:@"Copy" image:[UIImage systemImageNamed:@"doc.on.doc"] identifier:nil handler:^(UIAction *action) {
        UIPasteboard.generalPasteboard.string = weakText.text;
    }];
    UIAction *share = [UIAction actionWithTitle:@"Share" image:[UIImage systemImageNamed:@"square.and.arrow.up"] identifier:nil handler:^(UIAction *action) {
        UIActivityViewController *activity = [[UIActivityViewController alloc] initWithActivityItems:@[weakText.text ?: @""] applicationActivities:nil];
        activity.popoverPresentationController.barButtonItem = viewer.navigationItem.rightBarButtonItems.firstObject;
        [weakNavigation presentViewController:activity animated:YES completion:nil];
    }];
    viewer.navigationItem.rightBarButtonItems = @[
        [[UIBarButtonItem alloc] initWithPrimaryAction:share],
        [[UIBarButtonItem alloc] initWithPrimaryAction:copy],
    ];

    navigation.presentationController.delegate = self;
    self.viewerOpen = YES;
    [top presentViewController:navigation animated:YES completion:nil];
}

- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController {
    self.viewerOpen = NO;
}

@end

void DSTLogNative(NSString *format, ...) {
    va_list args;
    va_start(args, format);
    NSString *message = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    os_log(DSTLog(), "%{public}@", message);
    [DSTDiagnostics.shared log:message source:@"native" level:@"info"];
}
