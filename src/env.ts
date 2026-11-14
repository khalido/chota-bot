/**
 * Every named env var chota reads, imported from `$app/env/private`. All are read
 * when the app starts, and all are optional here: a missing key degrades its one
 * feature, and `preflight.ts` warns about the few that really matter.
 *
 * Sentral's per-person keys (`SENTRAL_<NAME>_...`) aren't listed, because that would
 * put family names in the repo. `tools/sentral.ts` reads those from `process.env`.
 */
import { defineEnvVars } from '@sveltejs/kit/env';

const optional = { schema: (value: string | undefined) => value ?? '' };

export const variables = defineEnvVars({
	// Server and storage
	ORIGIN: optional,
	PORT: optional,
	KIOSK: optional,
	DATABASE_URL: optional,

	// Sign-in
	BETTER_AUTH_SECRET: optional,
	GOOGLE_CLIENT_ID: optional,
	GOOGLE_CLIENT_SECRET: optional,

	// AI and chat
	AI_GATEWAY_API_KEY: optional,
	TELEGRAM_BOT_TOKEN: optional,
	WHATSAPP_ENABLED: optional,

	// The house (@khalido/home): path to its JSONC config, default data/home.jsonc
	HOME_CONFIG: optional,

	// Data sources
	EXA_API_KEY: optional,
	GOOGLE_BOOKS_API_KEY: optional,
	GOOGLE_WEATHER_API_KEY: optional,
	NASA_API_KEY: optional,
	TICKTICK_API_KEY: optional,
	TMDB_READ_ACCESS_TOKEN: optional,
	TRANSPORT_NSW_API_KEY: optional,
	X_BEARER_TOKEN: optional,

	// Spotify
	SPOTIFY_CLIENT_ID: optional,
	SPOTIFY_CLIENT_SECRET: optional,
	SOLOIST_WS: optional,

	// Log shipping
	OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: optional,
	OTEL_EXPORTER_OTLP_LOGS_HEADERS: optional,
	OTEL_SERVICE_NAME: optional
});
