import { logger } from "@vendetta";
import { findByStoreName } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import Settings from "./Settings";

let unpatch;

// Audio URLs for rickroll (using reliable public sources)
const RICKROLL_URLS = [
    "https://files.catbox.moe/pbtj68.mp3", // Direct MP3 link
    "https://audio.jukehost.co.uk/tFkLhbRaHjQGx7UHwsQMEe3eTfQNK5H4", // Backup
    "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav" // Fallback sound
];

// Play rickroll audio
const playRickroll = () => {
    try {
        // Try multiple URLs in case one fails
        const audio = new Audio();
        let urlIndex = 0;
        
        const tryNextUrl = () => {
            if (urlIndex >= RICKROLL_URLS.length) {
                logger.log("All rickroll URLs failed, playing local beep");
                // Fallback: create a simple beep sound
                const context = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = context.createOscillator();
                const gainNode = context.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(context.destination);
                
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, context.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 1);
                
                oscillator.start(context.currentTime);
                oscillator.stop(context.currentTime + 1);
                return;
            }
            
            audio.src = RICKROLL_URLS[urlIndex];
            audio.volume = 0.7;
            audio.play().catch(() => {
                urlIndex++;
                tryNextUrl();
            });
        };
        
        audio.addEventListener('error', () => {
            urlIndex++;
            tryNextUrl();
        });
        
        tryNextUrl();
        
        logger.log("🎵 Never gonna give you up! 🎵");
    } catch (error) {
        logger.log("Failed to rickroll:", error);
    }
};

// Check if message contains rickroll command
const checkForRickroll = (message) => {
    const content = message.content?.toLowerCase() || "";
    return content.includes("/rick") || content.includes("/rickroll");
};

export default {
    onLoad: () => {
        logger.log("🎵 Rickroll Plugin Loaded! Type /rick to rickroll! 🎵");
        
        try {
            // Find the MessageActions for sending messages
            const MessageActions = findByStoreName("MessageActions");
            
            if (MessageActions && MessageActions.sendMessage) {
                // Patch the sendMessage function
                unpatch = before("sendMessage", MessageActions, (args) => {
                    const [channelId, message] = args;
                    
                    if (checkForRickroll(message)) {
                        // Play rickroll sound locally for the user
                        setTimeout(() => {
                            playRickroll();
                        }, 100);
                        
                        // Replace the message content with rickroll text
                        message.content = "🎵 **RICKROLLED!** 🎵\n*Never gonna give you up, never gonna let you down!* 🕺💃\n\n*(You just got rickrolled by yourself!)*";
                        
                        logger.log("Rickroll activated! 🎵");
                    }
                });
                
                logger.log("Successfully patched MessageActions for rickroll detection!");
            } else {
                logger.log("Could not find MessageActions - trying alternative approach...");
                
                // Alternative: try to find the message store
                const MessageStore = findByStoreName("MessageStore");
                if (MessageStore) {
                    unpatch = before("dispatch", MessageStore, (args) => {
                        const [action] = args;
                        if (action.type === "MESSAGE_CREATE" && action.message && checkForRickroll(action.message)) {
                            setTimeout(() => {
                                playRickroll();
                            }, 100);
                        }
                    });
                }
            }
        } catch (error) {
            logger.log("Error setting up rickroll plugin:", error);
        }
    },
    
    onUnload: () => {
        logger.log("🎵 Rickroll Plugin Unloaded - No more rickrolls! 🎵");
        
        // Remove patches
        if (unpatch) {
            unpatch();
            unpatch = null;
        }
    },
    
    settings: Settings,
};
