package de.eimir.app.cache

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.reference.FakeReferenceContract
import de.eimir.app.reference.ReferenceApiException
import de.eimir.app.reference.ReferenceConfig
import de.eimir.app.reference.ReferenceContract
import de.eimir.app.reference.ReferenceViewModel
import java.io.IOException
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import eimir.api.models.AccountMembershipView
import eimir.api.models.AccountView
import eimir.api.models.AuthorSummary
import eimir.api.models.ChapterDetail
import eimir.api.models.ChapterPage
import eimir.api.models.CollectionDetail
import eimir.api.models.CollectionPage
import eimir.api.models.DashboardSpaceSummary
import eimir.api.models.DashboardView
import eimir.api.models.MemoryDetail
import eimir.api.models.MemorySummary
import eimir.api.models.PlaceDetail
import eimir.api.models.PlacePage
import eimir.api.models.PlanDetail
import eimir.api.models.PlanPage
import eimir.api.models.PlanStatus
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNotePage
import eimir.api.models.ResourceCapabilities
import eimir.api.models.SessionView
import eimir.api.models.StoryItem
import eimir.api.models.StoryMemoryItem
import eimir.api.models.StoryPage
import eimir.api.models.TokenView
import eimir.api.models.WishDetail
import eimir.api.models.WishPage
import eimir.api.models.WishStatus

private val SPACE: UUID = UUID.fromString("11111111-1111-4111-8111-111111111111")
private val OTHER_SPACE: UUID = UUID.fromString("55555555-5555-4555-8555-555555555555")
private val MEMORY: UUID = UUID.fromString("33333333-3333-4333-8333-333333333333")

/**
 * [ReferenceViewModel] wired to a real, Room-backed [ProductReadCache] —
 * the integration point `ProductReadCacheTest` alone cannot prove, since
 * that file exercises the cache directly rather than through a screen's
 * usual `openMemory`/`reloadMemory` path.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@OptIn(ExperimentalCoroutinesApi::class)
class ProductReadCacheViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    // A same-thread executor, not Room's default background thread pool: the
    // ViewModel's own coroutine runs on `Dispatchers.Main`, swapped to this
    // test's `StandardTestDispatcher` below, and `advanceUntilIdle()` only
    // pumps that dispatcher's own queue — a real background thread finishing
    // independently would race it. Room fully synchronous removes that race.
    private val database = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        ReadCacheDatabase::class.java,
    )
        .setQueryExecutor { it.run() }
        .setTransactionExecutor { it.run() }
        .allowMainThreadQueries()
        .build()
    private val cache = ProductReadCache(
        database.productCacheDao(),
        database.cacheContextDao(),
        database.protectedCacheDao(),
        FakeProtectedPayloadCipher(),
    )

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        database.close()
    }

    @Test
    fun aFreshNetworkReadCarriesNoCacheTimestamp() = runTest(dispatcher) {
        val model = signedIn(MemoryApi())

        model.openMemory(MEMORY)
        advanceUntilIdle()

        assertEquals(MEMORY, model.uiState.value.openMemory?.id)
        assertNull(model.uiState.value.openMemoryCachedAt)
    }

    @Test
    fun anOfflineReloadFallsBackToWhatWasCachedOnTheFirstSuccessfulRead() = runTest(dispatcher) {
        val api = MemoryApi()
        val model = signedIn(api)

        model.openMemory(MEMORY)
        advanceUntilIdle()

        api.nextFailure = IOException("offline")
        model.openMemory(MEMORY)
        advanceUntilIdle()

        assertEquals(MEMORY, model.uiState.value.openMemory?.id)
        assertNotNull(model.uiState.value.openMemoryCachedAt)
        // The fallback is silent, not an error state on top of the cached read.
        assertNull(model.uiState.value.memoryProblem)
    }

    @Test
    fun a401NeverFallsBackEvenWhenACachedRowExists() = runTest(dispatcher) {
        val api = MemoryApi()
        val model = signedIn(api)

        model.openMemory(MEMORY)
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.openMemory(MEMORY)
        advanceUntilIdle()

        // The screen keeps showing the last-good memory while a background
        // reload fails, same as before any cache existed — what must not
        // happen is the 401 being silently swallowed by a cache fallback.
        assertNull(model.uiState.value.openMemoryCachedAt)
        assertNotNull(model.uiState.value.memoryProblem)
    }

    @Test
    fun logoutClearsThePersistentCacheNotJustTheInMemoryState() = runTest(dispatcher) {
        val api = MemoryApi()
        val model = signedIn(api)

        model.openMemory(MEMORY)
        advanceUntilIdle()

        model.logout()
        advanceUntilIdle()

        // A second account/session, same resource id: nothing from the first
        // account's cache may answer for it.
        model.signIn("someone.else@example.test", "secret")
        advanceUntilIdle()
        api.nextFailure = IOException("offline")
        model.openMemory(MEMORY)
        advanceUntilIdle()

        assertNull(model.uiState.value.openMemory)
        assertNull(model.uiState.value.openMemoryCachedAt)
    }

    @Test
    fun switchingSpaceAndBackNoLongerFindsTheOriginalSpacesCachedRow() = runTest(dispatcher) {
        // A different key (Space differs) would miss regardless of any wipe;
        // switching back to the original Space proves the wipe itself ran,
        // not merely that the two Spaces' keys never collided.
        val api = MemoryApi(otherSpace = OTHER_SPACE)
        val model = signedIn(api)

        model.openMemory(MEMORY)
        advanceUntilIdle()

        model.selectSpace(OTHER_SPACE)
        advanceUntilIdle()
        model.selectSpace(SPACE)
        advanceUntilIdle()

        api.nextFailure = IOException("offline")
        model.openMemory(MEMORY)
        advanceUntilIdle()

        // No row survived the two Space switches to fall back to, so the
        // IOException surfaces as an ordinary Offline problem instead.
        assertNull(model.uiState.value.openMemoryCachedAt)
        assertEquals(
            de.eimir.app.shell.UiStateKind.Offline,
            model.uiState.value.memoryProblem?.kind,
        )
    }

    @Test
    fun refreshStoryFallsBackToTheCachedTimelineOnceOffline() = runTest(dispatcher) {
        val api = StoryApi()
        // Signing in already runs one refreshStory() itself, which is the
        // first successful network read the fallback below builds on.
        val model = signedIn(api)
        assertEquals(1, model.uiState.value.storyItems.size)
        assertNull(model.uiState.value.storyCachedAt)

        api.nextFailure = IOException("offline")
        model.refreshStory()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.storyItems.size)
        assertNotNull(model.uiState.value.storyCachedAt)
        // No offline pagination: a cache fallback has no cursor to load more with.
        assertEquals(false, model.uiState.value.storyHasMore)
        assertNull(model.uiState.value.error)
    }

    @Test
    fun refreshStoryNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = StoryApi()
        val model = signedIn(api)

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.refreshStory()
        advanceUntilIdle()

        assertNull(model.uiState.value.storyCachedAt)
        assertNotNull(model.uiState.value.storyProblem)
        assertTrue(model.uiState.value.storyItems.isEmpty())
        assertEquals(false, model.uiState.value.storyHasMore)
    }

    @Test
    fun loadPrivateNotesFallsBackToTheEncryptedCachedListOnceOffline() = runTest(dispatcher) {
        val api = PrivateNotesApi()
        val model = signedIn(api)

        model.loadPrivateNotes()
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.privateNotes.size)
        assertNull(model.uiState.value.privateNotesCachedAt)

        api.nextFailure = IOException("offline")
        model.loadPrivateNotes()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.privateNotes.size)
        assertNotNull(model.uiState.value.privateNotesCachedAt)
        assertNull(model.uiState.value.privateNotesProblem)
    }

    @Test
    fun loadPrivateNotesNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = PrivateNotesApi()
        val model = signedIn(api)

        model.loadPrivateNotes()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadPrivateNotes()
        advanceUntilIdle()

        assertNull(model.uiState.value.privateNotesCachedAt)
        assertNotNull(model.uiState.value.privateNotesProblem)
    }

    @Test
    fun loadPlanningFallsBackToTheCachedWishesAndPlansOnceOffline() = runTest(dispatcher) {
        val api = PlanningApi()
        val model = signedIn(api)

        model.loadPlanning()
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.openWishes.size)
        assertEquals(1, model.uiState.value.plans.size)
        assertNull(model.uiState.value.planningCachedAt)

        api.nextFailure = IOException("offline")
        model.loadPlanning()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.openWishes.size)
        assertEquals(1, model.uiState.value.plans.size)
        assertNotNull(model.uiState.value.planningCachedAt)
        assertNull(model.uiState.value.planningProblem)
    }

    @Test
    fun loadPlanningNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = PlanningApi()
        val model = signedIn(api)

        model.loadPlanning()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadPlanning()
        advanceUntilIdle()

        assertNull(model.uiState.value.planningCachedAt)
        assertNotNull(model.uiState.value.planningProblem)
    }

    @Test
    fun loadCollectionsFallsBackToTheCachedListOnceOffline() = runTest(dispatcher) {
        val api = CollectionsApi()
        val model = signedIn(api)

        model.loadCollections()
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.collections.size)
        assertNull(model.uiState.value.collectionsCachedAt)

        api.nextFailure = IOException("offline")
        model.loadCollections()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.collections.size)
        assertNotNull(model.uiState.value.collectionsCachedAt)
        assertNull(model.uiState.value.collectionsProblem)
    }

    @Test
    fun loadCollectionsNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = CollectionsApi()
        val model = signedIn(api)

        model.loadCollections()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadCollections()
        advanceUntilIdle()

        assertNull(model.uiState.value.collectionsCachedAt)
        assertNotNull(model.uiState.value.collectionsProblem)
    }

    @Test
    fun loadPlacesFallsBackToTheCachedListOnceOffline() = runTest(dispatcher) {
        val api = PlacesApi()
        val model = signedIn(api)

        model.loadPlaces()
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.places.size)
        assertNull(model.uiState.value.placesCachedAt)

        api.nextFailure = IOException("offline")
        model.loadPlaces()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.places.size)
        assertNotNull(model.uiState.value.placesCachedAt)
        assertNull(model.uiState.value.placesProblem)
    }

    @Test
    fun loadPlacesNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = PlacesApi()
        val model = signedIn(api)

        model.loadPlaces()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadPlaces()
        advanceUntilIdle()

        assertNull(model.uiState.value.placesCachedAt)
        assertNotNull(model.uiState.value.placesProblem)
    }

    @Test
    fun loadChaptersFallsBackToTheCachedListOnceOffline() = runTest(dispatcher) {
        val api = ChaptersApi()
        val model = signedIn(api)

        model.loadChapters()
        advanceUntilIdle()
        assertEquals(1, model.uiState.value.chapters.size)
        assertNull(model.uiState.value.chaptersCachedAt)

        api.nextFailure = IOException("offline")
        model.loadChapters()
        advanceUntilIdle()

        assertEquals(1, model.uiState.value.chapters.size)
        assertNotNull(model.uiState.value.chaptersCachedAt)
        assertNull(model.uiState.value.chaptersProblem)
    }

    @Test
    fun loadChaptersNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = ChaptersApi()
        val model = signedIn(api)

        model.loadChapters()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadChapters()
        advanceUntilIdle()

        assertNull(model.uiState.value.chaptersCachedAt)
        assertNotNull(model.uiState.value.chaptersProblem)
    }

    @Test
    fun loadTodayFallsBackToTheCachedDashboardOnceOffline() = runTest(dispatcher) {
        val api = TodayApi()
        val model = signedIn(api)

        model.loadToday()
        advanceUntilIdle()
        assertNotNull(model.uiState.value.dashboard)
        assertNull(model.uiState.value.todayCachedAt)

        api.nextFailure = IOException("offline")
        model.loadToday()
        advanceUntilIdle()

        assertNotNull(model.uiState.value.dashboard)
        assertNotNull(model.uiState.value.todayCachedAt)
        assertNull(model.uiState.value.todayProblem)
    }

    @Test
    fun loadTodayNeverFallsBackOnA401EvenWithACachedRow() = runTest(dispatcher) {
        val api = TodayApi()
        val model = signedIn(api)

        model.loadToday()
        advanceUntilIdle()

        api.nextFailure = ReferenceApiException(code = "unauthenticated", message = "expired", status = 401)
        model.loadToday()
        advanceUntilIdle()

        assertNull(model.uiState.value.todayCachedAt)
        assertNotNull(model.uiState.value.todayProblem)
    }

    private suspend fun TestScope.signedIn(api: ReferenceContract): ReferenceViewModel {
        val model = ReferenceViewModel(config = ReferenceConfig(BASE_URL), api = api, productReadCache = cache)
        model.signIn("someone@example.test", "secret")
        advanceUntilIdle()
        return model
    }
}

private const val BASE_URL = "https://eimir.example"

private fun memoryDetail() = MemoryDetail(
    attachments = emptyList(),
    author = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
    authorId = UUID.randomUUID(),
    body = "The text as the server has it",
    capabilities = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true),
    createdAt = OffsetDateTime.now(),
    happenedOn = LocalDate.of(2026, 8, 17),
    id = MEMORY,
    spaceId = SPACE,
    title = "The title as the server has it",
    updatedAt = OffsetDateTime.now(),
    version = 7,
)

private class MemoryApi(
    private val otherSpace: UUID? = null,
) : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOfNotNull(
            AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"),
            otherSpace?.let { AccountMembershipView(role = "PARTNER", spaceId = it, status = "ACTIVE") },
        )

    override suspend fun getMemory(spaceId: UUID, accessToken: String, memoryId: UUID): MemoryDetail {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return memoryDetail()
    }
}

private fun storyMemoryItem(): StoryItem = StoryItem.MemoryWrapper(
    StoryMemoryItem(
        effectiveDate = LocalDate.of(2026, 8, 17),
        kind = StoryMemoryItem.Kind.MEMORY,
        memory = MemorySummary(
            attachments = emptyList(),
            author = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
            capabilities = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true),
            createdAt = OffsetDateTime.now(),
            happenedOn = LocalDate.of(2026, 8, 17),
            id = MEMORY,
            title = "A day by the sea",
        ),
    ),
)

private class StoryApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
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
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return StoryPage(hasMore = false, items = listOf(storyMemoryItem()), nextCursor = null)
    }
}

private class PrivateNotesApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null
    private val ownerId: UUID = UUID.randomUUID()

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = ownerId),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun listPrivateNotes(spaceId: UUID, accessToken: String, cursor: String?): PrivateNotePage {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return PrivateNotePage(
            hasMore = false,
            items = listOf(
                PrivateNoteDetail(
                    body = "A private thought",
                    capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                    createdAt = OffsetDateTime.now(),
                    id = UUID.randomUUID(),
                    ownerId = ownerId,
                    pinned = false,
                    spaceId = spaceId,
                    title = "Just for me",
                    updatedAt = OffsetDateTime.now(),
                    version = 1,
                ),
            ),
            nextCursor = null,
        )
    }
}

private class PlanningApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun listWishes(spaceId: UUID, accessToken: String): WishPage {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return WishPage(
            hasMore = false,
            items = listOf(
                WishDetail(
                    capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                    createdAt = OffsetDateTime.now(),
                    createdBy = UUID.randomUUID(),
                    creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
                    id = UUID.randomUUID(),
                    spaceId = spaceId,
                    status = WishStatus.OPEN,
                    title = "Weekend in the mountains",
                    updatedAt = OffsetDateTime.now(),
                    version = 1,
                ),
            ),
            nextCursor = null,
        )
    }

    override suspend fun listPlans(spaceId: UUID, accessToken: String): PlanPage = PlanPage(
        hasMore = false,
        items = listOf(
            PlanDetail(
                capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                createdAt = OffsetDateTime.now(),
                createdBy = UUID.randomUUID(),
                creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
                description = null,
                experiencedOn = null,
                id = UUID.randomUUID(),
                placeId = null,
                plannedEnd = null,
                plannedStart = null,
                sourceWishId = null,
                spaceId = spaceId,
                status = PlanStatus.PLANNED,
                title = "Anniversary trip",
                updatedAt = OffsetDateTime.now(),
                version = 1,
            ),
        ),
        nextCursor = null,
    )
}

private class CollectionsApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun listCollections(spaceId: UUID, accessToken: String, cursor: String?): CollectionPage {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return CollectionPage(
            hasMore = false,
            items = listOf(
                CollectionDetail(
                    capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                    createdAt = OffsetDateTime.now(),
                    createdBy = UUID.randomUUID(),
                    creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
                    id = UUID.randomUUID(),
                    items = emptyList(),
                    spaceId = spaceId,
                    title = "Packing list",
                    updatedAt = OffsetDateTime.now(),
                    version = 1,
                ),
            ),
            nextCursor = null,
        )
    }
}

private class PlacesApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun listPlaces(spaceId: UUID, accessToken: String, cursor: String?): PlacePage {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return PlacePage(
            hasMore = false,
            items = listOf(
                PlaceDetail(
                    address = null,
                    capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                    createdAt = OffsetDateTime.now(),
                    createdBy = UUID.randomUUID(),
                    creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
                    description = null,
                    id = UUID.randomUUID(),
                    latitude = null,
                    longitude = null,
                    name = "By the sea",
                    spaceId = spaceId,
                    updatedAt = OffsetDateTime.now(),
                    version = 1,
                ),
            ),
            nextCursor = null,
        )
    }
}

private class ChaptersApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun listChapters(spaceId: UUID, accessToken: String, cursor: String?): ChapterPage {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return ChapterPage(
            hasMore = false,
            items = listOf(
                ChapterDetail(
                    capabilities = ResourceCapabilities(canComment = false, canDelete = true, canEdit = true),
                    createdAt = OffsetDateTime.now(),
                    createdBy = UUID.randomUUID(),
                    creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
                    description = null,
                    endOn = null,
                    id = UUID.randomUUID(),
                    placeId = null,
                    spaceId = spaceId,
                    startOn = null,
                    title = "The first summer",
                    updatedAt = OffsetDateTime.now(),
                    version = 1,
                ),
            ),
            nextCursor = null,
        )
    }
}

private class TodayApi : FakeReferenceContract() {
    var nextFailure: Throwable? = null

    override suspend fun signIn(email: String, password: String): SessionView = SessionView(
        account = AccountView(displayName = email, id = UUID.randomUUID()),
        tokens = TokenView(
            accessExpiresAt = OffsetDateTime.now(),
            accessToken = "access",
            refreshExpiresAt = OffsetDateTime.now(),
            refreshToken = "refresh",
        ),
    )

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        listOf(AccountMembershipView(role = "PARTNER", spaceId = SPACE, status = "ACTIVE"))

    override suspend fun getDashboard(spaceId: UUID, accessToken: String): DashboardView {
        nextFailure?.let {
            nextFailure = null
            throw it
        }
        return DashboardView(
            keepsake = null,
            recentShared = emptyList(),
            relationshipDuration = null,
            retrospective = null,
            sharedStorySummary = eimir.api.models.DashboardSharedStorySummary(heartMoments = 0, memories = 0, milestones = 0),
            space = DashboardSpaceSummary(partner = null, spaceId = spaceId),
            thinkingOfYouAvailableAt = null,
            upcoming = emptyList(),
        )
    }
}
