package de.eimir.nativetest.ui.icons

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.eimir.nativetest.ui.theme.Eimir

enum class IconRole { Base, Accent, Cool, AccentFill, OnAccent, Surface }

data class IconStroke(val role: IconRole, val pathData: String)

/** Names of the owner-selected icon grammar; see web/src/components/EimirIcon.tsx. */
enum class EimirIcons(val key: String) {
    Wir("wir"),
    Moments("momente"),
    Plan("planen"),
    Calendar("kalender"),
    Lists("listen"),
    More("mehr"),
    New("neu"),
    Thinking("denken"),
    Together("gemeinsam"),
    Shared("geteilt"),
    Private("nurfuer"),
    Photo("foto"),
    Memories("erinnerungen"),
    Highlights("highlights"),
    Wishes("wuensche"),
    Milestones("meilensteine"),
    Anniversary("jahrestag"),
    Notifications("benachrichtigungen"),
    Search("suche"),
    Settings("einstellungen"),
    Privacy("privatsphaere"),
    Pro("pro"),
    Help("hilfe"),
    Logout("logout"),
    Games("spiele"),
    Places("orte"),
    Chapters("kapitel"),
    Birthday("geburtstag"),
    Profile("profil"),
    Gift("geschenk"),
    Activity("aktivitaet"),
    Add("hinzufuegen"),
    Notes("notes"),
}

private class ParsedStroke(val role: IconRole, val path: Path)

/**
 * Draws an eimir. icon on its 24 unit grid with the Web stroke width (1.65).
 *
 * Icons are decorative by contract: the owning control carries the accessible
 * name, so no content description is set here.
 */
@Composable
fun EimirIcon(
    icon: EimirIcons,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    tint: Color = Eimir.colors.textPrimary,
    accent: Color = Eimir.colors.iconAccent,
    cool: Color = Eimir.colors.iconCool,
    strokeWidth: Float = 1.65f,
) {
    val strokes = remember(icon) {
        EIMIR_ICON_DATA[icon.key].orEmpty().map { ParsedStroke(it.role, PathParser().parsePathString(it.pathData).toPath()) }
    }
    val onAccent = Eimir.colors.onAccent
    val surface = Eimir.colors.surfaceRaised
    Canvas(modifier.size(size)) {
        val factor = this.size.minDimension / 24f
        scale(factor, factor, pivot = Offset.Zero) {
            val stroke = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round)
            for (part in strokes) {
                when (part.role) {
                    IconRole.AccentFill -> drawPath(part.path, accent)
                    else -> drawPath(
                        part.path,
                        when (part.role) {
                            IconRole.Accent -> accent
                            IconRole.Cool -> cool
                            IconRole.OnAccent -> onAccent
                            IconRole.Surface -> surface
                            else -> tint
                        },
                        style = stroke,
                    )
                }
            }
        }
    }
}
