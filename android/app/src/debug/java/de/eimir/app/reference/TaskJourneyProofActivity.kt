package de.eimir.app.reference

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.compose.rememberNavController
import de.eimir.app.design.EimirTheme
import de.eimir.app.story.StoryEntryKind
import de.eimir.app.story.TimelineScope
import eimir.api.models.*
import java.io.IOException
import java.lang.reflect.Proxy
import java.text.NumberFormat
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay

/** Debug-only transport fixture; the rendered route, task, picker and ViewModel are production code. */
class TaskJourneyProofActivity : ComponentActivity() {
    lateinit var model: ReferenceViewModel
        private set
    lateinit var fixture: TaskJourneyFixture
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val holder = ViewModelProvider(this, viewModelFactory {
            initializer { TaskProofHolder(applicationContext, intent.getStringExtra("scenario") ?: "ready") }
        })[TaskProofHolder::class.java]
        model = holder.model
        fixture = holder.fixture
        if (!model.uiState.value.loggedIn) model.signIn("fixture@example.test", "fixture-only")
        setContent {
            val state by model.uiState.collectAsState()
            val controller = rememberNavController()
            EimirTheme {
                Box(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                    ReferenceFlowRoute(referenceViewModel = model, navigationController = controller)
                }
                LaunchedEffect(state.loggedIn) {
                    if (state.loggedIn && savedInstanceState == null) {
                        val direct = intent.getStringExtra("direct")
                        val target = when (direct) {
                            "create" -> MEMORY_CREATE_ROUTE
                            "memory" -> "story/memories/${fixture.firstMemoryId}"
                            else -> null
                        }
                        if (target != null) controller.navigate(target) {
                            popUpTo(controller.graph.id) { inclusive = true }
                        }
                    }
                }
            }
        }
    }
}

private class TaskProofHolder(context: Context, scenario: String) : androidx.lifecycle.ViewModel() {
    val fixture = TaskJourneyFixture(context, scenario)
    private val connectivity = de.eimir.app.connectivity.ConnectivityTracker().apply {
        if (scenario == "offline") recordFailure(IOException("Fixture offline before submission"))
    }
    private val store = androidx.lifecycle.ViewModelStore()
    val model = ViewModelProvider(store, viewModelFactory {
        initializer { ReferenceViewModel(ReferenceConfig("https://fixture.invalid"), api = fixture, connectivityTracker = connectivity) }
    })[ReferenceViewModel::class.java]
    override fun onCleared() { store.clear() }
}

/** All fixture content stays in this debug process; no remote API is contacted. */
class TaskJourneyFixture(private val context: Context, var scenario: String) : ReferenceContract by unusedFixtureContract() {
    private val space = UUID(0, 958)
    private val account = UUID(0, 959)
    private val now = OffsetDateTime.parse("2026-09-16T12:00:00Z")
    private val records = linkedMapOf<UUID, MemoryDetail>()
    private val images = mutableMapOf<UUID, ByteArray>()
    private var nextImage = 0L
    var createCalls = 0
        private set
    var bindCalls = 0
        private set
    var pendingGate: CompletableDeferred<Unit>? = null
    val firstMemoryId: UUID get() = records.keys.first()

    init {
        repeat(17) { index ->
            val id = UUID(958, index.toLong() + 1)
            val date = LocalDate.of(if (index < 3) 2026 else 2025, 9, 20 - index)
            records[id] = MemoryDetail(emptyList(), AuthorSummary("Lea", account), account,
                context.getString(R.string.proof_photo_body), ResourceCapabilities(true, true, true), now,
                date, id, space,
                context.getString(R.string.proof_photo_title) + " " + NumberFormat.getIntegerInstance().format(index + 1), now, 1)
        }
    }

    override suspend fun getInstanceStatus() = InstanceAccessStatus(false, true, null)
    override suspend fun signIn(email: String, password: String) = SessionView(AccountView("Lea", account), TokenView(now.plusHours(1), "fixture", now.plusDays(1), "fixture-refresh"))
    override suspend fun listMemberships(accessToken: String) = listOf(AccountMembershipView("PARTNER", space, "ACTIVE"))
    override suspend fun getDashboard(spaceId: UUID, accessToken: String) = DashboardView(
        null, emptyList(), null, null, DashboardSharedStorySummary(0, records.size, 0),
        DashboardSpaceSummary(null, space), null, emptyList(),
    )
    override suspend fun getTimeline(spaceId: UUID, accessToken: String, cursor: String?) =
        getScopedTimeline(spaceId, accessToken, TimelineScope(), cursor)
    override suspend fun getScopedTimeline(spaceId: UUID, accessToken: String, scope: TimelineScope, cursor: String?): StoryPage {
        if (scenario == "refresh-failure" && createCalls > 0) throw IOException("Fixture projection unavailable")
        val matching = records.values.filter {
            (scope.year == null || it.happenedOn?.year == scope.year) && (scope.kind == null || scope.kind == StoryEntryKind.MEMORY)
        }.sortedByDescending { it.happenedOn }
        val offset = cursor?.toInt() ?: 0
        val selected = matching.drop(offset).take(5)
        val hasMore = offset + selected.size < matching.size
        return StoryPage(hasMore, selected.map { memory ->
            StoryItem.MemoryWrapper(StoryMemoryItem(checkNotNull(memory.happenedOn), StoryMemoryItem.Kind.MEMORY,
                MemorySummary(memory.attachments, memory.author, memory.capabilities, memory.createdAt, memory.happenedOn, memory.id, memory.title)))
        }, if (hasMore) (offset + selected.size).toString() else null, listOf(2026, 2025))
    }
    override suspend fun createMemory(spaceId: UUID, accessToken: String, memory: MemoryCreate): MemoryDetail {
        createCalls++
        if (scenario == "pending") pendingGate?.await() ?: delay(45_000)
        if (scenario == "rejected") throw ReferenceApiException("VALIDATION", "Fixture rejected", 422)
        val created = records.values.first().copy(id = UUID(958, 100L + createCalls),
            title = memory.title.orEmpty(), body = memory.body.orEmpty(), happenedOn = memory.happenedOn ?: LocalDate.now(), attachments = emptyList())
        records[created.id] = created
        if (scenario == "uncertain") throw IOException("Fixture response lost after write")
        return created
    }
    override suspend fun getMemory(spaceId: UUID, accessToken: String, memoryId: UUID): MemoryDetail {
        if (scenario == "denied" && createCalls > 0) throw ReferenceApiException("NOT_FOUND", "Fixture unavailable", 404)
        if (scenario == "refresh-failure" && createCalls > 0) throw IOException("Fixture read unavailable")
        return records[memoryId] ?: throw ReferenceApiException("NOT_FOUND", "Fixture unavailable", 404)
    }
    override suspend fun listComments(spaceId: UUID, accessToken: String, parent: ReferenceContract.CommentParent, parentId: UUID, cursor: String?) = CommentPage(false, emptyList(), null)
    private fun attachment(id: UUID) = AttachmentDetail(now, null, false, null, id, MediaType.IMAGE, "image/jpeg", images[id]?.size, "READY", 1, null)
    override suspend fun createAttachmentUpload(spaceId: UUID, accessToken: String, request: AttachmentUploadCreate): UploadDescriptor {
        val id = UUID(959, ++nextImage)
        return UploadDescriptor(attachment(id), UploadDescriptor.Method.STREAM, emptyMap(), id.toString())
    }
    override suspend fun uploadAttachmentBytes(accessToken: String, descriptor: UploadDescriptor, image: SelectedImage) {
        images[descriptor.attachment.id] = image.bytes
    }
    override suspend fun finalizeAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID) = attachment(attachmentId)
    override suspend fun getAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID) = attachment(attachmentId)
    override suspend fun replaceMemoryAttachments(spaceId: UUID, accessToken: String, memoryId: UUID, ifMatch: Int, attachments: MemoryAttachmentSet): MemoryDetail {
        bindCalls++
        if (scenario == "partial" && bindCalls == 1) throw IOException("Fixture association interrupted")
        val current = checkNotNull(records[memoryId])
        if (current.version != ifMatch) throw ReferenceApiException("CONFLICT", "Fixture version changed", 409)
        val bound = current.copy(version = current.version + 1, attachments = attachments.attachments.map {
            MemoryAttachmentSummary(false, null, it.attachmentId, MediaType.IMAGE, "image/jpeg", it.position, images[it.attachmentId]?.size, "READY", null)
        })
        records[memoryId] = bound
        return bound
    }
    override suspend fun createReadAccess(spaceId: UUID, accessToken: String, attachmentId: UUID, request: AttachmentReadRequest) =
        ReadDescriptor(ReadDescriptor.Method.STREAM, attachmentId.toString())
    override suspend fun readImageBytes(accessToken: String, descriptor: ReadDescriptor) = checkNotNull(images[UUID.fromString(descriptor.url)])
}

/** Fails closed for unused domain calls without contacting a live service. */
private fun unusedFixtureContract(): ReferenceContract = Proxy.newProxyInstance(
    ReferenceContract::class.java.classLoader, arrayOf(ReferenceContract::class.java),
) { _, method, _ -> throw UnsupportedOperationException("Fixture does not implement ${method.name}") } as ReferenceContract
