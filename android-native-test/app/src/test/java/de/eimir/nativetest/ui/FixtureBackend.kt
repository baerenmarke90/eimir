package de.eimir.nativetest.ui

import de.eimir.nativetest.EimirNativeApplication
import de.eimir.nativetest.auth.InMemoryPersistence
import de.eimir.nativetest.auth.StoredSession
import de.eimir.nativetest.core.AppGraph
import java.io.File
import java.util.Collections
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okio.Buffer

/**
 * A local stand-in for the eimir. backend that answers with contract-shaped
 * fixture JSON. Only synthetic content and the repository's approved demo
 * photographs (backend/demo_assets) are used — never real account data.
 */
object FixtureBackend {
    const val SPACE = "018f0000-0000-7000-8000-0000000000aa"
    const val ME = "018f0000-0000-7000-8000-000000000001"
    const val PARTNER = "018f0000-0000-7000-8000-000000000002"
    const val MEMORY = "018f0000-0000-7000-8000-000000000010"
    const val MEMORY_TEXT = "018f0000-0000-7000-8000-000000000013"
    const val PHOTO_1 = "018f0000-0000-7000-8000-000000000011"
    const val PHOTO_2 = "018f0000-0000-7000-8000-000000000014"
    const val PHOTO_SENSITIVE = "018f0000-0000-7000-8000-000000000015"
    const val PLAN = "018f0000-0000-7000-8000-000000000030"
    const val CREATED = "018f0000-0000-7000-8000-000000000099"

    val requests: MutableList<RecordedRequest> = Collections.synchronizedList(mutableListOf())

    val server: MockWebServer by lazy {
        MockWebServer().apply {
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requests += request
                    return respond(request)
                }
            }
            start()
        }
    }

    private fun json(body: String, code: Int = 200) =
        MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build()

    private fun image(name: String): MockResponse {
        val file = File("../../backend/demo_assets/images/$name")
        return MockResponse.Builder().code(200).addHeader("Content-Type", "image/jpeg").body(Buffer().write(file.readBytes())).build()
    }

    private val author = """{"id":"$ME","displayName":"Alex"}"""
    private val partner = """{"id":"$PARTNER","displayName":"Lea"}"""
    private val caps = """{"canComment":true,"canDelete":true,"canEdit":true}"""

    private fun attachment(id: String, sensitive: Boolean?, position: Int, w: Int = 1600, h: Int = 1067) =
        """{"id":"$id","position":$position,"hasThumbnail":true,"mediaType":"IMAGE","mimeType":"image/jpeg","size":1000,
            "status":"READY","width":$w,"height":$h${if (sensitive == null) "" else ",\"isSensitive\":$sensitive"}}"""

    private val memoryAttachments = listOf(
        attachment(PHOTO_1, false, 0),
        attachment(PHOTO_2, false, 1),
        attachment(PHOTO_SENSITIVE, true, 2),
    ).joinToString(",")

    val memoryDetail = """{"id":"$MEMORY","spaceId":"$SPACE","authorId":"$ME","author":$author,"capabilities":$caps,
        "title":"Wochenende am See","body":"Morgens Nebel über dem Wasser, abends Feuer vor der Hütte. Wir haben kaum aufs Handy geschaut.",
        "tags":["Herbst","Hütte"],"happenedOn":"2026-10-11","createdAt":"2026-10-12T08:00:00Z","updatedAt":"2026-10-12T08:00:00Z",
        "version":4,"attachments":[$memoryAttachments]}"""

    private fun storyMemory(id: String, title: String, date: String, attachments: String) =
        """{"kind":"MEMORY","effectiveDate":"$date","memory":{"id":"$id","title":"$title","happenedOn":"$date",
            "createdAt":"${date}T10:00:00Z","author":$author,"capabilities":$caps,"attachments":[$attachments]}}"""

    private val timeline = """{"hasMore":false,"nextCursor":null,"availableYears":[2026,2025],"items":[
        ${storyMemory(MEMORY, "Wochenende am See", "2026-10-11", memoryAttachments)},
        {"kind":"HEART_MOMENT","effectiveDate":"2026-10-05","heartMoment":{"id":"018f0000-0000-7000-8000-000000000020",
          "text":"Du hast mir einfach Tee gebracht, ohne dass ich fragen musste.","emotion":"SEEN","happenedOn":"2026-10-05",
          "createdAt":"2026-10-05T19:00:00Z","author":$partner,"capabilities":$caps,"visibility":"SHARED","attachment":null}},
        ${storyMemory(MEMORY_TEXT, "Der erste Abend auf dem Balkon", "2026-09-18", "")},
        {"kind":"MILESTONE","effectiveDate":"2026-08-01","milestone":{"id":"018f0000-0000-7000-8000-000000000021",
          "title":"Gemeinsame Wohnung","happenedOn":"2026-08-01","createdAt":"2026-08-01T10:00:00Z","author":$author,"capabilities":$caps}}
    ]}"""

    private val dashboard = """{"space":{"spaceId":"$SPACE","partner":{"id":"$PARTNER","displayName":"Lea"}},
        "relationshipDuration":{"daysTogether":1204,"displayMode":"YEARS_MONTHS","startedOn":"2023-07-12"},
        "viewerLocalDate":"2026-10-28","thinkingOfYouAvailableAt":null,
        "keepsake":{"id":"$MEMORY","type":"MEMORY","titleOrText":"Wochenende am See","occurredOn":"2026-10-11",
          "createdAt":"2026-10-12T08:00:00Z","scheduledAt":null,"previewAttachmentId":"$PHOTO_1","previewIsSensitive":false},
        "retrospective":null,
        "upcoming":[{"id":"$PLAN","type":"PLAN","titleOrText":"Konzert im Stadtpark","occurredOn":null,"createdAt":null,
          "scheduledAt":null,"scheduledOn":"2026-11-02"}],
        "recentShared":[{"id":"$MEMORY_TEXT","type":"MEMORY","titleOrText":"Der erste Abend auf dem Balkon","occurredOn":"2026-09-18",
          "createdAt":"2026-09-18T20:00:00Z","scheduledAt":null}],
        "sharedStorySummary":{"memories":42,"heartMoments":17,"milestones":6}}"""

    private val plans = """{"hasMore":false,"nextCursor":null,"items":[
        {"id":"$PLAN","spaceId":"$SPACE","title":"Konzert im Stadtpark","description":"Picknickdecke nicht vergessen.",
         "status":"PLANNED","plannedOn":"2026-11-02","plannedStart":null,"plannedEnd":null,"experiencedOn":null,"placeId":null,
         "sourceWishId":null,"createdBy":"$ME","creator":$author,"capabilities":$caps,"createdAt":"2026-10-01T10:00:00Z",
         "updatedAt":"2026-10-01T10:00:00Z","version":1},
        {"id":"018f0000-0000-7000-8000-000000000031","spaceId":"$SPACE","title":"Ein Wochenende in Lissabon","description":null,
         "status":"IDEA","plannedOn":null,"plannedStart":null,"plannedEnd":null,"experiencedOn":null,"placeId":null,
         "sourceWishId":null,"createdBy":"$PARTNER","creator":$partner,"capabilities":$caps,"createdAt":"2026-09-01T10:00:00Z",
         "updatedAt":"2026-09-01T10:00:00Z","version":1}]}"""

    private val wishes = """{"hasMore":false,"nextCursor":null,"items":[
        {"id":"018f0000-0000-7000-8000-000000000040","spaceId":"$SPACE","title":"Einmal Polarlichter sehen","status":"OPEN",
         "createdBy":"$PARTNER","creator":$partner,"capabilities":$caps,"createdAt":"2026-06-01T10:00:00Z",
         "updatedAt":"2026-06-01T10:00:00Z","version":1}]}"""

    private val place = """{"hasMore":false,"nextCursor":null,"items":[{"id":"018f0000-0000-7000-8000-000000000050","spaceId":"$SPACE",
        "name":"Hütte am Schliersee","address":"Seestraße 4, 83727 Schliersee","description":null,"latitude":47.7362,"longitude":11.8601,
        "geocodingSource":"openstreetmap","createdBy":"$ME","creator":$author,"capabilities":$caps,"createdAt":"2026-10-12T08:00:00Z",
        "updatedAt":"2026-10-12T08:00:00Z","version":2}]}"""

    private fun respond(request: RecordedRequest): MockResponse {
        val path = request.url.encodedPath
        val method = request.method
        val space = "/api/v1/spaces/$SPACE"
        return when {
            path == "/api/v1/auth/memberships" -> json("""[{"role":"MEMBER","spaceId":"$SPACE","status":"ACTIVE"}]""")
            path == "$space/dashboard" -> json(dashboard)
            path == "$space/presence" -> json("""{"state":"ACTIVE"}""")
            path == "$space/notifications/unread-count" -> json("""{"unreadCount":2}""")
            path == "$space/profiles/$ME" -> json(profile(ME, "Alex"))
            path == "$space/profiles/$PARTNER" -> json(profile(PARTNER, "Lea"))
            path == "$space/timeline" -> json(timeline)
            path == "$space/discover" -> json("""{"items":[],"lead":null,"selectionDate":"2026-10-28"}""")
            path == "$space/memories/$MEMORY" && method == "GET" -> json(memoryDetail)
            path == "$space/memories/$MEMORY/comments" -> json(
                """{"hasMore":false,"nextCursor":null,"items":[{"id":"018f0000-0000-7000-8000-000000000060","spaceId":"$SPACE",
                "authorId":"$PARTNER","author":$partner,"body":"Da will ich nächstes Jahr wieder hin.","createdAt":"2026-10-12T09:00:00Z",
                "updatedAt":"2026-10-12T09:00:00Z","version":1}]}""",
            )
            path.startsWith("$space/moments/memories/") -> json(place)
            path.endsWith("/read-access") -> {
                val id = path.removePrefix("$space/attachments/").removeSuffix("/read-access")
                json("""{"method":"SIGNED_URL","url":"/media/$id"}""")
            }
            path == "/media/$PHOTO_1" -> image("cabin-lake.jpg")
            path == "/media/$PHOTO_2" -> image("forest-path.jpg")
            path.startsWith("/media/") -> image("concert-lights.jpg")
            path == "$space/memories" && method == "POST" -> json(
                memoryDetail.replace(MEMORY, CREATED).replace("Wochenende am See", "Kaffee am Fluss")
                    .replace("\"version\":4", "\"version\":1").replace(Regex("\"attachments\":\\[.*]}$", RegexOption.DOT_MATCHES_ALL), "\"attachments\":[]}"),
                201,
            )
            path == "$space/memories/$CREATED" -> json(
                memoryDetail.replace(MEMORY, CREATED).replace("Wochenende am See", "Kaffee am Fluss")
                    .replace(Regex("\"attachments\":\\[.*]}$", RegexOption.DOT_MATCHES_ALL), "\"attachments\":[]}"),
            )
            path == "$space/plans" -> json(plans)
            path == "$space/wishes" -> json(wishes)
            path == space -> json("""{"id":"$SPACE","createdAt":"2023-07-12T10:00:00Z","partners":[$author,$partner]}""")
            path == "/api/v1/account/photo-location-preference" -> json("""{"enabled":true,"version":1}""")
            path == "$space/entitlements" -> json(
                """{"spaceId":"$SPACE","tier":"FREE","status":"ACTIVE","capabilities":[],"isInGracePeriod":false}""",
            )
            path.endsWith("/comments") -> json("""{"hasMore":false,"nextCursor":null,"items":[]}""")
            else -> json("""{"title":"Not found"}""", 404)
        }
    }

    private fun profile(id: String, name: String) =
        """{"id":"$id","accountId":"$id","displayName":"$name","birthday":null,"profileAttachmentId":null,"preferences":[],
            "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","version":1}"""

    fun signedInSession(origin: String) = StoredSession(
        origin = origin,
        accountId = ME,
        displayName = "Alex",
        accessToken = "fixture-access",
        accessExpiresAtEpochSeconds = Long.MAX_VALUE / 2,
        refreshToken = "fixture-refresh",
        refreshExpiresAtEpochSeconds = Long.MAX_VALUE / 2,
        activeSpaceId = SPACE,
        loginId = "fixture-login",
    )
}

/** Robolectric application whose graph talks to [FixtureBackend] with a signed-in in-memory session. */
class FixtureApplication : EimirNativeApplication() {
    override fun createGraph(): AppGraph {
        val origin = FixtureBackend.server.url("/").toString().removeSuffix("/")
        return AppGraph(this, origin, InMemoryPersistence(FixtureBackend.signedInSession(origin)))
    }
}
