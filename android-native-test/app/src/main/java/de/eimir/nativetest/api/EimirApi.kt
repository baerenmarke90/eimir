package de.eimir.nativetest.api

import eimir.api.models.AcceptRequest
import eimir.api.models.AccountMembershipView
import eimir.api.models.AccountView
import eimir.api.models.ActivityPage
import eimir.api.models.AttachmentDetail
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.AttachmentUploadCreate
import eimir.api.models.CommentCreate
import eimir.api.models.CommentDetail
import eimir.api.models.CommentPage
import eimir.api.models.CommentUpdate
import eimir.api.models.DashboardView
import eimir.api.models.DiscoverSelection
import eimir.api.models.EmailRequest
import eimir.api.models.HeartMomentDetail
import eimir.api.models.InstanceAccessStatus
import eimir.api.models.MagicLinkConsumeRequest
import eimir.api.models.MemoryAttachmentSet
import eimir.api.models.MemoryCreate
import eimir.api.models.MemoryDetail
import eimir.api.models.MemoryUpdate
import eimir.api.models.MembershipView
import eimir.api.models.MilestoneDetail
import eimir.api.models.NotificationItem
import eimir.api.models.NotificationPage
import eimir.api.models.NotificationUnreadCount
import eimir.api.models.PartnerPresenceView
import eimir.api.models.PartnerProfileView
import eimir.api.models.PhotoLocationPreference
import eimir.api.models.PhotoLocationPreferenceUpdate
import eimir.api.models.PlaceCreate
import eimir.api.models.PlaceDetail
import eimir.api.models.PlacePage
import eimir.api.models.PlaceUpdate
import eimir.api.models.PlanComplete
import eimir.api.models.PlanCreate
import eimir.api.models.PlanDetail
import eimir.api.models.PlanPage
import eimir.api.models.PlanReturnToWishResponse
import eimir.api.models.PlanSchedule
import eimir.api.models.PlanUpdate
import eimir.api.models.PrivateNoteCreate
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNotePage
import eimir.api.models.PrivateNoteUpdate
import eimir.api.models.ReadDescriptor
import eimir.api.models.RefreshRequest
import eimir.api.models.RelatedPersonView
import eimir.api.models.SearchPage
import eimir.api.models.SessionView
import eimir.api.models.SharedPhotoPage
import eimir.api.models.SignupConsumeRequest
import eimir.api.models.SignupSessionView
import eimir.api.models.SpaceEntitlementView
import eimir.api.models.SpaceProfileView
import eimir.api.models.SpaceView
import eimir.api.models.StoryPage
import eimir.api.models.ThinkingOfYouAccepted
import eimir.api.models.ThinkingOfYouCreate
import eimir.api.models.TokenOnlyRequest
import eimir.api.models.TokenView
import eimir.api.models.UploadDescriptor
import eimir.api.models.WishCreate
import eimir.api.models.WishDetail
import eimir.api.models.WishPage
import eimir.api.models.WishToPlan
import eimir.api.models.WishToPlanResponse
import eimir.api.models.WishUpdate
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The subset of the versioned REST contract this client uses.
 *
 * Request and response bodies are the models generated from
 * `backend/openapi.json`; this interface only binds them to paths. Writes to
 * versioned resources always send `If-Match`, and creates send an
 * `Idempotency-Key` that is reused for a retry of the same logical submission.
 */
interface EimirApi {
    // ---- Instance and identity -------------------------------------------------
    @GET("api/v1/instance/status")
    suspend fun instanceStatus(): InstanceAccessStatus

    @POST("api/v1/auth/magic-link/request")
    suspend fun requestMagicLink(@Body body: EmailRequest)

    @POST("api/v1/auth/magic-link/consume")
    suspend fun consumeMagicLink(@Body body: MagicLinkConsumeRequest): SessionView

    @POST("api/v1/auth/signup/consume")
    suspend fun consumeSignup(@Body body: SignupConsumeRequest): SignupSessionView

    @POST("api/v1/auth/email/verification/confirm")
    suspend fun confirmEmailVerification(@Body body: TokenOnlyRequest)

    @POST("api/v1/invitations/accept")
    suspend fun acceptInvitation(@Body body: AcceptRequest): MembershipView

    @GET("api/v1/auth/me")
    suspend fun me(): AccountView

    @GET("api/v1/auth/memberships")
    suspend fun memberships(): List<AccountMembershipView>

    @GET("api/v1/account/photo-location-preference")
    suspend fun photoLocationPreference(): PhotoLocationPreference

    @PUT("api/v1/account/photo-location-preference")
    suspend fun updatePhotoLocationPreference(
        @Header("If-Match") ifMatch: String,
        @Body body: PhotoLocationPreferenceUpdate,
    ): PhotoLocationPreference

    // ---- Space and Today ------------------------------------------------------
    @GET("api/v1/spaces/{spaceId}")
    suspend fun space(@Path("spaceId") spaceId: String): SpaceView

    @GET("api/v1/spaces/{spaceId}/profile")
    suspend fun spaceProfile(@Path("spaceId") spaceId: String): SpaceProfileView

    @GET("api/v1/spaces/{spaceId}/profiles/{accountId}")
    suspend fun personProfile(@Path("spaceId") spaceId: String, @Path("accountId") accountId: String): PartnerProfileView

    @GET("api/v1/spaces/{spaceId}/entitlements")
    suspend fun entitlements(@Path("spaceId") spaceId: String): SpaceEntitlementView

    @GET("api/v1/spaces/{spaceId}/dashboard")
    suspend fun dashboard(@Path("spaceId") spaceId: String): DashboardView

    @GET("api/v1/spaces/{spaceId}/presence")
    suspend fun presence(@Path("spaceId") spaceId: String): PartnerPresenceView

    @POST("api/v1/spaces/{spaceId}/presence")
    suspend fun touchPresence(@Path("spaceId") spaceId: String): PartnerPresenceView

    @POST("api/v1/spaces/{spaceId}/thinking-of-you")
    suspend fun thinkingOfYou(@Path("spaceId") spaceId: String, @Body body: ThinkingOfYouCreate): ThinkingOfYouAccepted

    @GET("api/v1/spaces/{spaceId}/notifications")
    suspend fun notifications(
        @Path("spaceId") spaceId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 30,
    ): NotificationPage

    @GET("api/v1/spaces/{spaceId}/notifications/unread-count")
    suspend fun unreadNotifications(@Path("spaceId") spaceId: String): NotificationUnreadCount

    @POST("api/v1/spaces/{spaceId}/notifications/{notificationId}/read")
    suspend fun markNotificationRead(
        @Path("spaceId") spaceId: String,
        @Path("notificationId") notificationId: String,
    ): NotificationItem

    @POST("api/v1/spaces/{spaceId}/notifications/read-all")
    suspend fun markAllNotificationsRead(@Path("spaceId") spaceId: String): JsonObject

    @GET("api/v1/spaces/{spaceId}/activity")
    suspend fun activity(
        @Path("spaceId") spaceId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 30,
    ): ActivityPage

    @GET("api/v1/spaces/{spaceId}/search")
    suspend fun search(
        @Path("spaceId") spaceId: String,
        @Query("q") query: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 30,
    ): SearchPage

    // ---- Moments ----------------------------------------------------------------
    @GET("api/v1/spaces/{spaceId}/timeline")
    suspend fun timeline(
        @Path("spaceId") spaceId: String,
        @Query("type") types: List<String>? = null,
        @Query("year") year: Int? = null,
        @Query("order") order: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 30,
    ): StoryPage

    @GET("api/v1/spaces/{spaceId}/discover")
    suspend fun discover(@Path("spaceId") spaceId: String): DiscoverSelection

    @GET("api/v1/spaces/{spaceId}/photos")
    suspend fun photos(
        @Path("spaceId") spaceId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 60,
    ): SharedPhotoPage

    @GET("api/v1/spaces/{spaceId}/memories/{memoryId}")
    suspend fun memory(@Path("spaceId") spaceId: String, @Path("memoryId") memoryId: String): MemoryDetail

    @POST("api/v1/spaces/{spaceId}/memories")
    suspend fun createMemory(
        @Path("spaceId") spaceId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: MemoryCreate,
    ): MemoryDetail

    @PATCH("api/v1/spaces/{spaceId}/memories/{memoryId}")
    suspend fun updateMemory(
        @Path("spaceId") spaceId: String,
        @Path("memoryId") memoryId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: MemoryUpdate,
    ): MemoryDetail

    @DELETE("api/v1/spaces/{spaceId}/memories/{memoryId}")
    suspend fun deleteMemory(
        @Path("spaceId") spaceId: String,
        @Path("memoryId") memoryId: String,
        @Header("If-Match") ifMatch: String,
    )

    @PUT("api/v1/spaces/{spaceId}/memories/{memoryId}/attachments")
    suspend fun replaceMemoryAttachments(
        @Path("spaceId") spaceId: String,
        @Path("memoryId") memoryId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: MemoryAttachmentSet,
    ): MemoryDetail

    @GET("api/v1/spaces/{spaceId}/memories/{memoryId}/comments")
    suspend fun memoryComments(
        @Path("spaceId") spaceId: String,
        @Path("memoryId") memoryId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): CommentPage

    @POST("api/v1/spaces/{spaceId}/memories/{memoryId}/comments")
    suspend fun createMemoryComment(
        @Path("spaceId") spaceId: String,
        @Path("memoryId") memoryId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: CommentCreate,
    ): CommentDetail

    @GET("api/v1/spaces/{spaceId}/heart-moments/{id}")
    suspend fun heartMoment(@Path("spaceId") spaceId: String, @Path("id") id: String): HeartMomentDetail

    @GET("api/v1/spaces/{spaceId}/heart-moments/{id}/comments")
    suspend fun heartMomentComments(
        @Path("spaceId") spaceId: String,
        @Path("id") id: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): CommentPage

    @POST("api/v1/spaces/{spaceId}/heart-moments/{id}/comments")
    suspend fun createHeartMomentComment(
        @Path("spaceId") spaceId: String,
        @Path("id") id: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: CommentCreate,
    ): CommentDetail

    @GET("api/v1/spaces/{spaceId}/milestones/{id}")
    suspend fun milestone(@Path("spaceId") spaceId: String, @Path("id") id: String): MilestoneDetail

    @GET("api/v1/spaces/{spaceId}/milestones/{id}/comments")
    suspend fun milestoneComments(
        @Path("spaceId") spaceId: String,
        @Path("id") id: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): CommentPage

    @POST("api/v1/spaces/{spaceId}/milestones/{id}/comments")
    suspend fun createMilestoneComment(
        @Path("spaceId") spaceId: String,
        @Path("id") id: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: CommentCreate,
    ): CommentDetail

    @PATCH("api/v1/spaces/{spaceId}/comments/{commentId}")
    suspend fun updateComment(
        @Path("spaceId") spaceId: String,
        @Path("commentId") commentId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: CommentUpdate,
    ): CommentDetail

    @DELETE("api/v1/spaces/{spaceId}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("spaceId") spaceId: String,
        @Path("commentId") commentId: String,
        @Header("If-Match") ifMatch: String,
    )

    @GET("api/v1/spaces/{spaceId}/moments/{kind}/{targetId}/places")
    suspend fun momentPlaces(
        @Path("spaceId") spaceId: String,
        @Path("kind") kind: String,
        @Path("targetId") targetId: String,
    ): PlacePage

    // ---- Attachments --------------------------------------------------------------
    @POST("api/v1/spaces/{spaceId}/attachments")
    suspend fun createAttachmentUpload(
        @Path("spaceId") spaceId: String,
        @Body body: AttachmentUploadCreate,
    ): UploadDescriptor

    @GET("api/v1/spaces/{spaceId}/attachments/{attachmentId}")
    suspend fun attachment(@Path("spaceId") spaceId: String, @Path("attachmentId") attachmentId: String): AttachmentDetail

    @POST("api/v1/spaces/{spaceId}/attachments/{attachmentId}/finalize")
    suspend fun finalizeAttachment(
        @Path("spaceId") spaceId: String,
        @Path("attachmentId") attachmentId: String,
        @Body body: JsonObject = JsonObject(emptyMap()),
    ): AttachmentDetail

    @DELETE("api/v1/spaces/{spaceId}/attachments/{attachmentId}")
    suspend fun deleteAttachment(
        @Path("spaceId") spaceId: String,
        @Path("attachmentId") attachmentId: String,
        @Header("If-Match") ifMatch: String,
    )

    @POST("api/v1/spaces/{spaceId}/attachments/{attachmentId}/read-access")
    suspend fun attachmentReadAccess(
        @Path("spaceId") spaceId: String,
        @Path("attachmentId") attachmentId: String,
        @Body body: AttachmentReadRequest,
    ): ReadDescriptor

    // ---- Planning -------------------------------------------------------------------
    @GET("api/v1/spaces/{spaceId}/plans")
    suspend fun plans(
        @Path("spaceId") spaceId: String,
        @Query("status") status: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 100,
    ): PlanPage

    @GET("api/v1/spaces/{spaceId}/plans/{planId}")
    suspend fun plan(@Path("spaceId") spaceId: String, @Path("planId") planId: String): PlanDetail

    @POST("api/v1/spaces/{spaceId}/plans")
    suspend fun createPlan(
        @Path("spaceId") spaceId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: PlanCreate,
    ): PlanDetail

    @PATCH("api/v1/spaces/{spaceId}/plans/{planId}")
    suspend fun updatePlan(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: PlanUpdate,
    ): PlanDetail

    @DELETE("api/v1/spaces/{spaceId}/plans/{planId}")
    suspend fun deletePlan(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
    )

    @POST("api/v1/spaces/{spaceId}/plans/{planId}/schedule")
    suspend fun schedulePlan(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: PlanSchedule,
    ): PlanDetail

    @POST("api/v1/spaces/{spaceId}/plans/{planId}/unschedule")
    suspend fun unschedulePlan(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
    ): PlanDetail

    @POST("api/v1/spaces/{spaceId}/plans/{planId}/complete")
    suspend fun completePlan(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: PlanComplete,
    ): PlanDetail

    @POST("api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish")
    suspend fun returnPlanToWish(
        @Path("spaceId") spaceId: String,
        @Path("planId") planId: String,
        @Header("If-Match") ifMatch: String,
    ): PlanReturnToWishResponse

    @GET("api/v1/spaces/{spaceId}/wishes")
    suspend fun wishes(
        @Path("spaceId") spaceId: String,
        @Query("status") status: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 100,
    ): WishPage

    @GET("api/v1/spaces/{spaceId}/wishes/{wishId}")
    suspend fun wish(@Path("spaceId") spaceId: String, @Path("wishId") wishId: String): WishDetail

    @POST("api/v1/spaces/{spaceId}/wishes")
    suspend fun createWish(
        @Path("spaceId") spaceId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: WishCreate,
    ): WishDetail

    @PATCH("api/v1/spaces/{spaceId}/wishes/{wishId}")
    suspend fun updateWish(
        @Path("spaceId") spaceId: String,
        @Path("wishId") wishId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: WishUpdate,
    ): WishDetail

    @DELETE("api/v1/spaces/{spaceId}/wishes/{wishId}")
    suspend fun deleteWish(
        @Path("spaceId") spaceId: String,
        @Path("wishId") wishId: String,
        @Header("If-Match") ifMatch: String,
    )

    @POST("api/v1/spaces/{spaceId}/wishes/{wishId}/plan")
    suspend fun planWish(
        @Path("spaceId") spaceId: String,
        @Path("wishId") wishId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: WishToPlan,
    ): WishToPlanResponse

    @POST("api/v1/spaces/{spaceId}/wishes/{wishId}/complete")
    suspend fun completeWish(
        @Path("spaceId") spaceId: String,
        @Path("wishId") wishId: String,
        @Header("If-Match") ifMatch: String,
    ): WishDetail

    // ---- Places, people and private area ----------------------------------------------
    @GET("api/v1/spaces/{spaceId}/places")
    suspend fun places(
        @Path("spaceId") spaceId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 100,
    ): PlacePage

    @GET("api/v1/spaces/{spaceId}/places/{placeId}")
    suspend fun place(@Path("spaceId") spaceId: String, @Path("placeId") placeId: String): PlaceDetail

    @POST("api/v1/spaces/{spaceId}/places")
    suspend fun createPlace(@Path("spaceId") spaceId: String, @Body body: PlaceCreate): PlaceDetail

    @PATCH("api/v1/spaces/{spaceId}/places/{placeId}")
    suspend fun updatePlace(
        @Path("spaceId") spaceId: String,
        @Path("placeId") placeId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: PlaceUpdate,
    ): PlaceDetail

    @DELETE("api/v1/spaces/{spaceId}/places/{placeId}")
    suspend fun deletePlace(
        @Path("spaceId") spaceId: String,
        @Path("placeId") placeId: String,
        @Header("If-Match") ifMatch: String,
    )

    @GET("api/v1/spaces/{spaceId}/related-persons")
    suspend fun relatedPersons(@Path("spaceId") spaceId: String): List<RelatedPersonView>

    @GET("api/v1/spaces/{spaceId}/private/notes")
    suspend fun privateNotes(
        @Path("spaceId") spaceId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 100,
    ): PrivateNotePage

    @GET("api/v1/spaces/{spaceId}/private/notes/{noteId}")
    suspend fun privateNote(@Path("spaceId") spaceId: String, @Path("noteId") noteId: String): PrivateNoteDetail

    @POST("api/v1/spaces/{spaceId}/private/notes")
    suspend fun createPrivateNote(@Path("spaceId") spaceId: String, @Body body: PrivateNoteCreate): PrivateNoteDetail

    @PATCH("api/v1/spaces/{spaceId}/private/notes/{noteId}")
    suspend fun updatePrivateNote(
        @Path("spaceId") spaceId: String,
        @Path("noteId") noteId: String,
        @Header("If-Match") ifMatch: String,
        @Body body: PrivateNoteUpdate,
    ): PrivateNoteDetail

    @DELETE("api/v1/spaces/{spaceId}/private/notes/{noteId}")
    suspend fun deletePrivateNote(
        @Path("spaceId") spaceId: String,
        @Path("noteId") noteId: String,
        @Header("If-Match") ifMatch: String,
    )
}

/** The two session calls run on a client without the refreshing authenticator. */
interface SessionApi {
    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenView

    @POST("api/v1/auth/sign-out")
    suspend fun signOut(@Header("Authorization") authorization: String)
}
