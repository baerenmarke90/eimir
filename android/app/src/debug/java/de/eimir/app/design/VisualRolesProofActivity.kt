package de.eimir.app.design

import android.graphics.Bitmap
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import de.eimir.app.reference.R
import de.eimir.app.story.decodeBounded
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Isolated, local-only proof; no account, API, navigation graph, or persistence. */
class VisualRolesProofActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val state = intent.getStringExtra("state") ?: "ready"
        val theme = intent.getStringExtra("theme")
        setContent {
            EimirTheme(darkTheme = when (theme) {
                "light" -> false
                "dark" -> true
                else -> isSystemInDarkTheme()
            }) {
                VisualRolesProof(initialState = state)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VisualRolesProof(initialState: String = "ready") {
    val context = LocalContext.current
    val photo by produceState<Bitmap?>(null) {
        value = withContext(Dispatchers.IO) {
            context.assets.open("cabin-lake.jpg").use { decodeBounded(it.readBytes()) }
        }
    }
    var mediaState by rememberSaveable(initialState) {
        mutableStateOf(initialState.takeIf { it in listOf("loading", "error", "empty") } ?: "ready")
    }
    var detail by rememberSaveable(initialState) {
        mutableStateOf(initialState.takeIf { it in listOf("photo-detail", "text-detail") })
    }
    var sheetOpen by rememberSaveable(initialState) { mutableStateOf(initialState == "overlay") }
    var selected by rememberSaveable(initialState) { mutableStateOf(initialState == "success") }
    val browseScroll = rememberScrollState()
    val detailScroll = key(detail) { rememberScrollState() }
    BackHandler(enabled = detail != null && !sheetOpen) { detail = null }

    Box(
        modifier = Modifier.fillMaxSize()
            .background(EimirTheme.colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .semantics { testTagsAsResourceId = true },
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier.widthIn(max = EimirReadingWidth).fillMaxWidth()
                .verticalScroll(if (detail == null) browseScroll else detailScroll)
                .padding(horizontal = EimirTheme.spacing.pageMargin)
                .padding(vertical = EimirTheme.spacing.step6)
                .testTag("proof-content"),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.sectionGap),
        ) {
            if (detail != null) {
                TextButton(
                    onClick = { detail = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                    modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("proof-back"),
                ) { Text(stringResource(R.string.proof_back)) }
                if (detail == "photo-detail") {
                    if (mediaState != "empty") {
                        ProofPhoto(photo, mediaState, fullImage = true, onRetry = { mediaState = "ready" })
                    }
                    ProofHeading(if (mediaState == "empty") R.string.proof_empty_title else R.string.proof_photo_title)
                    ProofParagraph(R.string.proof_photo_body)
                } else {
                    ProofHeading(R.string.proof_text_title)
                    ProofParagraph(R.string.proof_text_body)
                }
                VisibilityBadge(isShared = true)
            } else {
                ProofHeading(R.string.proof_heading, personal = true)
                if (initialState == "offline") {
                    ProofStatus(R.string.proof_offline)
                }
                Column(verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.groupGap)) {
                    if (mediaState != "empty") {
                        ProofPhoto(photo, mediaState, onRetry = { mediaState = "ready" }, onOpen = { detail = "photo-detail" })
                    }
                    Column(
                        modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)
                            .clickable(role = Role.Button) { detail = "photo-detail" }
                            .testTag("proof-photo-open"),
                        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
                    ) {
                        ProofHeading(if (mediaState == "empty") R.string.proof_empty_title else R.string.proof_photo_title)
                        Text(stringResource(R.string.proof_photo_context), style = EimirTheme.contentTypography.supporting, color = EimirTheme.colors.textSecondary)
                        if (mediaState == "empty") ProofParagraph(R.string.proof_photo_body)
                    }
                }
                Column(
                    modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)
                        .clickable(role = Role.Button) { detail = "text-detail" }
                        .testTag("proof-text-open"),
                    verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.groupGap),
                ) {
                    ProofHeading(R.string.proof_text_title)
                    ProofParagraph(R.string.proof_text_body)
                    VisibilityBadge(isShared = true)
                }
                Column(
                    modifier = Modifier.animateContentSize(tween(EimirMotion.standardMillis, easing = EimirMotion.standardEasing)),
                    verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
                ) {
                    Text(stringResource(R.string.proof_utility_heading), style = EimirTheme.contentTypography.sectionHeading,
                        color = EimirTheme.colors.textPrimary,
                        modifier = Modifier.semantics { heading() }.testTag("proof-utility-heading"))
                    TextButton(
                        onClick = { selected = !selected },
                        colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                        modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget).testTag("proof-select"),
                    ) { Text(stringResource(if (selected) R.string.proof_selected else R.string.proof_utility_open)) }
                    TextButton(
                        onClick = { sheetOpen = true },
                        colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                        modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget).testTag("proof-overlay-open"),
                    ) { Text(stringResource(R.string.proof_overlay_open)) }
                    if (selected) ProofStatus(R.string.proof_success)
                }
            }
        }
    }
    if (sheetOpen) {
        ModalBottomSheet(
            onDismissRequest = { sheetOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            shape = RoundedCornerShape(topStart = EimirTheme.radii.sheet, topEnd = EimirTheme.radii.sheet),
            containerColor = EimirTheme.colors.surfaceRaised,
            contentColor = EimirTheme.colors.textPrimary,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                    .semantics { testTagsAsResourceId = true }
                    .padding(horizontal = EimirTheme.spacing.pageMargin)
                    .padding(bottom = EimirTheme.spacing.step8).testTag("proof-overlay"),
                verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.groupGap),
            ) {
                Text(stringResource(R.string.proof_overlay_title), style = EimirTheme.contentTypography.utilityHeading,
                    color = EimirTheme.colors.textPrimary,
                    modifier = Modifier.semantics { heading() }.testTag("proof-overlay-heading"))
                VisibilityBadge(isShared = false)
                ProofParagraph(R.string.proof_overlay_body)
                Button(onClick = { sheetOpen = false }, modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("proof-close")) {
                    Text(stringResource(R.string.proof_close))
                }
            }
        }
    }
}

@Composable
private fun ProofHeading(resource: Int, personal: Boolean = false) {
    Text(stringResource(resource), color = EimirTheme.colors.textPrimary,
        style = if (personal) EimirTheme.contentTypography.personalHeading else EimirTheme.contentTypography.contentTitle,
        modifier = Modifier.semantics { heading() })
}

@Composable
private fun ProofParagraph(resource: Int) {
    Text(stringResource(resource), style = EimirTheme.contentTypography.reading, color = EimirTheme.colors.textPrimary)
}

@Composable
private fun ProofStatus(resource: Int) {
    Text(stringResource(resource), style = EimirTheme.contentTypography.supporting, color = EimirTheme.colors.textSecondary,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("proof-status"))
}

@Composable
private fun ProofPhoto(
    photo: Bitmap?,
    state: String,
    fullImage: Boolean = false,
    onRetry: () -> Unit,
    onOpen: (() -> Unit)? = null,
) {
    val isLoading = state == "loading" || (state == "ready" && photo == null)
    val imageModifier = Modifier.fillMaxWidth()
        .aspectRatio(if (fullImage && photo != null) photo.width.toFloat() / photo.height else 1.6f)
        .clip(RoundedCornerShape(EimirTheme.radii.large))
        .background(EimirTheme.colors.surfaceSubtle)
    if (state == "ready" && photo != null) {
        Image(bitmap = photo.asImageBitmap(), contentDescription = stringResource(R.string.proof_photo_description),
            contentScale = if (fullImage) ContentScale.Fit else ContentScale.Crop,
            modifier = imageModifier.then(if (onOpen == null) Modifier else Modifier.clickable(role = Role.Button, onClick = onOpen)).testTag("proof-photo"))
    } else {
        Column(
            modifier = Modifier.fillMaxWidth().testTag(if (isLoading) "proof-loading" else "proof-error"),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.groupGap),
        ) {
            Box(modifier = imageModifier.padding(EimirTheme.spacing.step4), contentAlignment = Alignment.Center) {
                Text(stringResource(if (isLoading) R.string.proof_loading else R.string.proof_error),
                    style = EimirTheme.contentTypography.supporting,
                    color = if (isLoading) EimirTheme.colors.textSecondary else EimirTheme.colors.error,
                    modifier = Modifier.semantics {
                        liveRegion = LiveRegionMode.Polite
                        if (isLoading) progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                    })
            }
            if (!isLoading) {
                Button(onClick = onRetry, modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("proof-retry")) {
                    Text(stringResource(R.string.proof_retry))
                }
            }
        }
    }
}
