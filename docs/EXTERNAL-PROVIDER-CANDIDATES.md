# External Provider Candidates

## Purpose

This document records possible external providers and technical components for future eimir. integrations.

**Important:** An entry in this list is not approval for implementation.

Before every production use, the following must be reviewed again:

- current Terms of Service
- commercial usability for eimir. Cloud
- Self-Hosted support
- license and attribution
- storage, caching, and deletion obligations
- privacy requirements
- technical dependencies and SDK licenses

The review becomes part of the corresponding feature PR.

## Architecture rule

External providers are connected only through clear adapter or integration boundaries.
The eimir. Core must not know a concrete provider.

Changing a provider must not require changes to Domain models or business logic.

## Product rule: technology stays invisible

eimir. is explicitly intended for people without technical knowledge.

Normal users should never need to:

- obtain API keys
- enter technical URLs
- select providers
- manage tokens
- understand server configuration

The Backend or operating platform should handle the technical process wherever possible.

## Component classification

Not all candidates are external data providers. They are considered separately:

- **External Providers:** deliver data or services (for example maps, weather, photos).
- **Infrastructure components:** reduce custom Backend development (for example upload, search, storage, monitoring).
- **Client/platform components:** use existing operating-system or framework capabilities.

## Current external provider candidates

| Area | Candidate | Possible adapter | Initial assessment |
|---|---|---|---|
| Maps / Places / Routing | Geoapify | MapProvider, GeocodingProvider, PlacesProvider | Candidate for early review |
| Self-Hosted photos | Immich API | ExternalMediaProvider | strong Self-Hosted fit |
| Weather | Open-Meteo | WeatherProvider | simple context provider |
| External photos | Google Photos Picker API | ExternalMediaProvider | explicit user permission required |
| Calendar | CalDAV / iCalendar | CalendarProvider | open standard, low dependency |
| Holidays / school breaks | OpenHolidays | HolidayProvider | low privacy effort |
| Product data | Open Food Facts | ProductLookupProvider | ODbL review required |
| Knowledge data | Wikidata | EntertainmentProvider / DiscoveryProvider | rate limits must be considered |
| Location history | Traccar | LocationHistoryProvider | opt-in only and M8 context |

## Infrastructure components

| Area | Candidate | Benefit |
|---|---|---|
| API clients | OpenAPI Generator | generate the Web (TypeScript) client from contract; Android packages it |
| Uploads | tus | robust resumable photo/video uploads |
| Web upload UX | Uppy | upload UI, progress, error handling |
| Images | imgproxy | thumbnails, sizes, and formats without custom pipeline |
| Videos | FFmpeg | metadata, poster frames, processing |
| Search | PostgreSQL FTS + pg_trgm + unaccent | search without additional search server |
| Backup | restic + rclone | encrypted backups and storage connection |
| Storage | S3-compatible systems | replaceable MediaStore |
| Monitoring | OpenTelemetry | standardized telemetry |
| Host notifications | Apprise | optional infrastructure alerts |

## Client/platform components

| Area | Candidate | Benefit |
|---|---|---|
| Android media selection | Android Photo Picker | no custom gallery/permission logic |
| Android sharing | Android Sharesheet | receive content from other apps |
| Android background jobs | WorkManager | reliable uploads and synchronization |
| Android local cache | Room + Paging | retired with the Compose client (#1009); the Web client owns caching |
| Android images | Coil | retired with the Compose client (#1009); the Web client renders images |
| Android video | Media3 / ExoPlayer | retired with the Compose client (#1009); the Web client plays video |
| Web API state | TanStack Query | cache, retry, server state |
| QR/barcode | ZXing | invitations and product flows |
| Date/localization | dateparser + Babel | natural input and localization |

## Operating model

Every component must be considered separately for:

## eimir. Cloud

- eimir. operates the infrastructure.
- API access and costs belong to the operator.
- Users do not need technical provider accounts.
- Privacy and consent are controlled by eimir.

## Self-Hosted

- Operators of their own instance may use their own providers and infrastructure.
- Configuration belongs to the hoster, not normal users.
- Bring-your-own-key is possible where technically and legally appropriate.

## Required documentation before implementation

Every new provider or technical component requires:

1. documented license/ToS review
2. Cloud vs. Self-Hosted decision
3. data flow description
4. privacy assessment
5. cost model
6. dependencies and runtime licenses
7. description of the user experience without technical terms
8. fallback behavior without the component

This list is an architecture and review basis, not automatic implementation approval.
