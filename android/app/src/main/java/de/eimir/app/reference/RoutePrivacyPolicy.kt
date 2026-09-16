package de.eimir.app.reference

import de.eimir.app.shell.AppDestination

/**
 * The privacy capability of an Android destination.
 *
 * [UNKNOWN] is deliberately capture-blocked. Adding a route without classifying
 * it can therefore reduce screenshot availability, but can never expose owner-only
 * content while its privacy boundary is still undecided.
 */
internal enum class RoutePrivacyCapability(val blocksContentCapture: Boolean) {
    SPACE_SHARED_ONLY(false),
    OWNER_ONLY_CAPABLE(true),
    UNKNOWN(true),
}

/**
 * Domain semantics that make a route owner-only-capable.
 *
 * The server maps `ContentVisibility.PRIVATE` and
 * `ProfileVisibility.PRIVATE_PARTNER_NOTE` to `PrivacyClass.OWNER_ONLY`.
 * Keeping those origins in the route inventory makes the client policy
 * reviewable without inspecting loaded rows or depending on response timing.
 */
internal enum class OwnerOnlySemantics {
    CONTENT_VISIBILITY_PRIVATE,
    PRIVATE_PARTNER_NOTE,
    PRIVACY_CLASS_OWNER_ONLY,
}

internal data class RoutePrivacyDecision(
    val capability: RoutePrivacyCapability,
    val ownerOnlySemantics: Set<OwnerOnlySemantics> = emptySet(),
)

private enum class RouteMatch {
    EXACT,
    SUBTREE,
}

private data class RoutePrivacyRule(
    val route: String,
    val match: RouteMatch,
    val decision: RoutePrivacyDecision,
) {
    fun matches(candidate: String): Boolean =
        candidate == route || (match == RouteMatch.SUBTREE && candidate.startsWith("$route/"))
}

private val sharedOnly = RoutePrivacyDecision(RoutePrivacyCapability.SPACE_SHARED_ONLY)

private fun ownerOnlyCapable(vararg semantics: OwnerOnlySemantics) =
    RoutePrivacyDecision(
        capability = RoutePrivacyCapability.OWNER_ONLY_CAPABLE,
        ownerOnlySemantics = semantics.toSet(),
    )

private fun exact(route: String, decision: RoutePrivacyDecision) =
    RoutePrivacyRule(route, RouteMatch.EXACT, decision)

private fun subtree(route: String, decision: RoutePrivacyDecision) =
    RoutePrivacyRule(route, RouteMatch.SUBTREE, decision)

/**
 * The central Android route/privacy inventory.
 *
 * Mixed shared/private datasets are classified by route capability rather than
 * by their current rows. Private Area and Related Persons use subtree rules so
 * future nested destinations inherit protection. The HeartMoments owner route
 * is exact because the separate HeartMoment detail projection is shared-only.
 */
private val routePrivacyRules = listOf(
    subtree(
        PRIVATE_AREA_ROUTE,
        ownerOnlyCapable(OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY),
    ),
    subtree(
        RELATED_PERSONS_ROUTE,
        ownerOnlyCapable(
            OwnerOnlySemantics.CONTENT_VISIBILITY_PRIVATE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        ),
    ),
    exact(
        HEART_MOMENTS_ROUTE,
        ownerOnlyCapable(
            OwnerOnlySemantics.CONTENT_VISIBILITY_PRIVATE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        ),
    ),
    exact(
        PREFERENCES_ROUTE,
        ownerOnlyCapable(
            OwnerOnlySemantics.PRIVATE_PARTNER_NOTE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        ),
    ),
    exact(
        SEARCH_ROUTE,
        ownerOnlyCapable(OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY),
    ),
    exact(AppDestination.Today.route, sharedOnly),
    exact(AppDestination.Story.route, sharedOnly),
    exact(AppDestination.Plan.route, sharedOnly),
    exact(AppDestination.More.route, sharedOnly),
    exact(MEMORY_ROUTE, sharedOnly),
    exact(MEMORY_CREATE_ROUTE, sharedOnly),
    exact(MILESTONE_CREATE_ROUTE, sharedOnly),
    exact(MILESTONE_ROUTE, sharedOnly),
    exact(HEART_MOMENT_ROUTE, sharedOnly),
    exact(INVITATIONS_ROUTE, sharedOnly),
    exact(PLACES_ROUTE, sharedOnly),
    exact(PLACE_RELATIONS_ROUTE, sharedOnly),
    exact(COLLECTIONS_ROUTE, sharedOnly),
    exact(COLLECTION_DETAIL_ROUTE, sharedOnly),
    exact(CHAPTERS_ROUTE, sharedOnly),
    exact(CHAPTER_CONTENT_ROUTE, sharedOnly),
    exact(NOTIFICATIONS_ROUTE, sharedOnly),
    exact(ACTIVITY_ROUTE, sharedOnly),
    exact(DATA_EXPORT_ROUTE, sharedOnly),
    exact(DATA_IMPORT_ROUTE, sharedOnly),
)

internal fun routePrivacyDecision(route: String?): RoutePrivacyDecision {
    if (route == null) return RoutePrivacyDecision(RoutePrivacyCapability.UNKNOWN)
    return routePrivacyRules.firstOrNull { it.matches(route) }?.decision
        ?: RoutePrivacyDecision(RoutePrivacyCapability.UNKNOWN)
}

internal fun isSecureRoute(route: String?): Boolean =
    routePrivacyDecision(route).capability.blocksContentCapture

internal const val MEMORY_ID_ARGUMENT = "memoryId"
internal const val MEMORY_ROUTE = "story/memories/{$MEMORY_ID_ARGUMENT}"
internal const val MEMORY_CREATE_ROUTE = "story/memories/new"

/** The account's own HeartMoments, including private ones. */
internal const val HEART_MOMENTS_ROUTE = "story/heart-moments"
internal const val INVITATIONS_ROUTE = "more/invitations"

internal const val ITEM_ID_ARGUMENT = "itemId"
internal const val MILESTONE_ROUTE = "story/milestones/{$ITEM_ID_ARGUMENT}"
internal const val MILESTONE_CREATE_ROUTE = "story/milestones/new"

/** A shared HeartMoment opened from the shared Story projection. */
internal const val HEART_MOMENT_ROUTE = "story/heart-moments/{$ITEM_ID_ARGUMENT}"

internal const val RELATED_PERSONS_ROUTE = "people/related-persons"
internal const val PERSON_ID_ARGUMENT = "personId"
internal const val IMPORTANT_DATES_ROUTE =
    "people/related-persons/{$PERSON_ID_ARGUMENT}/important-dates"

internal const val PREFERENCES_ROUTE = "profile/preferences"

internal const val PLACES_ROUTE = "planning/places"
internal const val PLACE_ID_ARGUMENT = "placeId"
internal const val PLACE_RELATIONS_ROUTE = "planning/places/{$PLACE_ID_ARGUMENT}/relations"

internal const val COLLECTIONS_ROUTE = "planning/collections"
internal const val COLLECTION_ID_ARGUMENT = "collectionId"
internal const val COLLECTION_DETAIL_ROUTE = "planning/collections/{$COLLECTION_ID_ARGUMENT}"

internal const val CHAPTERS_ROUTE = "planning/chapters"
internal const val CHAPTER_ID_ARGUMENT = "chapterId"
internal const val CHAPTER_CONTENT_ROUTE = "planning/chapters/{$CHAPTER_ID_ARGUMENT}/content"

internal const val PRIVATE_AREA_ROUTE = "more/private"
internal const val PRIVATE_NOTES_ROUTE = "more/private/notes"
internal const val GIFT_IDEAS_ROUTE = "more/private/gift-ideas"
internal const val PRIVATE_COLLECTIONS_ROUTE = "more/private/collections"
internal const val PRIVATE_COLLECTION_DETAIL_ROUTE =
    "more/private/collections/{$COLLECTION_ID_ARGUMENT}"

internal const val DATA_EXPORT_ROUTE = "more/data-export"
internal const val DATA_IMPORT_ROUTE = "more/data-import"
internal const val NOTIFICATIONS_ROUTE = "more/notifications"
internal const val ACTIVITY_ROUTE = "today/activity"
internal const val SEARCH_ROUTE = "search"
