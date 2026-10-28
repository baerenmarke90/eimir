package de.eimir.nativetest.core

import org.junit.Assert.assertEquals
import org.junit.Test

class AppErrorTest {
    @Test
    fun `status codes map to non-technical categories`() {
        assertEquals(AppError.SessionEnded, httpError(401, null))
        assertEquals(AppError.Unavailable, httpError(403, """{"code":"SPACE_NOT_FOUND"}"""))
        assertEquals(AppError.Unavailable, httpError(404, null))
        assertEquals(AppError.PremiumRequired, httpError(403, """{"code":"PREMIUM_ENTITLEMENT_REQUIRED"}"""))
        assertEquals(AppError.Conflict, httpError(409, null))
        assertEquals(AppError.Conflict, httpError(428, null))
        assertEquals(AppError.Invalid, httpError(422, null))
        assertEquals(AppError.RateLimited, httpError(429, null))
        assertEquals(AppError.Maintenance, httpError(503, """{"code":"MAINTENANCE_MODE"}"""))
        assertEquals(AppError.Server, httpError(502, null))
    }
}
