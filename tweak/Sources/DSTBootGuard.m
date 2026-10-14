// Crash-loop protection. Every JS launch increments a counter that is reset
// once the app has stayed up for a while. Repeated failures first start
// Distra in safe mode (no plugins/icon packs), then skip it entirely, so a
// bad plugin or Distra bug can never lock someone out of Discord.

#import "Distra.h"

static const NSInteger kSafeModeThreshold = 3;
static const NSInteger kDisableThreshold = 5;
static const int64_t kStableAfterSeconds = 15;

@implementation DSTBootGuard {
    NSUInteger _generation;
}

+ (instancetype)shared {
    static DSTBootGuard *shared;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ shared = [self new]; });
    return shared;
}

- (NSURL *)stateURL {
    return [DSTRootURL() URLByAppendingPathComponent:@"state/boot.json"];
}

- (DSTBootMode)beginLaunch {
    @synchronized (self) {
        NSInteger failed = [DSTReadJSONObject(self.stateURL)[@"failedBoots"] integerValue];
        _failedBoots = failed;

        if (failed >= kDisableThreshold) {
            _mode = DSTBootModeDisabled;
            _safeModeReason = @"crash-loop";
        } else if (failed >= kSafeModeThreshold) {
            _mode = DSTBootModeSafe;
            _safeModeReason = @"crash-loop";
        } else if ([DSTLoaderConfig()[@"safeMode"] boolValue]) {
            _mode = DSTBootModeSafe;
            _safeModeReason = @"user";
        } else {
            _mode = DSTBootModeNormal;
            _safeModeReason = nil;
        }

        DSTWriteJSONObject(@{ @"failedBoots": @(failed + 1) }, self.stateURL, nil);
        DSTLogNative(@"Launch after %ld failed launch(es); mode %@", (long)failed, @[@"normal", @"safe", @"disabled"][_mode]);

        // Reloads start a new launch; only the latest one may mark itself stable.
        NSUInteger generation = ++_generation;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, kStableAfterSeconds * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            if (generation == self->_generation) {
                [self markStable];
                DSTLogNative(@"Launch marked stable");
            }
        });

        return _mode;
    }
}

- (void)markStable {
    @synchronized (self) {
        DSTWriteJSONObject(@{ @"failedBoots": @0 }, self.stateURL, nil);
    }
}

@end
