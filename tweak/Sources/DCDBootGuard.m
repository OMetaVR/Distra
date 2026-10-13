// Crash-loop protection. Every JS launch increments a counter that is reset
// once the app has stayed up for a while. Repeated failures first start
// Discordia in safe mode (no plugins/icon packs), then skip it entirely, so a
// bad plugin or Discordia bug can never lock someone out of Discord.

#import "Discordia.h"

static const NSInteger kSafeModeThreshold = 3;
static const NSInteger kDisableThreshold = 5;
static const int64_t kStableAfterSeconds = 15;

@implementation DCDBootGuard {
    NSUInteger _generation;
}

+ (instancetype)shared {
    static DCDBootGuard *shared;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ shared = [self new]; });
    return shared;
}

- (NSURL *)stateURL {
    return [DCDRootURL() URLByAppendingPathComponent:@"state/boot.json"];
}

- (DCDBootMode)beginLaunch {
    @synchronized (self) {
        NSInteger failed = [DCDReadJSONObject(self.stateURL)[@"failedBoots"] integerValue];
        _failedBoots = failed;

        if (failed >= kDisableThreshold) {
            _mode = DCDBootModeDisabled;
            _safeModeReason = @"crash-loop";
        } else if (failed >= kSafeModeThreshold) {
            _mode = DCDBootModeSafe;
            _safeModeReason = @"crash-loop";
        } else if ([DCDLoaderConfig()[@"safeMode"] boolValue]) {
            _mode = DCDBootModeSafe;
            _safeModeReason = @"user";
        } else {
            _mode = DCDBootModeNormal;
            _safeModeReason = nil;
        }

        DCDWriteJSONObject(@{ @"failedBoots": @(failed + 1) }, self.stateURL, nil);
        DCDLogNative(@"Launch after %ld failed launch(es); mode %@", (long)failed, @[@"normal", @"safe", @"disabled"][_mode]);

        // Reloads start a new launch; only the latest one may mark itself stable.
        NSUInteger generation = ++_generation;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, kStableAfterSeconds * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            if (generation == self->_generation) {
                [self markStable];
                DCDLogNative(@"Launch marked stable");
            }
        });

        return _mode;
    }
}

- (void)markStable {
    @synchronized (self) {
        DCDWriteJSONObject(@{ @"failedBoots": @0 }, self.stateURL, nil);
    }
}

@end
