package de.eimir.nativetest.ui.common

import android.os.Build
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.SnapshotStateSet
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import de.eimir.nativetest.R
import de.eimir.nativetest.media.AttachmentImage
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.media.MediaVariant
import de.eimir.nativetest.media.ProfileAvatar
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.GeneratedMediaPrivacyTokens
import de.eimir.nativetest.ui.theme.Space
import java.util.UUID

/**
 * Explicit, deliberately volatile reveals of sensitive media.
 *
 * Mirrors the Web contract (#1477): reveal state is never saved with
 * navigation or process state, it is scoped to one viewing context, and it is
 * reset whenever the app leaves the foreground. While anything is revealed the
 * app is excluded from the Recents thumbnail.
 */
@Stable
class SensitiveReveals {
    private val ids = SnapshotStateSet<UUID>()
    fun isRevealed(id: UUID): Boolean = id in ids
    fun toggle(id: UUID) {
        if (!ids.remove(id)) ids.add(id)
    }
    fun concealAll() = ids.clear()
    val anyRevealed: Boolean get() = ids.isNotEmpty()
}

@Composable
fun rememberSensitiveReveals(scope: Any?): SensitiveReveals {
    val reveals = remember(scope) { SensitiveReveals() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, reveals) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) reveals.concealAll()
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            reveals.concealAll()
        }
    }
    val activity = LocalActivity.current
    val anyRevealed = reveals.anyRevealed
    DisposableEffect(activity, anyRevealed) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) activity?.setRecentsScreenshotEnabled(!anyRevealed)
        onDispose {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) activity?.setRecentsScreenshotEnabled(true)
        }
    }
    return reveals
}

/** Media reference resolved against the active login and Space. */
data class MediaRef(
    val attachmentId: UUID,
    val parent: MediaParent,
    val parentId: UUID?,
    /** null = classification unknown; treated like sensitive (fail closed). */
    val isSensitive: Boolean?,
    val hasThumbnail: Boolean = true,
    val width: Int? = null,
    val height: Int? = null,
) {
    val aspectRatio: Float?
        get() = if (width != null && height != null && width > 0 && height > 0) width.toFloat() / height else null
}

@Composable
fun rememberImageModel(ref: MediaRef, variant: MediaVariant): AttachmentImage {
    val graph = appGraph()
    val session = graph.sessions.session
    val loginId = session?.loginId.orEmpty()
    val spaceId = session?.activeSpaceId.orEmpty()
    // Without a thumbnail the original identity serves both roles (#1384).
    val effective = if (variant == MediaVariant.THUMBNAIL && !ref.hasThumbnail) MediaVariant.ORIGINAL else variant
    return remember(loginId, spaceId, ref.attachmentId, ref.parent, ref.parentId, effective) {
        AttachmentImage(loginId, spaceId, ref.attachmentId, ref.parent, ref.parentId, effective)
    }
}

/**
 * An authorized personal photo.
 *
 * Unknown or sensitive classification is concealed before any pixel is shown:
 * unknown media is not requested at all until revealed, and sensitive media is
 * drawn only under the token concealment blur. Layout size comes from the
 * caller, so arrival never shifts the page.
 */
@Composable
fun AttachmentPhoto(
    ref: MediaRef,
    modifier: Modifier = Modifier,
    variant: MediaVariant = MediaVariant.THUMBNAIL,
    reveals: SensitiveReveals? = null,
    contentScale: ContentScale = ContentScale.Crop,
    contentDescription: String? = null,
) {
    val concealed = ref.isSensitive != false && reveals?.isRevealed(ref.attachmentId) != true
    val model = rememberImageModel(ref, variant)
    val context = LocalContext.current
    Box(modifier.background(Eimir.colors.skeletonBase), contentAlignment = Alignment.Center) {
        if (!concealed || ref.isSensitive == true) {
            val request = remember(model) {
                ImageRequest.Builder(context).data(model).memoryCacheKey(model.cacheKey).build()
            }
            SubcomposeAsyncImage(
                model = request,
                contentDescription = if (concealed) null else contentDescription,
                contentScale = contentScale,
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (concealed) Modifier.blur(GeneratedMediaPrivacyTokens.CONCEALMENT_BLUR.dp) else Modifier),
                loading = { Skeleton(Modifier.fillMaxSize(), shape = androidx.compose.ui.graphics.RectangleShape) },
                error = { MediaUnavailable() },
            )
        }
        if (concealed) SensitiveCover(onReveal = reveals?.let { { it.toggle(ref.attachmentId) } })
    }
}

@Composable
private fun MediaUnavailable() {
    Box(Modifier.fillMaxSize().background(Eimir.colors.surfaceSubtle), contentAlignment = Alignment.Center) {
        EimirIcon(EimirIcons.Photo, size = 28.dp, tint = Eimir.colors.textSecondary)
    }
}

/**
 * Cover for concealed media. When a reveal is offered, the whole cover is one
 * large, labelled button (tap anywhere on the blurred photo), and the pill is
 * its visible affordance.
 */
@Composable
fun SensitiveCover(onReveal: (() -> Unit)?) {
    val label = stringResource(R.string.sensitive_label)
    val action = stringResource(R.string.sensitive_show)
    Box(
        Modifier
            .fillMaxSize()
            .background(Eimir.colors.scrim.copy(alpha = 0.35f))
            .then(
                if (onReveal != null) {
                    Modifier.clickable(onClickLabel = action, role = Role.Button, onClick = onReveal)
                } else {
                    Modifier
                },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = label
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            EimirIcon(EimirIcons.Privacy, size = 28.dp, tint = Eimir.colors.onAccent, accent = Eimir.colors.onAccent, cool = Eimir.colors.onAccent)
            Text(label, style = EimirType.label, color = Eimir.colors.onAccent)
            if (onReveal != null) {
                Surface(shape = de.eimir.nativetest.ui.theme.Radii.pill, color = Eimir.colors.surfaceRaised.copy(alpha = 0.92f)) {
                    Text(
                        action,
                        style = EimirType.label,
                        color = Eimir.colors.textPrimary,
                        modifier = Modifier.padding(horizontal = Space.md, vertical = Space.xs),
                    )
                }
            }
        }
    }
}

/** Person photo with initials fallback; decorative because names are always adjacent. */
@Composable
fun PersonAvatar(
    name: String,
    accountId: UUID?,
    attachmentId: UUID?,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val graph = appGraph()
    val session = graph.sessions.session
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    Box(
        modifier.size(size).clip(CircleShape).background(Eimir.colors.sharedSurface),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, style = if (size >= 48.dp) EimirType.title else EimirType.label, color = Eimir.colors.shared)
        if (accountId != null && attachmentId != null && session?.activeSpaceId != null) {
            val model = remember(session.loginId, session.activeSpaceId, accountId, attachmentId) {
                ProfileAvatar(session.loginId, session.activeSpaceId, accountId, attachmentId)
            }
            coil3.compose.AsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
