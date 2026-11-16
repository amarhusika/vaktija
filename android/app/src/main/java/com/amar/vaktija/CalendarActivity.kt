package com.amar.vaktija

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import java.time.LocalDate
import java.time.ZoneId

/** Days left until the important dates. */
class CalendarActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_calendar)
        Ui.edgeToEdge(this, findViewById(R.id.root), findViewById(R.id.content))
        findViewById<View>(R.id.back).setOnClickListener { finish() }

        val today = LocalDate.now(ZoneId.of(Prefs.city(this).zone))
        findViewById<TextView>(R.id.today).text = listOfNotNull(Ui.formatHijri(today), Ui.formatShort(today)).joinToString(" · ")

        val list = findViewById<LinearLayout>(R.id.list)
        Events.upcoming(today).forEachIndexed { i, u ->
            if (i > 0) list.addView(View(this).apply {
                setBackgroundResource(R.color.line)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
                    marginStart = Ui.dp(this@CalendarActivity, 20); marginEnd = Ui.dp(this@CalendarActivity, 20)
                }
            })
            val row = layoutInflater.inflate(R.layout.item_event, list, false)
            row.findViewById<TextView>(R.id.name).text = u.event.name
            row.findViewById<TextView>(R.id.date).text =
                listOfNotNull(Ui.formatShort(u.date), Ui.formatHijri(u.date)).joinToString(" · ")
            row.findViewById<TextView>(R.id.days).text = when (u.days) {
                0L -> "danas"
                1L -> "sutra"
                else -> "za ${u.days} ${dayWord(u.days)}"
            }
            if (u.days <= 1) row.setBackgroundResource(R.drawable.bg_current)
            list.addView(row)
        }
    }

    private fun dayWord(n: Long) = if (n % 10 == 1L && n % 100 != 11L) "dan" else "dana"
}
