package de.eimir.app.reference

import de.eimir.app.demo.DemoPersona
import java.util.UUID
import eimir.api.models.AccountDeletionAccepted
import eimir.api.models.AccountDeletionRequest
import eimir.api.models.AccountMembershipView
import eimir.api.models.AttachmentDetail
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.ActivityPage
import eimir.api.models.AttachmentUploadCreate
import eimir.api.models.CommentCreate
import eimir.api.models.CommentDetail
import eimir.api.models.CommentPage
import eimir.api.models.CollectionCreate
import eimir.api.models.CollectionDetail
import eimir.api.models.CollectionItemCreate
import eimir.api.models.CollectionItemDetail
import eimir.api.models.CollectionItemUpdate
import eimir.api.models.CollectionPage
import eimir.api.models.ChapterCreate
import eimir.api.models.ChapterDetail
import eimir.api.models.ChapterPage
import eimir.api.models.ChapterContent
import eimir.api.models.ChapterUpdate
import eimir.api.models.CollectionUpdate
import eimir.api.models.CommentUpdate
import eimir.api.models.ContentVisibility
import eimir.api.models.HeartMomentCreate
import eimir.api.models.HeartMomentDetail
import eimir.api.models.HeartMomentPage
import eimir.api.models.HeartMomentUpdate
import eimir.api.models.HeartMomentVisibilityChange
import eimir.api.models.InstanceAccessStatus
import eimir.api.models.DashboardView
import eimir.api.models.AcceptRequest
import eimir.api.models.IssuedInvitationView
import eimir.api.models.InvitationView
import eimir.api.models.MembershipView
import eimir.api.models.MemoryAttachmentSet
import eimir.api.models.PartnerView
import eimir.api.models.ImportantDateFields
import eimir.api.models.ImportantDateView
import eimir.api.models.RelatedPersonDeletePolicy
import eimir.api.models.RelatedPersonFields
import eimir.api.models.RelatedPersonView
import eimir.api.models.SearchKind
import eimir.api.models.SearchPage
import eimir.api.models.TransferExportDetail
import eimir.api.models.TransferImportDetail
import eimir.api.models.TransferScope
import eimir.api.models.ThinkingOfYouAccepted
import eimir.api.models.ThinkingOfYouCreate
import eimir.api.models.MemoryCreate
import eimir.api.models.MemoryDetail
import eimir.api.models.MemoryUpdate
import eimir.api.models.MilestoneCreate
import eimir.api.models.MilestoneDetail
import eimir.api.models.MilestoneUpdate
import eimir.api.models.NotificationItem
import eimir.api.models.NotificationPage
import eimir.api.models.NotificationUnreadCount
import eimir.api.models.NotificationsReadAllResult
import eimir.api.models.PartnerProfileView
import eimir.api.models.PlaceCreate
import eimir.api.models.PlaceDetail
import eimir.api.models.PlacePage
import eimir.api.models.PlaceUpdate
import eimir.api.models.GiftIdeaCreate
import eimir.api.models.GiftIdeaDetail
import eimir.api.models.GiftIdeaPage
import eimir.api.models.GiftIdeaUpdate
import eimir.api.models.PrivateCollectionCreate
import eimir.api.models.PrivateCollectionDetail
import eimir.api.models.PrivateCollectionItemCreate
import eimir.api.models.PrivateCollectionItemDetail
import eimir.api.models.PrivateCollectionItemUpdate
import eimir.api.models.PrivateCollectionPage
import eimir.api.models.PrivateCollectionUpdate
import eimir.api.models.PrivateNoteCreate
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNotePage
import eimir.api.models.PrivateNoteUpdate
import eimir.api.models.ProfilePreferenceCreate
import eimir.api.models.ProfilePreferenceUpdate
import eimir.api.models.ProfilePreferenceView
import eimir.api.models.PlanComplete
import eimir.api.models.PlanCreate
import eimir.api.models.PlanDetail
import eimir.api.models.PlanPage
import eimir.api.models.PlanReturnToWishResponse
import eimir.api.models.PlanSchedule
import eimir.api.models.PlanUpdate
import eimir.api.models.ProfileIdentityUpdate
import eimir.api.models.ReadDescriptor
import eimir.api.models.SessionView
import eimir.api.models.SpaceMembershipExitView
import eimir.api.models.SpaceView
import eimir.api.models.StoryPage
import eimir.api.models.UploadDescriptor
import eimir.api.models.WishCreate
import eimir.api.models.WishDetail
import eimir.api.models.WishPage
import eimir.api.models.WishToPlan
import eimir.api.models.WishToPlanResponse
import eimir.api.models.WishUpdate

data class SelectedImage(
    val bytes: ByteArray,
    val displayName: String,
    val mimeType: String,
)

data class ReferenceFlowResult(
    val memory: MemoryDetail,
    val story: StoryPage,
    val imageBytes: ByteArray?,
)

interface ReferenceContract {
    suspend fun getInstanceStatus(): InstanceAccessStatus

    suspend fun signIn(email: String, password: String): SessionView

    /**
     * Exchanges a one-time entry proof for a session.
     *
     * The demo entry issues such a proof, so the demo never needs a password
     * that could be embedded in the app.
     */
    suspend fun consumeMagicLink(token: String): SessionView

    /**
     * The Spaces this account may open, as the server sees them.
     *
     * The active Space is derived from this rather than configured, because a
     * demo persona's Space is not known at build time.
     */
    suspend fun listMemberships(accessToken: String): List<AccountMembershipView>

    /** Ends only the current Account's Membership in [spaceId]. */
    suspend fun leaveSpace(
        spaceId: UUID,
        accessToken: String,
    ): SpaceMembershipExitView

    /** Deletes only the Account represented by [accessToken]. */
    suspend fun deleteOwnAccount(
        accessToken: String,
        request: AccountDeletionRequest,
    ): AccountDeletionAccepted

    /**
     * Requests a one-time entry proof for a canonical demo persona.
     *
     * `POST /api/v1/demo/entry` is deliberately absent from the OpenAPI
     * contract: it is a facility of the isolated demo deployment, not a
     * supported authentication method for a normal installation. It is
     * therefore declared here by hand instead of through the generated client,
     * and it is the only call in this client that is.
     */
    suspend fun createDemoEntry(baseUrl: String, persona: DemoPersona): String

    suspend fun createMemory(spaceId: UUID, accessToken: String, memory: MemoryCreate): MemoryDetail

    suspend fun getMemory(spaceId: UUID, accessToken: String, memoryId: UUID): MemoryDetail

    /**
     * Changes a memory.
     *
     * [ifMatch] is the version the change was written against. The server
     * answers 409 when the partner changed the memory in the meantime, which is
     * the point: without it the later write would silently overwrite the
     * earlier one.
     */
    suspend fun updateMemory(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
        ifMatch: Int,
        update: MemoryUpdate,
    ): MemoryDetail

    suspend fun deleteMemory(spaceId: UUID, accessToken: String, memoryId: UUID, ifMatch: Int)

    suspend fun createMilestone(
        spaceId: UUID,
        accessToken: String,
        fields: MilestoneCreate,
    ): MilestoneDetail

    suspend fun getMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
    ): MilestoneDetail

    suspend fun updateMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
        ifMatch: Int,
        update: MilestoneUpdate,
    ): MilestoneDetail

    suspend fun deleteMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
        ifMatch: Int,
    )

    suspend fun getHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
    ): HeartMomentDetail

    /**
     * What a comment hangs on.
     *
     * The contract has a separate list and create path per kind, but one update
     * and one delete for all of them, so only reading and writing need to know
     * the parent.
     */
    enum class CommentParent(val segment: String) {
        MEMORY("memories"),
        MILESTONE("milestones"),
        HEART_MOMENT("heart-moments"),
    }

    suspend fun listComments(
        spaceId: UUID,
        accessToken: String,
        parent: CommentParent,
        parentId: UUID,
        cursor: String? = null,
    ): CommentPage

    suspend fun createComment(
        spaceId: UUID,
        accessToken: String,
        parent: CommentParent,
        parentId: UUID,
        comment: CommentCreate,
    ): CommentDetail

    /**
     * Comments are addressed by their own id, not through their parent: the
     * contract has one update and one delete for all three kinds.
     */
    suspend fun updateComment(
        spaceId: UUID,
        accessToken: String,
        commentId: UUID,
        ifMatch: Int,
        update: CommentUpdate,
    ): CommentDetail

    suspend fun deleteComment(
        spaceId: UUID,
        accessToken: String,
        commentId: UUID,
        ifMatch: Int,
    )

    /**
     * The HeartMoments this account may read.
     *
     * The server narrows this to what the caller is authorised for, and the
     * [visibility] filter narrows it further — it never widens it. Asking for
     * `PRIVATE` therefore returns the caller's own private moments, and an
     * empty page for anyone else's, rather than a refusal that would confirm
     * that someone else's exist.
     */
    suspend fun listHeartMoments(
        spaceId: UUID,
        accessToken: String,
        visibility: ContentVisibility? = null,
    ): HeartMomentPage

    suspend fun createHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMoment: HeartMomentCreate,
    ): HeartMomentDetail

    suspend fun updateHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
        update: HeartMomentUpdate,
    ): HeartMomentDetail

    /**
     * Changes who may see a HeartMoment.
     *
     * Its own call, not a field on [updateHeartMoment], because the server
     * makes it one: `SHARED -> PRIVATE` deletes the moment's comments in the
     * same transaction, and going back does not restore them. That must never
     * happen as a side effect of editing text.
     */
    suspend fun changeHeartMomentVisibility(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
        change: HeartMomentVisibilityChange,
    ): HeartMomentDetail

    suspend fun deleteHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
    )

    suspend fun createAttachmentUpload(
        spaceId: UUID,
        accessToken: String,
        request: AttachmentUploadCreate,
    ): UploadDescriptor

    suspend fun uploadAttachmentBytes(accessToken: String, descriptor: UploadDescriptor, image: SelectedImage)

    suspend fun finalizeAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID): AttachmentDetail

    suspend fun getAttachment(spaceId: UUID, accessToken: String, attachmentId: UUID): AttachmentDetail

    suspend fun deleteAttachment(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
        ifMatch: Int,
    ) {
        unsupportedProfileOperation()
    }

    suspend fun replaceMemoryAttachments(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
        ifMatch: Int,
        attachments: MemoryAttachmentSet,
    ): MemoryDetail

    suspend fun listWishes(spaceId: UUID, accessToken: String): WishPage

    suspend fun createWish(spaceId: UUID, accessToken: String, wish: WishCreate): WishDetail

    suspend fun updateWish(
        spaceId: UUID,
        accessToken: String,
        wishId: UUID,
        ifMatch: Int,
        update: WishUpdate,
    ): WishDetail

    suspend fun deleteWish(spaceId: UUID, accessToken: String, wishId: UUID, ifMatch: Int)

    /**
     * Turns a wish into a plan.
     *
     * Both survive: the wish moves `OPEN -> PLANNED` and goes on recording that
     * someone wanted this, while the plan records the doing. The answer carries
     * both, which is why it is not simply a plan.
     */
    suspend fun planWish(
        spaceId: UUID,
        accessToken: String,
        wishId: UUID,
        ifMatch: Int,
        conversion: WishToPlan,
    ): WishToPlanResponse

    suspend fun listPlans(spaceId: UUID, accessToken: String): PlanPage

    /** Direct plan creation (M3-D30): a plan that never started as a wish. */
    suspend fun createPlan(spaceId: UUID, accessToken: String, fields: PlanCreate): PlanDetail

    suspend fun updatePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        update: PlanUpdate,
    ): PlanDetail

    suspend fun deletePlan(spaceId: UUID, accessToken: String, planId: UUID, ifMatch: Int)

    /** `IDEA -> PLANNED`. */
    suspend fun schedulePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        schedule: PlanSchedule,
    ): PlanDetail

    /** `PLANNED -> IDEA`, keeping the plan. */
    suspend fun unschedulePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
    ): PlanDetail

    /** `-> COMPLETED`, with the day it actually happened. */
    suspend fun completePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        completion: PlanComplete,
    ): PlanDetail

    /**
     * All the way back: the plan is removed and its wish reopens.
     *
     * The wish deliberately receives nothing back from the plan (M3-D03), so
     * whatever was written into the plan is lost. The screen says so first.
     */
    suspend fun returnPlanToWish(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
    ): PlanReturnToWishResponse

    suspend fun getDashboard(spaceId: UUID, accessToken: String): DashboardView

    /**
     * Sends the partner a sign that you are thinking of them.
     *
     * [gesture] carries a client request id, so the same tap sent twice is one
     * gesture rather than two — which matters, because a tap that looks like it
     * failed is exactly the tap someone repeats. The server answers 429 when it
     * has been sent too often; that is a product state, not a failure.
     */
    suspend fun sendThinkingOfYou(
        spaceId: UUID,
        accessToken: String,
        gesture: ThinkingOfYouCreate,
    ): ThinkingOfYouAccepted

    /**
     * One page of the Story.
     *
     * [cursor] continues from a previous page's `nextCursor`. Without paging a
     * couple simply stops seeing their own history past the first page, which
     * is the kind of loss nothing on screen would announce.
     */
    /**
     * Accepts an invitation and returns the membership it created.
     *
     * Requires an authenticated caller: an invited account must keep its
     * session to reach this at all, which is why this slice exists.
     */
    suspend fun acceptInvitation(accessToken: String, token: String): MembershipView

    suspend fun listInvitations(spaceId: UUID, accessToken: String): List<InvitationView>

    /**
     * Issues a new invitation.
     *
     * The token in the response is the only time it is ever readable; the
     * contract does not expose it again through [listInvitations].
     */
    suspend fun createInvitation(spaceId: UUID, accessToken: String): IssuedInvitationView

    suspend fun revokeInvitation(spaceId: UUID, accessToken: String, invitationId: UUID)

    suspend fun listRelatedPersons(spaceId: UUID, accessToken: String): List<RelatedPersonView>

    suspend fun createRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        fields: RelatedPersonFields,
    ): RelatedPersonView

    /** The contract replaces every field, so callers send the whole record. */
    suspend fun updateRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        personId: UUID,
        ifMatch: Int,
        fields: RelatedPersonFields,
    ): RelatedPersonView

    /**
     * Deletes a person, per an explicit, named policy — never a default.
     *
     * `preserve` keeps their linked ImportantDates and detaches them; `cascade`
     * removes both. The choice must reach here already made; nothing about
     * what the deletion affects is queried beforehand, per #65.
     */
    suspend fun deleteRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        personId: UUID,
        deletePolicy: RelatedPersonDeletePolicy,
        ifMatch: Int,
    )

    suspend fun listImportantDates(
        spaceId: UUID,
        accessToken: String,
        relatedPersonId: UUID?,
    ): List<ImportantDateView>

    suspend fun createImportantDate(
        spaceId: UUID,
        accessToken: String,
        fields: ImportantDateFields,
    ): ImportantDateView

    suspend fun updateImportantDate(
        spaceId: UUID,
        accessToken: String,
        dateId: UUID,
        ifMatch: Int,
        fields: ImportantDateFields,
    ): ImportantDateView

    suspend fun deleteImportantDate(
        spaceId: UUID,
        accessToken: String,
        dateId: UUID,
        ifMatch: Int,
    )

    suspend fun getTimeline(
        spaceId: UUID,
        accessToken: String,
        cursor: String? = null,
    ): StoryPage

    /** Existing server filters; default-only adapters cannot silently ignore a requested scope. */
    suspend fun getScopedTimeline(
        spaceId: UUID,
        accessToken: String,
        scope: de.eimir.app.story.TimelineScope,
        cursor: String? = null,
    ): StoryPage {
        require(scope.isDefault) { "This adapter does not support scoped Timeline reads" }
        return getTimeline(spaceId, accessToken, cursor)
    }

    suspend fun createReadAccess(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
        request: AttachmentReadRequest,
    ): ReadDescriptor

    suspend fun readImageBytes(accessToken: String, descriptor: ReadDescriptor): ByteArray

    /** Profile APIs are optional for older test fakes and loaded lazily by the UI. */
    suspend fun getSpace(spaceId: UUID, accessToken: String): SpaceView = unsupportedProfileOperation()

    suspend fun getProfile(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
    ): PartnerProfileView = unsupportedProfileOperation()

    suspend fun updateProfileIdentity(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
        ifMatch: Int,
        update: ProfileIdentityUpdate,
    ): PartnerProfileView = unsupportedProfileOperation()

    /**
     * Explicit avatar removal is separate because the generated nullable DTO is
     * encoded with `explicitNulls = false`; the wire contract still requires a
     * literal JSON null to distinguish removal from omission.
     */
    suspend fun removeProfileAvatar(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
        ifMatch: Int,
    ): PartnerProfileView = unsupportedProfileOperation()

    suspend fun readProfileAvatar(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
    ): ByteArray = unsupportedProfileOperation()

    /**
     * Every ProfilePreference visible to the caller: the space's SELF_PROFILE
     * rows and the caller's own PRIVATE_PARTNER_NOTE rows about the partner.
     * The server applies no accountId filter; distinguishing "mine",
     * "partner's", and "my private note" is the caller's job.
     */
    suspend fun listProfilePreferences(spaceId: UUID, accessToken: String): List<ProfilePreferenceView>

    suspend fun createProfilePreference(
        spaceId: UUID,
        accessToken: String,
        fields: ProfilePreferenceCreate,
    ): ProfilePreferenceView

    /** The contract replaces every field, so callers send the whole record. */
    suspend fun updateProfilePreference(
        spaceId: UUID,
        accessToken: String,
        preferenceId: UUID,
        ifMatch: Int,
        fields: ProfilePreferenceUpdate,
    ): ProfilePreferenceView

    suspend fun deleteProfilePreference(
        spaceId: UUID,
        accessToken: String,
        preferenceId: UUID,
        ifMatch: Int,
    )

    suspend fun listPlaces(spaceId: UUID, accessToken: String, cursor: String? = null): PlacePage

    suspend fun createPlace(spaceId: UUID, accessToken: String, fields: PlaceCreate): PlaceDetail

    /** The contract accepts a partial correction; unset fields are left unchanged. */
    suspend fun updatePlace(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        ifMatch: Int,
        fields: PlaceUpdate,
    ): PlaceDetail

    suspend fun deletePlace(spaceId: UUID, accessToken: String, placeId: UUID, ifMatch: Int)

    /**
     * A Story item kind, with the URL segment its typed-relation endpoints
     * use. Mirrors [CommentParent] deliberately rather than reusing it: the
     * two happen to share the same three segments today, but coupling
     * Place's relation endpoints to a type named for comments would be the
     * wrong abstraction to reach for.
     */
    enum class RelationTargetKind(val segment: String) {
        MEMORY("memories"),
        MILESTONE("milestones"),
        HEART_MOMENT("heart-moments"),
    }

    /**
     * The Story items already linked to a place, as IDs only — the server
     * deliberately does not return their content here (a second, separately
     * authorized read path), so the caller resolves labels itself from
     * whatever Story items it can already read, e.g. via [getTimeline].
     */
    suspend fun listPlaceRelationTargets(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: RelationTargetKind,
    ): List<UUID>

    suspend fun linkPlaceTarget(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: RelationTargetKind,
        targetId: UUID,
    )

    suspend fun unlinkPlaceTarget(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: RelationTargetKind,
        targetId: UUID,
    )

    /**
     * Owner-only: the server filters to what the caller owns, so the path
     * carries no accountId and the response never contains another
     * account's PrivateNote.
     */
    suspend fun listPrivateNotes(spaceId: UUID, accessToken: String, cursor: String? = null): PrivateNotePage

    suspend fun createPrivateNote(spaceId: UUID, accessToken: String, fields: PrivateNoteCreate): PrivateNoteDetail

    /** The contract accepts a partial correction; unset fields are left unchanged. */
    suspend fun updatePrivateNote(
        spaceId: UUID,
        accessToken: String,
        noteId: UUID,
        ifMatch: Int,
        fields: PrivateNoteUpdate,
    ): PrivateNoteDetail

    suspend fun deletePrivateNote(spaceId: UUID, accessToken: String, noteId: UUID, ifMatch: Int)

    /** Owner-only, same server-side filtering as [listPrivateNotes]. */
    suspend fun listGiftIdeas(spaceId: UUID, accessToken: String, cursor: String? = null): GiftIdeaPage

    suspend fun createGiftIdea(spaceId: UUID, accessToken: String, fields: GiftIdeaCreate): GiftIdeaDetail

    /**
     * The contract accepts a partial correction; unset fields are left
     * unchanged. A status change is the same operation with only [fields]'s
     * `status` set — the server validates the transition (M3-D17's
     * transition graph), so this client never encodes that graph itself.
     */
    suspend fun updateGiftIdea(
        spaceId: UUID,
        accessToken: String,
        giftIdeaId: UUID,
        ifMatch: Int,
        fields: GiftIdeaUpdate,
    ): GiftIdeaDetail

    suspend fun deleteGiftIdea(spaceId: UUID, accessToken: String, giftIdeaId: UUID, ifMatch: Int)

    /**
     * Owner-only, same server-side filtering as [listPrivateNotes]. Items
     * are not listed separately: [PrivateCollectionDetail.items] already
     * carries them, in server order.
     */
    suspend fun listPrivateCollections(spaceId: UUID, accessToken: String, cursor: String? = null): PrivateCollectionPage

    suspend fun createPrivateCollection(
        spaceId: UUID,
        accessToken: String,
        fields: PrivateCollectionCreate,
    ): PrivateCollectionDetail

    suspend fun updatePrivateCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        fields: PrivateCollectionUpdate,
    ): PrivateCollectionDetail

    suspend fun deletePrivateCollection(spaceId: UUID, accessToken: String, collectionId: UUID, ifMatch: Int)

    suspend fun createPrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        fields: PrivateCollectionItemCreate,
    ): PrivateCollectionItemDetail

    suspend fun updatePrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
        fields: PrivateCollectionItemUpdate,
    ): PrivateCollectionItemDetail

    suspend fun deletePrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
    )

    /**
     * The server accepts only an exact permutation of the collection's
     * current item ids — not a subset, not an addition. [itemIds] must be
     * built from the collection's own current items, never invented.
     */
    suspend fun reorderPrivateCollectionItems(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        itemIds: List<UUID>,
    ): PrivateCollectionDetail

    suspend fun listNotifications(spaceId: UUID, accessToken: String, cursor: String? = null): NotificationPage

    suspend fun getNotificationUnreadCount(spaceId: UUID, accessToken: String): NotificationUnreadCount

    suspend fun markNotificationRead(
        spaceId: UUID,
        accessToken: String,
        notificationId: UUID,
    ): NotificationItem

    suspend fun markAllNotificationsRead(spaceId: UUID, accessToken: String): NotificationsReadAllResult

    suspend fun getActivity(spaceId: UUID, accessToken: String, cursor: String? = null): ActivityPage

    /** Searches shared Space content plus the caller's own private content. */
    suspend fun search(
        spaceId: UUID,
        accessToken: String,
        query: String,
        kind: SearchKind? = null,
        cursor: String? = null,
    ): SearchPage

    suspend fun listCollections(spaceId: UUID, accessToken: String, cursor: String? = null): CollectionPage

    suspend fun createCollection(spaceId: UUID, accessToken: String, fields: CollectionCreate): CollectionDetail

    suspend fun updateCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        fields: CollectionUpdate,
    ): CollectionDetail

    suspend fun deleteCollection(spaceId: UUID, accessToken: String, collectionId: UUID, ifMatch: Int)

    suspend fun createCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        fields: CollectionItemCreate,
    ): CollectionItemDetail

    suspend fun updateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
        fields: CollectionItemUpdate,
    ): CollectionItemDetail

    suspend fun deleteCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
    )

    /** Same exact-set contract as [reorderPrivateCollectionItems]. */
    suspend fun reorderCollectionItems(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        itemIds: List<UUID>,
    ): CollectionDetail

    suspend fun listChapters(spaceId: UUID, accessToken: String, cursor: String? = null): ChapterPage

    suspend fun createChapter(spaceId: UUID, accessToken: String, fields: ChapterCreate): ChapterDetail

    /** The contract accepts a partial correction; unset fields are left unchanged. */
    suspend fun updateChapter(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        ifMatch: Int,
        fields: ChapterUpdate,
    ): ChapterDetail

    suspend fun deleteChapter(spaceId: UUID, accessToken: String, chapterId: UUID, ifMatch: Int)

    /**
     * The chapter's own curated content, in the server's display order.
     * A read-only derived view of the typed relations below — there is no
     * manual relation position, so this client never reorders it.
     */
    suspend fun getChapterContent(spaceId: UUID, accessToken: String, chapterId: UUID): ChapterContent

    /** Same [RelationTargetKind] and privacy shape as the Place relation endpoints. */
    suspend fun linkChapterTarget(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        kind: RelationTargetKind,
        targetId: UUID,
    )

    suspend fun unlinkChapterTarget(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        kind: RelationTargetKind,
        targetId: UUID,
    )

    /**
     * Starts the M2-D17/S6 Transfer Bundle export. Assembly runs as a
     * background job on the server; the returned descriptor's `status`
     * starts `QUEUED`, never `READY` — [getTransferExport] is how a caller
     * learns it finished.
     */
    suspend fun createTransferExport(spaceId: UUID, accessToken: String, scope: TransferScope): TransferExportDetail

    suspend fun getTransferExport(spaceId: UUID, accessToken: String, exportId: UUID): TransferExportDetail

    /**
     * Streams the ready export's archive into [sink] rather than returning
     * it as a `ByteArray`: the server allows archives up to 512MB, too large
     * to safely hold as one in-memory allocation on a phone.
     */
    suspend fun downloadTransferExport(
        spaceId: UUID,
        accessToken: String,
        exportId: UUID,
        sink: java.io.OutputStream,
    )

    /**
     * Uploads [archive] to stage a Transfer Bundle import. Validation runs as
     * a background job; the returned descriptor's `status` starts `QUEUED` —
     * [getTransferImport] is how a caller learns whether it reached
     * `READY_TO_APPLY` or `FAILED`.
     *
     * [archive] is streamed rather than buffered, the same reasoning as
     * [downloadTransferExport] but in the other direction: the server's
     * 512MB limit applies here too.
     */
    suspend fun createTransferImport(
        spaceId: UUID,
        accessToken: String,
        archiveSize: Long,
        archive: java.io.InputStream,
    ): TransferImportDetail

    suspend fun getTransferImport(spaceId: UUID, accessToken: String, importId: UUID): TransferImportDetail

    /**
     * Applies a validated import. The M2-D18 contract requires the client to
     * show the validated summary first — apply is explicit, never automatic
     * once validation finishes.
     */
    suspend fun applyTransferImport(spaceId: UUID, accessToken: String, importId: UUID): TransferImportDetail
}

private fun unsupportedProfileOperation(): Nothing =
    throw UnsupportedOperationException("This ReferenceContract fake does not implement profile identity.")
