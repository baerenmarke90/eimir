package de.eimir.nativetest

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.media.PhotoSharing

open class EimirNativeApplication : Application(), SingletonImageLoader.Factory {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = createGraph()
        graph.sessions.restore()
        // No shared photo copy outlives the process that created it.
        PhotoSharing.clear(this)
    }

    /** Tests replace the backend origin and session storage; production uses the pinned defaults. */
    protected open fun createGraph(): AppGraph = AppGraph(this)

    override fun newImageLoader(context: PlatformContext): ImageLoader = graph.imageLoader
}
