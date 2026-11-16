package com.amar.vaktija

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.View
import kotlin.math.min

/** Dial turns with north; the needle with the Kaaba points to the qibla. Gray palette. */
class CompassView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {

    var heading = 0f
        set(v) { field = v; invalidate() }
    var qibla = Float.NaN
        set(v) { field = v; invalidate() }
    var aligned = false
        set(v) { if (field != v) { field = v; invalidate() } }

    private val dp = resources.displayMetrics.density
    private val cText = context.getColor(R.color.text)
    private val cText3 = context.getColor(R.color.text3)

    private val dial = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.dial) }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2 * dp }
    private val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.text3); strokeWidth = 1.2f * dp }
    private val major = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cText; strokeWidth = 2 * dp; strokeCap = Paint.Cap.ROUND }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; textSize = 18 * dp; typeface = Typeface.DEFAULT_BOLD }
    private val needle = Paint(Paint.ANTI_ALIAS_FLAG)
    private val kaaba = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.kaaba) }
    private val kaabaEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.kaaba_edge); style = Paint.Style.STROKE; strokeWidth = 1.2f * dp }
    private val cNeedle = context.getColor(R.color.needle)
    private val gold = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#BFA046") }
    private val center = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.bg) }
    private val marker = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val rect = RectF()

    override fun onMeasure(w: Int, h: Int) {
        val s = min(MeasureSpec.getSize(w), MeasureSpec.getSize(h))
        setMeasuredDimension(s, s)
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val r = min(cx, cy) - 18 * dp
        val accent = if (aligned) cText else cText3

        ring.color = if (aligned) cText else context.getColor(R.color.current)
        ring.strokeWidth = (if (aligned) 3 else 2) * dp
        canvas.drawCircle(cx, cy, r, dial)
        canvas.drawCircle(cx, cy, r, ring)

        // fixed marker = top of the phone
        marker.color = accent
        path.reset()
        path.moveTo(cx, cy - r + 2 * dp)
        path.lineTo(cx - 8 * dp, cy - r - 13 * dp)
        path.lineTo(cx + 8 * dp, cy - r - 13 * dp)
        path.close()
        canvas.drawPath(path, marker)

        canvas.save()
        canvas.rotate(-heading, cx, cy)
        for (i in 0 until 360 step 5) {
            val big = i % 30 == 0
            canvas.save()
            canvas.rotate(i.toFloat(), cx, cy)
            canvas.drawLine(cx, cy - r + 8 * dp, cx, cy - r + (if (big) 20 else 13) * dp, if (big) major else tick)
            canvas.restore()
        }
        val labels = arrayOf("S", "I", "J", "Z")
        for (k in 0..3) {
            canvas.save()
            canvas.rotate(k * 90f, cx, cy)
            text.color = if (k == 0) cText else cText3
            canvas.drawText(labels[k], cx, cy - r + 38 * dp, text)
            canvas.restore()
        }
        if (!qibla.isNaN()) {
            canvas.save()
            canvas.rotate(qibla, cx, cy)
            val len = r * 0.40f
            needle.color = if (aligned) cText else cNeedle
            path.reset()
            path.moveTo(cx, cy - len)
            path.lineTo(cx + 9 * dp, cy)
            path.lineTo(cx, cy + 12 * dp)
            path.lineTo(cx - 9 * dp, cy)
            path.close()
            canvas.drawPath(path, needle)
            val ks = 11 * dp
            val ky = cy - len - 16 * dp
            rect.set(cx - ks, ky - ks, cx + ks, ky + ks)
            canvas.drawRoundRect(rect, 3 * dp, 3 * dp, kaaba)
            canvas.drawRoundRect(rect, 3 * dp, 3 * dp, kaabaEdge)
            rect.set(cx - ks, ky - ks * 0.45f, cx + ks, ky - ks * 0.15f)
            canvas.drawRect(rect, gold)
            canvas.restore()
        }
        canvas.restore()
        canvas.drawCircle(cx, cy, 7 * dp, center)
    }
}
