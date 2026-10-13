TARGET := iphone:clang:latest:15.0
ARCHS := arm64
INSTALL_TARGET_PROCESSES = Discord

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = Discordia

Discordia_FILES = $(wildcard Sources/*.x Sources/*.m) Sources/Generated/EmbeddedBundle.c Sources/Generated/EmbeddedBuiltins.S
Discordia_CFLAGS = -fobjc-arc -ISources -Wno-unused-function \
	-DDISCORDIA_TWEAK_VERSION=\"$(THEOS_PACKAGE_BASE_VERSION)\" \
	-DDISCORDIA_INSTALL_PREFIX=\"$(THEOS_PACKAGE_INSTALL_PREFIX)\"
Discordia_FRAMEWORKS = Foundation UIKit CoreImage
Discordia_LIBRARIES = sqlite3
# Hooks use the ObjC runtime directly, so the dylib needs no Substrate/ElleKit
# when injected into an IPA.
Discordia_LOGOS_DEFAULT_GENERATOR = internal

include $(THEOS_MAKE_PATH)/tweak.mk

Sources/Generated/EmbeddedBundle.c:
	$(error Missing $@. Build the JS bundle first: `pnpm build` in the repository root)

Sources/Generated/EmbeddedBuiltins.S:
	$(error Missing $@. Build the built-in plugins first: `pnpm build:plugins` in the repository root)
