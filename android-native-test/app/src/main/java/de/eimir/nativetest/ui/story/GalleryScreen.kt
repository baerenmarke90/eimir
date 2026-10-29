package de.eimir.nativetest.ui.story

import android.app.Activity
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.eimir.nativetest.R
import de.eimir.nativetest.media.MediaVariant
import de.eimir.nativetest.media.PhotoSharing
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.FullScreenLoading
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.SensitiveCover
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.rememberImageModel
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Space
import coil3.request.ImageRequest
import kotlinx.coroutines.launch
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.coil3.ZoomableAsyncImage
import me.saket.telephoto.zoomable.rememberZoomableImageState
import me.saket.telephoto.zoomable.rememberZoomableState

/**
 * Full-screen photo viewer: swipe between photos, pinch/double-tap to zoom
 * (Telephoto handles pager/zoom gesture hand-off), tap to show or hide chrome,
 * share through the system share sheet. The whole image is shown (Fit), never
 * a crop. System bars hide while viewing and return on exit.
 */
@Composable
fun GalleryScreen(nav: AppNavigator, memoryId: String, startIndex: Int) {
    val model = graphViewModel(key = "gallery-$memoryId") { MemoryViewModel(it, memoryId) }
    val load by model.memory.collectAsStateWithLifecycle()
    ImmersiveSystemBars()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (val state = load) {
            Load.Loading -> FullScreenLoading()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> GalleryPager(state.value, startIndex, onClose = nav::back)
        }
    }
}

@Composable
private fun GalleryPager(memory: eimir.api.models.MemoryDetail, startIndex: Int, onClose: () -> Unit) {
    val photos = remember(memory.attachments) { memory.attachments.sortedBy { it.position } }
    if (photos.isEmpty()) {
        androidx.compose.runtime.LaunchedEffect(Unit) { onClose() }
        return
    }
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, photos.lastIndex)) { photos.size }
    var chrome by rememberSaveable { mutableStateOf(true) }
    val reveals = rememberSensitiveReveals("gallery-${memory.id}")
    val context = LocalContext.current
    val graph = appGraph()
    val scope = rememberCoroutineScope()
    val shareFailed = stringResource(R.string.gallery_share_failed)

    HorizontalPager(
        state = pager,
        key = { photos[it].id },
        beyondViewportPageCount = 1,
        modifier = Modifier.fillMaxSize(),
    ) { page ->
        val ref = photos[page].toRef(memory.id)
        val concealed = ref.isSensitive != false && !reveals.isRevealed(ref.attachmentId)
        val model = rememberImageModel(ref, MediaVariant.ORIGINAL)
        if (concealed) {
            Box(Modifier.fillMaxSize()) { SensitiveCover(onReveal = { reveals.toggle(ref.attachmentId) }) }
        } else {
            val request = remember(model) { ImageRequest.Builder(context).data(model).memoryCacheKey(model.cacheKey).build() }
            ZoomableAsyncImage(
                model = request,
                contentDescription = memory.title.ifBlank { null },
                state = rememberZoomableImageState(rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 5f))),
                onClick = { chrome = !chrome },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }

    AnimatedVisibility(chrome, enter = fadeIn(), exit = fadeOut()) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.45f))
                .safeDrawingPadding()
                .padding(horizontal = Space.xxs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) {
                Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.action_close), tint = Color.White)
            }
            Text(
                stringResource(R.string.gallery_position, pager.currentPage + 1, photos.size),
                style = EimirType.label,
                color = Color.White,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            Spacer(Modifier.weight(1f))
            val current = photos[pager.currentPage]
            val currentRef = current.toRef(memory.id)
            if (currentRef.isSensitive == true && reveals.isRevealed(currentRef.attachmentId)) {
                TextButton(onClick = { reveals.toggle(currentRef.attachmentId) }) {
                    Text(stringResource(R.string.sensitive_hide), color = Color.White)
                }
            }
            val shareModel = rememberImageModel(currentRef, MediaVariant.ORIGINAL)
            val canShare = currentRef.isSensitive == false || reveals.isRevealed(currentRef.attachmentId)
            if (canShare) {
                IconButton(onClick = {
                    scope.launch {
                        if (!PhotoSharing.share(context, graph.imageLoader, shareModel)) {
                            Toast.makeText(context, shareFailed, Toast.LENGTH_SHORT).show()
                        }
                    }
                }) {
                    Icon(Icons.Rounded.Share, contentDescription = stringResource(R.string.action_share), tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ImmersiveSystemBars() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? Activity)?.window ?: return@DisposableEffect onDispose { }
        val controller = WindowCompat.getInsetsController(window, view)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { controller.show(WindowInsetsCompat.Type.systemBars()) }
    }
}
