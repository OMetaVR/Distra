// Native alert shown when the boot guard changed how Discordia started, so
// people know why their plugins are missing and how to get them back. Native
// because in the worst case Discordia's JS isn't running at all.

#import "Discordia.h"

static UIViewController *DCDTopViewController(void) {
    UIWindow *window;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class] || scene.activationState != UISceneActivationStateForegroundActive) continue;
        for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
            if (candidate.isKeyWindow) window = candidate;
        }
    }
    UIViewController *controller = window.rootViewController;
    while (controller.presentedViewController) controller = controller.presentedViewController;
    return controller;
}

static void DCDPresentWhenReady(UIAlertController *alert, NSInteger attemptsLeft) {
    UIViewController *top = DCDTopViewController();
    if (top) {
        [top presentViewController:alert animated:YES completion:nil];
    } else if (attemptsLeft > 0) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            DCDPresentWhenReady(alert, attemptsLeft - 1);
        });
    }
}

void DCDShowRecoveryAlertIfNeeded(void) {
    DCDBootGuard *guard = DCDBootGuard.shared;
    if (![guard.safeModeReason isEqualToString:@"crash-loop"]) return;

    BOOL disabled = guard.mode == DCDBootModeDisabled;
    NSString *title = disabled ? @"Discordia was not loaded" : @"Discordia is in safe mode";
    NSString *message = disabled
        ? [NSString stringWithFormat:@"Discord failed to start %ld times in a row, so it was started without Discordia. Discordia will load again on the next launch.", (long)guard.failedBoots]
        : [NSString stringWithFormat:@"Discord failed to start %ld times in a row, so plugins and icon packs were not loaded. A recently installed or updated plugin is the most likely cause; you can disable it in Settings > Plugins.", (long)guard.failedBoots];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        UIAlertController *alert = [UIAlertController alertControllerWithTitle:title message:message preferredStyle:UIAlertControllerStyleAlert];
        [alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
        DCDPresentWhenReady(alert, 10);
    });
}
