package de.eimir.nativetest.api

import de.eimir.nativetest.core.ApiJson
import eimir.api.models.DashboardView
import eimir.api.models.MemoryDetail
import eimir.api.models.StoryItem
import eimir.api.models.StoryPage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT

/**
 * Guards the hand-bound paths against the authoritative contract: every
 * Retrofit method must name an existing OpenAPI path and method, and every
 * versioned write must send the mandatory `If-Match`.
 */
class ApiContractTest {
    private val openApi: JsonObject by lazy {
        Json.parseToJsonElement(File("../../backend/openapi.json").readText()).jsonObject
    }

    private fun normalize(path: String) = "/" + path.replace(Regex("\\{[^}]+}"), "{}")

    @Test
    fun `every client endpoint exists in the OpenAPI contract with the same method`() {
        val paths = openApi.getValue("paths").jsonObject
        val contract = paths.flatMap { (path, operations) ->
            operations.jsonObject.keys.map { method -> method.uppercase() to normalize(path.removePrefix("/")) }
        }.toSet()
        val missing = (EimirApi::class.java.methods + SessionApi::class.java.methods).mapNotNull { method ->
            val binding = method.getAnnotation(GET::class.java)?.let { "GET" to it.value }
                ?: method.getAnnotation(POST::class.java)?.let { "POST" to it.value }
                ?: method.getAnnotation(PUT::class.java)?.let { "PUT" to it.value }
                ?: method.getAnnotation(PATCH::class.java)?.let { "PATCH" to it.value }
                ?: method.getAnnotation(DELETE::class.java)?.let { "DELETE" to it.value }
                ?: return@mapNotNull null
            val key = binding.first to normalize(binding.second)
            if (key in contract) null else "${method.name}: ${binding.first} ${binding.second}"
        }
        assertTrue("Endpoints missing from backend/openapi.json: $missing", missing.isEmpty())
    }

    @Test
    fun `writes that the contract guards with If-Match send it`() {
        val paths = openApi.getValue("paths").jsonObject
        val guarded = paths.flatMap { (path, operations) ->
            operations.jsonObject.mapNotNull { (method, operation) ->
                val parameters = operation.jsonObject["parameters"]?.toString().orEmpty()
                if (parameters.contains("\"If-Match\"") && parameters.contains("\"required\":true")) {
                    method.uppercase() to normalize(path.removePrefix("/"))
                } else {
                    null
                }
            }
        }.toSet()
        val violations = EimirApi::class.java.methods.mapNotNull { method ->
            val binding = method.getAnnotation(PATCH::class.java)?.let { "PATCH" to it.value }
                ?: method.getAnnotation(PUT::class.java)?.let { "PUT" to it.value }
                ?: method.getAnnotation(DELETE::class.java)?.let { "DELETE" to it.value }
                ?: method.getAnnotation(POST::class.java)?.let { "POST" to it.value }
                ?: return@mapNotNull null
            if ((binding.first to normalize(binding.second)) !in guarded) return@mapNotNull null
            val sendsIfMatch = method.parameterAnnotations.flatten().any { it is Header && it.value == "If-Match" }
            if (sendsIfMatch) null else method.name
        }
        assertTrue("Missing If-Match: $violations", violations.isEmpty())
    }

    @Test
    fun `polymorphic story pages decode with unknown fields ignored`() {
        val page = ApiJson.json.decodeFromString<StoryPage>(
            """
            {"hasMore":false,"nextCursor":null,"availableYears":[2026],"futureField":1,
             "items":[
               {"kind":"MEMORY","effectiveDate":"2026-10-01","memory":{"id":"018f0000-0000-7000-8000-000000000010",
                 "title":"See","happenedOn":"2026-10-01","createdAt":"2026-10-01T10:00:00Z",
                 "author":{"id":"018f0000-0000-7000-8000-000000000001","displayName":"Alex"},
                 "capabilities":{"canComment":true,"canDelete":true,"canEdit":true},
                 "attachments":[{"id":"018f0000-0000-7000-8000-000000000011","position":0,"hasThumbnail":true,
                   "mediaType":"IMAGE","mimeType":"image/jpeg","size":10,"status":"READY","width":4,"height":3}]}},
               {"kind":"MILESTONE","effectiveDate":"2026-09-01","milestone":{"id":"018f0000-0000-7000-8000-000000000012",
                 "title":"Umzug","happenedOn":"2026-09-01","createdAt":"2026-09-01T10:00:00Z",
                 "author":{"id":"018f0000-0000-7000-8000-000000000001","displayName":"Alex"},
                 "capabilities":{"canComment":true,"canDelete":false,"canEdit":false}}}
             ]}
            """.trimIndent(),
        )
        assertEquals(2, page.items.size)
        assertTrue(page.items[0] is StoryItem.MemoryWrapper)
        assertTrue(page.items[1] is StoryItem.MilestoneWrapper)
        // The contract defaults an absent classification to false; the backend always sends it
        // (ApiModel excludes only None), so absence never hides a real "sensitive" flag.
        assertEquals(false, (page.items[0] as StoryItem.MemoryWrapper).value.memory.attachments[0].isSensitive)
    }

    @Test
    fun `every contextual type used by the generated models has a serializer`() {
        val place = ApiJson.json.decodeFromString<eimir.api.models.PlaceDetail>(
            """
            {"id":"018f0000-0000-7000-8000-000000000050","spaceId":"018f0000-0000-7000-8000-000000000020","name":"Foto-Ort",
             "address":null,"description":null,"latitude":47.7362,"longitude":11.8601,"createdBy":"018f0000-0000-7000-8000-000000000001",
             "creator":{"id":"018f0000-0000-7000-8000-000000000001","displayName":"Alex"},
             "capabilities":{"canComment":false,"canDelete":true,"canEdit":true},
             "createdAt":"2026-10-12T08:00:00Z","updatedAt":"2026-10-12T08:00:00Z","version":1}
            """.trimIndent(),
        )
        assertEquals("47.7362", place.latitude?.toPlainString())
        val types = File("../api/generated").walkTopDown().filter { it.extension == "kt" }
            .flatMap { Regex("@Contextual @SerialName\\(value = \"[^\"]+\"\\)\\s+val \\w+: (java\\.[\\w.]+)").findAll(it.readText()).map { m -> m.groupValues[1] } }
            .toSet()
        assertEquals(setOf("java.math.BigDecimal", "java.time.LocalDate", "java.time.OffsetDateTime", "java.util.UUID"), types)
    }

    @Test
    fun `dashboard without optional modules decodes`() {
        val dashboard = ApiJson.json.decodeFromString<DashboardView>(
            """
            {"keepsake":null,"recentShared":[],"relationshipDuration":null,"retrospective":null,
             "sharedStorySummary":{"heartMoments":0,"memories":0,"milestones":0},
             "space":{"partner":null,"spaceId":"018f0000-0000-7000-8000-000000000020"},
             "thinkingOfYouAvailableAt":null,"upcoming":[]}
            """.trimIndent(),
        )
        assertEquals(null, dashboard.space.partner)
    }

    @Test
    fun `patch bodies omit unchanged fields`() {
        val body = ApiJson.json.encodeToString(eimir.api.models.MemoryUpdate.serializer(), eimir.api.models.MemoryUpdate(title = "Neu"))
        assertEquals("""{"title":"Neu"}""", body)
        val decoded = ApiJson.json.decodeFromString<MemoryDetail>(
            """
            {"id":"018f0000-0000-7000-8000-000000000010","spaceId":"018f0000-0000-7000-8000-000000000020",
             "authorId":"018f0000-0000-7000-8000-000000000001","title":"See","body":"","tags":[],"version":3,
             "happenedOn":null,"createdAt":"2026-10-01T10:00:00Z","updatedAt":"2026-10-01T10:00:00Z",
             "author":{"id":"018f0000-0000-7000-8000-000000000001","displayName":"Alex","isFormerMember":false},
             "capabilities":{"canComment":true,"canDelete":true,"canEdit":true},"attachments":[]}
            """.trimIndent(),
        )
        assertEquals(3, decoded.version)
    }
}
