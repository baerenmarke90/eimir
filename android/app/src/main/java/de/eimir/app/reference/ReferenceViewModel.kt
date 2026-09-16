package de.eimir.app.reference

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.eimir.app.demo.DemoEndpoint
import de.eimir.app.demo.DemoPersona
import de.eimir.app.place.toRelationTargetItem
import de.eimir.app.profile.ProfileUiState
import de.eimir.app.profile.loadProfileIdentity
import de.eimir.app.profile.removeProfileAvatar
import de.eimir.app.profile.updateProfileAvatar
import de.eimir.app.profile.updateProfileDisplayName
import de.eimir.app.shell.UiProblem
import de.eimir.app.shell.UiStateKind
import de.eimir.app.shell.problemFor
import de.eimir.app.story.toEntry
import de.eimir.app.story.TimelineScope
import de.eimir.app.story.StoryImageRef
import de.eimir.app.story.StoryImageStore
import de.eimir.app.story.StoryView
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import eimir.api.models.AccountDeletionRequest
import eimir.api.models.AccountMembershipView
import eimir.api.models.ActivityItem
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.CommentCreate
import eimir.api.models.CommentDetail
import eimir.api.models.CollectionCreate
import eimir.api.models.CollectionDetail
import eimir.api.models.CollectionItemCreate
import eimir.api.models.CollectionItemDetail
import eimir.api.models.CollectionItemUpdate
import eimir.api.models.ChapterCreate
import eimir.api.models.ChapterDetail
import eimir.api.models.ChapterUpdate
import eimir.api.models.CollectionUpdate
import eimir.api.models.CommentUpdate
import eimir.api.models.ContentVisibility
import eimir.api.models.HeartEmotion
import eimir.api.models.HeartMomentCreate
import eimir.api.models.HeartMomentDetail
import eimir.api.models.HeartMomentUpdate
import eimir.api.models.HeartMomentVisibilityChange
import eimir.api.models.InstanceAccessStatus
import eimir.api.models.DashboardView
import eimir.api.models.DateRepeat
import eimir.api.models.ImportantDateFields
import eimir.api.models.ImportantDateType
import eimir.api.models.ImportantDateView
import eimir.api.models.MemoryDetail
import eimir.api.models.PersonRelationship
import eimir.api.models.PlaceCreate
import eimir.api.models.PlaceDetail
import eimir.api.models.PlaceUpdate
import eimir.api.models.GiftIdeaCreate
import eimir.api.models.GiftIdeaDetail
import eimir.api.models.GiftIdeaStatus
import eimir.api.models.GiftIdeaUpdate
import eimir.api.models.PrivateCollectionCreate
import eimir.api.models.PrivateCollectionDetail
import eimir.api.models.PrivateCollectionItemCreate
import eimir.api.models.PrivateCollectionItemDetail
import eimir.api.models.PrivateCollectionItemUpdate
import eimir.api.models.PrivateCollectionUpdate
import eimir.api.models.PrivateNoteCreate
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNoteUpdate
import eimir.api.models.PreferenceCategory
import eimir.api.models.PreferenceSentiment
import eimir.api.models.ProfilePreferenceCreate
import eimir.api.models.ProfilePreferenceUpdate
import eimir.api.models.ProfilePreferenceView
import eimir.api.models.ProfileVisibility
import eimir.api.models.RelatedPersonDeletePolicy
import eimir.api.models.RelatedPersonFields
import eimir.api.models.RelatedPersonView
import eimir.api.models.SearchKind
import eimir.api.models.SearchResult
import eimir.api.models.ThinkingOfYouCreate
import eimir.api.models.MemoryUpdate
import eimir.api.models.MilestoneCreate
import eimir.api.models.MilestoneDetail
import eimir.api.models.MilestoneUpdate
import eimir.api.models.NotificationItem
import eimir.api.models.PlanComplete
import eimir.api.models.PlanCreate
import eimir.api.models.PlanDetail
import eimir.api.models.InvitationView
import eimir.api.models.IssuedInvitationView
import eimir.api.models.MembershipView
import eimir.api.models.PlanSchedule
import eimir.api.models.PlanUpdate
import eimir.api.models.SessionView
import eimir.api.models.StoryItem
import eimir.api.models.StoryPage
import eimir.api.models.TransferExportDetail
import eimir.api.models.TransferImportDetail
import eimir.api.models.TransferScope
import eimir.api.models.WishCreate
import eimir.api.models.WishDetail
import eimir.api.models.WishStatus
import eimir.api.models.WishToPlan
import eimir.api.models.WishUpdate

data class UiMessage(
    val resourceId: Int,
    val args: List<Any> = emptyList(),
)

/** See [ReferenceUiState.snackbarMessage]. */
data class SnackbarMessage(
    val id: Long,
    val text: UiMessage,
)

enum class DraftUploadState {
    UPLOADING,
    VALIDATING,
    READY,
    FAILED,
}

enum class InstanceAvailability {
    CHECKING,
    AVAILABLE,
    REGISTRATION_DISABLED,
    MAINTENANCE,
    UNREACHABLE,
}

internal fun instanceAvailabilityOf(status: InstanceAccessStatus): InstanceAvailability = when {
    status.maintenanceMode ||
        status.registrationUnavailableReason == InstanceAccessStatus.RegistrationUnavailableReason.maintenance ->
        InstanceAvailability.MAINTENANCE
    status.registrationAvailable -> InstanceAvailability.AVAILABLE
    status.registrationUnavailableReason == InstanceAccessStatus.RegistrationUnavailableReason.administrator ->
        InstanceAvailability.REGISTRATION_DISABLED
    else -> InstanceAvailability.UNREACHABLE
}

data class DraftImageUiItem(
    val id: Long,
    val displayName: String,
    val bytes: ByteArray,
    val uploadState: DraftUploadState,
)

data class ReferenceUiState(
    val configured: Boolean = false,
    val instanceAvailability: InstanceAvailability = InstanceAvailability.CHECKING,
    /**
     * The M2-D18 application-level connectivity state: `true` only after a
     * transport/server-availability failure, cleared by the next successful
     * request. Never set directly by a screen — see
     * `de.eimir.app.connectivity.ConnectivityTracker`.
     */
    val offline: Boolean = false,
    /** The last request of any kind that succeeded, regardless of which screen made it. */
    val lastSyncedAt: java.time.Instant? = null,
    /**
     * Bumped once each time [offline] transitions from `true` back to
     * `false`. The currently visible screen's own `LaunchedEffect` includes
     * this as a key alongside [activeSpaceId], so reconnecting re-runs
     * exactly the load call that screen already makes on entry — the same
     * network-authoritative fetch, not a new sync mechanism. That is
     * deliberate: it reuses the same read path this whole cache already
     * goes through rather than adding a second, competing refresh
     * mechanism, matching M2-D18's "no fragile implicit sync queue"
     * boundary. Only the screen currently in composition re-fetches; one
     * left off-screen catches up the normal way, when next opened.
     */
    val reconnectEpoch: Int = 0,
    val loggedIn: Boolean = false,
    /**
     * Authenticated, but with no unambiguous Space context yet.
     *
     * Distinct from [loggedIn]: the session is real and held, only
     * `activeSpaceId` is absent. With no active Space this state offers
     * invitation entry; with multiple active Spaces and no valid remembered
     * explicit choice it requires the account to choose one first.
     */
    val awaitingSpace: Boolean = false,
    val invitationBusy: Boolean = false,
    val invitationProblem: UiProblem? = null,
    val issuedInvitations: List<InvitationView> = emptyList(),
    /** The token from a just-created invitation; shown once, per the contract. */
    val issuedInvitationToken: String? = null,
    /** True while the session belongs to the public demo rather than the configured server. */
    val demoMode: Boolean = false,
    val demoPersona: DemoPersona? = null,
    /** Every Space the account may open; a choice only exists above one. */
    val availableSpaces: List<AccountMembershipView> = emptyList(),
    /**
     * The other partner's name per Space, where it is known.
     *
     * A Space a couple is a member of is not the same as a Space whose name
     * has been resolved; this stays empty until [ReferenceViewModel] fetches
     * it, and a Space missing from it falls back to a position rather than
     * blocking the picker on a network round trip.
     */
    val spacePartnerNames: Map<java.util.UUID, String> = emptyMap(),
    val activeSpaceId: java.util.UUID? = null,
    val profile: ProfileUiState = ProfileUiState(),
    val spaceOffboardingBusy: Boolean = false,
    val spaceOffboardingProblem: UiProblem? = null,
    val accountDeletionBusy: Boolean = false,
    val accountDeletionProblem: UiProblem? = null,
    val accountDeletionRecentAuthenticationCapabilities: AccountDeletionRecentAuthenticationCapabilities? = null,
    val accountDeletionRecentAuthenticationBusy: Boolean = false,
    val accountDeletionRecentAuthenticationProblem: UiProblem? = null,
    val accountDeletionRecentAuthenticationComplete: Boolean = false,
    val accountDeletionPasskeyRequest: String? = null,
    val accountDeletionOidcPending: AccountDeletionOidcPending? = null,
    val busy: Boolean = false,
    val status: UiMessage? = null,
    /**
     * A one-shot Snackbar event (docs/COMPONENT-CONTRACTS.md §9.2), distinct
     * from [status]: [status] is a persistent inline message the M2/G2
     * reference flow still renders in place, but nothing in the signed-in
     * shell ever reads it, so it cannot serve a transient confirmation. This
     * carries an [SnackbarMessage.id] precisely so the same text posted
     * twice in a row is still shown twice — a plain nullable [UiMessage]
     * would not survive an unchanged value being set again, since a
     * `LaunchedEffect` keyed on it would see no change to react to. Cleared
     * by [snackbarShown] once the shell has actually displayed it.
     */
    val snackbarMessage: SnackbarMessage? = null,
    val error: UiMessage? = null,
    val draftImages: List<DraftImageUiItem> = emptyList(),
    val memoryTask: MemoryTask? = null,
    val lastMemoryTitle: String? = null,
    val lastMemoryBody: String? = null,
    val lastImageBytes: ByteArray? = null,
    /** Discover and Timeline are peer modes; switching never mutates the other's state below. */
    val storyView: StoryView = StoryView.TIMELINE,
    val storyScope: TimelineScope = TimelineScope(),
    val storyAvailableYears: List<Int> = emptyList(),
    val storyLoaded: Boolean = false,
    val storyLoading: Boolean = false,
    val storyProblem: UiProblem? = null,
    val storyPageFailed: Boolean = false,
    val storyItems: List<StoryItem> = emptyList(),
    /** Whether the server says there is more Story past what is loaded. */
    val storyHasMore: Boolean = false,
    val storyLoadingMore: Boolean = false,
    /** Non-null only while [storyItems] is a stale M2-D18 cache fallback, not a fresh read. */
    val storyCachedAt: java.time.Instant? = null,
    /**
     * Discover's own independent, always-unfiltered, single bounded page —
     * never Timeline's [storyItems] with a default scope, so visiting
     * Discover can never disturb a Timeline filter/loaded range.
     */
    val discoverItems: List<StoryItem> = emptyList(),
    val discoverLoaded: Boolean = false,
    val discoverLoading: Boolean = false,
    val discoverProblem: UiProblem? = null,
    /** Non-null only while [discoverItems] is a stale M2-D18 cache fallback, not a fresh read. */
    val discoverCachedAt: java.time.Instant? = null,
    val commentsHaveMore: Boolean = false,
    /** The memory currently open, if any. */
    val openMemory: MemoryDetail? = null,
    /** Non-null only while [openMemory] is a stale M2-D18 cache fallback, not a fresh read. */
    val openMemoryCachedAt: java.time.Instant? = null,
    val memoryBusy: Boolean = false,
    /**
     * Whether the open memory is being changed.
     *
     * Owned here rather than by the screen because only this knows how a save
     * ended: success closes the form, a conflict deliberately leaves it open
     * with the text still in it.
     */
    val editingMemory: Boolean = false,
    /**
     * Confirmation belonging to the open memory alone.
     *
     * Separate from [status], which carries messages from signing in, entering
     * the demo and switching Space. Reusing it put the demo-entry notice on a
     * memory screen dressed as a save confirmation.
     */
    val memoryStatus: UiMessage? = null,
    /**
     * The account's own HeartMoments, private ones included.
     *
     * The server decides what is in here; asking for someone else's private
     * moments returns an empty page rather than a refusal, so nothing this
     * screen can render discloses that they exist.
     */
    val heartMoments: List<HeartMomentDetail> = emptyList(),
    val heartMomentsBusy: Boolean = false,
    val heartMomentsProblem: UiProblem? = null,
    val heartMomentStatus: UiMessage? = null,
    /**
     * The signed-in account.
     *
     * A comment carries no `capabilities`, unlike a Memory or a HeartMoment, so
     * this is the only signal for whose comment it is. It decides what is
     * offered, never what is allowed — the server still refuses what it should.
     */
    val accountId: java.util.UUID? = null,
    val accountDisplayName: String? = null,
    val comments: List<CommentDetail> = emptyList(),
    /**
     * Only the wishes nobody has acted on yet.
     *
     * A wish that became a plan is still there and still `PLANNED`, but showing
     * it beside its plan would list one intention twice.
     */
    val dashboard: DashboardView? = null,
    val todayBusy: Boolean = false,
    val todayProblem: UiProblem? = null,
    /** Non-null only while [dashboard] is a stale M2-D18 cache fallback, not a fresh read. */
    val todayCachedAt: java.time.Instant? = null,
    /** Set once the gesture has been accepted, so the screen can say so. */
    val thinkingOfYouSent: Boolean = false,
    val openWishes: List<WishDetail> = emptyList(),
    val plans: List<PlanDetail> = emptyList(),
    val planningBusy: Boolean = false,
    val planningProblem: UiProblem? = null,
    /** Non-null only while [openWishes]/[plans] are a stale M2-D18 cache fallback, not a fresh read. */
    val planningCachedAt: java.time.Instant? = null,
    val relatedPersons: List<RelatedPersonView> = emptyList(),
    val relatedPersonsBusy: Boolean = false,
    val relatedPersonsProblem: UiProblem? = null,
    /** Dates for whichever person's screen is currently open. */
    val personImportantDates: List<ImportantDateView> = emptyList(),
    val places: List<PlaceDetail> = emptyList(),
    val placesBusy: Boolean = false,
    val placesProblem: UiProblem? = null,
    /** Non-null only while [places] is a stale M2-D18 cache fallback, not a fresh read. */
    val placesCachedAt: java.time.Instant? = null,
    /** Every shared Story item, as a possible link target for whichever place's relations are open. */
    val placeRelationTargets: List<de.eimir.app.place.RelationTargetItem> = emptyList(),
    /** Ids already linked to that place, across all three kinds. */
    val placeLinkedTargetIds: Set<java.util.UUID> = emptySet(),
    val placeRelationsBusy: Boolean = false,
    val placeRelationsProblem: UiProblem? = null,
    /** Owner-only: the server already filters this to the caller's own notes. */
    val privateNotes: List<PrivateNoteDetail> = emptyList(),
    val privateNotesBusy: Boolean = false,
    val privateNotesProblem: UiProblem? = null,
    /** Non-null only while [privateNotes] is a stale M2-D18 cache fallback, not a fresh read. */
    val privateNotesCachedAt: java.time.Instant? = null,
    /** Owner-only: the server already filters this to the caller's own gift ideas. */
    val giftIdeas: List<GiftIdeaDetail> = emptyList(),
    val giftIdeasBusy: Boolean = false,
    val giftIdeasProblem: UiProblem? = null,
    /** Non-null only while [giftIdeas] is a stale M2-D18 cache fallback, not a fresh read. */
    val giftIdeasCachedAt: java.time.Instant? = null,
    /** Owner-only: items ride along inside each [PrivateCollectionDetail]. */
    val privateCollections: List<PrivateCollectionDetail> = emptyList(),
    val privateCollectionsBusy: Boolean = false,
    val privateCollectionsProblem: UiProblem? = null,
    /** Non-null only while [privateCollections] is a stale M2-D18 cache fallback, not a fresh read. */
    val privateCollectionsCachedAt: java.time.Instant? = null,
    val notifications: List<NotificationItem> = emptyList(),
    val unreadNotificationCount: Int = 0,
    val notificationsBusy: Boolean = false,
    val notificationsProblem: UiProblem? = null,
    val notificationsHasMore: Boolean = false,
    val notificationsLoadingMore: Boolean = false,
    val activity: List<ActivityItem> = emptyList(),
    val activityBusy: Boolean = false,
    val activityProblem: UiProblem? = null,
    val activityHasMore: Boolean = false,
    val activityLoadingMore: Boolean = false,
    /** The M2-D17/S6 Transfer Bundle export currently tracked, if any. */
    val export: TransferExportDetail? = null,
    val exportBusy: Boolean = false,
    val exportProblem: UiProblem? = null,
    /** Set once [export] has actually been saved to a location the user chose; reset by a new export. */
    val exportDownloaded: Boolean = false,
    /** The M2-D17/S6 Transfer Bundle import currently tracked, if any. */
    val import: TransferImportDetail? = null,
    val importBusy: Boolean = false,
    val importProblem: UiProblem? = null,
    val searchResults: List<SearchResult> = emptyList(),
    val searchBusy: Boolean = false,
    val searchProblem: UiProblem? = null,
    val searchHasMore: Boolean = false,
    val searchLoadingMore: Boolean = false,
    val collections: List<CollectionDetail> = emptyList(),
    val collectionsBusy: Boolean = false,
    val collectionsProblem: UiProblem? = null,
    /** Non-null only while [collections] is a stale M2-D18 cache fallback, not a fresh read. */
    val collectionsCachedAt: java.time.Instant? = null,
    val chapters: List<ChapterDetail> = emptyList(),
    val chaptersBusy: Boolean = false,
    val chaptersProblem: UiProblem? = null,
    /** Non-null only while [chapters] is a stale M2-D18 cache fallback, not a fresh read. */
    val chaptersCachedAt: java.time.Instant? = null,
    /** Every shared Story item, as a possible content target for whichever chapter is open. */
    val chapterContentCandidates: List<de.eimir.app.place.RelationTargetItem> = emptyList(),
    /** The chapter's own content, in the server's display order. */
    val chapterLinkedContent: List<de.eimir.app.place.RelationTargetItem> = emptyList(),
    val chapterContentBusy: Boolean = false,
    val chapterContentProblem: UiProblem? = null,
    /** The Story item currently open that is not a memory. */
    val openMilestone: MilestoneDetail? = null,
    /** Non-null only while [openMilestone] is a stale M2-D18 cache fallback, not a fresh read. */
    val openMilestoneCachedAt: java.time.Instant? = null,
    /**
     * Set once [ReferenceViewModel.createMilestone] actually succeeds; the
     * create screen watches this to return to the Story feed itself,
     * mirroring [exportDownloaded]'s one-shot "the action completed" shape.
     * Reset by [ReferenceViewModel.clearMilestoneCreated].
     */
    val milestoneCreated: Boolean = false,
    val openSharedHeartMoment: HeartMomentDetail? = null,
    /** Non-null only while [openSharedHeartMoment] is a stale M2-D18 cache fallback, not a fresh read. */
    val openSharedHeartMomentCachedAt: java.time.Instant? = null,
    val commentsBusy: Boolean = false,
    val commentsProblem: UiProblem? = null,
    /** A problem belonging to the open memory rather than to the whole screen. */
    val memoryProblem: UiProblem? = null,
    /**
     * Set once the open memory no longer exists, so its screen can close
     * instead of showing a memory that was just deleted.
     */
    val openMemoryGone: Boolean = false,
)

private data class ImageDraft(
    val id: Long,
    val image: SelectedImage,
    val attemptId: Long,
    val uploadState: DraftUploadState,
    val preparedAttachment: PreparedAttachment? = null,
)

/**
 * What `loadPlanning()` fetches and caches as one unit: [Wish][WishDetail]
 * carries every status, not just `OPEN`, so the `OPEN` filter [ReferenceUiState.openWishes]
 * applies can run identically against a fresh read and a cache fallback.
 */
@Serializable
private data class PlanningSnapshot(
    val wishes: List<WishDetail>,
    val plans: List<PlanDetail>,
)

internal fun planScheduleStart(
    day: java.time.LocalDate,
    time: java.time.LocalTime,
    zoneId: java.time.ZoneId,
): java.time.OffsetDateTime =
    day.atTime(time).atZone(zoneId).toOffsetDateTime()

class ReferenceViewModel(
    private val config: ReferenceConfig = ReferenceConfig.fromBuildConfig(),
    api: ReferenceContract? = null,
    private val apiFactory: (String) -> ReferenceContract = ::OkHttpReferenceApi,
    private val spaceStore: SpacePreferenceStore = InMemorySpacePreferenceStore(),
    /**
     * The M2-D18 read cache for shared Story detail content. `null` (the
     * default every existing test relies on) disables it entirely — reads
     * behave exactly as before, network-only.
     */
    private val productReadCache: de.eimir.app.cache.ProductReadCache? = null,
    /**
     * The M2-D18 application-level connectivity state. `null` (the default
     * every existing test relies on) means [ReferenceUiState.offline] never
     * changes from its initial value — no behavior change for callers that
     * do not configure it.
     */
    private val connectivityTracker: de.eimir.app.connectivity.ConnectivityTracker? = null,
) : ViewModel() {
    private val injectedApi: ReferenceContract? = api

    /**
     * The endpoint the current session talks to.
     *
     * Entering the demo points this at the demo deployment for the duration of
     * that session only; the configured production or Self-Hosted endpoint is
     * never rewritten, so leaving the demo returns to it unchanged.
     */
    private var contract: ReferenceContract? = apiFor(config.apiBaseUrl)

    /**
     * The Space the current session works in.
     *
     * Always resolved from the account's Memberships after authentication, for
     * a normal sign-in as much as for a demo persona. Nothing about a Space is
     * known before someone signs in.
     */
    private var activeSpaceId: java.util.UUID? = null
    private var session: SessionView? = null
    private var imageDrafts: List<ImageDraft> = emptyList()
    private var sessionEpoch: Long = 0
    private var nextDraftId: Long = 1
    private var memoryTaskGeneration: Long = 0
    private var imageSelectionGeneration: Long = 0
    private var memoryReadGeneration: Long = 0
    private var storyRequestGeneration: Long = 0
    private var storyReconnectEpoch: Int = -1
    private var discoverRequestGeneration: Long = 0

    /** Where the next page continues from; opaque and server-issued. */
    private var storyCursor: String? = null
    private var commentsCursor: String? = null
    private var searchCursor: String? = null
    private var activityCursor: String? = null
    private var notificationsCursor: String? = null

    /** The query and kind filter the current [searchCursor] continues, so load-more repeats them. */
    private var lastSearchQuery: String? = null
    private var lastSearchKind: SearchKind? = null
    /**
     * Changes whenever a first-page search supersedes the previous search identity.
     * Session generation alone is insufficient because query/filter changes stay in the same session.
     */
    private var searchGeneration: Long = 0

    /** Kept across a failed attempt so a retry is the same gesture, not a second one. */
    private var pendingGestureId: java.util.UUID? = null
    private var nextAttemptId: Long = 1
    private var nextSnackbarId: Long = 1

    private val _uiState = MutableStateFlow(ReferenceUiState(configured = config.isConfigured))
    val uiState: StateFlow<ReferenceUiState> = _uiState.asStateFlow()

    init {
        if (config.isConfigured) refreshInstanceAvailability()
        connectivityTracker?.let { tracker ->
            viewModelScope.launch {
                tracker.state.collect { connectivity ->
                    val cameBackOnline = _uiState.value.offline && !connectivity.offline
                    mutate {
                        it.copy(
                            offline = connectivity.offline,
                            lastSyncedAt = connectivity.lastSyncedAt,
                            reconnectEpoch = if (cameBackOnline) it.reconnectEpoch + 1 else it.reconnectEpoch,
                        )
                    }
                    if (cameBackOnline) reconcileMembership()
                }
            }
        }
    }

    fun refreshInstanceAvailability() {
        val api = contract ?: return
        if (!config.isConfigured) return
        mutate { it.copy(instanceAvailability = InstanceAvailability.CHECKING) }
        viewModelScope.launch {
            val availability = runCatching { api.getInstanceStatus() }
                .fold(
                    onSuccess = ::instanceAvailabilityOf,
                    onFailure = { InstanceAvailability.UNREACHABLE },
                )
            mutate { it.copy(instanceAvailability = availability) }
        }
    }

    /**
     * Story photographs, held in memory for the current Space only.
     *
     * It is given the session's own read path rather than an endpoint, so it
     * cannot outlive the session it was filled from: once [sessionEpoch] moves
     * on, both the cache and anything still in flight are void.
     */
    val storyImages: StoryImageStore = StoryImageStore(scope = viewModelScope) { ref ->
        readStoryImage(ref)
    }

    /**
     * Changes whenever the Space or the session does, so the screen re-asks
     * for every image instead of showing the previous couple's.
     */
    val storyGeneration: Long get() = sessionEpoch

    private suspend fun readStoryImage(ref: StoryImageRef): ByteArray {
        val api = checkNotNull(contract) { "A Story image is only read inside a session." }
        val currentSession = checkNotNull(session) { "A Story image needs a session." }
        val spaceId = checkNotNull(activeSpaceId) { "A Story image belongs to a Space." }
        val accessToken = currentSession.tokens.accessToken

        val descriptor = api.createReadAccess(
            spaceId,
            accessToken,
            ref.attachmentId,
            AttachmentReadRequest(parentId = ref.parentId, parentType = ref.parentType),
        )
        return api.readImageBytes(accessToken, descriptor)
    }

    fun signIn(email: String, password: String) {
        val api = contract ?: return configurationError()
        if (!config.isConfigured) return configurationError()
        if (email.isBlank() || password.isBlank()) {
            setError(message(R.string.ref_error_credentials_required))
            return
        }

        sessionEpoch += 1
        clearMemoryTask()
        resetStoryContext()
        storyImages.reset()
        clearHeartMoments()
        clearComments()
        clearPlanning()
        clearToday()
        clearInvitations()
        clearRelatedPersons()
        clearProfilePreferences()
        clearPlaces()
        clearPlaceRelations()
        clearPrivateNotes()
        clearGiftIdeas()
        clearPrivateCollections()
        clearNotifications()
        clearActivity()
        clearExport()
        clearImport()
        clearSearch()
        clearCollections()
        clearChapters()
        clearChapterContent()
        clearProductReadCache()
        closeStoryItem()
        val attemptEpoch = sessionEpoch
        viewModelScope.launch {
            if (attemptEpoch != sessionEpoch) return@launch
            mutate { it.copy(busy = true, error = null, status = message(R.string.ref_login_pending)) }
            runCatching {
                val signedIn = api.signIn(email.trim(), password)
                val memberships = api.listMemberships(signedIn.tokens.accessToken)
                signedIn to memberships
            }
                .onSuccess { (signedIn, memberships) ->
                    if (attemptEpoch != sessionEpoch) return@onSuccess
                    val space = activeSpaceOf(memberships, signedIn.account.id)
                    if (space == null) {
                        // Authenticated, but without one unambiguous working
                        // Space. Keep the session: zero active Spaces need the
                        // invitation waiting room, while multiple active Spaces
                        // need an explicit choice before any Space-bound read or
                        // write can start.
                        activeSpaceId = null
                        session = signedIn
                        mutate {
                            it.copy(
                                loggedIn = false,
                                awaitingSpace = true,
                                accountId = signedIn.account.id,
                                accountDisplayName = signedIn.account.displayName,
                                busy = false,
                                error = null,
                                status = null,
                                availableSpaces = activeMemberships(memberships),
                                activeSpaceId = null,
                                spacePartnerNames = emptyMap(),
                            )
                        }
                        return@onSuccess
                    }
                    activeSpaceId = space
                    session = signedIn
                    imageDrafts = emptyList()
                    mutate {
                        it.copy(
                            loggedIn = true,
                            awaitingSpace = false,
                            accountId = signedIn.account.id,
                            accountDisplayName = signedIn.account.displayName,
                            busy = false,
                            status = message(R.string.ref_status_logged_in),
                            error = null,
                            spacePartnerNames = emptyMap(),
                            profile = ProfileUiState(),
                            draftImages = emptyList(),
                            lastMemoryTitle = null,
                            lastMemoryBody = null,
                            lastImageBytes = null,
                            storyItems = emptyList(),
                            storyCachedAt = null,
                            availableSpaces = activeMemberships(memberships),
                            activeSpaceId = space,
                        )
                    }
                    refreshStory()
                }
                .onFailure {
                    if (attemptEpoch == sessionEpoch) {
                        failure(R.string.ref_error_login_failed)
                    }
                }
        }
    }

    /**
     * Enters the public demo as one of the canonical personas.
     *
     * The server issues a one-time proof rather than a password, so nothing
     * reusable is stored in the app. The Space comes from the account's
     * memberships, because a demo persona's Space cannot be configured at build
     * time.
     */
    fun enterDemo(persona: DemoPersona) {
        val demoApi = apiFor(DemoEndpoint.BASE_URL) ?: return configurationError()

        sessionEpoch += 1
        clearMemoryTask()
        resetStoryContext()
        storyImages.reset()
        clearHeartMoments()
        clearComments()
        clearPlanning()
        clearToday()
        clearInvitations()
        clearRelatedPersons()
        clearProfilePreferences()
        clearPlaces()
        clearPlaceRelations()
        clearPrivateNotes()
        clearGiftIdeas()
        clearPrivateCollections()
        clearNotifications()
        clearActivity()
        clearExport()
        clearImport()
        clearSearch()
        clearCollections()
        clearChapters()
        clearChapterContent()
        clearProductReadCache()
        closeStoryItem()
        val attemptEpoch = sessionEpoch
        viewModelScope.launch {
            if (attemptEpoch != sessionEpoch) return@launch
            mutate { it.copy(busy = true, error = null, status = message(R.string.demo_entering)) }
            runCatching {
                val token = demoApi.createDemoEntry(DemoEndpoint.BASE_URL, persona)
                val signedIn = demoApi.consumeMagicLink(token)
                val memberships = demoApi.listMemberships(signedIn.tokens.accessToken)
                val space = activeSpaceOf(memberships)
                    ?: throw IllegalStateException("The demo account has no active Space.")
                Triple(signedIn, space, demoApi)
            }
                .onSuccess { (signedIn, space, activeApi) ->
                    if (attemptEpoch != sessionEpoch) return@onSuccess
                    contract = activeApi
                    activeSpaceId = space
                    session = signedIn
                    imageDrafts = emptyList()
                    _uiState.value = ReferenceUiState(
                        configured = true,
                        loggedIn = true,
                        accountId = signedIn.account.id,
                        accountDisplayName = signedIn.account.displayName,
                        demoMode = true,
                        demoPersona = persona,
                        activeSpaceId = space,
                        status = message(R.string.demo_entered),
                    )
                    refreshStory()
                }
                .onFailure {
                    if (attemptEpoch == sessionEpoch) {
                        contract = apiFor(config.apiBaseUrl)
                        activeSpaceId = null
                        failure(R.string.demo_entry_failed)
                    }
                }
        }
    }

    /** Leaves the demo and returns to the configured server, carrying nothing over. */
    fun leaveDemo() {
        contract = apiFor(config.apiBaseUrl)
        activeSpaceId = null
        sessionEpoch += 1
        clearMemoryTask()
        resetStoryContext()
        storyImages.reset()
        clearHeartMoments()
        clearComments()
        clearPlanning()
        clearToday()
        clearInvitations()
        clearRelatedPersons()
        clearProfilePreferences()
        clearPlaces()
        clearPlaceRelations()
        clearPrivateNotes()
        clearGiftIdeas()
        clearPrivateCollections()
        clearNotifications()
        clearActivity()
        clearExport()
        clearImport()
        clearSearch()
        clearCollections()
        clearChapters()
        clearChapterContent()
        clearProductReadCache()
        closeStoryItem()
        session = null
        imageDrafts = emptyList()
        _uiState.value = ReferenceUiState(
            configured = config.isConfigured,
            status = message(R.string.demo_left),
        )
        refreshInstanceAvailability()
    }

    /**
     * The Space to open, as the server authorises it.
     *
     * Only an active membership counts; an invited or removed one must not
     * silently become the working context.
     */
    /**
     * Resolves the only Space that may be entered without a new user choice.
     *
     * One active Space is unambiguous. With multiple active Spaces a normal
     * account may restore only a still-active explicitly remembered choice;
     * membership ordering is never authority for relationship context.
     * [accountId] is null only for the separately constrained demo entry.
     */
    private fun activeSpaceOf(
        memberships: List<AccountMembershipView>,
        accountId: java.util.UUID? = null,
    ): java.util.UUID? {
        val active = activeMemberships(memberships)
        if (active.size <= 1) return active.firstOrNull()?.spaceId
        if (accountId == null) return active.firstOrNull()?.spaceId

        val remembered = spaceStore.rememberedSpace(accountId)
        return active.firstOrNull { it.spaceId == remembered }?.spaceId
    }

    /**
     * Ends the current Account's Membership in the active Space.
     *
     * The token and destructive authority stay inside this session owner. Once
     * the server accepts exit, the old Space becomes unusable locally before a
     * membership refresh is attempted: [clearSpaceBoundState] advances the
     * session epoch and removes drafts/read caches/protected local state. A
     * refresh may then move to another active Space or keep the authenticated
     * Account in the existing awaiting-Space state. A refresh failure never
     * restores the former Space.
     */
    fun leaveActiveSpace() {
        if (_uiState.value.demoMode) return
        val api = contract ?: return configurationError()
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(spaceOffboardingBusy = true, spaceOffboardingProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.leaveSpace(spaceId, currentSession.tokens.accessToken) }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess

                    clearSpaceBoundState()
                    activeSpaceId = null
                    imageDrafts = emptyList()
                    mutate {
                        it.copy(
                            loggedIn = false,
                            awaitingSpace = true,
                            activeSpaceId = null,
                            availableSpaces = emptyList(),
                            spacePartnerNames = emptyMap(),
                            profile = ProfileUiState(),
                            spaceOffboardingBusy = false,
                            spaceOffboardingProblem = null,
                            busy = false,
                            error = null,
                            draftImages = emptyList(),
                        )
                    }

                    val postExitEpoch = sessionEpoch
                    val memberships = runCatching {
                        api.listMemberships(currentSession.tokens.accessToken)
                    }.getOrNull() ?: return@onSuccess
                    if (!isCurrentSession(postExitEpoch, currentSession)) return@onSuccess

                    val active = activeMemberships(memberships)
                    val nextSpace = activeSpaceOf(memberships, _uiState.value.accountId)
                    if (nextSpace == null) {
                        mutate { it.copy(availableSpaces = active) }
                        return@onSuccess
                    }

                    activeSpaceId = nextSpace
                    mutate {
                        it.copy(
                            loggedIn = true,
                            awaitingSpace = false,
                            activeSpaceId = nextSpace,
                            availableSpaces = active,
                            spacePartnerNames = emptyMap(),
                            profile = ProfileUiState(),
                            spaceOffboardingBusy = false,
                            spaceOffboardingProblem = null,
                        )
                    }
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (isCurrentSession(operationEpoch, currentSession)) {
                        mutate {
                            it.copy(
                                spaceOffboardingBusy = false,
                                spaceOffboardingProblem = problemFor(throwable),
                            )
                        }
                    }
                }
        }
    }

    /**
     * Switches to another authorized Space.
     *
     * Everything bound to the previous Space is dropped rather than filtered:
     * a draft, a loaded Story or a pending upload belongs to the Space it was
     * made in. Bumping the session epoch also makes any request still in flight
     * against the old Space discard its result.
     */
    fun selectSpace(spaceId: java.util.UUID) {
        val state = _uiState.value
        if (spaceId == activeSpaceId) return
        if (state.availableSpaces.none { it.spaceId == spaceId }) return

        // Only a user-selected Space is remembered. Single-Space automatic
        // entry remains unambiguous without turning membership ordering into
        // persistent authority for a later multi-Space session.
        state.accountId?.let { spaceStore.rememberSpace(it, spaceId) }

        clearSpaceBoundState()
        activeSpaceId = spaceId
        imageDrafts = emptyList()
        mutate {
            it.copy(
                loggedIn = true,
                awaitingSpace = false,
                activeSpaceId = spaceId,
                profile = ProfileUiState(),
                busy = false,
                error = null,
                draftImages = emptyList(),
                lastMemoryTitle = null,
                lastMemoryBody = null,
                lastImageBytes = null,
                storyItems = emptyList(),
                storyCachedAt = null,
            )
        }
        postSnackbar(R.string.space_switched)
        refreshStory()
    }

    private fun activeMemberships(
        memberships: List<AccountMembershipView>,
    ): List<AccountMembershipView> =
        memberships.filter { it.status.equals("ACTIVE", ignoreCase = true) }

    /**
     * Everything bound to the outgoing Space — draft, loaded Story, pending
     * upload, cache — belongs to the Space it was made in and must not
     * survive into a different one. Shared by [selectSpace] and
     * [reconcileMembership]'s "no active Space left" branch: losing the
     * last membership is the same kind of identity/relationship transition
     * M2-D18 requires clearing for.
     */
    private fun clearSpaceBoundState() {
        sessionEpoch += 1
        clearMemoryTask()
        resetStoryContext()
        storyImages.reset()
        clearHeartMoments()
        clearComments()
        clearPlanning()
        clearToday()
        clearInvitations()
        clearRelatedPersons()
        clearProfilePreferences()
        clearPlaces()
        clearPlaceRelations()
        clearPrivateNotes()
        clearGiftIdeas()
        clearPrivateCollections()
        clearNotifications()
        clearActivity()
        clearExport()
        clearImport()
        clearSearch()
        clearCollections()
        clearChapters()
        clearChapterContent()
        clearProductReadCache()
        closeStoryItem()
    }

    /**
     * The proactive half of #328's "membership/authorization changes are
     * reconciled after reconnect": once per genuine offline-to-online
     * transition (see [reconnectEpoch]), re-lists memberships and reacts if
     * the currently active Space is no longer one of them.
     *
     * A revoked membership is the exact same situation sign-in itself
     * already handles when an account has no active Space yet — this reuses
     * [awaitingSpace][ReferenceUiState.awaitingSpace] and [selectSpace]
     * rather than inventing a third state. If another active Space still
     * exists, switches to it the same way a manual choice would. Only when
     * none remains does the account fall back to `awaitingSpace`, matching
     * sign-in's own transition field-for-field.
     *
     * A failure here — still offline enough for this specific call, or the
     * whole session having become invalid — is swallowed. This is a
     * proactive extra, not the only place a revoked membership eventually
     * surfaces: every screen's own reconnect refresh already gets the same
     * 401/403 the normal way regardless of whether this succeeds.
     */
    private fun reconcileMembership() {
        val api = contract ?: return
        val currentSession = session ?: return
        val currentActiveSpaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            val memberships = runCatching { api.listMemberships(currentSession.tokens.accessToken) }
                .getOrNull() ?: return@launch
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch

            val active = activeMemberships(memberships)
            mutate { it.copy(availableSpaces = active) }
            if (active.any { it.spaceId == currentActiveSpaceId }) return@launch

            val nextSpace = activeSpaceOf(memberships, _uiState.value.accountId)
            if (nextSpace != null) {
                selectSpace(nextSpace)
                return@launch
            }

            clearSpaceBoundState()
            activeSpaceId = null
            mutate {
                it.copy(
                    loggedIn = false,
                    awaitingSpace = true,
                    activeSpaceId = null,
                    availableSpaces = active,
                    spacePartnerNames = emptyMap(),
                    profile = ProfileUiState(),
                    busy = false,
                    error = null,
                    status = null,
                )
            }
        }
    }

    private fun apiFor(baseUrl: String): ReferenceContract? =
        injectedApi ?: baseUrl.takeIf(String::isNotBlank)?.let(apiFactory)

    fun beginImageSelection(): Long? = session?.takeIf { _uiState.value.memoryTask?.editable != false }
        ?.let { imageSelectionGeneration }

    fun selectImages(images: List<SelectedImage>, selectionEpoch: Long) {
        val api = contract ?: return configurationError()
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return configurationError()
        if (selectionEpoch != imageSelectionGeneration || images.isEmpty() || _uiState.value.memoryTask?.editable == false) return

        val newDrafts = images.map { image ->
            ImageDraft(
                id = nextDraftId++,
                image = image,
                attemptId = nextAttemptId++,
                uploadState = DraftUploadState.UPLOADING,
            )
        }
        imageDrafts = imageDrafts + newDrafts
        publishDrafts()
        newDrafts.forEach { draft ->
            startAttachmentPreparation(api, spaceId, currentSession, draft)
        }
    }

    fun setImageSelectionError(throwable: Throwable, selectionEpoch: Long) {
        if (session == null || selectionEpoch != imageSelectionGeneration) return
        val error = throwable.message?.takeIf(String::isNotBlank)?.let {
            message(R.string.ref_error_image_selection_detail, it)
        } ?: message(R.string.ref_error_image_selection_failed)
        mutate { it.copy(error = error, status = null) }
    }

    fun retryImage(draftId: Long) {
        if (_uiState.value.memoryTask?.editable == false) return
        val api = contract ?: return configurationError()
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return configurationError()
        val index = imageDrafts.indexOfFirst { it.id == draftId }
        if (index < 0) return

        val draft = imageDrafts[index].copy(
            attemptId = nextAttemptId++,
            uploadState = DraftUploadState.UPLOADING,
            preparedAttachment = null,
        )
        imageDrafts = imageDrafts.toMutableList().also { it[index] = draft }
        publishDrafts()
        startAttachmentPreparation(api, spaceId, currentSession, draft)
    }

    fun removeImage(draftId: Long) {
        if (_uiState.value.memoryTask?.editable == false) return
        val previousSize = imageDrafts.size
        imageDrafts = imageDrafts.filterNot { it.id == draftId }
        if (imageDrafts.size == previousSize) return
        val nextStatus = draftStatus() ?: message(R.string.ref_status_image_removed)
        publishDrafts(status = nextStatus)
    }

    fun beginMemoryTask() {
        if (_uiState.value.memoryTask != null) return
        imageSelectionGeneration += 1
        imageDrafts = emptyList()
        mutate { it.copy(memoryTask = MemoryTask(++memoryTaskGeneration), draftImages = emptyList(), error = null, status = null) }
    }

    fun updateMemoryTask(title: String, body: String, happenedOn: String) {
        val task = _uiState.value.memoryTask?.takeIf { it.editable } ?: return
        mutate { it.copy(memoryTask = task.copy(title = title.take(200), body = body, happenedOn = happenedOn, problem = null)) }
    }

    /** Pending work must retain ownership until its result is known. */
    fun discardMemoryTask(): Boolean {
        if (_uiState.value.memoryTask?.pending == true) return false
        clearMemoryTask()
        return true
    }

    private fun clearMemoryTask() {
        memoryTaskGeneration += 1
        imageSelectionGeneration += 1
        imageDrafts = emptyList()
        mutate { it.copy(memoryTask = null, draftImages = emptyList(), busy = false, error = null, status = null) }
    }

    fun consumeMemoryResult(generation: Long) {
        val task = _uiState.value.memoryTask ?: return
        if (task.generation == generation && task.phase == MemoryTaskPhase.CONFIRMED) clearMemoryTask()
    }

    /**
     * [fallbackTitle] is a caller-resolved, already-localized date-based title, used
     * only when the task's own title is blank. Resolving it in the UI layer keeps
     * this ViewModel free of an Android Context/resource dependency, mirroring the
     * Web client's own `save()`-time fallback substitution.
     */
    fun submitMemoryTask(fallbackTitle: String) {
        val task = _uiState.value.memoryTask ?: return
        createMemory(task.title, task.body, task.happenedOn, fallbackTitle)
    }

    fun createMemory(title: String, body: String, happenedOnText: String, fallbackTitle: String = "") {
        val api = contract ?: return configurationError()
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        // Set the lock before launching a coroutine, including two taps in the same frame.
        var task = _uiState.value.memoryTask
        if (task != null && !task.editable) return
        if (task == null) {
            task = MemoryTask(++memoryTaskGeneration)
        }
        task = task.copy(title = title, body = body, happenedOn = happenedOnText)
        val drafts = imageDrafts.toList()
        val parsedDate = happenedOnText.takeIf { it.isNotBlank() }
            ?.let { runCatching { LocalDate.parse(it.trim()) }.getOrNull() }
        val problem = when {
            _uiState.value.offline -> message(R.string.memory_task_offline)
            drafts.any { it.uploadState != DraftUploadState.READY || it.preparedAttachment == null } ->
                message(R.string.ref_error_images_not_ready)
            happenedOnText.isNotBlank() && parsedDate == null -> message(R.string.ref_error_date_format)
            else -> null
        }
        if (problem != null) {
            mutate { it.copy(memoryTask = task.copy(phase = MemoryTaskPhase.REJECTED, problem = problem), error = problem) }
            return
        }
        // Title stays optional on the client, matching the shared image/text/title-only
        // capture contract. The caller resolves a localized date-based fallback (see
        // MemoryCreate.title in the Web client for the same parity) so this ViewModel
        // never needs an Android Context/resource dependency of its own; the task's
        // own displayed/editable title is left exactly as entered.
        val effectiveTitle = title.trim().ifBlank { fallbackTitle }
        val submitted = task.copy(phase = MemoryTaskPhase.SUBMITTING, problem = null)
        val operationEpoch = sessionEpoch
        val attachments = drafts.map { checkNotNull(it.preparedAttachment) }
        mutate { it.copy(memoryTask = submitted, busy = true, error = null, status = message(R.string.ref_status_save_pending)) }
        viewModelScope.launch {
            if (!isCurrentMemoryTask(submitted.generation, operationEpoch, currentSession)) return@launch
            var created: MemoryDetail? = null
            runCatching {
                saveMemoryWithPreparedAttachments(
                    api, spaceId, currentSession.tokens.accessToken, effectiveTitle, body.trim(),
                    parsedDate, attachments,
                    onCreated = { memory ->
                        created = memory
                        if (!isCurrentMemoryTask(submitted.generation, operationEpoch, currentSession))
                            throw kotlinx.coroutines.CancellationException("Memory task context changed")
                        mutate { it.copy(memoryTask = submitted.copy(confirmedMemory = memory)) }
                    },
                )
            }.onSuccess { memory ->
                if (isCurrentMemoryTask(submitted.generation, operationEpoch, currentSession)) {
                    confirmMemoryTask(submitted, memory)
                }
            }.onFailure { failure ->
                if (!isCurrentMemoryTask(submitted.generation, operationEpoch, currentSession)) return@onFailure
                val phase = when {
                    created != null -> MemoryTaskPhase.ATTACHMENT_RECOVERY
                    isKnownCreateRejection(failure) -> MemoryTaskPhase.REJECTED
                    else -> MemoryTaskPhase.UNCERTAIN
                }
                val problem = message(when (phase) {
                    MemoryTaskPhase.ATTACHMENT_RECOVERY -> R.string.memory_task_attachment_recovery
                    MemoryTaskPhase.UNCERTAIN -> R.string.memory_task_uncertain
                    else -> R.string.ref_error_save_failed
                })
                mutate { it.copy(busy = false, memoryTask = submitted.copy(phase = phase, confirmedMemory = created, problem = problem), error = problem, status = null) }
            }
        }
    }

    /** A timed-out association is reconciled before any further write to the known object. */
    fun retryMemoryAttachments() {
        val task = _uiState.value.memoryTask?.takeIf { it.phase == MemoryTaskPhase.ATTACHMENT_RECOVERY } ?: return
        val known = task.confirmedMemory ?: return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        val attachments = imageDrafts.mapNotNull { it.preparedAttachment }
        val submitted = task.copy(phase = MemoryTaskPhase.SUBMITTING, problem = null)
        mutate { it.copy(memoryTask = submitted, busy = true) }
        viewModelScope.launch {
            runCatching {
                val current = api.getMemory(spaceId, currentSession.tokens.accessToken, known.id)
                if (!isCurrentMemoryTask(task.generation, operationEpoch, currentSession))
                    throw kotlinx.coroutines.CancellationException("Memory task context changed")
                val intended = attachments.map { it.attachmentId }
                val actual = current.attachments.sortedBy { it.position }.map { it.id }
                when {
                    actual == intended -> current
                    // Never overwrite an unexpected partner/concurrent attachment change.
                    actual.isNotEmpty() || current.version != known.version ->
                        throw ReferenceApiException("ATTACHMENT_CONFLICT", "Attachment state changed", 409)
                    else -> bindMemoryAttachments(api, spaceId, currentSession.tokens.accessToken, current, attachments)
                }
            }.onSuccess { memory ->
                if (isCurrentMemoryTask(task.generation, operationEpoch, currentSession)) confirmMemoryTask(task, memory)
            }.onFailure { failure ->
                if (isCurrentMemoryTask(task.generation, operationEpoch, currentSession)) {
                    val problem = message(if (failure is ReferenceApiException && failure.status == 409)
                        R.string.memory_task_attachment_conflict else R.string.memory_task_attachment_recovery)
                    mutate { it.copy(busy = false, memoryTask = task.copy(problem = problem)) }
                }
            }
        }
    }

    /** Explicitly viewing the confirmed text never claims that missing attachments were saved. */
    fun viewPartiallySavedMemory() {
        val task = _uiState.value.memoryTask?.takeIf { it.phase == MemoryTaskPhase.ATTACHMENT_RECOVERY } ?: return
        task.confirmedMemory?.let { confirmMemoryTask(task, it, partial = true) }
    }

    private fun confirmMemoryTask(task: MemoryTask, memory: MemoryDetail, partial: Boolean = false) {
        mutate { it.copy(
            busy = false,
            memoryTask = task.copy(phase = MemoryTaskPhase.CONFIRMED, confirmedMemory = memory, problem = null),
            openMemory = memory,
            memoryStatus = message(if (partial) R.string.memory_task_partial_result else R.string.ref_status_save_success),
            error = null,
            status = message(R.string.ref_status_save_success),
            lastMemoryTitle = memory.title,
            lastMemoryBody = memory.body,
            lastImageBytes = null,
        ) }
        // Refresh independently: a projection failure cannot undo the confirmed write.
        refreshStory(preserveLoadedRange = true)
    }

    private fun isCurrentMemoryTask(generation: Long, epoch: Long, currentSession: SessionView): Boolean =
        isCurrentSession(epoch, currentSession) && _uiState.value.memoryTask?.generation == generation

    /**
     * Loads one memory for its own screen.
     *
     * The Story carries a summary; the full text and every photograph come from
     * here, as does the version a change has to be written against.
     */
    fun openMemory(memoryId: java.util.UUID) {
        mutate { it.copy(
            memoryProblem = null,
            memoryStatus = it.memoryStatus.takeIf { _ -> it.openMemory?.id == memoryId },
            openMemory = it.openMemory?.takeIf { memory -> memory.id == memoryId },
            openMemoryGone = false,
        ) }
        reloadMemory(memoryId)
    }

    /**
     * Reads the memory again without clearing what is already being reported.
     *
     * A conflict reloads to pick up the partner's version, and clearing the
     * problem on the way would make the explanation flash past: the write would
     * have been refused and the screen would look as though nothing happened.
     */
    private fun reloadMemory(memoryId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        val readGeneration = ++memoryReadGeneration

        mutate { it.copy(memoryBusy = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.MEMORY,
                resourceId = memoryId,
                load = { api.getMemory(spaceId, currentSession.tokens.accessToken, memoryId) },
                serialize = { EimirJson.encodeToString(MemoryDetail.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(MemoryDetail.serializer(), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession) || readGeneration != memoryReadGeneration) return@onSuccess
                    mutate {
                        it.copy(
                            openMemory = result.value,
                            openMemoryCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                            memoryBusy = false,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession) || readGeneration != memoryReadGeneration) return@onFailure
                    mutate {
                        val denied = throwable is ReferenceApiException && throwable.status in setOf(401, 403, 404)
                        it.copy(memoryBusy = false, memoryProblem = problemFor(throwable),
                            openMemory = it.openMemory.takeUnless { denied },
                            memoryStatus = it.memoryStatus.takeUnless { denied })
                    }
                }
        }
    }

    fun beginEditingMemory() {
        mutate { it.copy(editingMemory = true, memoryProblem = null, memoryStatus = null) }
    }

    fun cancelEditingMemory() {
        mutate { it.copy(editingMemory = false, memoryProblem = null) }
    }

    /** Forgets the open memory when its screen is left. */
    fun closeMemory() {
        memoryReadGeneration += 1
        mutate {
            it.copy(
                openMemory = null,
                memoryBusy = false,
                memoryProblem = null,
                openMemoryGone = false,
                editingMemory = false,
                memoryStatus = null,
            )
        }
    }

    /**
     * Writes a change to the open memory.
     *
     * The change is sent against the version it was written from. If the
     * partner changed the memory meanwhile the server refuses, and the refusal
     * is reported **without** touching what was typed — the newly written text
     * is the thing worth protecting here, not the request. The memory is then
     * reloaded so a second attempt carries the current version.
     */
    fun saveMemory(title: String, body: String, happenedOn: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val memory = _uiState.value.openMemory ?: return
        val operationEpoch = sessionEpoch

        val happenedOnDate = parseHappenedOn(happenedOn)
        if (happenedOn.isNotBlank() && happenedOnDate == null) {
            mutate { it.copy(error = message(R.string.ref_error_date_format)) }
            return
        }

        mutate { it.copy(memoryBusy = true, memoryProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateMemory(
                    spaceId,
                    currentSession.tokens.accessToken,
                    memory.id,
                    memory.version,
                    MemoryUpdate(
                        body = body,
                        happenedOn = happenedOnDate,
                        title = title,
                    ),
                )
            }
                .onSuccess { updated ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openMemory = updated,
                            memoryBusy = false,
                            memoryProblem = null,
                            // The change is written, so the form has done its
                            // job; leaving it open would look as if nothing had
                            // happened.
                            editingMemory = false,
                            memoryStatus = message(R.string.memory_saved),
                        )
                    }
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(memoryBusy = false, memoryProblem = problemFor(throwable))
                    }
                    // Reload so a retry carries the version the partner left
                    // behind. The typed text lives in the form and is untouched,
                    // and the refusal stays on screen.
                    reloadMemory(memory.id)
                }
        }
    }

    /** Removes the open memory, and the Story entry that showed it. */
    fun deleteMemory() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val memory = _uiState.value.openMemory ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(memoryBusy = true, memoryProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteMemory(
                    spaceId,
                    currentSession.tokens.accessToken,
                    memory.id,
                    memory.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openMemory = null,
                            memoryBusy = false,
                            openMemoryGone = true,
                        )
                    }
                    postSnackbar(R.string.memory_deleted)
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(memoryBusy = false, memoryProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun openMilestone(milestoneId: java.util.UUID) {
        mutate { it.copy(memoryProblem = null, memoryStatus = null, openMemoryGone = false) }
        reloadMilestone(milestoneId)
    }

    /**
     * Reads the milestone again without clearing what is already being
     * reported, for the same reason [reloadMemory] does: a conflict reloads to
     * pick up the partner's version, and clearing the problem on the way would
     * make the refusal look like nothing having happened.
     */
    private fun reloadMilestone(milestoneId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(memoryBusy = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.MILESTONE,
                resourceId = milestoneId,
                load = { api.getMilestone(spaceId, currentSession.tokens.accessToken, milestoneId) },
                serialize = { EimirJson.encodeToString(MilestoneDetail.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(MilestoneDetail.serializer(), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openMilestone = result.value,
                            openMilestoneCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                            memoryBusy = false,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(memoryBusy = false, memoryProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * Reads one HeartMoment for its own screen.
     *
     * Only a shared one is reachable this way, because only a shared one is in
     * the Story. A private moment is not filtered out here — the server never
     * puts it in the timeline the id came from.
     */
    fun openSharedHeartMoment(heartMomentId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(memoryBusy = true, memoryProblem = null, openMemoryGone = false) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.HEART_MOMENT,
                resourceId = heartMomentId,
                // Symmetric with the write-time gate: a cached row can only ever
                // have been written while still SHARED, but a moment can turn
                // PRIVATE after being cached, so a stale row is refused here too.
                canPersist = { it.visibility == ContentVisibility.SHARED },
                load = { api.getHeartMoment(spaceId, currentSession.tokens.accessToken, heartMomentId) },
                serialize = { EimirJson.encodeToString(HeartMomentDetail.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(HeartMomentDetail.serializer(), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openSharedHeartMoment = result.value,
                            openSharedHeartMomentCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                            memoryBusy = false,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(memoryBusy = false, memoryProblem = problemFor(throwable)) }
                }
        }
    }

    fun closeStoryItem() {
        mutate {
            it.copy(
                openMilestone = null,
                openSharedHeartMoment = null,
                memoryBusy = false,
                memoryProblem = null,
                memoryStatus = null,
                editingMemory = false,
            )
        }
    }

    /**
     * Creates a Milestone. Unlike [saveMilestone], there is nothing to
     * version against yet — the M2-D18 `If-Match` concurrency contract only
     * applies once a resource exists.
     */
    fun createMilestone(title: String, body: String, happenedOn: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        if (title.isBlank()) {
            mutate { it.copy(memoryProblem = validationProblem()) }
            return
        }
        val day = parseHappenedOn(happenedOn)
        if (day == null) {
            mutate { it.copy(memoryProblem = validationProblem()) }
            return
        }

        mutate { it.copy(memoryBusy = true, memoryProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createMilestone(
                    spaceId,
                    currentSession.tokens.accessToken,
                    MilestoneCreate(happenedOn = day, title = title.trim(), body = body.trim().ifBlank { null }),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(memoryBusy = false, memoryProblem = null, milestoneCreated = true) }
                    postSnackbar(R.string.milestone_created)
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(memoryBusy = false, memoryProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearMilestoneCreated() {
        mutate { it.copy(milestoneCreated = false) }
    }

    fun saveMilestone(title: String, body: String, happenedOn: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val milestone = _uiState.value.openMilestone ?: return
        val operationEpoch = sessionEpoch

        val day = parseHappenedOn(happenedOn)
        if (happenedOn.isNotBlank() && day == null) {
            mutate { it.copy(error = message(R.string.ref_error_date_format)) }
            return
        }

        mutate { it.copy(memoryBusy = true, memoryProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateMilestone(
                    spaceId,
                    currentSession.tokens.accessToken,
                    milestone.id,
                    milestone.version,
                    MilestoneUpdate(body = body, happenedOn = day, title = title),
                )
            }
                .onSuccess { updated ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openMilestone = updated,
                            memoryBusy = false,
                            memoryProblem = null,
                            editingMemory = false,
                            memoryStatus = message(R.string.memory_saved),
                        )
                    }
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(memoryBusy = false, memoryProblem = problemFor(throwable)) }
                    reloadMilestone(milestone.id)
                }
        }
    }

    fun deleteMilestone() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val milestone = _uiState.value.openMilestone ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(memoryBusy = true, memoryProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteMilestone(
                    spaceId,
                    currentSession.tokens.accessToken,
                    milestone.id,
                    milestone.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openMilestone = null,
                            memoryBusy = false,
                            openMemoryGone = true,
                            memoryStatus = message(R.string.memory_deleted),
                        )
                    }
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(memoryBusy = false, memoryProblem = problemFor(throwable)) }
                }
        }
    }

    fun loadComments(parent: ReferenceContract.CommentParent, parentId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(commentsBusy = true, commentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.listComments(spaceId, currentSession.tokens.accessToken, parent, parentId)
            }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    commentsCursor = page.nextCursor
                    mutate {
                        it.copy(
                            comments = page.items,
                            commentsHaveMore = page.hasMore,
                            commentsBusy = false,
                        )
                    }
                }
                .onFailure { throwable -> reportCommentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun addComment(
        parent: ReferenceContract.CommentParent,
        parentId: java.util.UUID,
        body: String,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        if (body.isBlank()) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(commentsBusy = true, commentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createComment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    parent,
                    parentId,
                    CommentCreate(body = body),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    loadComments(parent, parentId)
                }
                .onFailure { throwable -> reportCommentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun editComment(
        parent: ReferenceContract.CommentParent,
        parentId: java.util.UUID,
        commentId: java.util.UUID,
        body: String,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val current = _uiState.value.comments.firstOrNull { it.id == commentId } ?: return
        if (body.isBlank()) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(commentsBusy = true, commentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateComment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    commentId,
                    current.version,
                    CommentUpdate(body = body),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    loadComments(parent, parentId)
                }
                .onFailure { throwable -> reportCommentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun removeComment(
        parent: ReferenceContract.CommentParent,
        parentId: java.util.UUID,
        commentId: java.util.UUID,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val current = _uiState.value.comments.firstOrNull { it.id == commentId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(commentsBusy = true, commentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteComment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    commentId,
                    current.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    loadComments(parent, parentId)
                }
                .onFailure { throwable -> reportCommentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun clearComments() {
        commentsCursor = null
        mutate {
            it.copy(
                comments = emptyList(),
                commentsBusy = false,
                commentsProblem = null,
                commentsHaveMore = false,
            )
        }
    }

    private fun reportCommentFailure(
        operationEpoch: Long,
        currentSession: SessionView,
        throwable: Throwable,
    ) {
        if (!isCurrentSession(operationEpoch, currentSession)) return
        mutate { it.copy(commentsBusy = false, commentsProblem = problemFor(throwable)) }
    }

    fun loadHeartMoments() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(heartMomentsBusy = true, heartMomentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listHeartMoments(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(heartMoments = page.items, heartMomentsBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            heartMomentsBusy = false,
                            heartMomentsProblem = problemFor(throwable),
                        )
                    }
                }
        }
    }

    fun createHeartMoment(
        text: String,
        emotion: HeartEmotion,
        happenedOn: String,
        visibility: ContentVisibility,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return

        if (text.isBlank()) {
            mutate { it.copy(heartMomentStatus = null, heartMomentsProblem = validationProblem()) }
            return
        }
        val day = parseHappenedOn(happenedOn)
        if (day == null) {
            mutate { it.copy(heartMomentStatus = null, heartMomentsProblem = validationProblem()) }
            return
        }
        val operationEpoch = sessionEpoch

        mutate { it.copy(heartMomentsBusy = true, heartMomentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createHeartMoment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    HeartMomentCreate(
                        emotion = emotion,
                        happenedOn = day,
                        text = text,
                        visibility = visibility,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            heartMomentsBusy = false,
                            heartMomentStatus = message(R.string.heart_moment_created),
                        )
                    }
                    loadHeartMoments()
                    // A shared moment belongs in the Story straight away; a
                    // private one will simply not be in what comes back.
                    refreshStory()
                }
                .onFailure { throwable -> reportHeartMomentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun updateHeartMoment(heartMomentId: java.util.UUID, text: String, emotion: HeartEmotion, happenedOn: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val current = _uiState.value.heartMoments.firstOrNull { it.id == heartMomentId } ?: return

        if (text.isBlank()) {
            mutate { it.copy(heartMomentsProblem = validationProblem()) }
            return
        }
        val day = parseHappenedOn(happenedOn)
        if (day == null) {
            mutate { it.copy(heartMomentsProblem = validationProblem()) }
            return
        }
        val operationEpoch = sessionEpoch

        mutate { it.copy(heartMomentsBusy = true, heartMomentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateHeartMoment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    heartMomentId,
                    current.version,
                    // Deliberately without visibility: the contract keeps that
                    // a separate operation because it destroys comments.
                    HeartMomentUpdate(emotion = emotion, happenedOn = day, text = text),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            heartMomentsBusy = false,
                            heartMomentStatus = message(R.string.heart_moment_saved),
                        )
                    }
                    loadHeartMoments()
                    refreshStory()
                }
                .onFailure { throwable -> reportHeartMomentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    /**
     * Changes who may see a HeartMoment.
     *
     * Separate from [updateHeartMoment] because the server makes it separate:
     * `SHARED -> PRIVATE` deletes the moment's comments and going back does not
     * bring them back. The screen names that before calling this.
     */
    fun changeHeartMomentVisibility(
        heartMomentId: java.util.UUID,
        visibility: ContentVisibility,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val current = _uiState.value.heartMoments.firstOrNull { it.id == heartMomentId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(heartMomentsBusy = true, heartMomentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.changeHeartMomentVisibility(
                    spaceId,
                    currentSession.tokens.accessToken,
                    heartMomentId,
                    current.version,
                    HeartMomentVisibilityChange(visibility = visibility),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            heartMomentsBusy = false,
                            heartMomentStatus = message(
                                if (visibility == ContentVisibility.PRIVATE) {
                                    R.string.heart_moment_now_private
                                } else {
                                    R.string.heart_moment_now_shared
                                },
                            ),
                        )
                    }
                    loadHeartMoments()
                    // The Story gains or loses the moment with this change.
                    refreshStory()
                }
                .onFailure { throwable -> reportHeartMomentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun deleteHeartMoment(heartMomentId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val current = _uiState.value.heartMoments.firstOrNull { it.id == heartMomentId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(heartMomentsBusy = true, heartMomentsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteHeartMoment(
                    spaceId,
                    currentSession.tokens.accessToken,
                    heartMomentId,
                    current.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            heartMomentsBusy = false,
                            heartMomentStatus = message(R.string.heart_moment_deleted),
                        )
                    }
                    loadHeartMoments()
                    refreshStory()
                }
                .onFailure { throwable -> reportHeartMomentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun clearHeartMoments() {
        mutate {
            it.copy(
                heartMoments = emptyList(),
                heartMomentsBusy = false,
                heartMomentsProblem = null,
                heartMomentStatus = null,
            )
        }
    }

    private fun reportHeartMomentFailure(
        operationEpoch: Long,
        currentSession: SessionView,
        throwable: Throwable,
    ) {
        if (!isCurrentSession(operationEpoch, currentSession)) return
        mutate {
            it.copy(heartMomentsBusy = false, heartMomentsProblem = problemFor(throwable))
        }
    }

    /**
     * Appends the next Story page.
     *
     * Appends rather than replaces: a couple reading their history back must
     * not lose what they already scrolled past.
     */
    fun loadMoreStory() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val cursor = storyCursor ?: return
        val state = _uiState.value
        if (state.storyLoadingMore || state.storyLoading) return
        val operationEpoch = sessionEpoch
        val requestGeneration = storyRequestGeneration
        val appliedScope = state.storyScope
        mutate { it.copy(storyLoadingMore = true, storyProblem = null, storyPageFailed = false) }
        viewModelScope.launch {
            runCatching { api.getScopedTimeline(spaceId, currentSession.tokens.accessToken, appliedScope, cursor) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession) || requestGeneration != storyRequestGeneration) return@onSuccess
                    storyCursor = page.nextCursor
                    mutate { it.copy(
                        storyItems = (it.storyItems + page.items).distinctBy { item -> item.toEntry().id },
                        storyHasMore = page.hasMore, storyLoadingMore = false,
                    ) }
                }
                .onFailure { failure ->
                    if (isCurrentSession(operationEpoch, currentSession) && requestGeneration == storyRequestGeneration) {
                        val denied = failure is ReferenceApiException && failure.status in setOf(401, 403, 404)
                        if (denied) storyCursor = null
                        mutate { it.copy(storyLoadingMore = false, storyProblem = problemFor(failure),
                            storyPageFailed = !denied,
                            storyItems = if (denied) emptyList() else it.storyItems,
                            storyAvailableYears = if (denied) emptyList() else it.storyAvailableYears,
                            storyHasMore = it.storyHasMore && !denied) }
                    }
                }
        }
    }

    fun loadMoreComments(parent: ReferenceContract.CommentParent, parentId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val cursor = commentsCursor ?: return
        if (_uiState.value.commentsBusy) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(commentsBusy = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.listComments(
                    spaceId,
                    currentSession.tokens.accessToken,
                    parent,
                    parentId,
                    cursor,
                )
            }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    commentsCursor = page.nextCursor
                    mutate {
                        it.copy(
                            comments = it.comments + page.items,
                            commentsHaveMore = page.hasMore,
                            commentsBusy = false,
                        )
                    }
                }
                .onFailure { throwable -> reportCommentFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun loadToday() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(todayBusy = true, todayProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.DASHBOARD,
                resourceId = de.eimir.app.cache.TodayDashboardResourceId,
                load = { api.getDashboard(spaceId, currentSession.tokens.accessToken) },
                serialize = { EimirJson.encodeToString(DashboardView.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(DashboardView.serializer(), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            dashboard = result.value,
                            todayBusy = false,
                            todayCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(todayBusy = false, todayProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * Sends the partner a sign, once.
     *
     * The request id is kept until the server accepts it, so a second tap after
     * a failure repeats the *same* gesture rather than sending a new one. That
     * is the whole point of an idempotency key: the tap a person repeats is the
     * tap that looked like it failed.
     */
    fun sendThinkingOfYou() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        if (_uiState.value.todayBusy) return
        val operationEpoch = sessionEpoch

        val requestId = pendingGestureId ?: java.util.UUID.randomUUID().also {
            pendingGestureId = it
        }

        mutate { it.copy(todayBusy = true, todayProblem = null, thinkingOfYouSent = false) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.sendThinkingOfYou(
                    spaceId,
                    currentSession.tokens.accessToken,
                    ThinkingOfYouCreate(clientRequestId = requestId),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    pendingGestureId = null
                    mutate { it.copy(todayBusy = false, thinkingOfYouSent = true) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    // A 429 means it was already sent recently, which the
                    // problem mapping renders as its own state rather than as
                    // a failure. The id is kept either way.
                    mutate { it.copy(todayBusy = false, todayProblem = problemFor(throwable)) }
                }
        }
    }

    fun acknowledgeThinkingOfYou() {
        mutate { it.copy(thinkingOfYouSent = false) }
    }

    fun clearToday() {
        pendingGestureId = null
        mutate {
            it.copy(
                dashboard = null,
                todayBusy = false,
                todayProblem = null,
                todayCachedAt = null,
                thinkingOfYouSent = false,
            )
        }
    }

    /**
     * Accepts an invitation while `awaitingSpace`.
     *
     * Uses the session held from sign-in rather than asking for one again —
     * that session is the entire reason this state keeps it. Success re-lists
     * memberships and resolves a Space the same way sign-in itself does.
     */
    fun acceptInvitation(token: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        if (!_uiState.value.awaitingSpace) return
        if (token.isBlank()) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(invitationBusy = true, invitationProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.acceptInvitation(currentSession.tokens.accessToken, token)
                api.listMemberships(currentSession.tokens.accessToken)
            }
                .onSuccess { memberships ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    val active = activeMemberships(memberships)
                    val space = activeSpaceOf(memberships, currentSession.account.id)
                    if (space == null) {
                        if (active.size > 1) {
                            // Acceptance may legitimately leave an account with
                            // several active relationships. Do not pick one by
                            // membership order; keep the authenticated session
                            // waiting for an explicit choice.
                            mutate {
                                it.copy(
                                    invitationBusy = false,
                                    invitationProblem = null,
                                    availableSpaces = active,
                                )
                            }
                            postSnackbar(R.string.invitation_accepted)
                            return@onSuccess
                        }

                        // The server accepted the token but the membership is
                        // not active yet by this account's own rules; stay in
                        // the same waiting state rather than guessing.
                        mutate {
                            it.copy(
                                invitationBusy = false,
                                invitationProblem = problemFor(
                                    ReferenceApiException(null, "not active", 409),
                                ),
                                availableSpaces = active,
                            )
                        }
                        return@onSuccess
                    }
                    activeSpaceId = space
                    imageDrafts = emptyList()
                    mutate {
                        it.copy(
                            loggedIn = true,
                            awaitingSpace = false,
                            activeSpaceId = space,
                            availableSpaces = active,
                            invitationBusy = false,
                            invitationProblem = null,
                        )
                    }
                    postSnackbar(R.string.invitation_accepted)
                    refreshStory()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(invitationBusy = false, invitationProblem = acceptInvitationProblem(throwable))
                    }
                }
        }
    }

    /**
     * The server deliberately answers every bad-token case — unknown, expired,
     * revoked, already used — the same way, so as not to disclose which tokens
     * exist. `ACCOUNT_ALREADY_MEMBER` is a different, safe-to-name case: the
     * account already knows it is a member, so saying so leaks nothing.
     */
    private fun acceptInvitationProblem(throwable: Throwable): UiProblem {
        val code = (throwable as? ReferenceApiException)?.code
        return when (code) {
            "ACCOUNT_ALREADY_MEMBER" -> UiProblem(
                kind = UiStateKind.Conflict,
                titleRes = R.string.invitation_already_member_title,
                bodyRes = R.string.invitation_already_member,
                retryable = false,
            )

            "INVITATION_INVALID", "CANNOT_ACCEPT_OWN_INVITATION" -> UiProblem(
                kind = UiStateKind.Conflict,
                titleRes = R.string.invitation_expired_title,
                bodyRes = R.string.invitation_expired,
                retryable = false,
            )

            else -> problemFor(throwable)
        }
    }

    fun loadInvitations() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(invitationBusy = true, invitationProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listInvitations(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { invitations ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(issuedInvitations = invitations, invitationBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(invitationBusy = false, invitationProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * Issues a new invitation.
     *
     * The token is kept in state so the screen can offer it once; nothing
     * about it is written to storage or logged, and it is gone from state as
     * soon as [dismissIssuedInvitationToken] is called.
     */
    fun createInvitation() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(invitationBusy = true, invitationProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.createInvitation(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { issued ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(invitationBusy = false, issuedInvitationToken = issued.token)
                    }
                    loadInvitations()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    // The server refuses a third partner rather than issuing an
                    // invitation nobody could ever accept — a specific, named
                    // state, not a version conflict a retry would fix.
                    val problem = if ((throwable as? ReferenceApiException)?.code == "SPACE_FULL") {
                        UiProblem(
                            kind = UiStateKind.Conflict,
                            titleRes = R.string.invitation_space_full_title,
                            bodyRes = R.string.invitation_space_full,
                            retryable = false,
                        )
                    } else {
                        problemFor(throwable)
                    }
                    mutate { it.copy(invitationBusy = false, invitationProblem = problem) }
                }
        }
    }

    fun dismissIssuedInvitationToken() {
        mutate { it.copy(issuedInvitationToken = null) }
    }

    fun revokeInvitation(invitationId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(invitationBusy = true, invitationProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.revokeInvitation(spaceId, currentSession.tokens.accessToken, invitationId)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(invitationBusy = false) }
                    loadInvitations()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(invitationBusy = false, invitationProblem = problemFor(throwable)) }
                }
        }
    }

    fun loadRelatedPersons() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listRelatedPersons(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { people ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(relatedPersons = people, relatedPersonsBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun addRelatedPerson(
        displayName: String,
        relationship: PersonRelationship,
        birthday: LocalDate?,
        birthdayYearKnown: Boolean,
        visibility: ContentVisibility,
    ) {
        if (displayName.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createRelatedPerson(
                    spaceId,
                    currentSession.tokens.accessToken,
                    RelatedPersonFields(
                        birthday = birthday,
                        birthdayYearKnown = birthdayYearKnown,
                        displayName = displayName,
                        relationship = relationship,
                        visibility = visibility,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(relatedPersonsBusy = false) }
                    loadRelatedPersons()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun updateRelatedPerson(
        personId: java.util.UUID,
        displayName: String,
        relationship: PersonRelationship,
        birthday: LocalDate?,
        birthdayYearKnown: Boolean,
        visibility: ContentVisibility,
    ) {
        if (displayName.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val person = _uiState.value.relatedPersons.firstOrNull { it.id == personId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateRelatedPerson(
                    spaceId,
                    currentSession.tokens.accessToken,
                    personId,
                    person.version,
                    RelatedPersonFields(
                        birthday = birthday,
                        birthdayYearKnown = birthdayYearKnown,
                        displayName = displayName,
                        relationship = relationship,
                        visibility = visibility,
                        avatarAttachmentId = person.avatarAttachmentId,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(relatedPersonsBusy = false) }
                    loadRelatedPersons()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    /**
     * Resolves the other partner's name for every Space this account may
     * open, so the picker can show who a Space is with instead of its
     * position in a list.
     *
     * Best-effort: a Space that fails to resolve simply falls back to its
     * position, rather than the whole picker failing over one request.
     */
    fun loadSpaceNames() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaces = _uiState.value.availableSpaces
        if (spaces.size <= 1) return
        val operationEpoch = sessionEpoch
        val selfId = _uiState.value.accountId

        viewModelScope.launch {
            spaces.forEach { membership ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@launch
                if (_uiState.value.spacePartnerNames.containsKey(membership.spaceId)) return@forEach
                runCatching {
                    api.getSpace(membership.spaceId, currentSession.tokens.accessToken)
                }.onSuccess { space ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@launch
                    val partner = space.partners.firstOrNull { it.id != selfId }
                        ?: space.partners.firstOrNull()
                    partner?.let { view ->
                        mutate {
                            it.copy(
                                spacePartnerNames = it.spacePartnerNames +
                                    (membership.spaceId to view.displayName),
                            )
                        }
                    }
                }
            }
        }
    }

    fun clearInvitations() {
        mutate {
            it.copy(
                invitationBusy = false,
                invitationProblem = null,
                issuedInvitations = emptyList(),
                issuedInvitationToken = null,
            )
        }
    }

    /**
     * Deletes a person under an explicit, already-decided policy.
     *
     * Deliberately does not read [personImportantDates] or call
     * [loadImportantDates] first: per #65, the confirmation that led here must
     * never be built from a query of what is affected, because even a correct,
     * already-filtered count would disclose the gap between what this account
     * can see and what `cascade` actually removes.
     */
    fun deleteRelatedPerson(personId: java.util.UUID, deletePolicy: RelatedPersonDeletePolicy) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val person = _uiState.value.relatedPersons.firstOrNull { it.id == personId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteRelatedPerson(
                    spaceId,
                    currentSession.tokens.accessToken,
                    personId,
                    deletePolicy,
                    person.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            relatedPersonsBusy = false,
                            personImportantDates = emptyList(),
                        )
                    }
                    loadRelatedPersons()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun clearRelatedPersons() {
        mutate {
            it.copy(
                relatedPersons = emptyList(),
                relatedPersonsBusy = false,
                relatedPersonsProblem = null,
                personImportantDates = emptyList(),
            )
        }
    }

    /**
     * Reads a person's ImportantDates for their own screen.
     *
     * Only called from that screen, never from the delete confirmation — see
     * [deleteRelatedPerson].
     */
    fun loadImportantDates(relatedPersonId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.listImportantDates(spaceId, currentSession.tokens.accessToken, relatedPersonId)
            }
                .onSuccess { dates ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(personImportantDates = dates, relatedPersonsBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun addImportantDate(
        relatedPersonId: java.util.UUID,
        label: String,
        type: ImportantDateType,
        date: LocalDate,
        repeats: DateRepeat,
        visibility: ContentVisibility,
    ) {
        if (label.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createImportantDate(
                    spaceId,
                    currentSession.tokens.accessToken,
                    ImportantDateFields(
                        date = date,
                        label = label,
                        relatedPersonId = relatedPersonId,
                        repeats = repeats,
                        type = type,
                        visibility = visibility,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(relatedPersonsBusy = false) }
                    loadImportantDates(relatedPersonId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun deleteImportantDate(relatedPersonId: java.util.UUID, dateId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val date = _uiState.value.personImportantDates.firstOrNull { it.id == dateId } ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(relatedPersonsBusy = true, relatedPersonsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteImportantDate(spaceId, currentSession.tokens.accessToken, dateId, date.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(relatedPersonsBusy = false) }
                    loadImportantDates(relatedPersonId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(relatedPersonsBusy = false, relatedPersonsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun loadPlanning() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(planningBusy = true, planningProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.PLANNING,
                resourceId = de.eimir.app.cache.PlanningResourceId,
                load = {
                    val token = currentSession.tokens.accessToken
                    PlanningSnapshot(
                        wishes = api.listWishes(spaceId, token).items,
                        plans = api.listPlans(spaceId, token).items,
                    )
                },
                serialize = { EimirJson.encodeToString(PlanningSnapshot.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(PlanningSnapshot.serializer(), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            openWishes = result.value.wishes.filter { wish ->
                                wish.status == WishStatus.OPEN
                            },
                            plans = result.value.plans,
                            planningBusy = false,
                            planningCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable -> reportPlanningFailure(operationEpoch, currentSession, throwable) }
        }
    }

    fun addWish(title: String) {
        if (title.isBlank()) return
        planningCall { api, spaceId, token -> api.createWish(spaceId, token, WishCreate(title = title)) }
    }

    fun updateWish(wishId: java.util.UUID, title: String) {
        if (title.isBlank()) return
        val wish = _uiState.value.openWishes.firstOrNull { it.id == wishId } ?: return
        planningCall { api, spaceId, token ->
            api.updateWish(spaceId, token, wishId, wish.version, WishUpdate(title = title))
        }
    }

    fun removeWish(wishId: java.util.UUID) {
        val wish = _uiState.value.openWishes.firstOrNull { it.id == wishId } ?: return
        planningCall { api, spaceId, token -> api.deleteWish(spaceId, token, wishId, wish.version) }
    }

    /**
     * Turns a wish into a plan; both survive, the wish as `PLANNED`.
     *
     * [startOn]/[startAt] let the couple give the new plan a moment in the
     * same flow that created it, so a day already known does not force a
     * second visit through the dedicated schedule sheet.
     */
    fun planWish(
        wishId: java.util.UUID,
        title: String,
        description: String,
        placeId: java.util.UUID?,
        startOn: String? = null,
        startAt: String? = null,
    ) {
        val wish = _uiState.value.openWishes.firstOrNull { it.id == wishId } ?: return
        planningCall { api, spaceId, token ->
            val response = api.planWish(
                spaceId,
                token,
                wishId,
                wish.version,
                WishToPlan(
                    description = description.takeIf { it.isNotBlank() },
                    placeId = placeId,
                    schedule = planSchedule(startOn, startAt),
                    title = title.ifBlank { wish.title },
                ),
            )
        }
    }

    /**
     * Direct plan creation (M3-D30): a plan that never started as a wish.
     *
     * [startOn]/[startAt] carry the same same-flow scheduling as [planWish].
     */
    fun createPlan(
        title: String,
        description: String,
        placeId: java.util.UUID?,
        startOn: String? = null,
        startAt: String? = null,
    ) {
        if (title.isBlank()) return
        planningCall { api, spaceId, token ->
            val plan = api.createPlan(
                spaceId,
                token,
                PlanCreate(
                    title = title,
                    description = description.trim().takeIf { it.isNotBlank() },
                    placeId = placeId,
                    schedule = planSchedule(startOn, startAt),
                ),
            )
        }
    }

    /**
     * Schedules a plan the same call just created, when the couple picked
     * both a day and a time for it before submitting.
     *
     * `PlanSchedule.plannedStart` is a moment, not a date, so a day without a
     * time is not sent — [WishToPlanSheet] and the direct plan composer only
     * offer the time picker once a day is chosen, and never treat a lone day
     * as enough to schedule from.
     */
    /** Build a schedule without inventing a wall-clock value for a lone day. */
    private fun planSchedule(startOn: String?, startAt: String?): PlanSchedule? {
        val day = startOn?.let { parseHappenedOn(it) } ?: return null
        if (startAt.isNullOrBlank()) return PlanSchedule(plannedOn = day)
        val time = runCatching { java.time.LocalTime.parse(startAt) }.getOrNull() ?: return null
        return PlanSchedule(
            plannedStart = planScheduleStart(day, time, java.time.ZoneId.systemDefault()),
        )
    }

    fun updatePlan(planId: java.util.UUID, title: String, description: String, placeId: java.util.UUID?) {
        if (title.isBlank()) return
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token ->
            api.updatePlan(
                spaceId,
                token,
                planId,
                plan.version,
                PlanUpdate(
                    title = title,
                    description = description.trim().takeIf { it.isNotBlank() },
                    placeId = placeId,
                ),
            )
        }
    }

    /**
     * `IDEA -> PLANNED`. [startOn] carries the calendar date the couple chose;
     * the selected date and time are resolved through the device's IANA
     * timezone rules for that local instant, including daylight-saving changes.
     */
    fun schedulePlan(planId: java.util.UUID, startOn: String, startAt: String?) {
        val schedule = planSchedule(startOn, startAt) ?: return
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token ->
            api.schedulePlan(spaceId, token, plan.id, plan.version, schedule)
        }
    }

    fun unschedulePlan(planId: java.util.UUID) {
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token ->
            api.unschedulePlan(spaceId, token, planId, plan.version)
        }
    }

    fun completePlan(planId: java.util.UUID, experiencedOn: String) {
        val day = parseHappenedOn(experiencedOn) ?: return
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token ->
            api.completePlan(
                spaceId,
                token,
                planId,
                plan.version,
                PlanComplete(experiencedOn = day),
            )
        }
    }

    /**
     * Sends a plan back to being a wish.
     *
     * Destructive: the wish receives nothing back from the plan, so its
     * description is gone. The screen says so before calling this.
     */
    fun returnPlanToWish(planId: java.util.UUID) {
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token ->
            api.returnPlanToWish(spaceId, token, planId, plan.version)
        }
    }

    fun deletePlan(planId: java.util.UUID) {
        val plan = _uiState.value.plans.firstOrNull { it.id == planId } ?: return
        planningCall { api, spaceId, token -> api.deletePlan(spaceId, token, planId, plan.version) }
    }

    fun clearPlanning() {
        mutate {
            it.copy(
                openWishes = emptyList(),
                plans = emptyList(),
                planningBusy = false,
                planningProblem = null,
                planningCachedAt = null,
            )
        }
    }

    /**
     * Every planning write has the same shape: do it, then re-read both lists.
     *
     * Re-reading rather than patching locally, because one transition moves two
     * resources — planning a wish changes the wish as well as creating the plan
     * — and a client that guessed at that would drift from the server.
     */
    private fun planningCall(
        block: suspend (ReferenceContract, java.util.UUID, String) -> Unit,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(planningBusy = true, planningProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { block(api, spaceId, currentSession.tokens.accessToken) }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    loadPlanning()
                }
                .onFailure { throwable -> reportPlanningFailure(operationEpoch, currentSession, throwable) }
        }
    }

    private fun reportPlanningFailure(
        operationEpoch: Long,
        currentSession: SessionView,
        throwable: Throwable,
    ) {
        if (!isCurrentSession(operationEpoch, currentSession)) return
        mutate { it.copy(planningBusy = false, planningProblem = problemFor(throwable)) }
    }

    private fun resetStoryContext() {
        memoryReadGeneration += 1
        storyRequestGeneration += 1
        discoverRequestGeneration += 1
        storyReconnectEpoch = -1
        storyCursor = null
        mutate { it.copy(storyView = StoryView.TIMELINE, storyScope = TimelineScope(), storyLoaded = false, storyLoading = false,
            storyItems = emptyList(), storyAvailableYears = emptyList(), storyHasMore = false,
            storyLoadingMore = false, storyProblem = null, storyPageFailed = false, storyCachedAt = null,
            discoverItems = emptyList(), discoverLoaded = false, discoverLoading = false,
            discoverProblem = null, discoverCachedAt = null,
            openMemory = null, memoryStatus = null) }
    }

    /** Switching modes never mutates the other mode's own scope/items/loaded range. */
    fun setStoryView(view: StoryView) {
        if (view == _uiState.value.storyView) return
        mutate { it.copy(storyView = view) }
        if (view == StoryView.DISCOVER) ensureDiscoverLoaded()
    }

    fun ensureDiscoverLoaded() {
        if (!_uiState.value.discoverLoaded && !_uiState.value.discoverLoading) refreshDiscover()
    }

    fun retryDiscover() = refreshDiscover()

    /**
     * Discover's single bounded, always-unfiltered page. It deliberately
     * reuses Timeline's own default-scope cache resource
     * ([de.eimir.app.cache.StoryTimelineResourceId]): Discover's chronology
     * *is* the unfiltered Timeline read, just presented independently of
     * whatever scope Timeline currently has applied, so it inherits the same
     * authorized offline-cache behavior for free rather than needing a
     * second cache key.
     */
    private fun refreshDiscover() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        val requestGeneration = ++discoverRequestGeneration
        mutate { it.copy(discoverLoading = true, discoverProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            val result = loadProductDetail(
                accountId = currentSession.account.id, spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.STORY,
                resourceId = de.eimir.app.cache.StoryTimelineResourceId,
                load = { api.getTimeline(spaceId, currentSession.tokens.accessToken) },
                serialize = { EimirJson.encodeToString(StoryPage.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(StoryPage.serializer(), it) },
            )
            result.onSuccess { loaded ->
                if (!isCurrentSession(operationEpoch, currentSession) || requestGeneration != discoverRequestGeneration) return@onSuccess
                mutate { it.copy(
                    discoverItems = loaded.value.items,
                    discoverLoaded = true, discoverLoading = false,
                    discoverCachedAt = loaded.refreshedAt.takeIf { _ -> loaded.fromCache }, error = null,
                ) }
            }.onFailure { failure ->
                if (isCurrentSession(operationEpoch, currentSession) && requestGeneration == discoverRequestGeneration) {
                    val denied = failure is ReferenceApiException && failure.status in setOf(401, 403, 404)
                    mutate { it.copy(discoverLoading = false, discoverProblem = problemFor(failure),
                        discoverItems = if (denied) emptyList() else it.discoverItems) }
                }
            }
        }
    }

    fun applyStoryScope(scope: TimelineScope) {
        if (scope == _uiState.value.storyScope) return
        storyCursor = null
        mutate { it.copy(storyScope = scope, storyItems = emptyList(), storyLoaded = false,
            storyHasMore = false, storyLoadingMore = false, storyCachedAt = null) }
        refreshStory()
    }

    /** A normal detail return reuses the exact loaded range and cursor. */
    fun ensureStoryLoaded() {
        if (!_uiState.value.storyLoaded && !_uiState.value.storyLoading) refreshStory()
        else if (storyReconnectEpoch != _uiState.value.reconnectEpoch) refreshStory(preserveLoadedRange = true)
    }

    fun refreshStory() = refreshStory(preserveLoadedRange = false)

    fun retryStory() {
        if (_uiState.value.storyPageFailed) loadMoreStory()
        else refreshStory(preserveLoadedRange = _uiState.value.storyItems.isNotEmpty())
    }

    private fun refreshStory(preserveLoadedRange: Boolean) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        val requestGeneration = ++storyRequestGeneration
        val scope = _uiState.value.storyScope
        val previousCount = _uiState.value.storyItems.size
        storyReconnectEpoch = _uiState.value.reconnectEpoch
        mutate { it.copy(storyLoading = true, storyLoadingMore = false, storyProblem = null, storyPageFailed = false) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            // The existing durable cache contains only the unfiltered first page.
            val firstResult = if (scope.isDefault) loadProductDetail(
                accountId = currentSession.account.id, spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.STORY,
                resourceId = de.eimir.app.cache.StoryTimelineResourceId,
                load = { api.getTimeline(spaceId, currentSession.tokens.accessToken) },
                serialize = { EimirJson.encodeToString(StoryPage.serializer(), it) },
                deserialize = { EimirJson.decodeFromString(StoryPage.serializer(), it) },
            ) else runCatching {
                de.eimir.app.cache.ProductReadResult(
                    api.getScopedTimeline(spaceId, currentSession.tokens.accessToken, scope),
                    fromCache = false, refreshedAt = java.time.Instant.now(),
                )
            }
            val result = firstResult.mapCatching { first ->
                if (!preserveLoadedRange || previousCount == 0 || first.fromCache) return@mapCatching first
                // Re-read one authoritative contiguous prefix. Appending old first-page
                // items can resurrect deletions and break the API's chronological order.
                val targetCount = previousCount + first.value.items.size
                val items = first.value.items.toMutableList()
                val seenCursors = mutableSetOf<String>()
                var page = first.value
                while (page.hasMore && items.size < targetCount) {
                    if (!isCurrentSession(operationEpoch, currentSession) || requestGeneration != storyRequestGeneration) {
                        throw kotlinx.coroutines.CancellationException("Timeline context changed")
                    }
                    val cursor = page.nextCursor ?: throw java.io.IOException("Timeline continuation missing")
                    if (!seenCursors.add(cursor) || page.items.isEmpty()) throw java.io.IOException("Timeline continuation did not advance")
                    page = api.getScopedTimeline(spaceId, currentSession.tokens.accessToken, scope, cursor)
                    items += page.items
                }
                first.copy(value = StoryPage(page.hasMore, items.distinctBy { it.toEntry().id },
                    page.nextCursor, first.value.availableYears))
            }
            result.onSuccess { loaded ->
                if (!isCurrentSession(operationEpoch, currentSession) || requestGeneration != storyRequestGeneration) return@onSuccess
                val keepCachedRange = preserveLoadedRange && previousCount > 0 && loaded.fromCache
                storyCursor = loaded.value.nextCursor.takeUnless { loaded.fromCache }
                mutate { it.copy(
                    storyItems = if (keepCachedRange) it.storyItems else loaded.value.items,
                    storyHasMore = loaded.value.hasMore && !loaded.fromCache,
                    storyAvailableYears = loaded.value.availableYears.orEmpty(),
                    storyLoaded = true, storyLoading = false,
                    storyCachedAt = loaded.refreshedAt.takeIf { _ -> loaded.fromCache }, error = null,
                ) }
            }.onFailure { failure ->
                if (isCurrentSession(operationEpoch, currentSession) && requestGeneration == storyRequestGeneration) {
                    val denied = failure is ReferenceApiException && failure.status in setOf(401, 403, 404)
                    if (denied) storyCursor = null
                    mutate { it.copy(storyLoading = false, storyProblem = problemFor(failure),
                        storyItems = if (denied) emptyList() else it.storyItems,
                        storyAvailableYears = if (denied) emptyList() else it.storyAvailableYears,
                        storyHasMore = it.storyHasMore && !denied) }
                }
            }
        }
    }

    /** Profile data is lazy: older test fakes and normal Story startup need no profile calls. */
    fun refreshProfile() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                profile = it.profile.copy(
                    loading = true,
                    busy = false,
                    status = null,
                    error = null,
                ),
            )
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { loadProfileIdentity(api, spaceId, currentSession) }
                .onSuccess { profile ->
                    if (isCurrentSession(operationEpoch, currentSession)) {
                        // loadProfileIdentity builds a fresh ProfileUiState
                        // that knows nothing about ProfilePreference; carry
                        // that part of the state forward rather than
                        // clobbering it back to defaults.
                        mutate {
                            it.copy(
                                profile = profile.copy(
                                    preferences = it.profile.preferences,
                                    preferencesBusy = it.profile.preferencesBusy,
                                    preferencesProblem = it.profile.preferencesProblem,
                                ),
                            )
                        }
                    }
                }
                .onFailure {
                    if (isCurrentSession(operationEpoch, currentSession)) {
                        mutate {
                            it.copy(
                                profile = it.profile.copy(
                                    loading = false,
                                    busy = false,
                                    status = null,
                                    error = message(R.string.profile_loading_failed),
                                ),
                            )
                        }
                    }
                }
        }
    }

    fun saveProfileDisplayName(displayName: String) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val currentProfile = _uiState.value.profile.self ?: return refreshProfile()
        if (displayName.isBlank()) {
            mutate {
                it.copy(
                    profile = it.profile.copy(
                        error = message(R.string.profile_display_name_required),
                        status = null,
                    ),
                )
            }
            return
        }
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                profile = it.profile.copy(
                    busy = true,
                    status = null,
                    error = null,
                ),
            )
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                updateProfileDisplayName(
                    api = api,
                    spaceId = spaceId,
                    session = currentSession,
                    current = currentProfile,
                    displayName = displayName,
                )
            }.onSuccess { updated ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                session = currentSession.copy(
                    account = currentSession.account.copy(displayName = updated.displayName),
                )
                mutate {
                    it.copy(
                        accountDisplayName = updated.displayName,
                        profile = it.profile.copy(
                            self = updated,
                            busy = false,
                            status = message(R.string.profile_saved),
                            error = null,
                        ),
                    )
                }
                refreshStory()
            }.onFailure {
                if (sessionEpoch == operationEpoch) profileFailure(R.string.profile_save_failed)
            }
        }
    }

    fun beginProfileAvatarSelection(): Long? = session?.let { sessionEpoch }

    fun setProfileAvatar(image: SelectedImage, selectionEpoch: Long) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val currentProfile = _uiState.value.profile.self ?: return refreshProfile()
        if (selectionEpoch != sessionEpoch) return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                profile = it.profile.copy(
                    busy = true,
                    status = message(R.string.profile_avatar_uploading),
                    error = null,
                ),
            )
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                val updated = updateProfileAvatar(
                    api = api,
                    spaceId = spaceId,
                    session = currentSession,
                    current = currentProfile,
                    image = image,
                )
                val bytes = runCatching {
                    api.readProfileAvatar(spaceId, currentSession.tokens.accessToken, currentSession.account.id)
                }.getOrNull()
                updated to bytes
            }.onSuccess { (updated, bytes) ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        profile = it.profile.copy(
                            self = updated,
                            selfAvatarBytes = bytes,
                            busy = false,
                            status = message(R.string.profile_saved),
                            error = null,
                        ),
                    )
                }
            }.onFailure {
                if (isCurrentSession(operationEpoch, currentSession)) {
                    profileFailure(R.string.profile_avatar_failed)
                }
            }
        }
    }

    fun setProfileAvatarSelectionError(throwable: Throwable, selectionEpoch: Long) {
        if (session == null || selectionEpoch != sessionEpoch) return
        mutate {
            it.copy(
                profile = it.profile.copy(
                    busy = false,
                    status = null,
                    error = message(
                        R.string.profile_avatar_failed,
                        throwable.message.orEmpty(),
                    ),
                ),
            )
        }
    }

    fun removeProfileAvatar() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val currentProfile = _uiState.value.profile.self ?: return refreshProfile()
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(profile = it.profile.copy(busy = true, status = null, error = null))
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                removeProfileAvatar(api, spaceId, currentSession, currentProfile)
            }.onSuccess { updated ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        profile = it.profile.copy(
                            self = updated,
                            selfAvatarBytes = null,
                            busy = false,
                            status = message(R.string.profile_saved),
                            error = null,
                        ),
                    )
                }
            }.onFailure {
                if (isCurrentSession(operationEpoch, currentSession)) {
                    profileFailure(R.string.profile_avatar_failed)
                }
            }
        }
    }

    /**
     * Every ProfilePreference visible to this account.
     *
     * SELF_PROFILE rows already arrive embedded on [ProfileUiState.self] and
     * [ProfileUiState.partner] via [refreshProfile]; this call exists for the
     * PRIVATE_PARTNER_NOTE rows, which the server never attaches to either
     * profile. The server applies no accountId filter, so this list also
     * contains SELF_PROFILE rows again — callers read [ProfileUiState.self]
     * and [ProfileUiState.partner] for those instead of this list.
     */
    fun loadProfilePreferences() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(profile = it.profile.copy(preferencesBusy = true, preferencesProblem = null)) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listProfilePreferences(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { preferences ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(profile = it.profile.copy(preferences = preferences, preferencesBusy = false))
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            profile = it.profile.copy(
                                preferencesBusy = false,
                                preferencesProblem = problemFor(throwable),
                            ),
                        )
                    }
                }
        }
    }

    fun addProfilePreference(
        accountId: java.util.UUID,
        visibility: ProfileVisibility,
        category: PreferenceCategory,
        topic: String,
        sentiment: PreferenceSentiment,
        value: String,
    ) {
        if (topic.isBlank() || value.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(profile = it.profile.copy(preferencesBusy = true, preferencesProblem = null)) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createProfilePreference(
                    spaceId,
                    currentSession.tokens.accessToken,
                    ProfilePreferenceCreate(
                        accountId = accountId,
                        category = category,
                        sentiment = sentiment,
                        topic = topic,
                        value = value,
                        visibility = visibility,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(profile = it.profile.copy(preferencesBusy = false)) }
                    refreshProfile()
                    loadProfilePreferences()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            profile = it.profile.copy(
                                preferencesBusy = false,
                                preferencesProblem = problemFor(throwable),
                            ),
                        )
                    }
                }
        }
    }

    fun updateProfilePreference(
        preference: ProfilePreferenceView,
        category: PreferenceCategory,
        topic: String,
        sentiment: PreferenceSentiment,
        value: String,
    ) {
        if (topic.isBlank() || value.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(profile = it.profile.copy(preferencesBusy = true, preferencesProblem = null)) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateProfilePreference(
                    spaceId,
                    currentSession.tokens.accessToken,
                    preference.id,
                    preference.version,
                    ProfilePreferenceUpdate(
                        category = category,
                        sentiment = sentiment,
                        topic = topic,
                        value = value,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(profile = it.profile.copy(preferencesBusy = false)) }
                    refreshProfile()
                    loadProfilePreferences()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            profile = it.profile.copy(
                                preferencesBusy = false,
                                preferencesProblem = problemFor(throwable),
                            ),
                        )
                    }
                }
        }
    }

    fun deleteProfilePreference(preference: ProfilePreferenceView) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(profile = it.profile.copy(preferencesBusy = true, preferencesProblem = null)) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteProfilePreference(
                    spaceId,
                    currentSession.tokens.accessToken,
                    preference.id,
                    preference.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(profile = it.profile.copy(preferencesBusy = false)) }
                    refreshProfile()
                    loadProfilePreferences()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            profile = it.profile.copy(
                                preferencesBusy = false,
                                preferencesProblem = problemFor(throwable),
                            ),
                        )
                    }
                }
        }
    }

    fun clearProfilePreferences() {
        mutate {
            it.copy(
                profile = it.profile.copy(
                    preferences = emptyList(),
                    preferencesBusy = false,
                    preferencesProblem = null,
                ),
            )
        }
    }

    /**
     * Enforces the same latitude/longitude pairing, decimal parsing, and
     * `-90..90` / `-180..180` range the server enforces (`PLACE_COORDINATE_
     * PAIR_REQUIRED` and its range contract), so a client mistake is refused
     * before the request rather than surfacing only as a 422. Delegates to
     * [de.eimir.app.place.parsePlaceCoordinates], the same predicate
     * the create/edit form uses for its own field-level feedback (#684) —
     * one coordinate-validation domain, not two.
     *
     * Returns `null` when invalid (exactly one of the two set, either
     * unparsable, or out of range); both blank is valid and yields
     * `null to null`. In normal use the UI already withholds invalid input,
     * so this remains a defensive guard rather than a reachable error path.
     */
    private fun pairedCoordinates(
        latitude: String,
        longitude: String,
    ): Pair<java.math.BigDecimal?, java.math.BigDecimal?>? {
        val result = de.eimir.app.place.parsePlaceCoordinates(latitude, longitude)
        return (result as? de.eimir.app.place.PlaceCoordinatesResult.Valid)?.let {
            it.latitude to it.longitude
        }
    }

    fun loadPlaces() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placesBusy = true, placesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.PLACE,
                resourceId = de.eimir.app.cache.PlaceListResourceId,
                load = { api.listPlaces(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(PlaceDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(PlaceDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            places = result.value,
                            placesBusy = false,
                            placesCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(placesBusy = false, placesProblem = problemFor(throwable)) }
                }
        }
    }

    fun addPlace(
        name: String,
        description: String,
        address: String,
        latitude: String,
        longitude: String,
    ) {
        if (name.isBlank()) return
        val coordinates = pairedCoordinates(latitude, longitude) ?: return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placesBusy = true, placesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createPlace(
                    spaceId,
                    currentSession.tokens.accessToken,
                    PlaceCreate(
                        name = name,
                        address = address.trim().takeIf { it.isNotBlank() },
                        description = description.trim().takeIf { it.isNotBlank() },
                        latitude = coordinates.first,
                        longitude = coordinates.second,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(placesBusy = false) }
                    loadPlaces()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(placesBusy = false, placesProblem = problemFor(throwable)) }
                }
        }
    }

    fun updatePlace(
        place: PlaceDetail,
        name: String,
        description: String,
        address: String,
        latitude: String,
        longitude: String,
    ) {
        if (name.isBlank()) return
        val coordinates = pairedCoordinates(latitude, longitude) ?: return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placesBusy = true, placesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updatePlace(
                    spaceId,
                    currentSession.tokens.accessToken,
                    place.id,
                    place.version,
                    PlaceUpdate(
                        name = name,
                        address = address.trim().takeIf { it.isNotBlank() },
                        description = description.trim().takeIf { it.isNotBlank() },
                        latitude = coordinates.first,
                        longitude = coordinates.second,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(placesBusy = false) }
                    loadPlaces()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(placesBusy = false, placesProblem = problemFor(throwable)) }
                }
        }
    }

    fun deletePlace(place: PlaceDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placesBusy = true, placesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deletePlace(spaceId, currentSession.tokens.accessToken, place.id, place.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(placesBusy = false) }
                    loadPlaces()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(placesBusy = false, placesProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearPlaces() {
        mutate {
            it.copy(places = emptyList(), placesBusy = false, placesProblem = null, placesCachedAt = null)
        }
    }

    /**
     * Loads what a place's relations screen needs: the shared Story as
     * possible targets, and which of them are already linked to [placeId].
     *
     * Reads the Story timeline rather than any place-specific endpoint for
     * the target list, because the typed-relation endpoints return only
     * linked ids, never content — a second, separately authorized read path
     * for content was deliberately not built. This is also why a private
     * HeartMoment can never appear here: the timeline itself never carries
     * one that is not the caller's own or shared.
     */
    fun loadPlaceRelations(placeId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placeRelationsBusy = true, placeRelationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                val accessToken = currentSession.tokens.accessToken
                val timeline = api.getTimeline(spaceId, accessToken)
                val linkedIds = ReferenceContract.RelationTargetKind.entries
                    .flatMap { kind -> api.listPlaceRelationTargets(spaceId, accessToken, placeId, kind) }
                    .toSet()
                timeline.items.map { it.toRelationTargetItem() } to linkedIds
            }
                .onSuccess { (targets, linkedIds) ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            placeRelationTargets = targets,
                            placeLinkedTargetIds = linkedIds,
                            placeRelationsBusy = false,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(placeRelationsBusy = false, placeRelationsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun linkPlaceRelation(
        placeId: java.util.UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: java.util.UUID,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placeRelationsBusy = true, placeRelationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.linkPlaceTarget(spaceId, currentSession.tokens.accessToken, placeId, kind, targetId)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(placeRelationsBusy = false) }
                    loadPlaceRelations(placeId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(placeRelationsBusy = false, placeRelationsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun unlinkPlaceRelation(
        placeId: java.util.UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: java.util.UUID,
    ) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(placeRelationsBusy = true, placeRelationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.unlinkPlaceTarget(spaceId, currentSession.tokens.accessToken, placeId, kind, targetId)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(placeRelationsBusy = false) }
                    loadPlaceRelations(placeId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(placeRelationsBusy = false, placeRelationsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun clearPlaceRelations() {
        mutate {
            it.copy(
                placeRelationTargets = emptyList(),
                placeLinkedTargetIds = emptySet(),
                placeRelationsBusy = false,
                placeRelationsProblem = null,
            )
        }
    }

    fun loadPrivateNotes() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateNotesBusy = true, privateNotesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProtectedList(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                ownerId = currentSession.account.id,
                kind = de.eimir.app.cache.ProtectedCacheKind.PRIVATE_NOTE,
                resourceId = de.eimir.app.cache.PrivateAreaListResourceId,
                load = { api.listPrivateNotes(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(PrivateNoteDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(PrivateNoteDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            privateNotes = result.value,
                            privateNotesBusy = false,
                            privateNotesCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(privateNotesBusy = false, privateNotesProblem = problemFor(throwable)) }
                }
        }
    }

    fun addPrivateNote(title: String, body: String, pinned: Boolean) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateNotesBusy = true, privateNotesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createPrivateNote(
                    spaceId,
                    currentSession.tokens.accessToken,
                    PrivateNoteCreate(title = title, body = body, pinned = pinned),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateNotesBusy = false) }
                    loadPrivateNotes()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(privateNotesBusy = false, privateNotesProblem = problemFor(throwable)) }
                }
        }
    }

    fun updatePrivateNote(note: PrivateNoteDetail, title: String, body: String, pinned: Boolean) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateNotesBusy = true, privateNotesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updatePrivateNote(
                    spaceId,
                    currentSession.tokens.accessToken,
                    note.id,
                    note.version,
                    PrivateNoteUpdate(title = title, body = body, pinned = pinned),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateNotesBusy = false) }
                    loadPrivateNotes()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(privateNotesBusy = false, privateNotesProblem = problemFor(throwable)) }
                }
        }
    }

    fun deletePrivateNote(note: PrivateNoteDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateNotesBusy = true, privateNotesProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deletePrivateNote(spaceId, currentSession.tokens.accessToken, note.id, note.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateNotesBusy = false) }
                    loadPrivateNotes()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(privateNotesBusy = false, privateNotesProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearPrivateNotes() {
        mutate {
            it.copy(
                privateNotes = emptyList(),
                privateNotesBusy = false,
                privateNotesProblem = null,
                privateNotesCachedAt = null,
            )
        }
    }

    fun loadGiftIdeas() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(giftIdeasBusy = true, giftIdeasProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProtectedList(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                ownerId = currentSession.account.id,
                kind = de.eimir.app.cache.ProtectedCacheKind.GIFT_IDEA,
                resourceId = de.eimir.app.cache.PrivateAreaListResourceId,
                load = { api.listGiftIdeas(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(GiftIdeaDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(GiftIdeaDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            giftIdeas = result.value,
                            giftIdeasBusy = false,
                            giftIdeasCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(giftIdeasBusy = false, giftIdeasProblem = problemFor(throwable)) }
                }
        }
    }

    fun addGiftIdea(
        title: String,
        description: String,
        occasion: String,
        recipient: String,
        priceText: String,
        url: String,
        targetOn: String,
        pinned: Boolean,
    ) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(giftIdeasBusy = true, giftIdeasProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createGiftIdea(
                    spaceId,
                    currentSession.tokens.accessToken,
                    GiftIdeaCreate(
                        title = title,
                        description = description.trim().takeIf { it.isNotBlank() },
                        occasion = occasion.trim().takeIf { it.isNotBlank() },
                        pinned = pinned,
                        priceText = priceText.trim().takeIf { it.isNotBlank() },
                        recipient = recipient.trim().takeIf { it.isNotBlank() },
                        targetOn = parseHappenedOn(targetOn),
                        url = url.trim().takeIf { it.isNotBlank() },
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(giftIdeasBusy = false) }
                    loadGiftIdeas()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(giftIdeasBusy = false, giftIdeasProblem = problemFor(throwable)) }
                }
        }
    }

    fun updateGiftIdea(
        idea: GiftIdeaDetail,
        title: String,
        description: String,
        occasion: String,
        recipient: String,
        priceText: String,
        url: String,
        targetOn: String,
        pinned: Boolean,
    ) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(giftIdeasBusy = true, giftIdeasProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateGiftIdea(
                    spaceId,
                    currentSession.tokens.accessToken,
                    idea.id,
                    idea.version,
                    GiftIdeaUpdate(
                        title = title,
                        description = description.trim().takeIf { it.isNotBlank() },
                        occasion = occasion.trim().takeIf { it.isNotBlank() },
                        pinned = pinned,
                        priceText = priceText.trim().takeIf { it.isNotBlank() },
                        recipient = recipient.trim().takeIf { it.isNotBlank() },
                        targetOn = parseHappenedOn(targetOn),
                        url = url.trim().takeIf { it.isNotBlank() },
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(giftIdeasBusy = false) }
                    loadGiftIdeas()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(giftIdeasBusy = false, giftIdeasProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * A status change alone, sent as its own partial update rather than
     * folded into [updateGiftIdea]: the server owns M3-D17's transition
     * graph and rejects an invalid one, so this client never encodes which
     * transitions are allowed — it only ever proposes a target status.
     */
    fun changeGiftIdeaStatus(idea: GiftIdeaDetail, status: GiftIdeaStatus) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(giftIdeasBusy = true, giftIdeasProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateGiftIdea(
                    spaceId,
                    currentSession.tokens.accessToken,
                    idea.id,
                    idea.version,
                    GiftIdeaUpdate(status = status),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(giftIdeasBusy = false) }
                    loadGiftIdeas()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(giftIdeasBusy = false, giftIdeasProblem = problemFor(throwable)) }
                }
        }
    }

    fun deleteGiftIdea(idea: GiftIdeaDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(giftIdeasBusy = true, giftIdeasProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteGiftIdea(spaceId, currentSession.tokens.accessToken, idea.id, idea.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(giftIdeasBusy = false) }
                    loadGiftIdeas()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(giftIdeasBusy = false, giftIdeasProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearGiftIdeas() {
        mutate {
            it.copy(
                giftIdeas = emptyList(),
                giftIdeasBusy = false,
                giftIdeasProblem = null,
                giftIdeasCachedAt = null,
            )
        }
    }

    fun loadPrivateCollections() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProtectedList(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                ownerId = currentSession.account.id,
                kind = de.eimir.app.cache.ProtectedCacheKind.PRIVATE_COLLECTION,
                resourceId = de.eimir.app.cache.PrivateAreaListResourceId,
                load = { api.listPrivateCollections(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(PrivateCollectionDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(PrivateCollectionDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            privateCollections = result.value,
                            privateCollectionsBusy = false,
                            privateCollectionsCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun addPrivateCollection(title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createPrivateCollection(
                    spaceId,
                    currentSession.tokens.accessToken,
                    PrivateCollectionCreate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun updatePrivateCollection(collection: PrivateCollectionDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updatePrivateCollection(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    collection.version,
                    PrivateCollectionUpdate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun deletePrivateCollection(collection: PrivateCollectionDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deletePrivateCollection(spaceId, currentSession.tokens.accessToken, collection.id, collection.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun addPrivateCollectionItem(collection: PrivateCollectionDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createPrivateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    PrivateCollectionItemCreate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun toggleCollectionItemCompleted(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updatePrivateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                    PrivateCollectionItemUpdate(completed = !item.completed),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun renameCollectionItem(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updatePrivateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                    PrivateCollectionItemUpdate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun deletePrivateCollectionItem(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deletePrivateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun moveCollectionItemUp(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail) {
        reorderCollectionItem(collection, item, offset = -1)
    }

    fun moveCollectionItemDown(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail) {
        reorderCollectionItem(collection, item, offset = 1)
    }

    /**
     * Swaps [item] with its neighbour [offset] positions away and sends the
     * whole resulting order. A swap always keeps the same set of ids the
     * collection already has, so it satisfies the server's exact-set order
     * contract by construction rather than by re-checking it here.
     */
    private fun reorderCollectionItem(collection: PrivateCollectionDetail, item: PrivateCollectionItemDetail, offset: Int) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        val currentOrder = collection.items.sortedBy { it.position }.map { it.id }
        val index = currentOrder.indexOf(item.id)
        val targetIndex = index + offset
        if (index < 0 || targetIndex < 0 || targetIndex >= currentOrder.size) return
        val newOrder = currentOrder.toMutableList()
        val moved = newOrder.removeAt(index)
        newOrder.add(targetIndex, moved)

        mutate { it.copy(privateCollectionsBusy = true, privateCollectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.reorderPrivateCollectionItems(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    collection.version,
                    newOrder,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(privateCollectionsBusy = false) }
                    loadPrivateCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(privateCollectionsBusy = false, privateCollectionsProblem = problemFor(throwable))
                    }
                }
        }
    }

    fun clearPrivateCollections() {
        mutate {
            it.copy(
                privateCollections = emptyList(),
                privateCollectionsBusy = false,
                privateCollectionsProblem = null,
                privateCollectionsCachedAt = null,
            )
        }
    }

    fun loadNotifications() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(notificationsBusy = true, notificationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listNotifications(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    notificationsCursor = page.nextCursor
                    mutate {
                        it.copy(
                            notifications = page.items,
                            notificationsBusy = false,
                            notificationsHasMore = page.hasMore,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(notificationsBusy = false, notificationsProblem = problemFor(throwable)) }
                }
        }
    }

    fun loadMoreNotifications() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val cursor = notificationsCursor ?: return
        if (_uiState.value.notificationsLoadingMore) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(notificationsLoadingMore = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.listNotifications(spaceId, currentSession.tokens.accessToken, cursor) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    notificationsCursor = page.nextCursor
                    mutate {
                        it.copy(
                            notifications = it.notifications + page.items,
                            notificationsHasMore = page.hasMore,
                            notificationsLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    if (isCurrentSession(operationEpoch, currentSession)) {
                        mutate { it.copy(notificationsLoadingMore = false) }
                    }
                }
        }
    }

    fun loadUnreadNotificationCount() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.getNotificationUnreadCount(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { count ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(unreadNotificationCount = count.unreadCount) }
                }
        }
    }

    fun markNotificationRead(notification: NotificationItem) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(notificationsBusy = true, notificationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.markNotificationRead(spaceId, currentSession.tokens.accessToken, notification.id)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(notificationsBusy = false) }
                    loadNotifications()
                    loadUnreadNotificationCount()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(notificationsBusy = false, notificationsProblem = problemFor(throwable)) }
                }
        }
    }

    fun markAllNotificationsRead() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(notificationsBusy = true, notificationsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.markAllNotificationsRead(spaceId, currentSession.tokens.accessToken) }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(notificationsBusy = false) }
                    loadNotifications()
                    loadUnreadNotificationCount()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(notificationsBusy = false, notificationsProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearNotifications() {
        notificationsCursor = null
        mutate {
            it.copy(
                notifications = emptyList(),
                unreadNotificationCount = 0,
                notificationsBusy = false,
                notificationsProblem = null,
                notificationsHasMore = false,
                notificationsLoadingMore = false,
            )
        }
    }

    fun loadActivity() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(activityBusy = true, activityProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.getActivity(spaceId, currentSession.tokens.accessToken) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    activityCursor = page.nextCursor
                    mutate {
                        it.copy(activity = page.items, activityBusy = false, activityHasMore = page.hasMore)
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(activityBusy = false, activityProblem = problemFor(throwable)) }
                }
        }
    }

    fun loadMoreActivity() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val cursor = activityCursor ?: return
        if (_uiState.value.activityLoadingMore) return
        val operationEpoch = sessionEpoch

        mutate { it.copy(activityLoadingMore = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.getActivity(spaceId, currentSession.tokens.accessToken, cursor) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    activityCursor = page.nextCursor
                    mutate {
                        it.copy(
                            activity = it.activity + page.items,
                            activityHasMore = page.hasMore,
                            activityLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    if (isCurrentSession(operationEpoch, currentSession)) {
                        mutate { it.copy(activityLoadingMore = false) }
                    }
                }
        }
    }

    fun clearActivity() {
        activityCursor = null
        mutate {
            it.copy(
                activity = emptyList(),
                activityBusy = false,
                activityProblem = null,
                activityHasMore = false,
                activityLoadingMore = false,
            )
        }
    }

    /** Starts a Transfer Bundle export. [refreshExport] is how the caller learns it finished. */
    fun createExport(scope: TransferScope) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(exportBusy = true, exportProblem = null, exportDownloaded = false) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.createTransferExport(spaceId, currentSession.tokens.accessToken, scope) }
                .onSuccess { export ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(export = export, exportBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(exportBusy = false, exportProblem = problemFor(throwable)) }
                }
        }
    }

    /** Re-reads the tracked export's status — assembly runs as a background job on the server. */
    fun refreshExport() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val exportId = _uiState.value.export?.id ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(exportBusy = true, exportProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.getTransferExport(spaceId, currentSession.tokens.accessToken, exportId) }
                .onSuccess { export ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(export = export, exportBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(exportBusy = false, exportProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * Streams the ready export into [sink] — a destination the caller
     * already opened (typically from a Storage Access Framework picker), so
     * this never buffers the whole archive in memory.
     *
     * `suspend` rather than fire-and-forget like every other network call
     * here: the caller's own `.use { }` around [sink] must stay open for
     * exactly as long as this call takes, not just until it is launched.
     */
    suspend fun downloadExport(sink: java.io.OutputStream) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val exportId = _uiState.value.export?.id ?: return
        val operationEpoch = sessionEpoch
        if (!isCurrentSession(operationEpoch, currentSession)) return

        mutate { it.copy(exportBusy = true, exportProblem = null) }
        runCatching { api.downloadTransferExport(spaceId, currentSession.tokens.accessToken, exportId, sink) }
            .onSuccess {
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate { it.copy(exportBusy = false, exportDownloaded = true) }
            }
            .onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                mutate { it.copy(exportBusy = false, exportProblem = problemFor(throwable)) }
            }
    }

    fun clearExport() {
        mutate { it.copy(export = null, exportBusy = false, exportProblem = null, exportDownloaded = false) }
    }

    /**
     * Uploads [archive] to stage a Transfer Bundle import. [refreshImport] is
     * how the caller learns whether it reached `READY_TO_APPLY` or `FAILED`.
     *
     * `suspend` for the same reason [downloadExport] is: the caller's own
     * `.use { }` around [archive] (typically opened from a Storage Access
     * Framework picker) must stay open for exactly as long as this call
     * takes, not just until it is launched.
     */
    suspend fun uploadImport(archiveSize: Long, archive: java.io.InputStream) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        if (!isCurrentSession(operationEpoch, currentSession)) return

        mutate { it.copy(importBusy = true, importProblem = null) }
        runCatching { api.createTransferImport(spaceId, currentSession.tokens.accessToken, archiveSize, archive) }
            .onSuccess { imported ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate { it.copy(import = imported, importBusy = false) }
            }
            .onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                mutate { it.copy(importBusy = false, importProblem = problemFor(throwable)) }
            }
    }

    /** Re-reads the tracked import's status — validation runs as a background job on the server. */
    fun refreshImport() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val importId = _uiState.value.import?.id ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(importBusy = true, importProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.getTransferImport(spaceId, currentSession.tokens.accessToken, importId) }
                .onSuccess { imported ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(import = imported, importBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(importBusy = false, importProblem = problemFor(throwable)) }
                }
        }
    }

    /**
     * Applies a validated import. The M2-D18 contract requires the client to
     * show the validated summary before this is ever called — apply is
     * explicit, never automatic once validation finishes.
     */
    fun applyImport() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val importId = _uiState.value.import?.id ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(importBusy = true, importProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.applyTransferImport(spaceId, currentSession.tokens.accessToken, importId) }
                .onSuccess { imported ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(import = imported, importBusy = false) }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(importBusy = false, importProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearImport() {
        mutate { it.copy(import = null, importBusy = false, importProblem = null) }
    }

    fun search(query: String, kind: SearchKind? = null) {
        if (query.isBlank()) {
            clearSearch()
            return
        }
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch
        val trimmed = query.trim()
        val requestGeneration = ++searchGeneration

        // The new first page owns the search identity immediately. Clearing the old
        // cursor prevents load-more from pairing Search B with Search A's cursor
        // while Search B is still in flight.
        searchCursor = null
        lastSearchQuery = trimmed
        lastSearchKind = kind
        mutate {
            it.copy(
                searchBusy = true,
                searchProblem = null,
                searchHasMore = false,
                searchLoadingMore = false,
            )
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.search(spaceId, currentSession.tokens.accessToken, trimmed, kind) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    if (!isCurrentSearch(requestGeneration, trimmed, kind)) return@onSuccess
                    searchCursor = page.nextCursor
                    mutate {
                        it.copy(
                            searchResults = page.items,
                            searchBusy = false,
                            searchHasMore = page.nextCursor != null,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    if (!isCurrentSearch(requestGeneration, trimmed, kind)) return@onFailure
                    mutate { it.copy(searchBusy = false, searchProblem = problemFor(throwable)) }
                }
        }
    }

    fun loadMoreSearch() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val cursor = searchCursor ?: return
        val query = lastSearchQuery ?: return
        val kind = lastSearchKind
        if (_uiState.value.searchLoadingMore) return
        val operationEpoch = sessionEpoch
        val requestGeneration = searchGeneration

        mutate { it.copy(searchLoadingMore = true) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching { api.search(spaceId, currentSession.tokens.accessToken, query, kind, cursor) }
                .onSuccess { page ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    if (!isCurrentSearch(requestGeneration, query, kind)) return@onSuccess
                    searchCursor = page.nextCursor
                    mutate {
                        it.copy(
                            searchResults = it.searchResults + page.items,
                            searchHasMore = page.nextCursor != null,
                            searchLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    if (
                        isCurrentSession(operationEpoch, currentSession) &&
                        isCurrentSearch(requestGeneration, query, kind)
                    ) {
                        mutate { it.copy(searchLoadingMore = false) }
                    }
                }
        }
    }

    fun clearSearch() {
        searchGeneration += 1
        searchCursor = null
        lastSearchQuery = null
        lastSearchKind = null
        mutate {
            it.copy(
                searchResults = emptyList(),
                searchBusy = false,
                searchProblem = null,
                searchHasMore = false,
                searchLoadingMore = false,
            )
        }
    }

    fun loadCollections() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.COLLECTION,
                resourceId = de.eimir.app.cache.CollectionListResourceId,
                load = { api.listCollections(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(CollectionDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(CollectionDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            collections = result.value,
                            collectionsBusy = false,
                            collectionsCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun addCollection(title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createCollection(
                    spaceId,
                    currentSession.tokens.accessToken,
                    CollectionCreate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun updateCollection(collection: CollectionDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateCollection(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    collection.version,
                    CollectionUpdate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun deleteCollection(collection: CollectionDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteCollection(spaceId, currentSession.tokens.accessToken, collection.id, collection.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun addCollectionItem(collection: CollectionDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    CollectionItemCreate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun toggleCollectionItemCompleted(collection: CollectionDetail, item: CollectionItemDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                    CollectionItemUpdate(completed = !item.completed),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun renameCollectionItem(collection: CollectionDetail, item: CollectionItemDetail, title: String) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                    CollectionItemUpdate(title = title),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun deleteCollectionItem(collection: CollectionDetail, item: CollectionItemDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteCollectionItem(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    item.id,
                    item.version,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun moveCollectionItemUp(collection: CollectionDetail, item: CollectionItemDetail) {
        reorderCollectionItem(collection, item, offset = -1)
    }

    fun moveCollectionItemDown(collection: CollectionDetail, item: CollectionItemDetail) {
        reorderCollectionItem(collection, item, offset = 1)
    }

    /** Same by-construction exact-set reasoning as [reorderCollectionItem] for PrivateCollection. */
    private fun reorderCollectionItem(collection: CollectionDetail, item: CollectionItemDetail, offset: Int) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        val currentOrder = collection.items.sortedBy { it.position }.map { it.id }
        val index = currentOrder.indexOf(item.id)
        val targetIndex = index + offset
        if (index < 0 || targetIndex < 0 || targetIndex >= currentOrder.size) return
        val newOrder = currentOrder.toMutableList()
        val moved = newOrder.removeAt(index)
        newOrder.add(targetIndex, moved)

        mutate { it.copy(collectionsBusy = true, collectionsProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.reorderCollectionItems(
                    spaceId,
                    currentSession.tokens.accessToken,
                    collection.id,
                    collection.version,
                    newOrder,
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(collectionsBusy = false) }
                    loadCollections()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(collectionsBusy = false, collectionsProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearCollections() {
        mutate {
            it.copy(
                collections = emptyList(),
                collectionsBusy = false,
                collectionsProblem = null,
                collectionsCachedAt = null,
            )
        }
    }

    fun loadChapters() {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chaptersBusy = true, chaptersProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            loadProductDetail(
                accountId = currentSession.account.id,
                spaceId = spaceId,
                kind = de.eimir.app.cache.ProductCacheKind.CHAPTER,
                resourceId = de.eimir.app.cache.ChapterListResourceId,
                load = { api.listChapters(spaceId, currentSession.tokens.accessToken).items },
                serialize = { EimirJson.encodeToString(ListSerializer(ChapterDetail.serializer()), it) },
                deserialize = { EimirJson.decodeFromString(ListSerializer(ChapterDetail.serializer()), it) },
            )
                .onSuccess { result ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            chapters = result.value,
                            chaptersBusy = false,
                            chaptersCachedAt = result.refreshedAt.takeIf { _ -> result.fromCache },
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chaptersBusy = false, chaptersProblem = problemFor(throwable)) }
                }
        }
    }

    fun addChapter(
        title: String,
        description: String,
        startOn: String,
        endOn: String,
        placeId: java.util.UUID? = null,
    ) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chaptersBusy = true, chaptersProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.createChapter(
                    spaceId,
                    currentSession.tokens.accessToken,
                    ChapterCreate(
                        title = title,
                        description = description.trim().takeIf { it.isNotBlank() },
                        startOn = parseHappenedOn(startOn),
                        endOn = parseHappenedOn(endOn),
                        placeId = placeId,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(chaptersBusy = false) }
                    loadChapters()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chaptersBusy = false, chaptersProblem = problemFor(throwable)) }
                }
        }
    }

    fun updateChapter(
        chapter: ChapterDetail,
        title: String,
        description: String,
        startOn: String,
        endOn: String,
        placeId: java.util.UUID? = null,
    ) {
        if (title.isBlank()) return
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chaptersBusy = true, chaptersProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.updateChapter(
                    spaceId,
                    currentSession.tokens.accessToken,
                    chapter.id,
                    chapter.version,
                    ChapterUpdate(
                        title = title,
                        description = description.trim().takeIf { it.isNotBlank() },
                        startOn = parseHappenedOn(startOn),
                        endOn = parseHappenedOn(endOn),
                        placeId = placeId,
                    ),
                )
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(chaptersBusy = false) }
                    loadChapters()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chaptersBusy = false, chaptersProblem = problemFor(throwable)) }
                }
        }
    }

    fun deleteChapter(chapter: ChapterDetail) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chaptersBusy = true, chaptersProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteChapter(spaceId, currentSession.tokens.accessToken, chapter.id, chapter.version)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(chaptersBusy = false) }
                    loadChapters()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chaptersBusy = false, chaptersProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearChapters() {
        mutate {
            it.copy(chapters = emptyList(), chaptersBusy = false, chaptersProblem = null, chaptersCachedAt = null)
        }
    }

    /**
     * Loads a chapter's own curated content plus every shared Story item as
     * a possible addition. Mirrors [loadPlaceRelations]'s reasoning: reads
     * the timeline rather than a content-bearing relation endpoint, which is
     * also why a private HeartMoment can never appear here.
     */
    fun loadChapterContent(chapterId: java.util.UUID) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chapterContentBusy = true, chapterContentProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                val accessToken = currentSession.tokens.accessToken
                val timeline = api.getTimeline(spaceId, accessToken)
                val candidates = timeline.items.map { it.toRelationTargetItem() }
                val content = api.getChapterContent(spaceId, accessToken, chapterId)
                val linked = content.items.mapNotNull { entry ->
                    candidates.firstOrNull { it.id == entry.targetId }
                }
                candidates to linked
            }
                .onSuccess { (candidates, linked) ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate {
                        it.copy(
                            chapterContentCandidates = candidates,
                            chapterLinkedContent = linked,
                            chapterContentBusy = false,
                        )
                    }
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chapterContentBusy = false, chapterContentProblem = problemFor(throwable)) }
                }
        }
    }

    fun linkChapterContent(chapterId: java.util.UUID, target: de.eimir.app.place.RelationTargetItem) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chapterContentBusy = true, chapterContentProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.linkChapterTarget(spaceId, currentSession.tokens.accessToken, chapterId, target.kind, target.id)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(chapterContentBusy = false) }
                    loadChapterContent(chapterId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chapterContentBusy = false, chapterContentProblem = problemFor(throwable)) }
                }
        }
    }

    fun unlinkChapterContent(chapterId: java.util.UUID, target: de.eimir.app.place.RelationTargetItem) {
        val api = contract ?: return
        val currentSession = session ?: return
        val spaceId = activeSpaceId ?: return
        val operationEpoch = sessionEpoch

        mutate { it.copy(chapterContentBusy = true, chapterContentProblem = null) }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.unlinkChapterTarget(spaceId, currentSession.tokens.accessToken, chapterId, target.kind, target.id)
            }
                .onSuccess {
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    mutate { it.copy(chapterContentBusy = false) }
                    loadChapterContent(chapterId)
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate { it.copy(chapterContentBusy = false, chapterContentProblem = problemFor(throwable)) }
                }
        }
    }

    fun clearChapterContent() {
        mutate {
            it.copy(
                chapterContentCandidates = emptyList(),
                chapterLinkedContent = emptyList(),
                chapterContentBusy = false,
                chapterContentProblem = null,
            )
        }
    }

    /**
     * The M2-D18 persistent-cache wipe. Unlike every other `clearXxx`
     * function here, this one does not touch in-memory [ReferenceUiState] —
     * it wipes the on-disk Room database, which a fresh `_uiState` value
     * (as [logout] assigns) does nothing to by itself.
     *
     * The wipe itself stays fire-and-forget, because this caller's own
     * session/state transition has no reason to wait on disk I/O. What must
     * not wait is the *decision*: a read that is still in flight would
     * otherwise finish against a cache context this transition has already
     * abandoned, so the context is ended synchronously here and only the
     * removal of rows is left to the coroutine.
     */
    private fun clearProductReadCache() {
        val cache = productReadCache ?: return
        cache.invalidateContextNow()
        viewModelScope.launch { cache.clearAll() }
    }

    fun resetAccountDeletionRecentAuthentication() {
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationCapabilities = null,
                accountDeletionRecentAuthenticationBusy = false,
                accountDeletionRecentAuthenticationProblem = null,
                accountDeletionRecentAuthenticationComplete = false,
                accountDeletionPasskeyRequest = null,
                accountDeletionOidcPending = null,
            )
        }
    }

    fun loadAccountDeletionRecentAuthentication() {
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
                accountDeletionRecentAuthenticationComplete = false,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.accountDeletionRecentAuthenticationCapabilities(currentSession.tokens.accessToken)
            }.onSuccess { capabilities ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationCapabilities = capabilities,
                        accountDeletionRecentAuthenticationBusy = false,
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun authenticateAccountDeletionPassword(password: String) {
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.accountDeletionRecentAuthenticationPassword(currentSession.tokens.accessToken, password)
            }.onSuccess {
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationBusy = false,
                        accountDeletionRecentAuthenticationComplete = true,
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun startAccountDeletionPasskey() {
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
                accountDeletionPasskeyRequest = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.startAccountDeletionRecentAuthenticationPasskey(currentSession.tokens.accessToken)
            }.onSuccess { requestJson ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationBusy = false,
                        accountDeletionPasskeyRequest = requestJson,
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun finishAccountDeletionPasskey(authenticationResponseJson: String) {
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
                accountDeletionPasskeyRequest = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.finishAccountDeletionRecentAuthenticationPasskey(
                    currentSession.tokens.accessToken,
                    authenticationResponseJson,
                )
            }.onSuccess {
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationBusy = false,
                        accountDeletionRecentAuthenticationComplete = true,
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun startAccountDeletionOidc(connectionId: String) {
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
                accountDeletionOidcPending = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.startAccountDeletionRecentAuthenticationOidc(
                    currentSession.tokens.accessToken,
                    connectionId,
                )
            }.onSuccess { started ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationBusy = false,
                        accountDeletionOidcPending = AccountDeletionOidcPending(
                            connectionId = connectionId,
                            authorizationUrl = started.authorizationUrl,
                            state = started.state,
                        ),
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun finishAccountDeletionOidc(code: String, state: String) {
        val pending = _uiState.value.accountDeletionOidcPending ?: return
        if (pending.state != state) {
            failAccountDeletionRecentAuthentication(IllegalArgumentException("OIDC state mismatch"))
            return
        }
        val api = contract as? AccountDeletionRecentAuthenticationContract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = true,
                accountDeletionRecentAuthenticationProblem = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                api.finishAccountDeletionRecentAuthenticationOidc(
                    currentSession.tokens.accessToken,
                    pending.connectionId,
                    code,
                    state,
                )
            }.onSuccess {
                if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                mutate {
                    it.copy(
                        accountDeletionRecentAuthenticationBusy = false,
                        accountDeletionRecentAuthenticationComplete = true,
                        accountDeletionOidcPending = null,
                    )
                }
            }.onFailure { throwable ->
                if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                failAccountDeletionRecentAuthentication(throwable)
            }
        }
    }

    fun failAccountDeletionRecentAuthentication(throwable: Throwable) {
        mutate {
            it.copy(
                accountDeletionRecentAuthenticationBusy = false,
                accountDeletionRecentAuthenticationProblem = problemFor(throwable),
                accountDeletionPasskeyRequest = null,
                accountDeletionOidcPending = null,
            )
        }
    }

    fun deleteOwnAccount() {
        if (_uiState.value.demoMode) return
        val api = contract ?: return configurationError()
        val currentSession = session ?: return
        val operationEpoch = sessionEpoch

        mutate {
            it.copy(
                accountDeletionBusy = true,
                accountDeletionProblem = null,
            )
        }
        viewModelScope.launch {
            if (!isCurrentSession(operationEpoch, currentSession)) return@launch
            runCatching {
                api.deleteOwnAccount(
                    currentSession.tokens.accessToken,
                    AccountDeletionRequest(
                        confirmation = AccountDeletionRequest.Confirmation.DELETE_ACCOUNT,
                    ),
                )
            }
                .onSuccess {
                    // Server acceptance belongs to the captured Account even if the UI
                    // moved to another session while the request was in flight. Remove
                    // only that Account's durable Space preference before touching UI state.
                    spaceStore.forgetAccount(currentSession.account.id)
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onSuccess
                    // The server has crossed the irreversible tombstone boundary and
                    // revoked this session. Reuse the existing logout transition to
                    // invalidate in-flight work, drafts, Room/protected caches and UI state.
                    logout()
                }
                .onFailure { throwable ->
                    if (!isCurrentSession(operationEpoch, currentSession)) return@onFailure
                    mutate {
                        it.copy(
                            accountDeletionBusy = false,
                            accountDeletionProblem = problemFor(throwable),
                        )
                    }
                }
        }
    }

    fun logout() {
        // Leaving the demo is a different exit: it also has to put the endpoint
        // back, so a later normal sign-in does not silently reach the demo.
        if (_uiState.value.demoMode) return leaveDemo()

        sessionEpoch += 1
        clearMemoryTask()
        resetStoryContext()
        storyImages.reset()
        clearHeartMoments()
        clearComments()
        closeStoryItem()
        clearProductReadCache()
        session = null
        activeSpaceId = null
        imageDrafts = emptyList()
        _uiState.value = ReferenceUiState(
            configured = config.isConfigured,
            status = message(R.string.ref_status_logged_out),
        )
        refreshInstanceAvailability()
    }

    private fun startAttachmentPreparation(
        api: ReferenceContract,
        spaceId: java.util.UUID,
        currentSession: SessionView,
        draft: ImageDraft,
    ) {
        viewModelScope.launch {
            if (!isCurrentDraft(draft.id, draft.attemptId, currentSession)) return@launch
            runCatching {
                prepareAttachment(
                    api = api,
                    spaceId = spaceId,
                    accessToken = currentSession.tokens.accessToken,
                    image = draft.image,
                    onPhase = { phase ->
                        val state = when (phase) {
                            AttachmentPreparationPhase.UPLOADING -> DraftUploadState.UPLOADING
                            AttachmentPreparationPhase.VALIDATING -> DraftUploadState.VALIDATING
                            AttachmentPreparationPhase.READY -> DraftUploadState.VALIDATING
                        }
                        updateDraft(draft.id, draft.attemptId, currentSession) {
                            it.copy(uploadState = state)
                        }
                    },
                )
            }.onSuccess { prepared ->
                updateDraft(draft.id, draft.attemptId, currentSession) {
                    it.copy(
                        uploadState = DraftUploadState.READY,
                        preparedAttachment = prepared,
                    )
                }
            }.onFailure {
                updateDraft(draft.id, draft.attemptId, currentSession) {
                    it.copy(
                        uploadState = DraftUploadState.FAILED,
                        preparedAttachment = null,
                    )
                }
            }
        }
    }

    private fun updateDraft(
        draftId: Long,
        attemptId: Long,
        currentSession: SessionView,
        update: (ImageDraft) -> ImageDraft,
    ): Boolean {
        if (!isCurrentSession(sessionEpoch, currentSession)) return false
        val index = imageDrafts.indexOfFirst { it.id == draftId && it.attemptId == attemptId }
        if (index < 0) return false
        imageDrafts = imageDrafts.toMutableList().also { drafts ->
            drafts[index] = update(drafts[index])
        }
        publishDrafts()
        return true
    }

    private fun isCurrentDraft(
        draftId: Long,
        attemptId: Long,
        currentSession: SessionView,
    ): Boolean =
        session === currentSession && imageDrafts.any { it.id == draftId && it.attemptId == attemptId }

    private fun isCurrentSession(epoch: Long, currentSession: SessionView): Boolean =
        sessionEpoch == epoch && session === currentSession

    private fun isCurrentSearch(generation: Long, query: String, kind: SearchKind?): Boolean =
        searchGeneration == generation && lastSearchQuery == query && lastSearchKind == kind

    private fun publishDrafts(
        status: UiMessage? = draftStatus(),
        error: UiMessage? = draftError(),
    ) {
        mutate {
            it.copy(
                draftImages = imageDrafts.map { draft ->
                    DraftImageUiItem(
                        id = draft.id,
                        displayName = draft.image.displayName,
                        bytes = draft.image.bytes,
                        uploadState = draft.uploadState,
                    )
                },
                status = status,
                error = error,
            )
        }
    }

    private fun draftStatus(): UiMessage? = when {
        imageDrafts.any { it.uploadState == DraftUploadState.UPLOADING } ->
            message(R.string.ref_status_images_uploading)
        imageDrafts.any { it.uploadState == DraftUploadState.VALIDATING } ->
            message(R.string.ref_status_images_validating)
        imageDrafts.isNotEmpty() && imageDrafts.all { it.uploadState == DraftUploadState.READY } ->
            message(R.string.ref_status_images_ready)
        else -> null
    }

    private fun draftError(): UiMessage? =
        if (imageDrafts.any { it.uploadState == DraftUploadState.FAILED }) {
            message(R.string.ref_error_image_upload_failed)
        } else {
            null
        }

    private fun configurationError() {
        setError(message(R.string.ref_not_configured))
    }

    private fun setError(message: UiMessage) {
        mutate { it.copy(busy = false, error = message, status = null) }
    }

    private fun failure(resourceId: Int, clearBusy: Boolean = true) {
        mutate {
            it.copy(
                busy = if (clearBusy) false else it.busy,
                error = message(resourceId),
                status = null,
            )
        }
    }

    private fun profileFailure(resourceId: Int) {
        mutate {
            it.copy(
                profile = it.profile.copy(
                    loading = false,
                    busy = false,
                    error = message(resourceId),
                    status = null,
                ),
            )
        }
    }

    private inline fun mutate(update: (ReferenceUiState) -> ReferenceUiState) {
        _uiState.value = update(_uiState.value)
    }

    /**
     * Reads one shared Story detail resource through the M2-D18 cache when
     * one is configured, or plain network-only when [productReadCache] is
     * `null` (every existing test's default, and the state before this
     * device ever configures a cache instance). Centralizing the branch here
     * keeps each of the three call sites the same shape they were before the
     * cache existed.
     */
    private suspend fun <T> loadProductDetail(
        accountId: java.util.UUID,
        spaceId: java.util.UUID,
        kind: de.eimir.app.cache.ProductCacheKind,
        resourceId: java.util.UUID,
        canPersist: (T) -> Boolean = { true },
        load: suspend () -> T,
        serialize: (T) -> String,
        deserialize: (String) -> T,
    ): Result<de.eimir.app.cache.ProductReadResult<T>> {
        val cache = productReadCache
        return if (cache != null) {
            cache.loadWithFallback(accountId, spaceId, kind, resourceId, canPersist, load, serialize, deserialize)
        } else {
            runCatching { load() }.map {
                de.eimir.app.cache.ProductReadResult(it, fromCache = false, refreshedAt = java.time.Instant.now())
            }
        }
    }

    /**
     * The `OWNER_ONLY` counterpart to [loadProductDetail], for the
     * current-user Private Area lists. [ownerId] is always the signed-in
     * account itself: the server already scopes each list to its owner, and
     * the cache namespace records that owner explicitly rather than assuming
     * it always equals [accountId], per M2-D18's Android decision.
     */
    private suspend fun <T> loadProtectedList(
        accountId: java.util.UUID,
        spaceId: java.util.UUID,
        ownerId: java.util.UUID,
        kind: de.eimir.app.cache.ProtectedCacheKind,
        resourceId: java.util.UUID,
        load: suspend () -> T,
        serialize: (T) -> String,
        deserialize: (String) -> T,
    ): Result<de.eimir.app.cache.ProductReadResult<T>> {
        val cache = productReadCache
        return if (cache != null) {
            cache.loadProtectedWithFallback(accountId, spaceId, ownerId, kind, resourceId, load, serialize, deserialize)
        } else {
            runCatching { load() }.map {
                de.eimir.app.cache.ProductReadResult(it, fromCache = false, refreshedAt = java.time.Instant.now())
            }
        }
    }

    /** Null for a blank date, which is allowed, and for an unparseable one. */
    private fun parseHappenedOn(text: String): LocalDate? =
        if (text.isBlank()) null else runCatching { LocalDate.parse(text.trim()) }.getOrNull()

    /**
     * The same shape [problemForStatus] gives a server 422 — a client-side
     * check failing (a blank required field, an unparseable date) is not
     * meaningfully different from the server rejecting it, and reusing the
     * existing validation copy means one message rather than a second,
     * competing one.
     */
    private fun validationProblem(): UiProblem = UiProblem(
        kind = UiStateKind.Error,
        titleRes = R.string.state_validation_title,
        bodyRes = R.string.state_validation_body,
        retryable = false,
    )

    private fun message(resourceId: Int, vararg args: Any): UiMessage =
        UiMessage(resourceId = resourceId, args = args.toList())

    private fun postSnackbar(resourceId: Int, vararg args: Any) {
        mutate { it.copy(snackbarMessage = SnackbarMessage(nextSnackbarId++, message(resourceId, *args))) }
    }

    /**
     * Clears a shown Snackbar event, guarded by [id] so a late clear can
     * never wipe a newer message posted in between — the shell calls this
     * once it has actually displayed [ReferenceUiState.snackbarMessage].
     */
    fun snackbarShown(id: Long) {
        mutate { if (it.snackbarMessage?.id == id) it.copy(snackbarMessage = null) else it }
    }
}
