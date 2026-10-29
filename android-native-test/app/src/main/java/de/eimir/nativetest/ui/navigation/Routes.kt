package de.eimir.nativetest.ui.navigation

import kotlinx.serialization.Serializable

/**
 * Type-safe destinations. Arguments are identifiers only: no personal content,
 * draft text or tokens ever enters a route, the back stack or saved state.
 */
@Serializable data object TodayGraph
@Serializable data object StoryGraph
@Serializable data object PlanGraph
@Serializable data object MoreGraph

@Serializable data object TodayRoute
@Serializable data object StoryRoute
@Serializable data object PlanRoute
@Serializable data object MoreRoute

@Serializable data class MemoryRoute(val memoryId: String)
@Serializable data class MemoryEditorRoute(val memoryId: String? = null)
@Serializable data class GalleryRoute(val memoryId: String, val startIndex: Int = 0)
@Serializable data class HeartMomentRoute(val heartMomentId: String)
@Serializable data class MilestoneRoute(val milestoneId: String)
@Serializable data object PhotosRoute

@Serializable data class PlanDetailRoute(val planId: String)
@Serializable data class WishDetailRoute(val wishId: String)
@Serializable data class PlanEditorRoute(val planId: String? = null, val fromWishId: String? = null)
@Serializable data class WishEditorRoute(val wishId: String? = null)

@Serializable data object SearchRoute
@Serializable data object NotificationsRoute
@Serializable data object ActivityRoute
@Serializable data object ProfileRoute
@Serializable data object PlacesRoute
@Serializable data class PlaceRoute(val placeId: String)
@Serializable data object PeopleRoute
@Serializable data object PrivateNotesRoute
@Serializable data class PrivateNoteEditorRoute(val noteId: String? = null)
@Serializable data object SettingsRoute
@Serializable data object AboutRoute

enum class TopLevel { Today, Story, Plan, More }
