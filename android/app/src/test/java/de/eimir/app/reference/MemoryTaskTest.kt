package de.eimir.app.reference

import de.eimir.app.story.StoryEntryKind
import de.eimir.app.story.TimelineScope
import de.eimir.app.story.toEntry
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
        model.submitMemoryTask("Fallback title")
        assertEquals(MemoryTaskPhase.SUBMITTING, model.uiState.value.memoryTask?.phase)
        assertFalse(model.discardMemoryTask())
        model.updateMemoryTask("New title", "New body", "")
        model.submitMemoryTask("Fallback title")
        runCurrent()
        assertEquals(1, api.createCalls)
        assertEquals("Words", model.uiState.value.memoryTask?.body)
        result.complete(memory())
        advanceUntilIdle()
        assertEquals(memory().id, model.uiState.value.memoryTask?.confirmedMemory?.id)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
        assertEquals(2, api.timelineCalls) // Sign-in plus independent post-confirmation refresh.
    }

    @Test fun blankTitleUsesCallerSuppliedFallbackForTextOnlyCapture() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        model.beginMemoryTask()
        model.updateMemoryTask("", "Only these words, no title or photo", "")
        model.submitMemoryTask("Erinnerung vom 16.09.2026")
        advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals("Erinnerung vom 16.09.2026", api.lastCreateTitle)
        // The task's own editable title is never overwritten by the fallback.
        assertEquals("", model.uiState.value.memoryTask?.title)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun blankTitleAndBodyWithOnlyAPhotoSucceedsAsImageOnlyCapture() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("", "", "")
        model.submitMemoryTask("Erinnerung vom 16.09.2026")
        advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(1, api.bindCalls)
        assertEquals("Erinnerung vom 16.09.2026", api.lastCreateTitle)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun rejectedWriteRetainsInputAndAllowsDeliberateRetry() = runTest(dispatcher) {
        val api = TaskApi().apply { create = { throw ReferenceApiException("VALIDATION", "Rejected", 422) } }
        val model = signedIn(api)
        model.beginMemoryTask(); model.updateMemoryTask("Title", "Keep these words", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(MemoryTaskPhase.REJECTED, model.uiState.value.memoryTask?.phase)
        assertEquals("Keep these words", model.uiState.value.memoryTask?.body)
        api.create = { memory() }
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(2, api.createCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun unknownCreateOutcomeNeverRepeatsPost() = runTest(dispatcher) {
        val api = TaskApi().apply { create = { throw IOException("Response lost") } }
        val model = signedIn(api)
        model.beginMemoryTask(); model.updateMemoryTask("Title", "Retained", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(MemoryTaskPhase.UNCERTAIN, model.uiState.value.memoryTask?.phase)
        assertEquals("Retained", model.uiState.value.memoryTask?.body)
    }

    @Test fun lateCreateFromOldSessionCannotClearNewDraftOrBindPhotos() = runTest(dispatcher) {
        val result = CompletableDeferred<MemoryDetail>()
        val api = TaskApi().apply { create = { result.await() } }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Old", "Old draft", ""); model.submitMemoryTask("Fallback title"); runCurrent()
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

    @Test fun memoryPickerGenerationDoesNotSuppressCurrentSessionAvatarFailures() = runTest(dispatcher) {
        val model = signedIn(TaskApi())
        val avatarSession = checkNotNull(model.beginProfileAvatarSelection())
        model.beginMemoryTask(); model.discardMemoryTask(); model.beginMemoryTask()
        model.setProfileAvatarSelectionError(IOException("Picker read failed"), avatarSession)
        assertEquals(R.string.profile_avatar_failed, model.uiState.value.profile.error?.resourceId)
        model.logout(); model.signIn("new@example.test", "secret"); advanceUntilIdle()
        model.setProfileAvatarSelectionError(IOException("Stale picker callback"), avatarSession)
        assertNull(model.uiState.value.profile.error)
    }

    @Test fun associationFailureRetriesKnownMemoryWithoutAnotherCreate() = runTest(dispatcher) {
        val api = TaskApi().apply { failBinding = true }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask("Fallback title"); advanceUntilIdle()
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
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        model.retryMemoryAttachments(); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(1, api.bindCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
    }

    @Test fun concurrentVersionCannotBeOverwrittenByPhotoRecovery() = runTest(dispatcher) {
        val api = TaskApi().apply { failBinding = true }
        val model = signedIn(api)
        model.beginMemoryTask(); selectPhoto(model)
        model.updateMemoryTask("Photo", "", ""); model.submitMemoryTask("Fallback title"); advanceUntilIdle()
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

    @Test fun successfulPostSaveRefreshKeepsOldFirstPageAndUsesFreshContinuation() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        val scope = TimelineScope(year = 2025, kind = StoryEntryKind.MEMORY)
        model.applyStoryScope(scope); advanceUntilIdle()
        val original = model.uiState.value.storyItems
        api.scopedRecords = listOf(memory().copy(id = UUID(0, 20), happenedOn = LocalDate.of(2025, 9, 4))) + api.scopedRecords!!
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
        assertEquals(4, model.uiState.value.storyItems.size)
        assertTrue(model.uiState.value.storyItems.containsAll(original))
        assertEquals(scope, model.uiState.value.storyScope)
        assertTrue(model.uiState.value.storyHasMore)
        model.loadMoreStory(); advanceUntilIdle()
        assertEquals(listOf(null, null, "2", "4"), api.scopedCursors)
    }

    @Test fun refreshedPrefixRemovesDeletionAndKeepsChangedDatesInApiOrder() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        model.loadMoreStory(); advanceUntilIdle(); model.loadMoreStory(); advanceUntilIdle()
        val deleted = UUID(0, 10)
        api.scopedRecords = api.scopedRecords!!.filterNot { it.id == deleted }.map {
            if (it.id == UUID(0, 13)) it.copy(happenedOn = LocalDate.of(2025, 9, 4)) else it
        }
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        val entries = model.uiState.value.storyItems.map { it.toEntry() }
        assertEquals(listOf(13L, 11L, 12L, 14L, 15L).map { UUID(0, it) }, entries.map { it.id })
        assertFalse(entries.any { it.id == deleted })
        assertEquals(entries.map { it.date }.sortedDescending(), entries.map { it.date })
        assertFalse(model.uiState.value.storyHasMore)
    }

    @Test fun failedLaterPrefixPageRetainsWholeRangeAndRetryDoesNotCreateAgain() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        val original = model.uiState.value.storyItems
        api.pageFailure = ReferenceApiException("UNAVAILABLE", "Retry later", 503)
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(original, model.uiState.value.storyItems)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
        assertNotNull(model.uiState.value.storyProblem)
        api.pageFailure = null
        model.retryStory(); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(4, model.uiState.value.storyItems.size)
        assertNull(model.uiState.value.storyProblem)
    }

    @Test fun deniedLaterPrefixPageClearsWholeRangeAndContinuation() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        api.pageFailure = ReferenceApiException("FORBIDDEN", "Access lost", 403)
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertTrue(model.uiState.value.storyItems.isEmpty())
        assertTrue(model.uiState.value.storyAvailableYears.isEmpty())
        assertFalse(model.uiState.value.storyHasMore)
        val reads = api.timelineCalls
        model.loadMoreStory(); advanceUntilIdle()
        assertEquals(reads, api.timelineCalls)
    }

    @Test fun latePrefixPageCannotReplaceNewScope() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        model.loadMoreStory(); advanceUntilIdle()
        val retained = model.uiState.value.storyItems
        val gate = CompletableDeferred<StoryPage>()
        api.pageGate = gate
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); runCurrent()
        assertEquals(retained, model.uiState.value.storyItems) // No partial prefix is published.
        api.pageGate = null
        model.applyStoryScope(TimelineScope(year = 2026)); advanceUntilIdle()
        gate.complete(StoryPage(false, emptyList(), null)); advanceUntilIdle()
        assertEquals(TimelineScope(year = 2026), model.uiState.value.storyScope)
        assertTrue(model.uiState.value.storyItems.isEmpty())
        assertFalse(model.uiState.value.storyHasMore)
    }

    @Test fun latePrefixPageCannotReplaceNewSession() = runTest(dispatcher) {
        val api = pagedApi()
        val model = signedIn(api)
        model.applyStoryScope(TimelineScope(year = 2025)); advanceUntilIdle()
        val gate = CompletableDeferred<StoryPage>()
        api.pageGate = gate
        model.beginMemoryTask(); model.updateMemoryTask("New", "Words", "")
        model.submitMemoryTask("Fallback title"); runCurrent()
        api.pageGate = null
        model.logout(); model.signIn("new@example.test", "secret"); advanceUntilIdle()
        gate.complete(StoryPage(false, emptyList(), null)); advanceUntilIdle()
        assertEquals(TimelineScope(), model.uiState.value.storyScope)
        assertTrue(model.uiState.value.storyItems.isEmpty())
        assertNull(model.uiState.value.memoryTask)
        assertNull(model.uiState.value.openMemory)
    }

    @Test fun projectionFailureAfterSaveKeepsConfirmationAndScopedLoadedRange() = runTest(dispatcher) {
        val api = TaskApi()
        val model = signedIn(api)
        val scope = TimelineScope(year = 2025, kind = StoryEntryKind.MEMORY)
        model.applyStoryScope(scope); advanceUntilIdle()
        model.loadMoreStory(); advanceUntilIdle()
        val loaded = model.uiState.value.storyItems
        api.projectionFailure = IOException("Projection temporarily unavailable")
        model.beginMemoryTask(); model.updateMemoryTask("Title", "Known result", "")
        model.submitMemoryTask("Fallback title"); advanceUntilIdle()
        assertEquals(1, api.createCalls)
        assertEquals(MemoryTaskPhase.CONFIRMED, model.uiState.value.memoryTask?.phase)
        assertEquals(memory().id, model.uiState.value.openMemory?.id)
        assertEquals(scope, model.uiState.value.storyScope)
        assertEquals(loaded, model.uiState.value.storyItems)
        assertNotNull(model.uiState.value.storyProblem)
        assertNull(model.uiState.value.memoryTask?.problem)
        assertEquals(listOf(null, "older", null), api.scopedCursors)
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
    var lastCreateTitle: String? = null
    var bindCalls = 0
    var timelineCalls = 0
    var failBinding = false
    var applyBindingBeforeFailure = false
    var current = memory()
    var readFailure: Throwable? = null
    var pageFailure: Throwable? = null
    var projectionFailure: Throwable? = null
    var scopedRecords: List<MemoryDetail>? = null
    var pageGate: CompletableDeferred<StoryPage>? = null
    val scopedCursors = mutableListOf<String?>()
    override suspend fun signIn(email: String, password: String) = SessionView(AccountView("Fixture", taskAccount), TokenView(taskTime, "access", taskTime, "refresh"))
    override suspend fun listMemberships(accessToken: String) = listOf(AccountMembershipView("PARTNER", taskSpace, "ACTIVE"))
    override suspend fun getTimeline(spaceId: UUID, accessToken: String, cursor: String?): StoryPage {
        timelineCalls++
        projectionFailure?.let { throw it }
        return StoryPage(false, emptyList(), null)
    }
    override suspend fun getScopedTimeline(spaceId: UUID, accessToken: String, scope: TimelineScope, cursor: String?): StoryPage {
        if (scope.isDefault) return getTimeline(spaceId, accessToken, cursor)
        timelineCalls++; scopedCursors += cursor
        projectionFailure?.let { throw it }
        if (cursor != null) {
            pageFailure?.let { throw it }
            pageGate?.let { return it.await() }
        }
        scopedRecords?.let { records ->
            val matching = records.filter { scope.year == null || it.happenedOn?.year == scope.year }
                .sortedWith(compareByDescending<MemoryDetail> { it.happenedOn }.thenBy { it.id })
            val offset = cursor?.toInt() ?: 0
            val page = matching.drop(offset).take(2)
            val more = offset + page.size < matching.size
            return StoryPage(more, page.map(::storyItem), if (more) (offset + page.size).toString() else null,
                records.mapNotNull { it.happenedOn?.year }.distinct())
        }
        val m = current.copy(id = UUID(0, if (cursor == null) 10 else 11))
        val summary = MemorySummary(m.attachments, m.author, m.capabilities, m.createdAt, m.happenedOn, m.id, m.title)
        return StoryPage(cursor == null, listOf(StoryItem.MemoryWrapper(StoryMemoryItem(LocalDate.of(2025, 6, 2), StoryMemoryItem.Kind.MEMORY, summary))), if (cursor == null) "older" else null, listOf(2025))
    }
    override suspend fun createMemory(spaceId: UUID, accessToken: String, memory: MemoryCreate): MemoryDetail {
        createCalls++; lastCreateTitle = memory.title; return create().also { current = it }
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

private fun storyItem(memory: MemoryDetail): StoryItem = StoryItem.MemoryWrapper(StoryMemoryItem(
    checkNotNull(memory.happenedOn), StoryMemoryItem.Kind.MEMORY,
    MemorySummary(memory.attachments, memory.author, memory.capabilities, memory.createdAt, memory.happenedOn, memory.id, memory.title),
))

private fun pagedApi() = TaskApi().apply {
    scopedRecords = listOf("2025-09-03", "2025-09-03", "2025-09-02", "2025-09-01", "2025-09-01", "2025-08-31")
        .mapIndexed { index, date -> memory().copy(id = UUID(0, index.toLong() + 10), happenedOn = LocalDate.parse(date)) }
}
