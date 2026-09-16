package de.eimir.app.reference

import de.eimir.app.shell.AppDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regression coverage for #683's complete Android route/privacy inventory. */
class RoutePrivacyPolicyTest {
    @Test
    fun contentVisibilityPrivateSurfacesAreOwnerOnlyCapable() {
        assertOwnerOnly(
            HEART_MOMENTS_ROUTE,
            OwnerOnlySemantics.CONTENT_VISIBILITY_PRIVATE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        )
        assertOwnerOnly(
            RELATED_PERSONS_ROUTE,
            OwnerOnlySemantics.CONTENT_VISIBILITY_PRIVATE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        )
        assertOwnerOnly(
            IMPORTANT_DATES_ROUTE,
            OwnerOnlySemantics.CONTENT_VISIBILITY_PRIVATE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        )
    }

    @Test
    fun relatedPersonDetailRoutesInheritOwnerOnlyProtection() {
        assertTrue(isSecureRoute("people/related-persons/123/edit"))
        assertTrue(isSecureRoute("people/related-persons/123/important-dates/new"))
    }

    @Test
    fun privatePartnerNotesMapToOwnerOnlyProtection() {
        assertOwnerOnly(
            PREFERENCES_ROUTE,
            OwnerOnlySemantics.PRIVATE_PARTNER_NOTE,
            OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY,
        )
    }

    @Test
    fun privateAreaAndEveryNestedRouteRemainOwnerOnlyProtected() {
        listOf(
            PRIVATE_AREA_ROUTE,
            PRIVATE_NOTES_ROUTE,
            GIFT_IDEAS_ROUTE,
            PRIVATE_COLLECTIONS_ROUTE,
            PRIVATE_COLLECTION_DETAIL_ROUTE,
            "more/private/collections/123/items",
        ).forEach { route ->
            assertOwnerOnly(route, OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY)
        }
    }

    @Test
    fun searchRemainsProtectedBecauseResultsCanBeOwnerOnly() {
        assertOwnerOnly(SEARCH_ROUTE, OwnerOnlySemantics.PRIVACY_CLASS_OWNER_ONLY)
    }

    @Test
    fun currentSharedOnlyRoutesAreExplicitlyCaptureAllowed() {
        listOf(
            AppDestination.Today.route,
            AppDestination.Story.route,
            AppDestination.Plan.route,
            AppDestination.More.route,
            MEMORY_ROUTE,
            MEMORY_CREATE_ROUTE,
            MILESTONE_CREATE_ROUTE,
            MILESTONE_ROUTE,
            HEART_MOMENT_ROUTE,
            INVITATIONS_ROUTE,
            PLACES_ROUTE,
            PLACE_RELATIONS_ROUTE,
            COLLECTIONS_ROUTE,
            COLLECTION_DETAIL_ROUTE,
            CHAPTERS_ROUTE,
            CHAPTER_CONTENT_ROUTE,
            NOTIFICATIONS_ROUTE,
            ACTIVITY_ROUTE,
            DATA_EXPORT_ROUTE,
            DATA_IMPORT_ROUTE,
        ).forEach { route ->
            assertEquals(
                "Expected an explicit shared-only decision for $route",
                RoutePrivacyCapability.SPACE_SHARED_ONLY,
                routePrivacyDecision(route).capability,
            )
            assertFalse(isSecureRoute(route))
        }
    }

    @Test
    fun sharedHeartMomentDetailStaysDistinctFromOwnerCollection() {
        assertEquals(
            RoutePrivacyCapability.OWNER_ONLY_CAPABLE,
            routePrivacyDecision(HEART_MOMENTS_ROUTE).capability,
        )
        assertEquals(
            RoutePrivacyCapability.SPACE_SHARED_ONLY,
            routePrivacyDecision(HEART_MOMENT_ROUTE).capability,
        )
    }

    @Test
    fun nullAndUnclassifiedRoutesFailClosed() {
        assertEquals(RoutePrivacyCapability.UNKNOWN, routePrivacyDecision(null).capability)
        assertEquals(
            RoutePrivacyCapability.UNKNOWN,
            routePrivacyDecision("new/owner-status-undecided").capability,
        )
        assertTrue(isSecureRoute(null))
        assertTrue(isSecureRoute("new/owner-status-undecided"))
    }

    private fun assertOwnerOnly(route: String, vararg semantics: OwnerOnlySemantics) {
        val decision = routePrivacyDecision(route)
        assertEquals(RoutePrivacyCapability.OWNER_ONLY_CAPABLE, decision.capability)
        assertEquals(semantics.toSet(), decision.ownerOnlySemantics)
        assertTrue(isSecureRoute(route))
    }
}
