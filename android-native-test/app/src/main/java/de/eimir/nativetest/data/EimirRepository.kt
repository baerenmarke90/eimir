package de.eimir.nativetest.data

import de.eimir.nativetest.api.EimirApi
import de.eimir.nativetest.auth.SessionManager
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppException
import de.eimir.nativetest.core.attempt
import eimir.api.models.CommentCreate
import eimir.api.models.CommentDetail
import eimir.api.models.CommentPage
import eimir.api.models.CommentUpdate
import eimir.api.models.DashboardView
import eimir.api.models.HeartMomentDetail
import eimir.api.models.MemoryAttachmentEntry
import eimir.api.models.MemoryAttachmentSet
import eimir.api.models.MemoryCreate
import eimir.api.models.MemoryDetail
import eimir.api.models.MemoryUpdate
import eimir.api.models.MilestoneDetail
import eimir.api.models.PhotoLocationPreference
import eimir.api.models.PhotoLocationPreferenceUpdate
import eimir.api.models.PlaceDetail
import eimir.api.models.PlanComplete
import eimir.api.models.PlanCreate
import eimir.api.models.PlanDetail
import eimir.api.models.PlanSchedule
import eimir.api.models.PlanUpdate
import eimir.api.models.PrivateNoteCreate
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNoteUpdate
import eimir.api.models.StoryPage
import eimir.api.models.ThinkingOfYouCreate
import eimir.api.models.WishCreate
import eimir.api.models.WishDetail
import eimir.api.models.WishToPlan
import eimir.api.models.WishUpdate
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Something the server confirmed changing; screens that show it refresh. */
sealed interface Change {
    data class Memory(val id: String, val deleted: Boolean = false) : Change
    data object Planning : Change
    data class Comments(val targetId: String) : Change
    data object Places : Change
    data object PrivateNotes : Change
    data object Notifications : Change
    data object Settings : Change
}

class ChangeBus {
    private val _events = MutableSharedFlow<Change>(extraBufferCapacity = 32)
    val events: SharedFlow<Change> = _events.asSharedFlow()
    fun emit(change: Change) {
        _events.tryEmit(change)
    }
}

/** Kind of commentable moment; maps to the backend's three comment collections. */
enum class MomentKind(val pathSegment: String) { MEMORY("memories"), HEART_MOMENT("heart-moments"), MILESTONE("milestones") }

/**
 * The single data access point for screens.
 *
 * It holds no business rules: authorization, visibility and entitlements are
 * decided by the backend. It only binds calls to the active Space, keeps a
 * small in-memory projection cache for instant detail display, and announces
 * confirmed changes. Nothing is persisted, and [clear] runs on sign-out and
 * on every Space change so no projection can cross a login or Space.
 */
class EimirRepository(
    private val api: EimirApi,
    private val sessions: SessionManager,
    private val changes: ChangeBus,
) {
    private val memoryProjections = object : LinkedHashMap<String, MemoryDetail>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, MemoryDetail>?) = size > 40
    }

    val spaceId: String
        get() = sessions.session?.activeSpaceId ?: throw AppException(AppError.Unavailable)

    val accountId: String
        get() = sessions.session?.accountId ?: throw AppException(AppError.SessionEnded)

    val loginId: String get() = sessions.session?.loginId.orEmpty()

    fun clear() = synchronized(memoryProjections) { memoryProjections.clear() }

    fun cachedMemory(id: String): MemoryDetail? = synchronized(memoryProjections) { memoryProjections[id] }

    private fun remember(memory: MemoryDetail): MemoryDetail {
        synchronized(memoryProjections) { memoryProjections[memory.id.toString()] = memory }
        return memory
    }

    // ---- Today --------------------------------------------------------------------
    suspend fun dashboard(): Result<DashboardView> = attempt { api.dashboard(spaceId) }
    suspend fun space() = attempt { api.space(spaceId) }
    suspend fun spaceProfile() = attempt { api.spaceProfile(spaceId) }
    suspend fun presence() = attempt { api.presence(spaceId) }
    suspend fun touchPresence() = attempt { api.touchPresence(spaceId) }
    suspend fun thinkingOfYou(requestId: UUID) = attempt { api.thinkingOfYou(spaceId, ThinkingOfYouCreate(requestId)) }
    suspend fun unreadNotifications() = attempt { api.unreadNotifications(spaceId).unreadCount }
    suspend fun notifications(cursor: String?) = attempt { api.notifications(spaceId, cursor) }
    suspend fun markNotificationRead(id: String) = attempt {
        api.markNotificationRead(spaceId, id).also { changes.emit(Change.Notifications) }
    }
    suspend fun markAllNotificationsRead() = attempt {
        api.markAllNotificationsRead(spaceId)
        changes.emit(Change.Notifications)
    }
    suspend fun activity(cursor: String?) = attempt { api.activity(spaceId, cursor) }
    suspend fun search(query: String) = attempt { api.search(spaceId, query) }
    suspend fun entitlements() = attempt { api.entitlements(spaceId) }

    // ---- Moments ------------------------------------------------------------------
    suspend fun timeline(types: List<String>?, year: Int?, ascending: Boolean, cursor: String?): Result<StoryPage> =
        attempt { api.timeline(spaceId, types?.takeIf { it.isNotEmpty() }, year, if (ascending) "ASC" else "DESC", cursor) }

    suspend fun discover() = attempt { api.discover(spaceId) }
    suspend fun photos(cursor: String?) = attempt { api.photos(spaceId, cursor) }

    suspend fun memory(id: String): Result<MemoryDetail> = attempt { remember(api.memory(spaceId, id)) }

    suspend fun createMemory(idempotencyKey: String, body: MemoryCreate): Result<MemoryDetail> =
        attempt { remember(api.createMemory(spaceId, idempotencyKey, body)) }

    suspend fun updateMemory(memory: MemoryDetail, body: MemoryUpdate): Result<MemoryDetail> = attempt {
        remember(api.updateMemory(spaceId, memory.id.toString(), memory.version.toString(), body))
    }

    /**
     * Binds the ordered attachment list. On a lost response the caller retries
     * with [reconcile], which re-reads the Memory first so a confirmed bind is
     * never applied twice and another person's newer edit is never overwritten.
     */
    suspend fun bindMemoryAttachments(
        memory: MemoryDetail,
        attachments: List<Pair<UUID, Boolean>>,
        reconcile: Boolean = false,
    ): Result<MemoryDetail> = attempt {
        var current = memory
        if (reconcile) {
            current = api.memory(spaceId, memory.id.toString())
            val bound = current.attachments.sortedBy { it.position }
            val matches = bound.map { it.id } == attachments.map { it.first } &&
                bound.map { it.isSensitive == true } == attachments.map { it.second }
            if (matches) return@attempt remember(current).also { changes.emit(Change.Memory(it.id.toString())) }
            if (current.version != memory.version) throw AppException(AppError.Conflict)
        }
        val entries = attachments.mapIndexed { index, (id, sensitive) ->
            MemoryAttachmentEntry(attachmentId = id, position = index, isSensitive = sensitive)
        }
        remember(api.replaceMemoryAttachments(spaceId, current.id.toString(), current.version.toString(), MemoryAttachmentSet(entries)))
            .also { changes.emit(Change.Memory(it.id.toString())) }
    }

    suspend fun deleteMemory(memory: MemoryDetail) = attempt {
        api.deleteMemory(spaceId, memory.id.toString(), memory.version.toString())
        synchronized(memoryProjections) { memoryProjections.remove(memory.id.toString()) }
        changes.emit(Change.Memory(memory.id.toString(), deleted = true))
    }

    fun announceMemory(id: String) = changes.emit(Change.Memory(id))

    suspend fun heartMoment(id: String): Result<HeartMomentDetail> = attempt { api.heartMoment(spaceId, id) }
    suspend fun milestone(id: String): Result<MilestoneDetail> = attempt { api.milestone(spaceId, id) }

    suspend fun comments(kind: MomentKind, id: String, cursor: String? = null): Result<CommentPage> = attempt {
        when (kind) {
            MomentKind.MEMORY -> api.memoryComments(spaceId, id, cursor)
            MomentKind.HEART_MOMENT -> api.heartMomentComments(spaceId, id, cursor)
            MomentKind.MILESTONE -> api.milestoneComments(spaceId, id, cursor)
        }
    }

    suspend fun addComment(kind: MomentKind, id: String, idempotencyKey: String, body: String): Result<CommentDetail> = attempt {
        val payload = CommentCreate(body)
        when (kind) {
            MomentKind.MEMORY -> api.createMemoryComment(spaceId, id, idempotencyKey, payload)
            MomentKind.HEART_MOMENT -> api.createHeartMomentComment(spaceId, id, idempotencyKey, payload)
            MomentKind.MILESTONE -> api.createMilestoneComment(spaceId, id, idempotencyKey, payload)
        }.also { changes.emit(Change.Comments(id)) }
    }

    suspend fun editComment(comment: CommentDetail, body: String, targetId: String) = attempt {
        api.updateComment(spaceId, comment.id.toString(), comment.version.toString(), CommentUpdate(body))
            .also { changes.emit(Change.Comments(targetId)) }
    }

    suspend fun deleteComment(comment: CommentDetail, targetId: String) = attempt {
        api.deleteComment(spaceId, comment.id.toString(), comment.version.toString())
        changes.emit(Change.Comments(targetId))
    }

    /** Photo places exist for Memories and heart moments only (contract pattern `memories|heart-moments`). */
    suspend fun momentPlaces(kind: MomentKind, id: String) = attempt {
        if (kind == MomentKind.MILESTONE) emptyList() else api.momentPlaces(spaceId, kind.pathSegment, id).items
    }

    // ---- Planning -------------------------------------------------------------------
    suspend fun plans() = attempt { api.plans(spaceId).items }
    suspend fun wishes() = attempt { api.wishes(spaceId).items }
    suspend fun plan(id: String) = attempt { api.plan(spaceId, id) }
    suspend fun wish(id: String) = attempt { api.wish(spaceId, id) }

    suspend fun createPlan(idempotencyKey: String, body: PlanCreate) =
        attempt { api.createPlan(spaceId, idempotencyKey, body).also { changes.emit(Change.Planning) } }

    suspend fun updatePlan(plan: PlanDetail, body: PlanUpdate) =
        attempt { api.updatePlan(spaceId, plan.id.toString(), plan.version.toString(), body).also { changes.emit(Change.Planning) } }

    suspend fun schedulePlan(plan: PlanDetail, schedule: PlanSchedule) =
        attempt { api.schedulePlan(spaceId, plan.id.toString(), plan.version.toString(), schedule).also { changes.emit(Change.Planning) } }

    suspend fun unschedulePlan(plan: PlanDetail) =
        attempt { api.unschedulePlan(spaceId, plan.id.toString(), plan.version.toString()).also { changes.emit(Change.Planning) } }

    suspend fun completePlan(plan: PlanDetail, on: LocalDate) =
        attempt { api.completePlan(spaceId, plan.id.toString(), plan.version.toString(), PlanComplete(on)).also { changes.emit(Change.Planning) } }

    suspend fun returnPlanToWish(plan: PlanDetail) =
        attempt { api.returnPlanToWish(spaceId, plan.id.toString(), plan.version.toString()).also { changes.emit(Change.Planning) } }

    suspend fun deletePlan(plan: PlanDetail) =
        attempt { api.deletePlan(spaceId, plan.id.toString(), plan.version.toString()).also { changes.emit(Change.Planning) } }

    suspend fun createWish(idempotencyKey: String, title: String) =
        attempt { api.createWish(spaceId, idempotencyKey, WishCreate(title)).also { changes.emit(Change.Planning) } }

    suspend fun updateWish(wish: WishDetail, title: String) =
        attempt { api.updateWish(spaceId, wish.id.toString(), wish.version.toString(), WishUpdate(title)).also { changes.emit(Change.Planning) } }

    suspend fun planWish(wish: WishDetail, body: WishToPlan) =
        attempt { api.planWish(spaceId, wish.id.toString(), wish.version.toString(), body).also { changes.emit(Change.Planning) } }

    suspend fun completeWish(wish: WishDetail) =
        attempt { api.completeWish(spaceId, wish.id.toString(), wish.version.toString()).also { changes.emit(Change.Planning) } }

    suspend fun deleteWish(wish: WishDetail) =
        attempt { api.deleteWish(spaceId, wish.id.toString(), wish.version.toString()).also { changes.emit(Change.Planning) } }

    // ---- Places, people, private area, account -------------------------------------
    suspend fun places() = attempt { api.places(spaceId).items }
    suspend fun place(id: String) = attempt { api.place(spaceId, id) }
    suspend fun deletePlace(place: PlaceDetail) =
        attempt { api.deletePlace(spaceId, place.id.toString(), place.version.toString()).also { changes.emit(Change.Places) } }

    suspend fun relatedPersons() = attempt { api.relatedPersons(spaceId) }

    suspend fun privateNotes() = attempt { api.privateNotes(spaceId).items }
    suspend fun privateNote(id: String) = attempt { api.privateNote(spaceId, id) }
    suspend fun createPrivateNote(title: String, body: String) =
        attempt { api.createPrivateNote(spaceId, PrivateNoteCreate(body = body, title = title)).also { changes.emit(Change.PrivateNotes) } }

    suspend fun updatePrivateNote(note: PrivateNoteDetail, title: String, body: String, pinned: Boolean = note.pinned) = attempt {
        api.updatePrivateNote(spaceId, note.id.toString(), note.version.toString(), PrivateNoteUpdate(body = body, pinned = pinned, title = title))
            .also { changes.emit(Change.PrivateNotes) }
    }

    suspend fun deletePrivateNote(note: PrivateNoteDetail) =
        attempt { api.deletePrivateNote(spaceId, note.id.toString(), note.version.toString()).also { changes.emit(Change.PrivateNotes) } }

    suspend fun personProfile(accountId: String) = attempt { api.personProfile(spaceId, accountId) }

    suspend fun photoLocationPreference(): Result<PhotoLocationPreference> = attempt { api.photoLocationPreference() }

    suspend fun setPhotoLocationPreference(current: PhotoLocationPreference, enabled: Boolean) = attempt {
        api.updatePhotoLocationPreference(current.version.toString(), PhotoLocationPreferenceUpdate(enabled))
            .also { changes.emit(Change.Settings) }
    }
}
