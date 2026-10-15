package io.github.ikasast.voxinq

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * The home-screen widget: one wide row, two buttons. Record now opens the app on the page that
 * creates a meeting and starts recording it; New meeting opens the form. Nothing is done from the
 * widget itself — the app is what holds the microphone, the server address and the session — so
 * a tap is the same as opening the app and pressing the button there.
 */
class QuickWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, views(context, R.layout.widget_quick))
    }

    companion object {
        /** Where each of the widget's actions takes the app. Pure, for the tests. */
        fun pathFor(action: String?): String? = when (action) {
            MainActivity.ACTION_QUICK_RECORD -> "/quick-record"
            MainActivity.ACTION_NEW_MEETING -> "/new"
            else -> null
        }

        /** Either size: both layouts name their buttons the same. */
        fun views(context: Context, layout: Int): RemoteViews =
            RemoteViews(context.packageName, layout).apply {
                setOnClickPendingIntent(R.id.widget_record, open(context, MainActivity.ACTION_QUICK_RECORD, 1))
                setOnClickPendingIntent(R.id.widget_new, open(context, MainActivity.ACTION_NEW_MEETING, 2))
            }

        private fun open(context: Context, action: String, code: Int): PendingIntent =
            PendingIntent.getActivity(
                context,
                code,
                Intent(context, MainActivity::class.java).setAction(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
    }
}

/**
 * The same two buttons in two cells: the picture and a short word each, for a home screen that
 * has no room for a whole row.
 */
class QuickWidgetCompact : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, QuickWidget.views(context, R.layout.widget_quick_compact))
    }
}
