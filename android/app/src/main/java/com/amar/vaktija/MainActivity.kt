package com.amar.vaktija

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Today's prayer times. The countdown only ticks while the screen is open;
 * the beeps are handled by a single exact alarm (see Scheduler).
 */
class MainActivity : Activity() {

    private lateinit var cityView: TextView
    private lateinit var dateView: TextView
    private lateinit var hijriView: TextView
    private lateinit var nextLabel: TextView
    private lateinit var nextTime: TextView
    private lateinit var countdown: TextView
    private lateinit var list: LinearLayout
    private lateinit var ramazanCard: View
    private lateinit var ramazanList: LinearLayout

    private lateinit var city: City
    private lateinit var zone: ZoneId
    private lateinit var day: Vakat.Day
    private var shown: List<Vakat.Time> = emptyList()   // the main list (without "Jacija IZ" during Ramazan)
    private var tomorrowFajr: Int? = null
    private val rows = mutableMapOf<String, View>()
    private var currentKey: String? = null

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            tick()
            handler.postDelayed(this, 1000L - System.currentTimeMillis() % 1000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        Ui.edgeToEdge(this, findViewById(R.id.root), findViewById(R.id.content))

        cityView = findViewById(R.id.city)
        dateView = findViewById(R.id.date)
        hijriView = findViewById(R.id.hijri)
        nextLabel = findViewById(R.id.nextLabel)
        nextTime = findViewById(R.id.nextTime)
        countdown = findViewById(R.id.countdown)
        list = findViewById(R.id.list)
        ramazanCard = findViewById(R.id.ramazanCard)
        ramazanList = findViewById(R.id.ramazanList)

        findViewById<View>(R.id.header).setOnClickListener { startActivity(Intent(this, CityActivity::class.java)) }
        findViewById<View>(R.id.qibla).setOnClickListener { startActivity(Intent(this, QiblaActivity::class.java)) }
        findViewById<View>(R.id.calendar).setOnClickListener { startActivity(Intent(this, CalendarActivity::class.java)) }
        findViewById<View>(R.id.location).setOnClickListener { startActivity(Intent(this, CityActivity::class.java)) }

        if (Prefs.firstRun(this)) {
            val perms = mutableListOf(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
            requestPermissions(perms.toTypedArray(), REQ_FIRST)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_FIRST && Loc.has(this)) {
            Loc.current(this) { l ->
                if (l != null) Places.saveMyLocation(this, l.latitude, l.longitude) { if (!isDestroyed) refresh() }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // in "my location" mode, follow big moves using the free last-known fix (no GPS use)
        if (Prefs.usesGps(this)) {
            Loc.lastKnown(this)?.let { l ->
                val c = Prefs.city(this)
                if (Loc.distanceKm(c.lat, c.lng, l.latitude, l.longitude) > 3) {
                    Places.saveMyLocation(this, l.latitude, l.longitude) { if (!isDestroyed) refresh() }
                }
            }
        }
        refresh()
        handler.post(ticker)
    }

    override fun onPause() {
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    private fun refresh() {
        city = Prefs.city(this)
        zone = ZoneId.of(city.zone)
        load(LocalDate.now(zone))
        Scheduler.schedule(this)
    }

    private fun load(date: LocalDate) {
        day = Vakat.compute(city.lat, city.lng, zone, date)
        tomorrowFajr = Vakat.compute(city.lat, city.lng, zone, date.plusDays(1))["fajr"].minutes

        cityView.text = city.name
        dateView.text = Ui.formatDate(date)
        val hijri = Ui.formatHijri(date)
        hijriView.text = hijri.orEmpty()
        hijriView.visibility = if (hijri == null) View.GONE else View.VISIBLE

        // Ramazan night: this evening's "Jacija IZ" is akšam + 126 min when TOMORROW is a Ramazan day
        // → first on the last day of ša'ban, last on the second-to-last day of Ramazan.
        val ramazanNight = Ui.isRamazan(date.plusDays(1))
        val ramazanDay = Ui.isRamazan(date)               // today's Sabah IZ (sehur)
        shown = if (ramazanNight) day.times.filter { it.key != "ishaiz" } else day.times

        rows.clear()
        currentKey = null
        fill(list, shown, register = true)

        val extra = listOfNotNull(day.sabahIZ.takeIf { ramazanDay }, day.jacijaIZ.takeIf { ramazanNight })
        if (extra.isNotEmpty()) {
            ramazanCard.visibility = View.VISIBLE
            fill(ramazanList, extra, register = false)
        } else {
            ramazanCard.visibility = View.GONE
        }
    }

    private fun fill(container: LinearLayout, times: List<Vakat.Time>, register: Boolean) {
        container.removeAllViews()
        times.forEachIndexed { i, t ->
            if (i > 0) {
                container.addView(View(this).apply {
                    setBackgroundResource(R.color.line)
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
                        marginStart = Ui.dp(this@MainActivity, 20); marginEnd = Ui.dp(this@MainActivity, 20)
                    }
                })
            }
            val row = layoutInflater.inflate(R.layout.item_time, container, false)
            row.findViewById<TextView>(R.id.label).text = t.label
            row.findViewById<TextView>(R.id.time).text = t.text
            container.addView(row)
            if (register) rows[t.key] = row
        }
    }

    private fun tick() {
        val now = ZonedDateTime.now(zone)
        if (now.toLocalDate() != day.date) load(now.toLocalDate())

        val fajr = day["fajr"].minutes ?: 0
        fun norm(m: Int) = if (m < fajr) m + 1440 else m      // times after midnight belong to "tonight"
        val nowMin = now.hour * 60 + now.minute
        val nowSec = norm(nowMin) * 60 + now.second

        val slots = shown.filter { it.minutes != null }
        var cur = -1
        for (i in slots.indices) if (norm(slots[i].minutes!!) <= norm(nowMin)) cur = i

        val next: Vakat.Time
        val targetSec: Int
        if (cur in 0 until slots.lastIndex) {
            next = slots[cur + 1]
            targetSec = norm(next.minutes!!) * 60
        } else {
            // after the last time of the night → the coming fajr (today's if past midnight, else tomorrow's)
            next = day["fajr"]
            targetSec = (1440 + (if (nowMin < fajr) fajr else (tomorrowFajr ?: fajr))) * 60
        }
        val left = (targetSec - nowSec).coerceAtLeast(0)

        nextLabel.text = next.label
        nextTime.text = "u " + (if (next.key == "fajr" && nowMin >= fajr) Vakat.Time("fajr", "", tomorrowFajr).text else next.text)
        countdown.text = "%02d:%02d:%02d".format(left / 3600, left % 3600 / 60, left % 60)

        val key = slots.getOrNull(cur)?.key
        if (key != currentKey) {
            currentKey?.let { highlight(rows[it], false) }
            highlight(rows[key], true)
            currentKey = key
        }
    }

    private fun highlight(row: View?, on: Boolean) {
        row ?: return
        if (on) row.setBackgroundResource(R.drawable.bg_current) else row.background = null
        val label = row.findViewById<TextView>(R.id.label)
        val time = row.findViewById<TextView>(R.id.time)
        val face = if (on) Typeface.create("sans-serif-medium", Typeface.NORMAL) else Typeface.DEFAULT
        label.typeface = face
        time.typeface = face
        label.setTextColor(getColor(if (on) R.color.text else R.color.text2))
    }

    companion object {
        private const val REQ_FIRST = 1
    }
}
