package de.eimir.app.reference

import de.eimir.app.story.StoryEntryKind
import de.eimir.app.story.TimelineScope
import eimir.api.models.*
import java.io.IOException
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MemoryTaskTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun pendingIsSynchronousAndCannotDiscardOrSubmitTwice() = runTest(dispatcher) {
        val result = CompletableDeferred<MemoryDetail>()
        val api = TaskApi().apply { create = { result.await() } }
        val model = signedIn(api)
        model.beginMemoryTask()
        model.updateMemoryTask("Title", "Words", "")
        model.submitMemoryTask()
        assertEquals(MemoryTaskPhase.SUBMITTING, model.uiState.value.memoryTask?.phase)
        assertFalse(model.discardMemoryTask())
        model.updateMemoryTask("New title", "New body", "")
        model.submitMemoryTask()
        runCurrent()
        assertEquals(1, api.createCalls)
        assertEquals("Words", model.uiState.value.memoryTask?.body)
        result.complete(memory())
        advanceUntilIdle()
        assertEquals(memory().id, model.uiState.value.memoryTask?.confirmedMemory?.id)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
        assertEquals(1, api.timelineCalls) // Sign-in only; confirmation does not depend on a projection refresh.
    }

    @Test fun rejectedWriteRetainsInputAndAllowsDeliberateRetry() = runTest(dispatcher) {
        val api = TaskApi().apply { create = { throw ReferenceApiException("VALIDATION", "Rejected", 422) } }
        val model = signedIn(api)
        model.beginMemoryTask(); model.updateMemoryTask("Title", "Keep these words", "")
        model.submitMemoryTask(); advanceUntilIdle()
        assertEquals(MemoryTaskPhase.REJECTED, model.uiState.value.memoryTask?.phase)
        assertEquals("Keep these words", model.uiState.value.memoryTask?.body)
        api.create = { memory() }
        model.submitMemoryTask(); advanceUntilIdle()
        assertEquals(2, api.createCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun unknownCreateOutcomeNeverRepeatsPost() = runTest(dispatcher) {
        val api = TaskApi().apply { create = { throw IOException("Response lost") } }
        val model = signedIn(api)
        model.beginMemoryTask(); model.updateMemoryTask("Title", "Retained", "")
        model.submitMemoryTask(); advanceUntilIdle()
        model.submitMemoryTask(); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(MemoryTaskPhase.UNCERTAIN, model.uiState.value.memoryTask?.phase)
        assertEquals("Retained", model.uiState.value.memoryTask?.body)
    }

    @Test fun lateCreateFromOldSessionCannotClearNewDraftOrBindPhotos() = runTest(dispatcher) {
        val result = CompletableDeferred<MemoryDetail>()
        val api = TaskApi().apply { create = { result.await() } }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Old", "Old draft", ""); model.submitMemoryTask(); runCurrent()
        model.logout(); model.signIn("new@example.test", "secret"); advanceUntilIdle()
        model.beginMemoryTask(); model.updateMemoryTask("New", "New draft", "")
        result.complete(memory()); advanceUntilIdle()
        assertEquals("New draft", model.uiState.value.memoryTask?.body)
        assertEquals(MemoryTaskPhase.EDITING, model.uiState.value.memoryTask?.phase)
        assertEquals(0, api.bindCalls)
    }

    @Test fun pickerResultAfterDiscardCannotEnterNewTask() = runTest(dispatcher) {
        val model = signedIn(TaskApi())
        model.beginMemoryTask()
        val selection = checkNotNull(model.beginImageSelection())
        model.discardMemoryTask(); model.beginMemoryTask()
        model.selectImages(listOf(SelectedImage(byteArrayOf(1), "fixture.jpg", "image/jpeg")), selection)
        advanceUntilIdle()
        assertTrue(model.uiState.value.draftImages.isEmpty())
    }

    @Test fun associationFailureRetriesKnownMemoryWithoutAnotherCreate() = runTest(dispatcher) {
        val api = TaskApi().apply { failBinding = true }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask(); advanceUntilIdle()
        assertEquals(MemoryTaskPhase.ATTACHMENT_RECOVERY, model.uiState.value.memoryTask?.phase)
        api.failBinding = false
        model.retryMemoryAttachments(); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(2, api.bindCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun associationResponseLossReconcilesAlreadyBoundPhotosWithoutSecondPut() = runTest(dispatcher) {
        val api = TaskApi().apply { failBinding = true; applyBindingBeforeFailure = true }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask(); advanceUntilIdle()
        model.retryMemoryAttachments(); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(1, api.bindCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun concurrentVersionCannotBeOverwrittenByPhotoRecovery() = runTest(dispatcher) {
        val api = TaskApi().apply { failBinding = true }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask(); advanceUntilIdle()
        api.current = memory().copy(version = 2, body = "Concurrent change")
        model.retryMemoryAttachments(); advanceUntilIdle()
        assertEquals(1, api.bindCalls)
        assertEquals(MemoryTaskPhase.ATTACHMENT_RECOVERY, model.uiState.value.memoryTask?.phase)
    }

    @Test fun deniedDetailReadHidesConfirmedContentButTransportFailureKeepsIt() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        model.createMemory("Title", "Body", ""); advanceUntilIdle()
        api.readFailure = IOException("offline")
        model.openMemory(memory().id); advanceUntilIdle()
        assertNotNull(model.uiState.value.openMemory)
        api.readFailure = ReferenceApiException("NOT_FOUND", "Unavailable", 404)
        model.openMemory(memory().id); advanceUntilIdle()
        assertNull(model.uiState.value.openMemory)
    }

    @Test fun scopedPagesAndCursorSurviveOrdinaryReturn() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        val scope = TimelineScope(year = 2025, kind = StoryEntryKind.MEMORY)
        model.applyStoryScope(scope); advanceUntilIdle()
        model.loadMoreStory(); advanceUntilIdle()
        val loaded = model.uiState.value.storyItems
        val reads = api.timelineCalls
        model.ensureStoryLoaded(); advanceUntilIdle()
        assertEquals(loaded, model.uiState.value.storyItems)
        assertEquals(scope, model.uiState.value.storyScope)
        assertEquals(reads, api.timelineCalls)
        assertEquals(listOf(null, "older"), api.scopedCursors)
        assertEquals(2, loaded.size)
    }

    @Test fun deniedNextPageClearsRetainedContentAndCannotReuseCursor() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        api.pageFailure = ReferenceApiException("FORBIDDEN", "Access lost", 403)
        model.loadMoreStory(); advanceUntilIdle()
        assertTrue(model.uiState.value.storyItems.isEmpty())
        assertFalse(model.uiState.value.storyHasMore)
        assertFalse(model.uiState.value.storyPageFailed)
        val reads = api.timelineCalls
        model.loadMoreStory(); advanceUntilIdle()
        assertEquals(reads, api.timelineCalls)
    }

    @Test fun unavailableNextPageKeepsRangeAndRetryContinuesSameCursor() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        val before = model.uiState.value.storyItems
        api.pageFailure = ReferenceApiException("UNAVAILABLE", "Retry later", 503)
        model.loadMoreStory(); advanceUntilIdle()
        assertEquals(before, model.uiState.value.storyItems)
        assertTrue(model.uiState.value.storyPageFailed)
        api.pageFailure = null
        model.retryStory(); advanceUntilIdle()
        assertEquals(2, model.uiState.value.storyItems.size)
        assertEquals(listOf(null, "older", "older"), api.scopedCursors)
    }

    private fun TestScope.signedIn(api: TaskApi): ReferenceViewModel =
        ReferenceViewModel(ReferenceConfig("https://fixture.invalid"), api = api).also {
            it.signIn("person@example.test", "secret"); advanceUntilIdle()
        }

    private fun TestScope.selectPhoto(model: ReferenceViewModel) {
        model.selectImages(listOf(SelectedImage(byteArrayOf(1), "fixture.jpg", "image/jpeg")), checkNotNull(model.beginImageSelection()))
        advanceUntilIdle()
    }
}

private val taskSpace = UUID(0, 1)
private val taskAccount = UUID(0, 2)
private val taskPhoto = UUID(0, 3)
private val taskTime = OffsetDateTime.parse("2026-09-16T10:00:00Z")
private fun memory() = MemoryDetail(emptyList(), AuthorSummary("Fixture", taskAccount), taskAccount,
    "Full authored body", ResourceCapabilities(true, true, true), taskTime, LocalDate.of(2025, 6, 2),
    UUID(0, 4), taskSpace, "Fixture memory", taskTime, 1)

private class TaskApi : FakeReferenceContract() {
    var create: suspend () -> MemoryDetail = { memory() }
    var createCalls = 0
    var bindCalls = 0
    var timelineCalls = 0
    var failBinding = false
    var applyBindingBeforeFailure = false
    var current = memory()
    var readFailure: Throwable? = null
    var pageFailure: Throwable? = null
    val scopedCursors = mutableListOf<String?>()
    override suspend fun signIn(email: String, password: String) = SessionView(AccountView("Fixture", taskAccount), TokenView(taskTime, "access", taskTime, "refresh"))
    override suspend fun listMemberships(accessToken: String) = listOf(AccountMembershipView("PARTNER", taskSpace, "ACTIVE"))
    override suspend fun getTimeline(spaceId: UUID, accessToken: String, cursor: String?): StoryPage {
        timelineCalls++
        return StoryPage(false, emptyList(), null)
    }
    override suspend fun getScopedTimeline(spaceId: UUID, accessToken: String, scope: TimelineScope, cursor: String?): StoryPage {
        if (scope.isDefault) return getTimeline(spaceId, accessToken, cursor)
        timelineCalls++; scopedCursors += cursor
        if (cursor != null) pageFailure?.let { throw it }
        val m = current.copy(id = UUID(0, if (cursor == null) 10 else 11))
        val summary = MemorySummary(m.attachments, m.author, m.capabilities, m.createdAt, m.happenedOn, m.id, m.title)
        return StoryPage(cursor == null, listOf(StoryItem.MemoryWrapper(StoryMemoryItem(LocalDate.of(2025, 6, 2), StoryMemoryItem.Kind.MEMORY, summary))), if (cursor == null) "older" else null, listOf(2025))
    }
    override suspend fun createMemory(spaceId: UUID, accessToken: String, memory: MemoryCreate): MemoryDetail {
        createCalls++; return create().also { current = it }
    }
    override suspend fun getMemory(spaceId: UUID, accessToken: String, memoryId: UUID): MemoryDetail {
        readFailure?.let { throw it }; return current
    }
    private fun attachment() = AttachmentDetail(taskTime, null, false, null, taskPhoto, MediaType.IMAGE, "image/jpeg", 1, "READY", 1, null)
    override suspend fun createAttachmentUpload(spaceId: UUID, accessToken: String, request: AttachmentUploadCreate) =
        UploadDescriptor(attachment(), UploadDescriptor.Method.STREAM, emptyMap(), "/fixture")
    override suspend fun uploadAttachmentBytes(accessToken: String, descriptor: UploadDescriptor, image: SelectedImage) = Unit
    override suspend fun finalizeAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID) = attachment()
    override suspend fun getAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID) = attachment()
    override suspend fun replaceMemoryAttachments(spaceId: UUID, accessToken: String, memoryId: UUID, ifMatch: Int, attachments: MemoryAttachmentSet): MemoryDetail {
        bindCalls++
        if (!failBinding || applyBindingBeforeFailure) current = current.copy(version = 2, attachments = attachments.attachments.map {
            MemoryAttachmentSummary(false, null, it.attachmentId, MediaType.IMAGE, "image/jpeg", it.position, 1, "READY", null)
        })
        if (failBinding) throw IOException("Binding response lost")
        return current
    }
}
