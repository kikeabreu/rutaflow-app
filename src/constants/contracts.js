// src/constants/contracts.js

// Feature Flags to safely toggle new architectural changes
export const FLAGS = {
    offline_v2: false,
    hud_v2: false,
    native_speech_v2: false,
    copilot_status_v2: false,
    native_tracking_v2: false,
    places_v2: false
};

// State Machines Contracts
export const SpeechState = {
    IDLE: 'idle',
    REQUESTING: 'requesting',
    LISTENING: 'listening',
    STOPPING: 'stopping',
    ERROR: 'error'
};

export const CopilotState = {
    DISABLED_BY_USER: 'disabled_by_user',
    STARTING: 'starting',
    ACTIVE: 'active',
    PAUSED_RUTAFLOW: 'paused_rutaflow',
    NEEDS_CONSENT: 'needs_consent',
    STOPPED_BY_SYSTEM: 'stopped_by_system',
    ERROR: 'error'
};

export const TrackingState = {
    OFF: 'off',
    STARTING: 'starting',
    TRACKING: 'tracking',
    DEGRADED: 'degraded',
    PERMISSION_DENIED: 'permission_denied',
    STOPPED: 'stopped'
};
