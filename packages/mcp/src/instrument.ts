import { initializePostHogFromEnv } from './posthog.js';
import { initializeSentryFromEnv } from './sentry.js';

initializeSentryFromEnv();
initializePostHogFromEnv();
