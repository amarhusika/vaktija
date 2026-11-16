package com.amar.vaktija

import android.Manifest
import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.ImageView
import android.widget.ListView
import android.widget.TextView

/** Search any city through the phone's Google Geocoder, or use the current location. */
class CityActivity : Activity() {

    private var results: List<City> = emptyList()
    private lateinit var current: City
    private lateinit var status: TextView
    private lateinit var gpsSub: TextView
    private val adapter = Adapter()
    private val handler = Handler(Looper.getMainLooper())
    private var seq = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_city)
        val root = findViewById<View>(R.id.root)
        Ui.edgeToEdge(this, root, root)

        current = Prefs.city(this)
        status = findViewById(R.id.status)
        gpsSub = findViewById(R.id.gpsSub)
        val list = findViewById<ListView>(R.id.list)
        list.adapter = adapter
        list.setOnItemClickListener { _, _, position, _ ->
            results.getOrNull(position)?.let {
                Prefs.setCity(this, it)
                Scheduler.schedule(this)
                finish()
            }
        }
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        findViewById<View>(R.id.gps).setOnClickListener { useMyLocation() }
        findViewById<EditText>(R.id.search).addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = onQuery(s?.toString().orEmpty().trim())
        })
        gpsSub.text = if (Prefs.usesGps(this)) "Trenutno: ${current.name}" else "Učitaj lokaciju telefona"
        showRecent()
    }

    private fun showRecent() {
        results = Prefs.recent(this)
        status.text = if (results.isEmpty()) "Upiši ime grada (npr. Tuzla, Istanbul, Medina)" else "Nedavno"
        adapter.notifyDataSetChanged()
    }

    private fun onQuery(q: String) {
        handler.removeCallbacksAndMessages(null)
        val mySeq = ++seq
        if (q.length < 2) { showRecent(); return }
        if (!Places.available()) {
            status.text = "Pretraga nije dostupna na ovom telefonu (nema Google usluga)"
            return
        }
        handler.postDelayed({
            status.text = "Tražim…"
            Places.search(this, q) { found ->
                if (mySeq != seq || isDestroyed) return@search      // a newer search is running
                results = found.orEmpty()
                status.text = when {
                    found == null -> "Pretraga nije uspjela – provjeri internet"
                    found.isEmpty() -> "Nije pronađen nijedan grad"
                    else -> ""
                }
                adapter.notifyDataSetChanged()
            }
        }, 450)
    }

    private fun useMyLocation() {
        if (!Loc.has(this)) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), REQ_LOC)
            return
        }
        gpsSub.text = "Tražim lokaciju…"
        Loc.current(this) { l ->
            if (isDestroyed) return@current
            if (l == null) {
                gpsSub.text = "Lokacija nije dostupna – uključi lokaciju na telefonu"
                return@current
            }
            Places.saveMyLocation(this, l.latitude, l.longitude) { Scheduler.schedule(this) }
            finish()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_LOC && Loc.has(this)) useMyLocation()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private inner class Adapter : BaseAdapter() {
        override fun getCount() = results.size
        override fun getItem(position: Int) = results[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: layoutInflater.inflate(R.layout.item_city, parent, false)
            val c = results[position]
            val isSel = !Prefs.usesGps(this@CityActivity) && c.id == current.id
            v.findViewById<TextView>(R.id.name).text = c.name
            v.findViewById<TextView>(R.id.region).text = c.country
            v.findViewById<ImageView>(R.id.check).visibility = if (isSel) View.VISIBLE else View.INVISIBLE
            if (isSel) v.setBackgroundResource(R.drawable.bg_current) else v.background = null
            return v
        }
    }

    companion object {
        private const val REQ_LOC = 4
    }
}
