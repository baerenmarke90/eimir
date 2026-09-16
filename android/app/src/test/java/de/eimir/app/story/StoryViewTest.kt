package de.eimir.app.story

import de.eimir.app.reference.FakeReferenceContract
import de.eimir.app.reference.ReferenceConfig
import de.eimir.app.reference.ReferenceContract
import de.eimir.app.reference.ReferenceViewModel
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import eimir.api.models.AccountMembershipView
import eimir.api.models.AccountView
import eimir.api.models.AuthorSummary
import eimir.api.models.MemorySummary
import eimir.api.models.ResourceCapabilities
import eimir.api.models.SessionView
import eimir.api.models.StoryItem
import eimir.api.models.StoryMemoryItem
import eimir.api.models.StoryPage
import eimir.api.models.TokenView

private val SPACE: UUID = UUID.fromString("22222222-2222-4222-8222-222222222222")

/**
 * Discover and Timeline as independent peer modes (#966): switching between
 * them must never disturb the other's applied scope, loaded range, or
 * in-flight/stale request bookkeeping.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun startsOnTimelineAndDoesNotFetchDiscoverUntilSelected() = runTest(dispatcher) {
        val api = ViewApi()
        val model = signedIn(api)

        // Timeline's own default-scope load already ran once at sign-in
        // (reusing the same unscoped endpoint); Discover's independent state
        // is untouched until its mode is actually selected.
        assertEquals(StoryView.TIMELINE, model.uiState.value.storyView)
        assertTrue(model.uiState.value.discoverItems.isEmpty())
        assertFalse(model.uiState.value.discoverLoaded)
        assertEquals(1, api.unscopedCalls)
    }

    @Test
    fun switchingToDiscoverLoadsItsOwnUnfilteredPageOnce() = runTest(dispatcher) {
        val api = ViewApi(unscoped = page("discover-1"))
        val model = signedIn(api)
        val callsBeforeDiscover = api.unscopedCalls

        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()

        assertEquals(StoryView.DISCOVER, model.uiState.value.storyView)
        assertEquals(1, model.uiState.value.discoverItems.size)
        assertTrue(model.uiState.value.discoverLoaded)
        assertEquals(callsBeforeDiscover + 1, api.unscopedCalls)

        // Switching back and forth again does not refetch what is already loaded.
        model.setStoryView(StoryView.TIMELINE)
        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()
        assertEquals(callsBeforeDiscover + 1, api.unscopedCalls)
    }

    @Test
    fun discoverStaysUnfilteredAndTimelineScopeSurvivesVisitingIt() = runTest(dispatcher) {
        val api = ViewApi(unscoped = page("discover-1"))
        val model = signedIn(api)
        val scope = TimelineScope(year = 2025, kind = StoryEntryKind.MEMORY)

        model.applyStoryScope(scope)
        advanceUntilIdle()
        val timelineItemsBefore = model.uiState.value.storyItems

        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()

        // Discover's own fetch never touched Timeline's applied scope or items.
        assertEquals(scope, model.uiState.value.storyScope)
        assertEquals(timelineItemsBefore, model.uiState.value.storyItems)
        // Discover's own item is the independent unfiltered page, not Timeline's.
        assertEquals(1, model.uiState.value.discoverItems.size)
        assertFalse(model.uiState.value.discoverItems == timelineItemsBefore)

        model.setStoryView(StoryView.TIMELINE)
        assertEquals(scope, model.uiState.value.storyScope)
        assertEquals(timelineItemsBefore, model.uiState.value.storyItems)
    }

    @Test
    fun requestsOldestFirstOnlyWhenTheOrderFilterIsApplied() = runTest(dispatcher) {
        val api = ViewApi()
        val model = signedIn(api)

        model.applyStoryScope(TimelineScope(order = StoryOrder.OLDEST_FIRST))
        advanceUntilIdle()

        assertEquals(listOf(StoryOrder.OLDEST_FIRST), api.scopedOrders)
    }

    @Test
    fun defaultOrderIsPassedThroughUnchangedWhenOnlyOtherFiltersApply() = runTest(dispatcher) {
        val api = ViewApi()
        val model = signedIn(api)

        // A non-default scope (year set) still passes the default order as-is;
        // the network-level omission of an explicit `order` query parameter
        // for this case is covered by OkHttpReferenceApiTest.
        model.applyStoryScope(TimelineScope(year = 2025))
        advanceUntilIdle()

        assertEquals(listOf(StoryOrder.NEWEST_FIRST), api.scopedOrders)
    }

    @Test
    fun accountSwitchResetsBothModesAndTheirGenerations() = runTest(dispatcher) {
        val api = ViewApi(unscoped = page("discover-1"))
        val model = signedIn(api)
        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()
        assertTrue(model.uiState.value.discoverItems.isNotEmpty())

        model.logout()
        model.signIn("someone-else@example.test", "secret")
        advanceUntilIdle()

        assertEquals(StoryView.TIMELINE, model.uiState.value.storyView)
        assertTrue(model.uiState.value.discoverItems.isEmpty())
        assertFalse(model.uiState.value.discoverLoaded)
    }

    @Test
    fun capturesDiscoverAvailableYearsFromItsOwnFetchedPage() = runTest(dispatcher) {
        val api = ViewApi(unscoped = page("discover-1", availableYears = listOf(2026, 2025, 2021)))
        val model = signedIn(api)

        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()

        assertEquals(listOf(2026, 2025, 2021), model.uiState.value.discoverAvailableYears)
    }

    @Test
    fun selectingADiscoverYearAppliesItToTimelineAndSwitchesModeWithoutTouchingDiscover() = runTest(dispatcher) {
        val api = ViewApi(unscoped = page("discover-1", availableYears = listOf(2025)))
        val model = signedIn(api)
        model.setStoryView(StoryView.DISCOVER)
        advanceUntilIdle()
        val discoverItemsBefore = model.uiState.value.discoverItems

        model.selectDiscoverYear(2025)
        advanceUntilIdle()

        assertEquals(StoryView.TIMELINE, model.uiState.value.storyView)
        assertEquals(TimelineScope(year = 2025), model.uiState.value.storyScope)
        // Discover's own already-loaded data is untouched by the year jump.
        assertEquals(discoverItemsBefore, model.uiState.value.discoverItems)
    }

    private fun TestScope.signedIn(api: ReferenceContract): ReferenceViewModel {
        val model = ReferenceViewModel(config = ReferenceConfig(BASE_URL), api = api)
        model.signIn("someone@example.test", "secret")
        advanceUntilIdle()
        return model
    }
}

private const val BASE_URL = "https://eimir.example"
private val CAPABILITIES = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true)
private val AUTHOR = AuthorSummary(displayName = "Lea", id = UUID.randomUUID())

private fun page(title: String, availableYears: List<Int> = emptyList()) = StoryPage(
    hasMore = false,
    items = listOf(
        StoryItem.MemoryWrapper(
            StoryMemoryItem(
                effectiveDate = LocalDate.of(2026, 8, 20),
                kind = StoryMemoryItem.Kind.MEMORY,
                memory = MemorySummary(
                    attachments = emptyList(),
                    author = AUTHOR,
                    capabilities = CAPABILITIES,
                    createdAt = OffsetDateTime.now(),
                    happenedOn = LocalDate.of(2026, 8, 20),
                    id = UUID.randomUUID(),
                    title = title,
                ),
            ),
        ),
    ),
    nextCursor = null,
    availableYears = availableYears,
)

private class ViewApi(
    private val unscoped: StoryPage = StoryPage(hasMore = false, items = emptyList(), nextCursor = null),
) : FakeReferenceContract() {
    var unscopedCalls = 0
    val scopedOrders = mutableListOf<StoryOrder>()

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = "Lea", id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun getTimeline(spaceId: UUID, accessToken: String, cursor: String?): StoryPage {
        unscopedCalls++
        return unscoped
    }

    override suspend fun getScopedTimeline(
        spaceId: UUID,
        accessToken: String,
        scope: TimelineScope,
        cursor: String?,
    ): StoryPage {
        if (scope.isDefault) return getTimeline(spaceId, accessToken, cursor)
        scopedOrders += scope.order
        return StoryPage(hasMore = false, items = emptyList(), nextCursor = null)
    }
}
