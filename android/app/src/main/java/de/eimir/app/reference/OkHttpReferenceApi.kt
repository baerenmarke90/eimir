package de.eimir.app.reference

import de.eimir.app.connectivity.ConnectivityTracker
import de.eimir.app.demo.DemoPersona
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.source
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
import eimir.api.models.CollectionOrder
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
import eimir.api.models.MagicLinkConsumeRequest
import eimir.api.models.DashboardView
import eimir.api.models.AcceptRequest
import eimir.api.models.IssuedInvitationView
import eimir.api.models.InvitationView
import eimir.api.models.MembershipView
import eimir.api.models.ImportantDateFields
import eimir.api.models.ImportantDateView
import eimir.api.models.MemoryAttachmentSet
import eimir.api.models.RelatedPersonDeletePolicy
import eimir.api.models.RelatedPersonFields
import eimir.api.models.RelatedPersonView
import eimir.api.models.SearchKind
import eimir.api.models.SearchPage
import eimir.api.models.ThinkingOfYouAccepted
import eimir.api.models.ThinkingOfYouCreate
import eimir.api.models.TransferExportCreate
import eimir.api.models.TransferExportDetail
import eimir.api.models.TransferImportDetail
import eimir.api.models.TransferScope
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
import eimir.api.models.PrivateCollectionOrder
import eimir.api.models.PrivateCollectionPage
import eimir.api.models.PrivateCollectionUpdate
import eimir.api.models.PrivateNoteCreate
import eimir.api.models.PrivateNoteDetail
import eimir.api.models.PrivateNotePage
import eimir.api.models.PrivateNoteUpdate
import eimir.api.models.RelationTargets
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
import eimir.api.models.ProblemDetails
import eimir.api.models.ProfileIdentityUpdate
import eimir.api.models.ReadDescriptor
import eimir.api.models.SessionView
import eimir.api.models.SignInRequest
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

/** The demo entry response. It is not part of the generated contract. */
@Serializable
private data class DemoEntryPayload(val token: String)

/**
 * A failed API call.
 *
 * The HTTP status is carried alongside the ProblemDetails code because the two
 * answer different questions: the code identifies the domain reason, the status
 * decides which system state the user sees. Dropping the status made
 * permission, conflict and rate-limit indistinguishable.
 */
class ReferenceApiException(
    val code: String?,
    override val message: String,
    val status: Int? = null,
) : RuntimeException(message)

/**
 * Appends a cursor, encoded, or nothing at all.
 *
 * A cursor is opaque and server-issued; it is passed back exactly as received
 * rather than parsed or rebuilt.
 */
private fun cursorQuery(cursor: String?): String =
    cursor?.let { "&cursor=" + java.net.URLEncoder.encode(it, "UTF-8") }.orEmpty()

/** A transition that carries no body still has to send valid JSON. */
private const val EMPTY_JSON_BODY = "{}"

class OkHttpReferenceApi(
    apiBaseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
    /**
     * `null` (every existing test's default) makes this class behave exactly
     * as before. A real instance sees every request this class ever makes,
     * since both [executeJson] and [executeEmpty] are this class's only two
     * ways to reach the network.
     */
    private val connectivityTracker: ConnectivityTracker? = null,
) : ReferenceContract, AccountDeletionRecentAuthenticationContract {
    private val baseUrl = apiBaseUrl.trimEnd('/')
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val zipMediaType = "application/zip".toMediaType()

    init {
        require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://")) {
            "EIMIR_API_BASE_URL must be a complete HTTP(S) URL."
        }
    }

    override suspend fun getInstanceStatus(): InstanceAccessStatus =
        executeJson(
            Request.Builder()
                .url("$baseUrl/api/v1/instance/status")
                .get()
                .build(),
            InstanceAccessStatus.serializer(),
        )

    override suspend fun signIn(email: String, password: String): SessionView {
        val payload = SignInRequest(
            email = email,
            password = password,
            deviceName = "Eimir Android M2 reference flow",
            platform = "android",
        )
        return executeJson(
            Request.Builder()
                .url("$baseUrl/api/v1/auth/sign-in")
                .post(EimirJson.encodeToString(SignInRequest.serializer(), payload).toRequestBody(jsonMediaType))
                .build(),
            SessionView.serializer(),
        )
    }

    override suspend fun consumeMagicLink(token: String): SessionView {
        val payload = MagicLinkConsumeRequest(
            token = token,
            deviceName = "Eimir Android",
            platform = "android",
        )
        return executeJson(
            Request.Builder()
                .url("$baseUrl/api/v1/auth/magic-link/consume")
                .post(
                    EimirJson
                        .encodeToString(MagicLinkConsumeRequest.serializer(), payload)
                        .toRequestBody(jsonMediaType),
                )
                .build(),
            SessionView.serializer(),
        )
    }

    override suspend fun listMemberships(accessToken: String): List<AccountMembershipView> =
        executeJson(
            authenticatedRequest("$baseUrl/api/v1/auth/memberships", accessToken)
                .get()
                .build(),
            ListSerializer(AccountMembershipView.serializer()),
        )

    override suspend fun leaveSpace(
        spaceId: UUID,
        accessToken: String,
    ): SpaceMembershipExitView =
        executeJson(
            authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/membership/leave", accessToken)
                .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType))
                .build(),
            SpaceMembershipExitView.serializer(),
        )

    override suspend fun accountDeletionRecentAuthenticationCapabilities(
        accessToken: String,
    ): AccountDeletionRecentAuthenticationCapabilities {
        val payload = executeJson(
            authenticatedRequest(
                "$baseUrl/api/v1/auth/recent-authentication/account-deletion?client=android",
                accessToken,
            ).get().build(),
            JsonObject.serializer(),
        )
        return AccountDeletionRecentAuthenticationCapabilities(
            localPassword = payload["localPassword"]?.jsonPrimitive?.content == "true",
            passkey = payload["passkey"]?.jsonPrimitive?.content == "true",
            oidcConnections = payload["oidcConnections"]
                ?.jsonArray
                ?.map { it.jsonPrimitive.content }
                .orEmpty(),
        )
    }

    override suspend fun accountDeletionRecentAuthenticationPassword(
        accessToken: String,
        password: String,
    ) {
        val body = buildJsonObject { put("password", JsonPrimitive(password)) }
        executeEmpty(
            authenticatedRequest(
                "$baseUrl/api/v1/auth/recent-authentication/account-deletion/password",
                accessToken,
            ).post(body.toString().toRequestBody(jsonMediaType)).build(),
        )
    }

    override suspend fun startAccountDeletionRecentAuthenticationPasskey(
        accessToken: String,
    ): String = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/auth/recent-authentication/account-deletion/passkeys/start",
            accessToken,
        ).post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        JsonObject.serializer(),
    ).toString()

    override suspend fun finishAccountDeletionRecentAuthenticationPasskey(
        accessToken: String,
        authenticationResponseJson: String,
    ) {
        val credential = EimirJson.parseToJsonElement(authenticationResponseJson)
        val body = buildJsonObject { put("credential", credential) }
        executeEmpty(
            authenticatedRequest(
                "$baseUrl/api/v1/auth/recent-authentication/account-deletion/passkeys/finish",
                accessToken,
            ).post(body.toString().toRequestBody(jsonMediaType)).build(),
        )
    }

    override suspend fun startAccountDeletionRecentAuthenticationOidc(
        accessToken: String,
        connectionId: String,
    ): AccountDeletionOidcStart {
        val encodedConnection = java.net.URLEncoder
            .encode(connectionId, Charsets.UTF_8.name())
            .replace("+", "%20")
        val payload = executeJson(
            authenticatedRequest(
                "$baseUrl/api/v1/auth/recent-authentication/account-deletion/oidc/$encodedConnection/start?client=android",
                accessToken,
            ).post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
            JsonObject.serializer(),
        )
        return AccountDeletionOidcStart(
            authorizationUrl = payload.getValue("authorizationUrl").jsonPrimitive.content,
            state = payload.getValue("state").jsonPrimitive.content,
        )
    }

    override suspend fun finishAccountDeletionRecentAuthenticationOidc(
        accessToken: String,
        connectionId: String,
        code: String,
        state: String,
    ) {
        val encodedConnection = java.net.URLEncoder
            .encode(connectionId, Charsets.UTF_8.name())
            .replace("+", "%20")
        val body = buildJsonObject {
            put("code", JsonPrimitive(code))
            put("state", JsonPrimitive(state))
        }
        executeEmpty(
            authenticatedRequest(
                "$baseUrl/api/v1/auth/recent-authentication/account-deletion/oidc/$encodedConnection/callback",
                accessToken,
            ).post(body.toString().toRequestBody(jsonMediaType)).build(),
        )
    }

    override suspend fun deleteOwnAccount(
        accessToken: String,
        request: AccountDeletionRequest,
    ): AccountDeletionAccepted =
        executeJson(
            authenticatedRequest("$baseUrl/api/v1/account/deletion", accessToken)
                .post(
                    EimirJson
                        .encodeToString(AccountDeletionRequest.serializer(), request)
                        .toRequestBody(jsonMediaType),
                )
                .build(),
            AccountDeletionAccepted.serializer(),
        )

    /*
     * Hand-written on purpose: the demo entry is excluded from the OpenAPI
     * contract, so no generated call exists. The base URL is passed in rather
     * than taken from this client, because entering the demo must not depend on
     * the configured endpoint and must not overwrite it.
     */
    override suspend fun createDemoEntry(baseUrl: String, persona: DemoPersona): String {
        val payload = buildJsonObject { put("persona", JsonPrimitive(persona.wireValue)) }
        val entry = executeJson(
            Request.Builder()
                .url("${baseUrl.trimEnd('/')}/api/v1/demo/entry")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build(),
            DemoEntryPayload.serializer(),
        )
        return entry.token
    }

    override suspend fun createMemory(
        spaceId: UUID,
        accessToken: String,
        memory: MemoryCreate,
    ): MemoryDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/memories", accessToken)
            .post(EimirJson.encodeToString(MemoryCreate.serializer(), memory).toRequestBody(jsonMediaType))
            .build(),
        MemoryDetail.serializer(),
    )

    override suspend fun getMemory(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
    ): MemoryDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/memories/$memoryId", accessToken)
            .get()
            .build(),
        MemoryDetail.serializer(),
    )

    override suspend fun updateMemory(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
        ifMatch: Int,
        update: MemoryUpdate,
    ): MemoryDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/memories/$memoryId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(MemoryUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        MemoryDetail.serializer(),
    )

    override suspend fun deleteMemory(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/memories/$memoryId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete()
            .build(),
    )

    override suspend fun listComments(
        spaceId: UUID,
        accessToken: String,
        parent: ReferenceContract.CommentParent,
        parentId: UUID,
        cursor: String?,
    ): CommentPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/${parent.segment}/$parentId/comments?limit=50" +
                cursorQuery(cursor),
            accessToken,
        ).get().build(),
        CommentPage.serializer(),
    )

    override suspend fun createComment(
        spaceId: UUID,
        accessToken: String,
        parent: ReferenceContract.CommentParent,
        parentId: UUID,
        comment: CommentCreate,
    ): CommentDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/${parent.segment}/$parentId/comments",
            accessToken,
        )
            .post(
                EimirJson.encodeToString(CommentCreate.serializer(), comment)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        CommentDetail.serializer(),
    )

    override suspend fun updateComment(
        spaceId: UUID,
        accessToken: String,
        commentId: UUID,
        ifMatch: Int,
        update: CommentUpdate,
    ): CommentDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/comments/$commentId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(CommentUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        CommentDetail.serializer(),
    )

    override suspend fun deleteComment(
        spaceId: UUID,
        accessToken: String,
        commentId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/comments/$commentId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete()
            .build(),
    )

    override suspend fun createMilestone(
        spaceId: UUID,
        accessToken: String,
        fields: MilestoneCreate,
    ): MilestoneDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/milestones", accessToken)
            .post(
                EimirJson.encodeToString(MilestoneCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        MilestoneDetail.serializer(),
    )

    override suspend fun getMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
    ): MilestoneDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/milestones/$milestoneId",
            accessToken,
        ).get().build(),
        MilestoneDetail.serializer(),
    )

    override suspend fun updateMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
        ifMatch: Int,
        update: MilestoneUpdate,
    ): MilestoneDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/milestones/$milestoneId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(MilestoneUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        MilestoneDetail.serializer(),
    )

    override suspend fun deleteMilestone(
        spaceId: UUID,
        accessToken: String,
        milestoneId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/milestones/$milestoneId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .delete()
            .build(),
    )

    override suspend fun getHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
    ): HeartMomentDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/heart-moments/$heartMomentId",
            accessToken,
        ).get().build(),
        HeartMomentDetail.serializer(),
    )

    override suspend fun listHeartMoments(
        spaceId: UUID,
        accessToken: String,
        visibility: ContentVisibility?,
    ): HeartMomentPage {
        val filter = visibility?.let { "&visibility=${it.value}" }.orEmpty()
        return executeJson(
            authenticatedRequest(
                "$baseUrl/api/v1/spaces/$spaceId/heart-moments?limit=50$filter",
                accessToken,
            ).get().build(),
            HeartMomentPage.serializer(),
        )
    }

    override suspend fun createHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMoment: HeartMomentCreate,
    ): HeartMomentDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/heart-moments", accessToken)
            .post(
                EimirJson.encodeToString(HeartMomentCreate.serializer(), heartMoment)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        HeartMomentDetail.serializer(),
    )

    override suspend fun updateHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
        update: HeartMomentUpdate,
    ): HeartMomentDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/heart-moments/$heartMomentId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(HeartMomentUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        HeartMomentDetail.serializer(),
    )

    override suspend fun changeHeartMomentVisibility(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
        change: HeartMomentVisibilityChange,
    ): HeartMomentDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/heart-moments/$heartMomentId/visibility",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson
                    .encodeToString(HeartMomentVisibilityChange.serializer(), change)
                    .toRequestBody(jsonMediaType),
            )
            .build(),
        HeartMomentDetail.serializer(),
    )

    override suspend fun deleteHeartMoment(
        spaceId: UUID,
        accessToken: String,
        heartMomentId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/heart-moments/$heartMomentId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .delete()
            .build(),
    )

    override suspend fun createAttachmentUpload(
        spaceId: UUID,
        accessToken: String,
        request: AttachmentUploadCreate,
    ): UploadDescriptor = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/attachments", accessToken)
            .post(EimirJson.encodeToString(AttachmentUploadCreate.serializer(), request).toRequestBody(jsonMediaType))
            .build(),
        UploadDescriptor.serializer(),
    )

    override suspend fun uploadAttachmentBytes(
        accessToken: String,
        descriptor: UploadDescriptor,
        image: SelectedImage,
    ) {
        val builder = Request.Builder().url(resolveTransportUrl(descriptor.uploadUrl))
        descriptor.requiredHeaders.forEach { (name, value) -> builder.header(name, value) }
        if (descriptor.method == UploadDescriptor.Method.STREAM) {
            builder.header("Authorization", "Bearer $accessToken")
        }
        executeEmpty(
            builder
                .put(image.bytes.toRequestBody(image.mimeType.toMediaType()))
                .build(),
        )
    }

    override suspend fun finalizeAttachment(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
    ): AttachmentDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/attachments/$attachmentId/finalize",
            accessToken,
        )
            .post("{}".toRequestBody(jsonMediaType))
            .build(),
        AttachmentDetail.serializer(),
    )

    override suspend fun getAttachment(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
    ): AttachmentDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/attachments/$attachmentId", accessToken)
            .get()
            .build(),
        AttachmentDetail.serializer(),
    )

    override suspend fun deleteAttachment(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
        ifMatch: Int,
    ) {
        executeEmpty(
            authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/attachments/$attachmentId", accessToken)
                .header("If-Match", ifMatch.toString())
                .delete()
                .build(),
        )
    }

    override suspend fun replaceMemoryAttachments(
        spaceId: UUID,
        accessToken: String,
        memoryId: UUID,
        ifMatch: Int,
        attachments: MemoryAttachmentSet,
    ): MemoryDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/memories/$memoryId/attachments",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .put(EimirJson.encodeToString(MemoryAttachmentSet.serializer(), attachments).toRequestBody(jsonMediaType))
            .build(),
        MemoryDetail.serializer(),
    )

    override suspend fun listWishes(spaceId: UUID, accessToken: String): WishPage = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/wishes?limit=50", accessToken)
            .get().build(),
        WishPage.serializer(),
    )

    override suspend fun createWish(
        spaceId: UUID,
        accessToken: String,
        wish: WishCreate,
    ): WishDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/wishes", accessToken)
            .post(
                EimirJson.encodeToString(WishCreate.serializer(), wish)
                    .toRequestBody(jsonMediaType),
            ).build(),
        WishDetail.serializer(),
    )

    override suspend fun updateWish(
        spaceId: UUID,
        accessToken: String,
        wishId: UUID,
        ifMatch: Int,
        update: WishUpdate,
    ): WishDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/wishes/$wishId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(WishUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            ).build(),
        WishDetail.serializer(),
    )

    override suspend fun deleteWish(
        spaceId: UUID,
        accessToken: String,
        wishId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/wishes/$wishId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun planWish(
        spaceId: UUID,
        accessToken: String,
        wishId: UUID,
        ifMatch: Int,
        conversion: WishToPlan,
    ): WishToPlanResponse = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/wishes/$wishId/plan", accessToken)
            .header("If-Match", ifMatch.toString())
            .post(
                EimirJson.encodeToString(WishToPlan.serializer(), conversion)
                    .toRequestBody(jsonMediaType),
            ).build(),
        WishToPlanResponse.serializer(),
    )

    override suspend fun listPlans(spaceId: UUID, accessToken: String): PlanPage = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans?limit=50", accessToken)
            .get().build(),
        PlanPage.serializer(),
    )

    override suspend fun createPlan(
        spaceId: UUID,
        accessToken: String,
        fields: PlanCreate,
    ): PlanDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans", accessToken)
            .post(
                EimirJson.encodeToString(PlanCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlanDetail.serializer(),
    )

    override suspend fun updatePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        update: PlanUpdate,
    ): PlanDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans/$planId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(PlanUpdate.serializer(), update)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlanDetail.serializer(),
    )

    override suspend fun deletePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans/$planId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun schedulePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        schedule: PlanSchedule,
    ): PlanDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans/$planId/schedule", accessToken)
            .header("If-Match", ifMatch.toString())
            .post(
                EimirJson.encodeToString(PlanSchedule.serializer(), schedule)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlanDetail.serializer(),
    )

    override suspend fun unschedulePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
    ): PlanDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/plans/$planId/unschedule",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        PlanDetail.serializer(),
    )

    override suspend fun completePlan(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
        completion: PlanComplete,
    ): PlanDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/plans/$planId/complete", accessToken)
            .header("If-Match", ifMatch.toString())
            .post(
                EimirJson.encodeToString(PlanComplete.serializer(), completion)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlanDetail.serializer(),
    )

    override suspend fun returnPlanToWish(
        spaceId: UUID,
        accessToken: String,
        planId: UUID,
        ifMatch: Int,
    ): PlanReturnToWishResponse = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/plans/$planId/return-to-wish",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        PlanReturnToWishResponse.serializer(),
    )

    override suspend fun getDashboard(
        spaceId: UUID,
        accessToken: String,
    ): DashboardView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/dashboard", accessToken)
            .get().build(),
        DashboardView.serializer(),
    )

    override suspend fun sendThinkingOfYou(
        spaceId: UUID,
        accessToken: String,
        gesture: ThinkingOfYouCreate,
    ): ThinkingOfYouAccepted = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/thinking-of-you", accessToken)
            .post(
                EimirJson.encodeToString(ThinkingOfYouCreate.serializer(), gesture)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ThinkingOfYouAccepted.serializer(),
    )

    override suspend fun acceptInvitation(
        accessToken: String,
        token: String,
    ): MembershipView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/invitations/accept", accessToken)
            .post(
                EimirJson.encodeToString(AcceptRequest.serializer(), AcceptRequest(token = token))
                    .toRequestBody(jsonMediaType),
            ).build(),
        MembershipView.serializer(),
    )

    override suspend fun listInvitations(
        spaceId: UUID,
        accessToken: String,
    ): List<InvitationView> = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/invitations", accessToken)
            .get().build(),
        ListSerializer(InvitationView.serializer()),
    )

    override suspend fun createInvitation(
        spaceId: UUID,
        accessToken: String,
    ): IssuedInvitationView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/invitations", accessToken)
            .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        IssuedInvitationView.serializer(),
    )

    override suspend fun revokeInvitation(
        spaceId: UUID,
        accessToken: String,
        invitationId: UUID,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/invitations/$invitationId",
            accessToken,
        ).delete().build(),
    )

    override suspend fun listRelatedPersons(
        spaceId: UUID,
        accessToken: String,
    ): List<RelatedPersonView> = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/related-persons", accessToken)
            .get().build(),
        ListSerializer(RelatedPersonView.serializer()),
    )

    override suspend fun createRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        fields: RelatedPersonFields,
    ): RelatedPersonView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/related-persons", accessToken)
            .post(
                EimirJson.encodeToString(RelatedPersonFields.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        RelatedPersonView.serializer(),
    )

    override suspend fun updateRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        personId: UUID,
        ifMatch: Int,
        fields: RelatedPersonFields,
    ): RelatedPersonView = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/related-persons/$personId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .put(
                EimirJson.encodeToString(RelatedPersonFields.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        RelatedPersonView.serializer(),
    )

    override suspend fun deleteRelatedPerson(
        spaceId: UUID,
        accessToken: String,
        personId: UUID,
        deletePolicy: RelatedPersonDeletePolicy,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/related-persons/$personId" +
                "?deletePolicy=${deletePolicy.value}",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun listImportantDates(
        spaceId: UUID,
        accessToken: String,
        relatedPersonId: UUID?,
    ): List<ImportantDateView> {
        val filter = relatedPersonId?.let { "?relatedPersonId=$it" }.orEmpty()
        return executeJson(
            authenticatedRequest(
                "$baseUrl/api/v1/spaces/$spaceId/important-dates$filter",
                accessToken,
            ).get().build(),
            ListSerializer(ImportantDateView.serializer()),
        )
    }

    override suspend fun createImportantDate(
        spaceId: UUID,
        accessToken: String,
        fields: ImportantDateFields,
    ): ImportantDateView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/important-dates", accessToken)
            .post(
                EimirJson.encodeToString(ImportantDateFields.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ImportantDateView.serializer(),
    )

    override suspend fun updateImportantDate(
        spaceId: UUID,
        accessToken: String,
        dateId: UUID,
        ifMatch: Int,
        fields: ImportantDateFields,
    ): ImportantDateView = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/important-dates/$dateId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .put(
                EimirJson.encodeToString(ImportantDateFields.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ImportantDateView.serializer(),
    )

    override suspend fun deleteImportantDate(
        spaceId: UUID,
        accessToken: String,
        dateId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/important-dates/$dateId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun getTimeline(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): StoryPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/timeline?limit=25" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        StoryPage.serializer(),
    )

    override suspend fun getScopedTimeline(
        spaceId: UUID,
        accessToken: String,
        scope: de.eimir.app.story.TimelineScope,
        cursor: String?,
    ): StoryPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/timeline?limit=25" +
                (scope.year?.let { "&year=$it" } ?: "") +
                (scope.kind?.let { "&type=${it.name}" } ?: "") + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        StoryPage.serializer(),
    )

    override suspend fun createReadAccess(
        spaceId: UUID,
        accessToken: String,
        attachmentId: UUID,
        request: AttachmentReadRequest,
    ): ReadDescriptor = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/attachments/$attachmentId/read-access",
            accessToken,
        )
            .post(EimirJson.encodeToString(AttachmentReadRequest.serializer(), request).toRequestBody(jsonMediaType))
            .build(),
        ReadDescriptor.serializer(),
    )

    override suspend fun readImageBytes(accessToken: String, descriptor: ReadDescriptor): ByteArray = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(resolveTransportUrl(descriptor.url)).get()
        if (descriptor.method == ReadDescriptor.Method.STREAM) {
            builder.header("Authorization", "Bearer $accessToken")
        }
        client.newCall(builder.build()).execute().use { response ->
            assertSuccessful(response)
            response.body.bytes()
        }
    }

    override suspend fun getSpace(spaceId: UUID, accessToken: String): SpaceView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId", accessToken)
            .get()
            .build(),
        SpaceView.serializer(),
    )

    override suspend fun getProfile(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
    ): PartnerProfileView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/profiles/$accountId", accessToken)
            .get()
            .build(),
        PartnerProfileView.serializer(),
    )

    override suspend fun updateProfileIdentity(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
        ifMatch: Int,
        update: ProfileIdentityUpdate,
    ): PartnerProfileView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/profiles/$accountId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(EimirJson.encodeToString(ProfileIdentityUpdate.serializer(), update).toRequestBody(jsonMediaType))
            .build(),
        PartnerProfileView.serializer(),
    )

    override suspend fun removeProfileAvatar(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
        ifMatch: Int,
    ): PartnerProfileView {
        val payload = buildJsonObject { put("profileAttachmentId", JsonNull) }
        return executeJson(
            authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/profiles/$accountId", accessToken)
                .header("If-Match", ifMatch.toString())
                .patch(payload.toString().toRequestBody(jsonMediaType))
                .build(),
            PartnerProfileView.serializer(),
        )
    }

    override suspend fun readProfileAvatar(
        spaceId: UUID,
        accessToken: String,
        accountId: UUID,
    ): ByteArray = withContext(Dispatchers.IO) {
        val request = authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/profiles/$accountId/avatar/content",
            accessToken,
        )
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            assertSuccessful(response)
            response.body.bytes()
        }
    }

    override suspend fun listProfilePreferences(
        spaceId: UUID,
        accessToken: String,
    ): List<ProfilePreferenceView> = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/profile-preferences", accessToken)
            .get().build(),
        ListSerializer(ProfilePreferenceView.serializer()),
    )

    override suspend fun createProfilePreference(
        spaceId: UUID,
        accessToken: String,
        fields: ProfilePreferenceCreate,
    ): ProfilePreferenceView = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/profile-preferences", accessToken)
            .post(
                EimirJson.encodeToString(ProfilePreferenceCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ProfilePreferenceView.serializer(),
    )

    override suspend fun updateProfilePreference(
        spaceId: UUID,
        accessToken: String,
        preferenceId: UUID,
        ifMatch: Int,
        fields: ProfilePreferenceUpdate,
    ): ProfilePreferenceView = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/profile-preferences/$preferenceId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .put(
                EimirJson.encodeToString(ProfilePreferenceUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ProfilePreferenceView.serializer(),
    )

    override suspend fun deleteProfilePreference(
        spaceId: UUID,
        accessToken: String,
        preferenceId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/profile-preferences/$preferenceId",
            accessToken,
        )
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    private fun authenticatedRequest(url: String, accessToken: String): Request.Builder =
        Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $accessToken")

    private fun resolveTransportUrl(target: String): String = when {
        target.startsWith("https://") || target.startsWith("http://") -> target
        else -> "$baseUrl/${target.trimStart('/')}"
    }

    private suspend fun <T> executeJson(request: Request, serializer: KSerializer<T>): T = withContext(Dispatchers.IO) {
        runCatching {
            client.newCall(request).execute().use { response ->
                assertSuccessful(response)
                val body = response.body.string()
                if (body.isBlank()) throw ReferenceApiException(null, "Empty API response.")
                EimirJson.decodeFromString(serializer, body)
            }
        }.onSuccess { connectivityTracker?.recordSuccess() }
            .onFailure { connectivityTracker?.recordFailure(it) }
            .getOrThrow()
    }

    override suspend fun listPlaces(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): PlacePage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/places?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        PlacePage.serializer(),
    )

    override suspend fun createPlace(
        spaceId: UUID,
        accessToken: String,
        fields: PlaceCreate,
    ): PlaceDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/places", accessToken)
            .post(
                EimirJson.encodeToString(PlaceCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlaceDetail.serializer(),
    )

    override suspend fun updatePlace(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        ifMatch: Int,
        fields: PlaceUpdate,
    ): PlaceDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/places/$placeId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(PlaceUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PlaceDetail.serializer(),
    )

    override suspend fun deletePlace(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/places/$placeId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun listPlaceRelationTargets(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: ReferenceContract.RelationTargetKind,
    ): List<UUID> = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/places/$placeId/${kind.segment}",
            accessToken,
        ).get().build(),
        RelationTargets.serializer(),
    ).items

    override suspend fun linkPlaceTarget(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: UUID,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/places/$placeId/${kind.segment}/$targetId",
            accessToken,
        ).put(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
    )

    override suspend fun unlinkPlaceTarget(
        spaceId: UUID,
        accessToken: String,
        placeId: UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: UUID,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/places/$placeId/${kind.segment}/$targetId",
            accessToken,
        ).delete().build(),
    )

    override suspend fun listPrivateNotes(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): PrivateNotePage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/notes?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        PrivateNotePage.serializer(),
    )

    override suspend fun createPrivateNote(
        spaceId: UUID,
        accessToken: String,
        fields: PrivateNoteCreate,
    ): PrivateNoteDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/notes", accessToken)
            .post(
                EimirJson.encodeToString(PrivateNoteCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateNoteDetail.serializer(),
    )

    override suspend fun updatePrivateNote(
        spaceId: UUID,
        accessToken: String,
        noteId: UUID,
        ifMatch: Int,
        fields: PrivateNoteUpdate,
    ): PrivateNoteDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/notes/$noteId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(PrivateNoteUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateNoteDetail.serializer(),
    )

    override suspend fun deletePrivateNote(
        spaceId: UUID,
        accessToken: String,
        noteId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/notes/$noteId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun listGiftIdeas(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): GiftIdeaPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/gift-ideas?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        GiftIdeaPage.serializer(),
    )

    override suspend fun createGiftIdea(
        spaceId: UUID,
        accessToken: String,
        fields: GiftIdeaCreate,
    ): GiftIdeaDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/gift-ideas", accessToken)
            .post(
                EimirJson.encodeToString(GiftIdeaCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        GiftIdeaDetail.serializer(),
    )

    override suspend fun updateGiftIdea(
        spaceId: UUID,
        accessToken: String,
        giftIdeaId: UUID,
        ifMatch: Int,
        fields: GiftIdeaUpdate,
    ): GiftIdeaDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/gift-ideas/$giftIdeaId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(GiftIdeaUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        GiftIdeaDetail.serializer(),
    )

    override suspend fun deleteGiftIdea(
        spaceId: UUID,
        accessToken: String,
        giftIdeaId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/gift-ideas/$giftIdeaId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun listPrivateCollections(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): PrivateCollectionPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/collections?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        PrivateCollectionPage.serializer(),
    )

    override suspend fun createPrivateCollection(
        spaceId: UUID,
        accessToken: String,
        fields: PrivateCollectionCreate,
    ): PrivateCollectionDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/collections", accessToken)
            .post(
                EimirJson.encodeToString(PrivateCollectionCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateCollectionDetail.serializer(),
    )

    override suspend fun updatePrivateCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        fields: PrivateCollectionUpdate,
    ): PrivateCollectionDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(PrivateCollectionUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateCollectionDetail.serializer(),
    )

    override suspend fun deletePrivateCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun createPrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        fields: PrivateCollectionItemCreate,
    ): PrivateCollectionItemDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId/items",
            accessToken,
        ).post(
            EimirJson.encodeToString(PrivateCollectionItemCreate.serializer(), fields)
                .toRequestBody(jsonMediaType),
        ).build(),
        PrivateCollectionItemDetail.serializer(),
    )

    override suspend fun updatePrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
        fields: PrivateCollectionItemUpdate,
    ): PrivateCollectionItemDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId/items/$itemId",
            accessToken,
        ).header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(PrivateCollectionItemUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateCollectionItemDetail.serializer(),
    )

    override suspend fun deletePrivateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId/items/$itemId",
            accessToken,
        ).header("If-Match", ifMatch.toString()).delete().build(),
    )

    override suspend fun reorderPrivateCollectionItems(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        itemIds: List<UUID>,
    ): PrivateCollectionDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/private/collections/$collectionId/order",
            accessToken,
        ).header("If-Match", ifMatch.toString())
            .put(
                EimirJson.encodeToString(PrivateCollectionOrder.serializer(), PrivateCollectionOrder(itemIds))
                    .toRequestBody(jsonMediaType),
            ).build(),
        PrivateCollectionDetail.serializer(),
    )

    override suspend fun listNotifications(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): NotificationPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/notifications?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        NotificationPage.serializer(),
    )

    override suspend fun getNotificationUnreadCount(
        spaceId: UUID,
        accessToken: String,
    ): NotificationUnreadCount = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/notifications/unread-count", accessToken)
            .get().build(),
        NotificationUnreadCount.serializer(),
    )

    override suspend fun markNotificationRead(
        spaceId: UUID,
        accessToken: String,
        notificationId: UUID,
    ): NotificationItem = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/notifications/$notificationId/read",
            accessToken,
        ).post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        NotificationItem.serializer(),
    )

    override suspend fun markAllNotificationsRead(
        spaceId: UUID,
        accessToken: String,
    ): NotificationsReadAllResult = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/notifications/read-all", accessToken)
            .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
        NotificationsReadAllResult.serializer(),
    )

    override suspend fun getActivity(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): ActivityPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/activity?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        ActivityPage.serializer(),
    )

    override suspend fun search(
        spaceId: UUID,
        accessToken: String,
        query: String,
        kind: SearchKind?,
        cursor: String?,
    ): SearchPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/search?q=" +
                java.net.URLEncoder.encode(query, "UTF-8") + "&limit=50" +
                (kind?.let { "&type=${it.value}" } ?: "") + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        SearchPage.serializer(),
    )

    override suspend fun listCollections(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): CollectionPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/collections?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        CollectionPage.serializer(),
    )

    override suspend fun createCollection(
        spaceId: UUID,
        accessToken: String,
        fields: CollectionCreate,
    ): CollectionDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/collections", accessToken)
            .post(
                EimirJson.encodeToString(CollectionCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        CollectionDetail.serializer(),
    )

    override suspend fun updateCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        fields: CollectionUpdate,
    ): CollectionDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(CollectionUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        CollectionDetail.serializer(),
    )

    override suspend fun deleteCollection(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun createCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        fields: CollectionItemCreate,
    ): CollectionItemDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId/items",
            accessToken,
        ).post(
            EimirJson.encodeToString(CollectionItemCreate.serializer(), fields)
                .toRequestBody(jsonMediaType),
        ).build(),
        CollectionItemDetail.serializer(),
    )

    override suspend fun updateCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
        fields: CollectionItemUpdate,
    ): CollectionItemDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId/items/$itemId",
            accessToken,
        ).header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(CollectionItemUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        CollectionItemDetail.serializer(),
    )

    override suspend fun deleteCollectionItem(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        itemId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId/items/$itemId",
            accessToken,
        ).header("If-Match", ifMatch.toString()).delete().build(),
    )

    override suspend fun reorderCollectionItems(
        spaceId: UUID,
        accessToken: String,
        collectionId: UUID,
        ifMatch: Int,
        itemIds: List<UUID>,
    ): CollectionDetail = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/collections/$collectionId/order",
            accessToken,
        ).header("If-Match", ifMatch.toString())
            .put(
                EimirJson.encodeToString(CollectionOrder.serializer(), CollectionOrder(itemIds))
                    .toRequestBody(jsonMediaType),
            ).build(),
        CollectionDetail.serializer(),
    )

    override suspend fun listChapters(
        spaceId: UUID,
        accessToken: String,
        cursor: String?,
    ): ChapterPage = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/chapters?limit=50" + cursorQuery(cursor),
            accessToken,
        ).get().build(),
        ChapterPage.serializer(),
    )

    override suspend fun createChapter(
        spaceId: UUID,
        accessToken: String,
        fields: ChapterCreate,
    ): ChapterDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/chapters", accessToken)
            .post(
                EimirJson.encodeToString(ChapterCreate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ChapterDetail.serializer(),
    )

    override suspend fun updateChapter(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        ifMatch: Int,
        fields: ChapterUpdate,
    ): ChapterDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/chapters/$chapterId", accessToken)
            .header("If-Match", ifMatch.toString())
            .patch(
                EimirJson.encodeToString(ChapterUpdate.serializer(), fields)
                    .toRequestBody(jsonMediaType),
            ).build(),
        ChapterDetail.serializer(),
    )

    override suspend fun deleteChapter(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        ifMatch: Int,
    ) = executeEmpty(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/chapters/$chapterId", accessToken)
            .header("If-Match", ifMatch.toString())
            .delete().build(),
    )

    override suspend fun getChapterContent(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
    ): ChapterContent = executeJson(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/chapters/$chapterId/content",
            accessToken,
        ).get().build(),
        ChapterContent.serializer(),
    )

    override suspend fun linkChapterTarget(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: UUID,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/chapters/$chapterId/${kind.segment}/$targetId",
            accessToken,
        ).put(EMPTY_JSON_BODY.toRequestBody(jsonMediaType)).build(),
    )

    override suspend fun unlinkChapterTarget(
        spaceId: UUID,
        accessToken: String,
        chapterId: UUID,
        kind: ReferenceContract.RelationTargetKind,
        targetId: UUID,
    ) = executeEmpty(
        authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/chapters/$chapterId/${kind.segment}/$targetId",
            accessToken,
        ).delete().build(),
    )

    override suspend fun createTransferExport(
        spaceId: UUID,
        accessToken: String,
        scope: TransferScope,
    ): TransferExportDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/transfer/exports", accessToken)
            .post(
                EimirJson.encodeToString(TransferExportCreate.serializer(), TransferExportCreate(scope))
                    .toRequestBody(jsonMediaType),
            ).build(),
        TransferExportDetail.serializer(),
    )

    override suspend fun getTransferExport(
        spaceId: UUID,
        accessToken: String,
        exportId: UUID,
    ): TransferExportDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/transfer/exports/$exportId", accessToken)
            .get()
            .build(),
        TransferExportDetail.serializer(),
    )

    override suspend fun downloadTransferExport(
        spaceId: UUID,
        accessToken: String,
        exportId: UUID,
        sink: java.io.OutputStream,
    ) = withContext(Dispatchers.IO) {
        val request = authenticatedRequest(
            "$baseUrl/api/v1/spaces/$spaceId/transfer/exports/$exportId/download",
            accessToken,
        ).get().build()
        client.newCall(request).execute().use { response ->
            assertSuccessful(response)
            response.body.byteStream().use { it.copyTo(sink) }
            Unit
        }
    }

    override suspend fun createTransferImport(
        spaceId: UUID,
        accessToken: String,
        archiveSize: Long,
        archive: java.io.InputStream,
    ): TransferImportDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/transfer/imports", accessToken)
            .post(streamingRequestBody(zipMediaType, archiveSize, archive))
            .build(),
        TransferImportDetail.serializer(),
    )

    override suspend fun getTransferImport(
        spaceId: UUID,
        accessToken: String,
        importId: UUID,
    ): TransferImportDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/transfer/imports/$importId", accessToken)
            .get()
            .build(),
        TransferImportDetail.serializer(),
    )

    override suspend fun applyTransferImport(
        spaceId: UUID,
        accessToken: String,
        importId: UUID,
    ): TransferImportDetail = executeJson(
        authenticatedRequest("$baseUrl/api/v1/spaces/$spaceId/transfer/imports/$importId/apply", accessToken)
            .post(EMPTY_JSON_BODY.toRequestBody(jsonMediaType))
            .build(),
        TransferImportDetail.serializer(),
    )

    /**
     * A request body that streams [source] straight to the socket instead of
     * buffering it: import archives may be up to the server's 512MB limit,
     * too large to hold as one in-memory allocation on a phone.
     */
    private fun streamingRequestBody(mediaType: MediaType, size: Long, source: java.io.InputStream): RequestBody =
        object : RequestBody() {
            override fun contentType(): MediaType = mediaType

            override fun contentLength(): Long = size

            override fun writeTo(sink: BufferedSink) {
                source.use { sink.writeAll(it.source()) }
            }
        }

    private suspend fun executeEmpty(request: Request) = withContext(Dispatchers.IO) {
        runCatching { client.newCall(request).execute().use(::assertSuccessful) }
            .onSuccess { connectivityTracker?.recordSuccess() }
            .onFailure { connectivityTracker?.recordFailure(it) }
            .getOrThrow()
    }

    private fun assertSuccessful(response: Response) {
        if (response.isSuccessful) return
        val responseText = response.body.string()
        val problem = runCatching {
            EimirJson.decodeFromString(ProblemDetails.serializer(), responseText)
        }.getOrNull()
        throw ReferenceApiException(
            problem?.code,
            problem?.detail ?: "API request failed (HTTP ${response.code}).",
            problem?.status ?: response.code,
        )
    }
}
