package de.eimir.app.reference

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import eimir.api.models.AttachmentDetail
import eimir.api.models.AuthorSummary
import eimir.api.models.ExportStatus
import eimir.api.models.ImportStatus
import eimir.api.models.InstanceAccessStatus
import eimir.api.models.MediaType
import eimir.api.models.PartnerProfileView
import eimir.api.models.PlaceCreate
import eimir.api.models.PlaceDetail
import eimir.api.models.ProfileIdentityUpdate
import eimir.api.models.ReadDescriptor
import eimir.api.models.ResourceCapabilities
import eimir.api.models.TransferExportDetail
import eimir.api.models.TransferImportDetail
import eimir.api.models.TransferScope
import eimir.api.models.UploadDescriptor

class OkHttpReferenceApiTest {
    @Test
    fun scopedTimelineCarriesYearKindAndOpaqueCursorOnTheAuthorizedEndpoint() = runTest {
        val requests = mutableListOf<Request>()
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            requests += request
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body("""{"hasMore":false,"items":[],"nextCursor":null,"availableYears":[2025]}"""
                    .toResponseBody("application/json".toMediaType())).build()
        }.build()
        val space = UUID(0, 958)
        val result = OkHttpReferenceApi("https://api.example.invalid", client).getScopedTimeline(
            space, "secret", de.eimir.app.story.TimelineScope(2025, de.eimir.app.story.StoryEntryKind.MEMORY), "opaque+/= value",
        )
        val request = requests.single()
        assertEquals("/api/v1/spaces/$space/timeline", request.url.encodedPath)
        assertEquals("Bearer secret", request.header("Authorization"))
        assertEquals("2025", request.url.queryParameter("year"))
        assertEquals("MEMORY", request.url.queryParameter("type"))
        assertEquals("opaque+/= value", request.url.queryParameter("cursor"))
        assertEquals(listOf(2025), result.availableYears)
    }

    @Test
    fun scopedTimelineOmitsOrderByDefaultAndSendsAscOnlyForOldestFirst() = runTest {
        val requests = mutableListOf<Request>()
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            requests += request
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body("""{"hasMore":false,"items":[],"nextCursor":null,"availableYears":[]}"""
                    .toResponseBody("application/json".toMediaType())).build()
        }.build()
        val space = UUID(0, 959)
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        api.getScopedTimeline(space, "secret", de.eimir.app.story.TimelineScope(year = 2025), null)
        assertNull(requests.last().url.queryParameter("order"))

        api.getScopedTimeline(
            space, "secret",
            de.eimir.app.story.TimelineScope(year = 2025, order = de.eimir.app.story.StoryOrder.OLDEST_FIRST),
            null,
        )
        assertEquals("ASC", requests.last().url.queryParameter("order"))
    }

    @Test
    fun bearerTokenOnlyTravelsOnAuthenticatedStreamDescriptors() = runTest {
        val requests = mutableListOf<Request>()
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                val isRead = request.url.encodedPath.contains("read")
                val body = if (isRead) byteArrayOf(1, 2, 3) else byteArrayOf()
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(if (isRead) 200 else 204)
                    .message("OK")
                    .body(body.toResponseBody("image/jpeg".toMediaType()))
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)
        val image = SelectedImage(byteArrayOf(4, 5), "test.jpg", "image/jpeg")
        val attachment = AttachmentDetail(
            createdAt = OffsetDateTime.parse("2026-08-26T08:00:00Z"),
            durationSeconds = null,
            hasThumbnail = false,
            height = null,
            id = UUID.fromString("00000000-0000-0000-0000-000000000030"),
            mediaType = MediaType.IMAGE,
            mimeType = "image/jpeg",
            propertySize = 2,
            status = "UPLOADING",
            version = 1,
            width = null,
        )

        api.uploadAttachmentBytes(
            "secret",
            UploadDescriptor(
                attachment = attachment,
                method = UploadDescriptor.Method.STREAM,
                requiredHeaders = mapOf("Content-Type" to "image/jpeg"),
                uploadUrl = "/stream",
            ),
            image,
        )
        api.uploadAttachmentBytes(
            "secret",
            UploadDescriptor(
                attachment = attachment,
                method = UploadDescriptor.Method.SIGNED_UPLOAD,
                requiredHeaders = emptyMap(),
                uploadUrl = "https://storage.example.invalid/signed",
            ),
            image,
        )
        api.readImageBytes(
            "secret",
            ReadDescriptor(ReadDescriptor.Method.STREAM, "/read-stream"),
        )
        api.readImageBytes(
            "secret",
            ReadDescriptor(ReadDescriptor.Method.SIGNED_URL, "https://storage.example.invalid/read-signed"),
        )

        assertEquals("Bearer secret", requests[0].header("Authorization"))
        assertNull(requests[1].header("Authorization"))
        assertEquals("Bearer secret", requests[2].header("Authorization"))
        assertNull(requests[3].header("Authorization"))
        assertEquals("https://api.example.invalid/stream", requests[0].url.toString())
        assertEquals("https://storage.example.invalid/signed", requests[1].url.toString())
    }

    @Test
    fun profileIdentityPatchCarriesAccountVersionAndGeneratedBody() = runTest {
        val requests = mutableListOf<Request>()
        val responseProfile = profile(version = 8, displayName = "Änne")
        val client = jsonClient(requests, responseProfile)
        val api = OkHttpReferenceApi("https://api.example.invalid", client)
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000011")
        val accountId = responseProfile.accountId

        val result = api.updateProfileIdentity(
            spaceId = spaceId,
            accessToken = "secret",
            accountId = accountId,
            ifMatch = 7,
            update = ProfileIdentityUpdate(displayName = "Änne"),
        )

        val request = requests.single()
        val body = requestBody(request)
        assertEquals("PATCH", request.method)
        assertEquals("Bearer secret", request.header("Authorization"))
        assertEquals("7", request.header("If-Match"))
        assertEquals(
            "/api/v1/spaces/$spaceId/profiles/$accountId",
            request.url.encodedPath,
        )
        assertTrue(body.contains("\"displayName\":\"Änne\""))
        assertFalse(body.contains("profileAttachmentId"))
        assertEquals(8, result.version)
    }

    @Test
    fun avatarRemovalSendsExplicitJsonNull() = runTest {
        val requests = mutableListOf<Request>()
        val responseProfile = profile(version = 4)
        val client = jsonClient(requests, responseProfile)
        val api = OkHttpReferenceApi("https://api.example.invalid", client)
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000012")

        api.removeProfileAvatar(
            spaceId = spaceId,
            accessToken = "secret",
            accountId = responseProfile.accountId,
            ifMatch = 3,
        )

        val request = requests.single()
        assertEquals("PATCH", request.method)
        assertEquals("3", request.header("If-Match"))
        assertEquals("{\"profileAttachmentId\":null}", requestBody(request))
    }

    @Test
    fun placeCoordinatesRoundTripAsJsonNumbersNotStrings() = runTest {
        // Found on the device: no BigDecimal serializer was registered at
        // all, so decoding any response carrying a Place coordinate failed
        // outright. This proves both directions against real JSON rather
        // than the in-memory fake, which never exercises encoding at all.
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000031")
        val responsePlace = PlaceDetail(
            address = null,
            capabilities = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true),
            createdAt = OffsetDateTime.parse("2026-08-31T08:00:00Z"),
            createdBy = UUID.randomUUID(),
            creator = AuthorSummary(displayName = "Lea", id = UUID.randomUUID()),
            description = null,
            id = UUID.fromString("00000000-0000-0000-0000-000000000032"),
            latitude = BigDecimal("52.520008"),
            longitude = BigDecimal("13.404954"),
            name = "Brandenburg Gate",
            spaceId = spaceId,
            updatedAt = OffsetDateTime.parse("2026-08-31T08:00:00Z"),
            version = 1,
        )
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        EimirJson
                            .encodeToString(PlaceDetail.serializer(), responsePlace)
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.createPlace(
            spaceId,
            "secret",
            PlaceCreate(
                name = "Brandenburg Gate",
                latitude = BigDecimal("52.520008"),
                longitude = BigDecimal("13.404954"),
            ),
        )

        assertEquals(BigDecimal("52.520008"), result.latitude)
        assertEquals(BigDecimal("13.404954"), result.longitude)

        val sentBody = requestBody(requests.single())
        assertTrue(sentBody.contains("\"latitude\":52.520008"))
        assertTrue(sentBody.contains("\"longitude\":13.404954"))
        assertFalse(sentBody.contains("\"latitude\":\"52.520008\""))
    }

    @Test
    fun profileAvatarReadUsesAuthenticatedStableRoute() = runTest {
        val requests = mutableListOf<Request>()
        val avatar = byteArrayOf(8, 6, 7)
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(avatar.toResponseBody("image/jpeg".toMediaType()))
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000013")
        val accountId = UUID.fromString("00000000-0000-0000-0000-000000000014")

        val result = api.readProfileAvatar(spaceId, "secret", accountId)

        assertTrue(result.contentEquals(avatar))
        assertEquals("Bearer secret", requests.single().header("Authorization"))
        assertEquals(
            "/api/v1/spaces/$spaceId/profiles/$accountId/avatar/content",
            requests.single().url.encodedPath,
        )
    }

    @Test
    fun aSuccessfulRequestRecordsItWithTheConnectivityTracker() = runTest {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        EimirJson
                            .encodeToString(
                                InstanceAccessStatus.serializer(),
                                InstanceAccessStatus(
                                    maintenanceMode = false,
                                    registrationAvailable = true,
                                    registrationUnavailableReason = null,
                                ),
                            )
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val tracker = de.eimir.app.connectivity.ConnectivityTracker()
        val api = OkHttpReferenceApi("https://api.example.invalid", client, connectivityTracker = tracker)

        api.getInstanceStatus()

        assertFalse(tracker.state.value.offline)
        assertNotNull(tracker.state.value.lastSyncedAt)
    }

    @Test
    fun aTransportFailureMarksTheConnectivityTrackerOffline() = runTest {
        val client = OkHttpClient.Builder()
            .addInterceptor { throw java.io.IOException("no connection") }
            .build()
        val tracker = de.eimir.app.connectivity.ConnectivityTracker()
        val api = OkHttpReferenceApi("https://api.example.invalid", client, connectivityTracker = tracker)

        runCatching { api.getInstanceStatus() }

        assertTrue(tracker.state.value.offline)
    }

    @Test
    fun a401NeverMarksTheConnectivityTrackerOffline() = runTest {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(401)
                    .message("Unauthorized")
                    .body("{}".toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()
        val tracker = de.eimir.app.connectivity.ConnectivityTracker()
        val api = OkHttpReferenceApi("https://api.example.invalid", client, connectivityTracker = tracker)

        runCatching { api.getInstanceStatus() }

        assertFalse(tracker.state.value.offline)
    }

    @Test
    fun createTransferExportSendsTheChosenScope() = runTest {
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000040")
        val exportId = UUID.fromString("00000000-0000-0000-0000-000000000041")
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(202)
                    .message("Accepted")
                    .body(
                        EimirJson
                            .encodeToString(TransferExportDetail.serializer(), exportDetail(exportId))
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.createTransferExport(spaceId, "secret", TransferScope.SHARED)

        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/spaces/$spaceId/transfer/exports", request.url.encodedPath)
        assertTrue(requestBody(request).contains("\"scope\":\"SHARED\""))
        assertEquals(exportId, result.id)
        assertEquals(ExportStatus.QUEUED, result.status)
    }

    @Test
    fun getTransferExportReadsTheGivenExport() = runTest {
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000042")
        val exportId = UUID.fromString("00000000-0000-0000-0000-000000000043")
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        EimirJson
                            .encodeToString(
                                TransferExportDetail.serializer(),
                                exportDetail(exportId, status = ExportStatus.READY),
                            )
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.getTransferExport(spaceId, "secret", exportId)

        assertEquals(
            "/api/v1/spaces/$spaceId/transfer/exports/$exportId",
            requests.single().url.encodedPath,
        )
        assertEquals(ExportStatus.READY, result.status)
    }

    @Test
    fun downloadTransferExportStreamsIntoTheGivenSinkWithoutBufferingItWhole() = runTest {
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000044")
        val exportId = UUID.fromString("00000000-0000-0000-0000-000000000045")
        val archiveBytes = ByteArray(4096) { it.toByte() }
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(archiveBytes.toResponseBody("application/zip".toMediaType()))
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)
        val sink = java.io.ByteArrayOutputStream()

        api.downloadTransferExport(spaceId, "secret", exportId, sink)

        assertTrue(archiveBytes.contentEquals(sink.toByteArray()))
    }

    @Test
    fun createTransferImportStreamsTheArchiveBodyExactly() = runTest {
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000046")
        val importId = UUID.fromString("00000000-0000-0000-0000-000000000047")
        val archiveBytes = ByteArray(4096) { it.toByte() }
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(202)
                    .message("Accepted")
                    .body(
                        EimirJson
                            .encodeToString(TransferImportDetail.serializer(), importDetail(importId))
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.createTransferImport(
            spaceId,
            "secret",
            archiveBytes.size.toLong(),
            java.io.ByteArrayInputStream(archiveBytes),
        )

        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/spaces/$spaceId/transfer/imports", request.url.encodedPath)
        assertEquals("application/zip", request.body?.contentType().toString())
        assertTrue(archiveBytes.contentEquals(requestBodyBytes(request)))
        assertEquals(importId, result.id)
        assertEquals(ImportStatus.QUEUED, result.status)
    }

    @Test
    fun getTransferImportReadsTheGivenImport() = runTest {
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000048")
        val importId = UUID.fromString("00000000-0000-0000-0000-000000000049")
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        EimirJson
                            .encodeToString(
                                TransferImportDetail.serializer(),
                                importDetail(importId, status = ImportStatus.READY_TO_APPLY),
                            )
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.getTransferImport(spaceId, "secret", importId)

        assertEquals(
            "/api/v1/spaces/$spaceId/transfer/imports/$importId",
            requests.single().url.encodedPath,
        )
        assertEquals(ImportStatus.READY_TO_APPLY, result.status)
    }

    @Test
    fun applyTransferImportPostsToTheApplyRoute() = runTest {
        val requests = mutableListOf<Request>()
        val spaceId = UUID.fromString("00000000-0000-0000-0000-000000000050")
        val importId = UUID.fromString("00000000-0000-0000-0000-000000000051")
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                requests += request
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(202)
                    .message("Accepted")
                    .body(
                        EimirJson
                            .encodeToString(
                                TransferImportDetail.serializer(),
                                importDetail(importId, status = ImportStatus.APPLYING),
                            )
                            .toResponseBody("application/json".toMediaType()),
                    )
                    .build()
            }
            .build()
        val api = OkHttpReferenceApi("https://api.example.invalid", client)

        val result = api.applyTransferImport(spaceId, "secret", importId)

        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals(
            "/api/v1/spaces/$spaceId/transfer/imports/$importId/apply",
            request.url.encodedPath,
        )
        assertEquals(ImportStatus.APPLYING, result.status)
    }

    private fun importDetail(
        importId: UUID,
        status: ImportStatus = ImportStatus.QUEUED,
    ): TransferImportDetail = TransferImportDetail(
        artifactSize = 4096,
        completedAt = null,
        createdAt = OffsetDateTime.now(),
        errorCode = null,
        expiresAt = OffsetDateTime.now().plusHours(24),
        id = importId,
        scope = TransferScope.SHARED,
        status = status,
        summary = null,
        validatedAt = null,
    )

    private fun exportDetail(
        exportId: UUID,
        status: ExportStatus = ExportStatus.QUEUED,
    ): TransferExportDetail = TransferExportDetail(
        artifactSize = null,
        createdAt = OffsetDateTime.now(),
        downloadUrl = null,
        errorCode = null,
        expiresAt = OffsetDateTime.now().plusHours(24),
        id = exportId,
        readyAt = null,
        scope = TransferScope.SHARED,
        status = status,
    )

    private fun jsonClient(
        requests: MutableList<Request>,
        responseProfile: PartnerProfileView,
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request()
            requests += request
            Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(200)
                .message("OK")
                .body(
                    EimirJson
                        .encodeToString(PartnerProfileView.serializer(), responseProfile)
                        .toResponseBody("application/json".toMediaType()),
                )
                .build()
        }
        .build()

    private fun profile(
        version: Int,
        displayName: String = "Anna",
    ): PartnerProfileView = PartnerProfileView(
        accountId = UUID.fromString("00000000-0000-0000-0000-000000000021"),
        createdAt = OffsetDateTime.parse("2026-08-31T08:00:00Z"),
        displayName = displayName,
        id = UUID.fromString("00000000-0000-0000-0000-000000000022"),
        preferences = emptyList(),
        profileAttachmentId = null,
        updatedAt = OffsetDateTime.parse("2026-08-31T08:00:00Z"),
        version = version,
    )

    private fun requestBody(request: Request): String = Buffer().use { buffer ->
        request.body?.writeTo(buffer)
        buffer.readUtf8()
    }

    private fun requestBodyBytes(request: Request): ByteArray = Buffer().use { buffer ->
        request.body?.writeTo(buffer)
        buffer.readByteArray()
    }
}
