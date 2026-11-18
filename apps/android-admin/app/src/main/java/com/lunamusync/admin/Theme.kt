package com.lunamusync.admin

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Outfit = FontFamily(
    Font(R.font.outfit_regular, FontWeight.Normal),
    Font(R.font.outfit_medium, FontWeight.Medium),
    Font(R.font.outfit_semibold, FontWeight.SemiBold),
    Font(R.font.outfit_bold, FontWeight.Bold),
)
val Sora = FontFamily(
    Font(R.font.sora_extralight, FontWeight.ExtraLight),
    Font(R.font.sora_light, FontWeight.Light),
)

@Composable
fun LunaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color.White, onPrimary = Color(0xFF09090D),
            background = Color(0xFF030304), onBackground = Color.White,
            surface = Color(0xFF0B0B0E), onSurface = Color.White,
            surfaceVariant = Color(0x22FFFFFF), onSurfaceVariant = Color(0xB3FFFFFF),
            outline = Color(0x33FFFFFF), error = Color(0xFFFF9AA5),
        ),
        typography = Typography(
            displayLarge = TextStyle(fontFamily = Sora, fontWeight = FontWeight.Light, fontSize = 40.sp, lineHeight = 46.sp, letterSpacing = (-1.2).sp),
            headlineLarge = TextStyle(fontFamily = Sora, fontWeight = FontWeight.Light, fontSize = 32.sp, lineHeight = 38.sp, letterSpacing = (-0.8).sp),
            headlineMedium = TextStyle(fontFamily = Sora, fontWeight = FontWeight.Light, fontSize = 25.sp, lineHeight = 31.sp, letterSpacing = (-0.4).sp),
            titleLarge = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
            titleMedium = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
            bodyLarge = TextStyle(fontFamily = Outfit, fontSize = 16.sp),
            bodyMedium = TextStyle(fontFamily = Outfit, fontSize = 14.sp),
            labelLarge = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
            labelMedium = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 12.sp),
            labelSmall = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 2.sp),
        ),
        shapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp)),
        content = content,
    )
}

@Composable
fun Moon(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val radius = size.minDimension * 0.43f
        drawCircle(Color.White, radius, Offset(size.width * 0.47f, size.height * 0.52f))
        drawCircle(Color(0xFF030304), radius * 0.9f, Offset(size.width * 0.68f, size.height * 0.35f))
    }
}
